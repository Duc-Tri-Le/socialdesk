import { defineAction, z } from "@hatch/space-sdk";
import { eq } from "drizzle-orm";
import * as schema from "../../schema";
import { privileged } from "../../privileged";
import {
  executePublishDraft,
  updatePublishBatchOutcome,
} from "../../services/publishing/publishOrchestrator";
import { serializePackTargets } from "../../services/postingPack";

export const draftPublishActions = {
  publishDraft: defineAction({
    request: z.object({
      id: z.number().int().positive(),
      group_ids: z.array(z.number().int().positive()).default([]),
      page_ids: z.array(z.number().int().positive()).default([]),
      instagram_account_ids: z.array(z.number().int().positive()).default([]),
      account_ids: z.array(z.number().int().positive()).default([]),
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
            kind: z
              .enum(["group", "page", "account", "instagram"])
              .default("group"),
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

  scheduleDraft: defineAction({
    request: z.object({
      id: z.number().int().positive(),
      scheduled_at: z.string().min(1),
      group_ids: z.array(z.number().int().positive()).optional().default([]),
      page_ids: z.array(z.number().int().positive()).optional().default([]),
      instagram_account_ids: z.array(z.number().int().positive()).optional().default([]),
      account_ids: z.array(z.number().int().positive()).optional().default([]),
    }),
    response: z.object({
      ok: z.boolean(),
      message: z.string(),
      scheduled_at: z.string().nullable(),
    }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const [row] = await db
        .select()
        .from(schema.drafts)
        .where(eq(schema.drafts.id, args.id));
      if (!row) {
        return { ok: false, message: "Không tìm thấy bản nháp.", scheduled_at: null };
      }
      if (row.status !== "approved" && row.status !== "packed") {
        return {
          ok: false,
          message: "Chỉ có thể lên lịch cho bài đã được duyệt.",
          scheduled_at: null,
        };
      }

      const scheduledDate = new Date(args.scheduled_at);
      if (isNaN(scheduledDate.getTime())) {
        return { ok: false, message: "Thời gian lên lịch không hợp lệ.", scheduled_at: null };
      }
      if (scheduledDate.getTime() <= Date.now() + 30000) {
        return {
          ok: false,
          message: "Thời gian lên lịch phải cách hiện tại ít nhất 1 phút.",
          scheduled_at: null,
        };
      }

      // Lưu đích đăng nếu người dùng tùy chọn đích
      const groupIds = args.group_ids || [];
      const pageIds = args.page_ids || [];
      const igIds = args.instagram_account_ids || [];
      const accountIds = args.account_ids || [];

      if (groupIds.length > 0 || pageIds.length > 0 || igIds.length > 0 || accountIds.length > 0) {
        await db
          .update(schema.drafts)
          .set({
            packTargets: serializePackTargets({
              group_ids: groupIds,
              page_ids: pageIds,
              instagram_account_ids: igIds,
              account_ids: accountIds,
            }),
            scheduledAt: scheduledDate,
          })
          .where(eq(schema.drafts.id, args.id));
      } else {
        await db
          .update(schema.drafts)
          .set({ scheduledAt: scheduledDate })
          .where(eq(schema.drafts.id, args.id));
      }

      ctx.invalidateQueries();
      const timeFmt = new Intl.DateTimeFormat("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(scheduledDate);

      return {
        ok: true,
        message: `Đã lên lịch đăng bài thành công vào lúc ${timeFmt}.`,
        scheduled_at: scheduledDate.toISOString(),
      };
    },
  }),

  cancelDraftSchedule: defineAction({
    request: z.object({
      id: z.number().int().positive(),
    }),
    response: z.object({ ok: z.boolean(), message: z.string() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const [row] = await db
        .select()
        .from(schema.drafts)
        .where(eq(schema.drafts.id, args.id));
      if (!row) {
        return { ok: false, message: "Không tìm thấy bản nháp." };
      }
      await db
        .update(schema.drafts)
        .set({ scheduledAt: null })
        .where(eq(schema.drafts.id, args.id));
      ctx.invalidateQueries();
      return { ok: true, message: "Đã hủy lịch hẹn đăng bài." };
    },
  }),
};
