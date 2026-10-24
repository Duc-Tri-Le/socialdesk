import { defineAction, z } from "@hatch/space-sdk";
import { eq } from "drizzle-orm";
import * as schema from "../../schema";
import { privileged } from "../../privileged";
import {
  executePublishDraft,
  updatePublishBatchOutcome,
} from "../../services/publishing/publishOrchestrator";

export const draftPublishActions = {
  publishDraft: defineAction({
    request: z.object({
      id: z.number().int().positive(),
      group_ids: z.array(z.number().int().positive()).default([]),
      page_ids: z.array(z.number().int().positive()).default([]),
      instagram_account_ids: z.array(z.number().int().positive()).default([]),
    }),
    response: z.object({
      ok: z.boolean(),
      message: z.string(),
      results: z.array(
        z.object({
          kind: z.enum(["page", "instagram", "group", "account"]),
          name: z.string(),
          status: z.enum([
            "published",
            "failed",
            "unsupported",
            "skipped",
            "queued",
            "needs_login",
          ]),
          message: z.string(),
          post_url: z.string(),
        }),
      ),
    }),
    privileged: [
      privileged.listFbPages,
      privileged.publishFbPagePost,
      privileged.listIgAccounts,
      privileged.preparePublishMedia,
    ],
    async handler(ctx, args) {
      return executePublishDraft(ctx, args);
    },
  }),

  reportGroupPublish: defineAction({
    request: z.object({
      draft_id: z.number().int().positive(),
      outcomes: z
        .array(
          z.object({
            group_name: z.string().min(1),
            status: z.enum(["published", "failed", "needs_login"]),
            post_url: z.string().default(""),
            message: z.string().default(""),
          }),
        )
        .min(1)
        .max(20),
    }),
    response: z.object({ ok: z.boolean(), updated: z.number() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const updated = await updatePublishBatchOutcome(
        db,
        args.draft_id,
        args.outcomes,
        "group",
      );
      ctx.invalidateQueries();
      return { ok: true, updated };
    },
  }),

  reportBrowserPublish: defineAction({
    request: z.object({
      draft_id: z.number().int().positive(),
      outcomes: z
        .array(
          z.object({
            kind: z.enum(["group", "page"]),
            name: z.string().min(1),
            status: z.enum(["published", "failed", "needs_login"]),
            post_url: z.string().default(""),
            message: z.string().default(""),
          }),
        )
        .min(1)
        .max(20),
    }),
    response: z.object({ ok: z.boolean(), updated: z.number() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const updated = await updatePublishBatchOutcome(
        db,
        args.draft_id,
        args.outcomes,
        "group",
      );
      ctx.invalidateQueries();
      return { ok: true, updated };
    },
  }),

  reportInstagramPublish: defineAction({
    request: z.object({
      draft_id: z.number().int().positive(),
      outcomes: z
        .array(
          z.object({
            name: z.string().min(1),
            status: z.enum(["published", "failed", "uncertain"]),
            post_url: z.string().default(""),
            message: z.string().default(""),
          }),
        )
        .min(1)
        .max(20),
    }),
    response: z.object({ ok: z.boolean(), updated: z.number() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const updated = await updatePublishBatchOutcome(
        db,
        args.draft_id,
        args.outcomes,
        "instagram",
      );
      ctx.invalidateQueries();
      return { ok: true, updated };
    },
  }),

  setPublishRecordPostUrl: defineAction({
    request: z.object({
      id: z.number().int().positive(),
      post_url: z.string().default(""),
    }),
    response: z.object({ ok: z.boolean(), message: z.string() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const [record] = await db
        .select()
        .from(schema.publishRecords)
        .where(eq(schema.publishRecords.id, args.id));
      if (!record)
        return { ok: false, message: "Không tìm thấy bản ghi đăng bài." };
      const cleanUrl = args.post_url.trim();
      await db
        .update(schema.publishRecords)
        .set({ postUrl: cleanUrl })
        .where(eq(schema.publishRecords.id, args.id));
      ctx.invalidateQueries();
      return {
        ok: true,
        message: cleanUrl
          ? "Đã lưu đường link bài viết."
          : "Đã xóa đường link bài viết.",
      };
    },
  }),
};
