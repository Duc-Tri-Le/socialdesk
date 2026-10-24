import { defineAction, z } from "@hatch/space-sdk";
import { asc, eq } from "drizzle-orm";
import * as schema from "../../schema";
import { pageOut, toPageOut, extractFacebookPageName } from "../../types";

export const pageActions = {
  listPages: defineAction({
    request: z.object({}),
    response: z.object({ pages: z.array(pageOut) }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const [rows, accs] = await Promise.all([
        db.select().from(schema.fbPages).orderBy(asc(schema.fbPages.id)),
        db.select().from(schema.accounts),
      ]);
      const nameById = new Map(accs.map((a) => [a.id, a.name]));
      return {
        pages: rows.map((r) => toPageOut(r, nameById.get(r.accountId) ?? "")),
      };
    },
  }),

  addPage: defineAction({
    request: z.object({
      account_id: z.number().int().positive(),
      url: z.string().default(""),
      name: z.string().default("").optional(),
      role: z.string().default("").optional(),
    }),
    response: z.object({ ok: z.boolean(), message: z.string() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const [acc] = await db
        .select()
        .from(schema.accounts)
        .where(eq(schema.accounts.id, args.account_id));
      if (!acc)
        return { ok: false, message: "Không tìm thấy tài khoản Facebook." };
      if (acc.platform !== "Facebook")
        return {
          ok: false,
          message: "Page chỉ thuộc về tài khoản Facebook, không phải Instagram.",
        };
      let cleanUrl = (args.url || "").trim();
      if (!cleanUrl) {
        return {
          ok: false,
          message: "Vui lòng nhập link Fanpage Facebook.",
        };
      }
      if (!/^https?:\/\//i.test(cleanUrl)) {
        cleanUrl = `https://${cleanUrl}`;
      }
      if (
        !/^https?:\/\/((www|m|web)\.)?(facebook\.com|fb\.com)\/.+/i.test(cleanUrl)
      ) {
        return {
          ok: false,
          message:
            "Link Page chưa đúng — vui lòng dán link Facebook hợp lệ (ví dụ https://www.facebook.com/ten-trang).",
        };
      }

      const finalName = args.name?.trim() || extractFacebookPageName(cleanUrl);
      const finalRole = args.role?.trim() || "";

      await db.insert(schema.fbPages).values({
        accountId: acc.id,
        name: finalName,
        url: cleanUrl,
        role: finalRole,
        selected: 1,
      });
      ctx.invalidateQueries();
      return {
        ok: true,
        message: `Đã thêm Fanpage “${finalName}” vào nick ${acc.name} và đang chọn để đăng.`,
      };
    },
  }),

  setPageSelected: defineAction({
    request: z.object({
      id: z.number().int().positive(),
      selected: z.boolean(),
    }),
    response: z.object({ ok: z.boolean(), message: z.string() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const [row] = await db
        .select()
        .from(schema.fbPages)
        .where(eq(schema.fbPages.id, args.id));
      if (!row) return { ok: false, message: "Không tìm thấy Page." };
      await db
        .update(schema.fbPages)
        .set({ selected: args.selected ? 1 : 0 })
        .where(eq(schema.fbPages.id, args.id));
      ctx.invalidateQueries();
      return {
        ok: true,
        message: args.selected
          ? `Đã chọn Page “${row.name}” để đăng bài.`
          : `Đã bỏ chọn Page “${row.name}”.`,
      };
    },
  }),

  deletePage: defineAction({
    request: z.object({ id: z.number().int().positive() }),
    response: z.object({ ok: z.boolean() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      await db
        .delete(schema.fbPages)
        .where(eq(schema.fbPages.id, args.id));
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  setPageUrl: defineAction({
    request: z.object({
      id: z.number().int().positive(),
      url: z.string().default(""),
    }),
    response: z.object({ ok: z.boolean(), message: z.string() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const [row] = await db
        .select()
        .from(schema.fbPages)
        .where(eq(schema.fbPages.id, args.id));
      if (!row) return { ok: false, message: "Không tìm thấy Fanpage." };

      let cleanUrl = args.url.trim();
      if (cleanUrl && !/^https?:\/\//i.test(cleanUrl)) {
        cleanUrl = `https://${cleanUrl}`;
      }
      if (
        cleanUrl &&
        !/^https?:\/\/((www|m|web)\.)?(facebook\.com|fb\.com)\/.+/i.test(cleanUrl)
      ) {
        return {
          ok: false,
          message:
            "Link Fanpage chưa đúng — vui lòng dán link Facebook hợp lệ (ví dụ: https://www.facebook.com/ten-trang).",
        };
      }

      await db
        .update(schema.fbPages)
        .set({ url: cleanUrl })
        .where(eq(schema.fbPages.id, args.id));
      ctx.invalidateQueries();
      return {
        ok: true,
        message: cleanUrl
          ? `Đã cập nhật link Fanpage “${row.name}”.`
          : `Đã xóa link Fanpage “${row.name}”.`,
      };
    },
  }),

  setPageName: defineAction({
    request: z.object({
      id: z.number().int().positive(),
      name: z.string().min(1),
    }),
    response: z.object({ ok: z.boolean(), message: z.string() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const [row] = await db
        .select()
        .from(schema.fbPages)
        .where(eq(schema.fbPages.id, args.id));
      if (!row) return { ok: false, message: "Không tìm thấy Fanpage." };

      const name = args.name.trim();
      await db
        .update(schema.fbPages)
        .set({ name })
        .where(eq(schema.fbPages.id, args.id));
      ctx.invalidateQueries();
      return {
        ok: true,
        message: `Đã đổi tên Fanpage thành “${name}”.`,
      };
    },
  }),
};
