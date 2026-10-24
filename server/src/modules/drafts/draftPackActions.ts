import { defineAction, z } from "@hatch/space-sdk";
import { eq } from "drizzle-orm";
import * as schema from "../../schema";
import {
  findPlaceholders,
  hasColorPlaceholder,
  stripColorPlaceholders,
} from "../../services/copywriting";
import {
  parsePackTargets,
  serializePackTargets,
  buildPackTextForDraft,
  defaultPackTargets,
  type DraftRow,
  type PackTargetsInput,
} from "../../services/postingPack";

export const draftPackActions = {
  approveDraft: defineAction({
    request: z.object({ id: z.number().int().positive() }),
    response: z.object({
      ok: z.boolean(),
      message: z.string(),
      missing: z.array(z.string()),
    }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const [row] = await db
        .select()
        .from(schema.drafts)
        .where(eq(schema.drafts.id, args.id));
      if (!row)
        return { ok: false, message: "Không tìm thấy bản nháp.", missing: [] };
      if (row.status !== "draft")
        return {
          ok: false,
          message: `Bản nháp đang ở trạng thái ${row.status}, không duyệt lại.`,
          missing: [],
        };

      const caption = hasColorPlaceholder(row.caption)
        ? stripColorPlaceholders(row.caption, row.color)
        : row.caption;
      const missing = findPlaceholders(caption);
      if (missing.length > 0) {
        if (caption !== row.caption) {
          await db
            .update(schema.drafts)
            .set({ caption })
            .where(eq(schema.drafts.id, args.id));
          ctx.invalidateQueries();
        }
        return {
          ok: false,
          message: "Còn mục chưa điền: " + missing.join(", "),
          missing,
        };
      }

      const savedTargets = parsePackTargets(row.packTargets);
      const targets = savedTargets.saved
        ? {
            group_ids: savedTargets.group_ids,
            page_ids: savedTargets.page_ids,
            instagram_account_ids: savedTargets.instagram_account_ids,
          }
        : await defaultPackTargets(db);

      const rowForPack: DraftRow = { ...row, caption };
      const built = await buildPackTextForDraft(db, rowForPack, targets, {
        explicit: true,
      });

      if (!built.ok) {
        await db
          .update(schema.drafts)
          .set(
            caption !== row.caption
              ? { status: "approved", caption }
              : { status: "approved" },
          )
          .where(eq(schema.drafts.id, args.id));
        ctx.invalidateQueries();
        return {
          ok: true,
          message: `Đã duyệt ${row.code}. Chưa sinh được gói đăng tự động: ${built.message} Chọn lại đích đăng ở trang “Đã duyệt” thì gói sẽ tự được tạo.`,
          missing: [],
        };
      }

      const now = new Date();
      await db
        .update(schema.drafts)
        .set({
          status: "packed",
          caption: built.cleanCaption,
          packText: built.packText,
          packedAt: now,
          packTargets: serializePackTargets(targets),
        })
        .where(eq(schema.drafts.id, args.id));
      ctx.invalidateQueries();

      return {
        ok: true,
        message: built.hasMedia
          ? `Đã duyệt bài viết ${row.code} — gói đăng đã có trên thẻ bài ở trang “Đã duyệt”, bấm “Đăng Bài” để đăng ngay lên các đích đã chọn.`
          : `Đã duyệt bài viết ${row.code} — gói đăng đã có trên thẻ bài ở trang “Đã duyệt” (bài chưa gắn ảnh/video nào), bấm “Đăng Bài” để đăng ngay lên các đích đã chọn.`,
        missing: [],
      };
    },
  }),

  saveDraftTargets: defineAction({
    request: z.object({
      id: z.number().int().positive(),
      group_ids: z.array(z.number().int().positive()),
      page_ids: z.array(z.number().int().positive()).default([]),
      instagram_account_ids: z.array(z.number().int().positive()).default([]),
    }),
    response: z.object({ ok: z.boolean(), message: z.string() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const [row] = await db
        .select()
        .from(schema.drafts)
        .where(eq(schema.drafts.id, args.id));
      if (!row) return { ok: false, message: "Không tìm thấy bản nháp." };
      const targets: PackTargetsInput = {
        group_ids: args.group_ids,
        page_ids: args.page_ids,
        instagram_account_ids: args.instagram_account_ids,
      };

      if (row.status === "draft") {
        await db
          .update(schema.drafts)
          .set({ packTargets: serializePackTargets(targets) })
          .where(eq(schema.drafts.id, args.id));
        ctx.invalidateQueries();
        return {
          ok: true,
          message:
            "Đã lưu đích đăng cho bài chờ duyệt — gói đăng sẽ xuất theo đích này khi duyệt bài.",
        };
      }
      if (row.status !== "approved" && row.status !== "packed")
        return {
          ok: false,
          message: "Chỉ lưu đích đăng cho bài chờ duyệt hoặc đã duyệt.",
        };

      const built = await buildPackTextForDraft(db, row, targets, {
        explicit: true,
      });
      if (!built.ok) {
        await db
          .update(schema.drafts)
          .set({ packTargets: serializePackTargets(targets) })
          .where(eq(schema.drafts.id, args.id));
        ctx.invalidateQueries();
        return {
          ok: false,
          message: `Đã lưu đích đăng nhưng chưa cập nhật được gói đăng: ${built.message}`,
        };
      }
      await db
        .update(schema.drafts)
        .set({
          status: "packed",
          caption: built.cleanCaption,
          packText: built.packText,
          packedAt: new Date(),
          packTargets: serializePackTargets(targets),
        })
        .where(eq(schema.drafts.id, args.id));
      ctx.invalidateQueries();
      return {
        ok: true,
        message: "Đã lưu đích đăng và tự cập nhật gói đăng theo đích mới.",
      };
    },
  }),

  buildPack: defineAction({
    request: z.object({
      id: z.number().int().positive(),
      group_ids: z.array(z.number().int().positive()),
      page_ids: z.array(z.number().int().positive()).default([]),
      instagram_account_ids: z.array(z.number().int().positive()).default([]),
    }),
    response: z.object({
      ok: z.boolean(),
      message: z.string(),
      pack_text: z.string(),
    }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const [row] = await db
        .select()
        .from(schema.drafts)
        .where(eq(schema.drafts.id, args.id));
      if (!row)
        return { ok: false, message: "Không tìm thấy bản nháp.", pack_text: "" };
      if (row.status !== "approved" && row.status !== "packed")
        return {
          ok: false,
          message: `Bản nháp chưa được duyệt (trạng thái: ${row.status}). Duyệt bài trước khi cập nhật gói đăng.`,
          pack_text: "",
        };
      const built = await buildPackTextForDraft(db, row, {
        group_ids: args.group_ids,
        page_ids: args.page_ids,
        instagram_account_ids: args.instagram_account_ids,
      });
      if (!built.ok)
        return { ok: false, message: built.message, pack_text: "" };

      await db
        .update(schema.drafts)
        .set({
          status: "packed",
          packText: built.packText,
          packedAt: new Date(),
          caption: built.cleanCaption,
          packTargets: serializePackTargets({
            group_ids: args.group_ids,
            page_ids: args.page_ids,
            instagram_account_ids: args.instagram_account_ids,
          }),
        })
        .where(eq(schema.drafts.id, args.id));
      ctx.invalidateQueries();
      return {
        ok: true,
        message: built.hasMedia
          ? `Đã cập nhật gói đăng — gói đăng ở ngay trên thẻ bài này; đăng đúng các đích đã chọn, dùng đúng media đã gắn trong bản nháp (${built.driveImageCount} ảnh${built.hasVideo ? ", có video" : ""}; không quét lại Drive, không thêm/bớt media).`
          : `Đã cập nhật gói đăng — gói đăng ở ngay trên thẻ bài này; đăng đúng các đích đã chọn; bài này chưa gắn ảnh/video nào.`,
        pack_text: built.packText,
      };
    },
  }),
};
