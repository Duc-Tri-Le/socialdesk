import { defineAction, z } from "@hatch/space-sdk";
import { asc, eq } from "drizzle-orm";
import * as schema from "../../schema";
import { setSetting, getSettingsByPrefix, deleteSetting } from "../../services/settings";
import { accountOut, toAccountOut } from "../../types";

export const accountCrudActions = {
  listAccounts: defineAction({
    request: z.object({}),
    response: z.object({ accounts: z.array(accountOut) }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      // Truy vấn đồng thời danh sách tài khoản và bảng setting phiên (loại bỏ N+1 query)
      const [rows, sessionMap] = await Promise.all([
        db
          .select()
          .from(schema.accounts)
          .orderBy(asc(schema.accounts.id)),
        getSettingsByPrefix(db, "account_session_"),
      ]);
      const accountsOut = rows.map((r) => {
        const savedStatus = sessionMap.get(`account_session_${r.id}`) ?? "";
        return toAccountOut(r, savedStatus);
      });
      return { accounts: accountsOut };
    },
  }),

  addAccount: defineAction({
    request: z.object({
      platform: z.enum(["Facebook", "Instagram"]).default("Facebook"),
      name: z.string().default(""),
      handle: z.string().default(""),
      profile_url: z.string().default(""),
      extension_code: z.string().default(""),
      linked: z.boolean().default(true),
    }),
    response: z.object({ ok: z.boolean(), message: z.string() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const existing = await db
        .select()
        .from(schema.accounts)
        .where(eq(schema.accounts.platform, args.platform));
      const autoSelect =
        args.linked &&
        (args.platform === "Instagram" ||
          !existing.some((a) => a.selected === 1));
      const extCode = (args.extension_code || "").trim().toUpperCase();
      const name =
        args.name.trim() ||
        (extCode ? `Nick Facebook (${extCode})` : "Nick Facebook");
      const [newRow] = await db.insert(schema.accounts).values({
        platform: args.platform,
        name,
        handle: args.handle.trim(),
        profileUrl: args.profile_url.trim(),
        extensionCode: extCode,
        linked: args.linked ? 1 : 0,
        selected: autoSelect ? 1 : 0,
      }).returning();
      if (newRow) {
        await setSetting(db, `account_session_${newRow.id}`, args.linked ? "logged_in" : "expired");
      }
      ctx.invalidateQueries();
      return {
        ok: true,
        message: autoSelect
          ? `Đã thêm tài khoản ${args.platform} — ${name} và đang chọn dùng để đăng bài.`
          : args.linked
            ? `Đã thêm tài khoản ${args.platform} — ${name} (đã liên kết, chưa chọn dùng để đăng; bật “Đang chọn” khi muốn chuyển).`
            : `Đã thêm tài khoản ${args.platform} — ${name} (chưa liên kết).`,
      };
    },
  }),

  setAccountSelected: defineAction({
    request: z.object({
      id: z.number().int().positive(),
      selected: z.boolean(),
    }),
    response: z.object({ ok: z.boolean(), message: z.string() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const [row] = await db
        .select()
        .from(schema.accounts)
        .where(eq(schema.accounts.id, args.id));
      if (!row) return { ok: false, message: "Không tìm thấy tài khoản." };

      await db
        .update(schema.accounts)
        .set({ selected: args.selected ? 1 : 0 })
        .where(eq(schema.accounts.id, args.id));
      ctx.invalidateQueries();
      return {
        ok: true,
        message: args.selected
          ? `Đã chọn tài khoản ${row.platform} — ${row.name} làm tài khoản đang sử dụng.`
          : `Đã bỏ chọn tài khoản ${row.platform} — ${row.name}.`,
      };
    },
  }),

  setAccountSessionStatus: defineAction({
    request: z.object({
      id: z.number().int().positive(),
      status: z.enum(["logged_in", "expired", "checkpoint"]),
    }),
    response: z.object({ ok: z.boolean(), message: z.string() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const [row] = await db
        .select()
        .from(schema.accounts)
        .where(eq(schema.accounts.id, args.id));
      if (!row) return { ok: false, message: "Không tìm thấy tài khoản." };
      await setSetting(db, `account_session_${args.id}`, args.status);
      await db
        .update(schema.accounts)
        .set({ linked: args.status === "logged_in" ? 1 : 0 })
        .where(eq(schema.accounts.id, args.id));
      ctx.invalidateQueries();
      const statusLabels: Record<string, string> = {
        logged_in: "Đã đăng nhập",
        expired: "Hết phiên",
        checkpoint: "Cần xác minh",
      };
      return {
        ok: true,
        message: `Đã cập nhật phiên đăng nhập của ${row.name}: ${statusLabels[args.status]}.`,
      };
    },
  }),

  setAccountLinked: defineAction({
    request: z.object({
      id: z.number().int().positive(),
      linked: z.boolean(),
    }),
    response: z.object({ ok: z.boolean(), message: z.string() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const [row] = await db
        .select()
        .from(schema.accounts)
        .where(eq(schema.accounts.id, args.id));
      if (!row) return { ok: false, message: "Không tìm thấy tài khoản." };
      let selected = args.linked ? row.selected : 0;
      let autoSelected = false;
      if (args.linked && selected !== 1) {
        if (row.platform === "Instagram") {
          selected = 1;
          autoSelected = true;
        } else {
          const siblings = await db
            .select()
            .from(schema.accounts)
            .where(eq(schema.accounts.platform, row.platform));
          if (!siblings.some((a) => a.id !== row.id && a.selected === 1)) {
            selected = 1;
            autoSelected = true;
          }
        }
      }
      await db
        .update(schema.accounts)
        .set({
          linked: args.linked ? 1 : 0,
          selected,
        })
        .where(eq(schema.accounts.id, args.id));
      ctx.invalidateQueries();
      return {
        ok: true,
        message: args.linked
          ? autoSelected
            ? `Đã đánh dấu ${row.name} là đã liên kết và đang chọn dùng để đăng bài.`
            : `Đã đánh dấu ${row.name} là đã liên kết.`
          : `Đã gỡ liên kết ${row.name} (và bỏ chọn dùng).`,
      };
    },
  }),

  deleteAccount: defineAction({
    request: z.object({ id: z.number().int().positive() }),
    response: z.object({ ok: z.boolean() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      await db
        .delete(schema.fbPages)
        .where(eq(schema.fbPages.accountId, args.id));
      await db
        .delete(schema.accounts)
        .where(eq(schema.accounts.id, args.id));
      await deleteSetting(db, `account_session_${args.id}`);
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  setAccountProfileUrl: defineAction({
    request: z.object({
      id: z.number().int().positive(),
      profile_url: z.string().default(""),
    }),
    response: z.object({ ok: z.boolean(), message: z.string() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const [row] = await db
        .select()
        .from(schema.accounts)
        .where(eq(schema.accounts.id, args.id));
      if (!row) return { ok: false, message: "Không tìm thấy tài khoản." };
      const url = args.profile_url.trim();
      if (url && !/^https:\/\/(www\.)?(facebook\.com|instagram\.com)\//.test(url))
        return {
          ok: false,
          message:
            "Link chưa đúng — dán link trang cá nhân bắt đầu bằng https://www.facebook.com/… hoặc https://www.instagram.com/…",
        };
      await db
        .update(schema.accounts)
        .set({ profileUrl: url })
        .where(eq(schema.accounts.id, args.id));
      ctx.invalidateQueries();
      return {
        ok: true,
        message: url
          ? `Đã lưu link trang của ${row.name} — bấm vào tên nick là mở thẳng trang đó.`
          : `Đã xóa link trang của ${row.name}.`,
      };
    },
  }),

  setAccountName: defineAction({
    request: z.object({
      id: z.number().int().positive(),
      name: z.string().min(1),
    }),
    response: z.object({ ok: z.boolean(), message: z.string() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const [row] = await db
        .select()
        .from(schema.accounts)
        .where(eq(schema.accounts.id, args.id));
      if (!row) return { ok: false, message: "Không tìm thấy tài khoản." };
      const newName = args.name.trim();
      await db
        .update(schema.accounts)
        .set({ name: newName })
        .where(eq(schema.accounts.id, args.id));
      ctx.invalidateQueries();
      return {
        ok: true,
        message: `Đã đổi tên nick thành "${newName}".`,
      };
    },
  }),

  setAccountExtensionCode: defineAction({
    request: z.object({
      id: z.number().int().positive(),
      extension_code: z.string().default(""),
    }),
    response: z.object({ ok: z.boolean(), message: z.string() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const [row] = await db
        .select()
        .from(schema.accounts)
        .where(eq(schema.accounts.id, args.id));
      if (!row) return { ok: false, message: "Không tìm thấy tài khoản." };
      const code = args.extension_code.trim().toUpperCase();
      await db
        .update(schema.accounts)
        .set({ extensionCode: code })
        .where(eq(schema.accounts.id, args.id));
      ctx.invalidateQueries();
      return {
        ok: true,
        message: code
          ? `Đã lưu Mã Extension Chrome "${code}" cho tài khoản ${row.name}.`
          : `Đã xóa Mã Extension Chrome cho tài khoản ${row.name}.`,
      };
    },
  }),

  getConnectedExtensions: defineAction({
    request: z.object({}),
    response: z.object({
      online_codes: z.array(z.string()),
    }),
    async handler(_ctx) {
      const globalAny = globalThis as any;
      const getCodes = globalAny.__socialDeskGetOnlineExtensionCodes;
      const codes = typeof getCodes === "function" ? getCodes() : [];
      return { online_codes: codes };
    },
  }),
};
