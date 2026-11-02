import { defineAction, z } from "@hatch/space-sdk";
import { eq } from "drizzle-orm";
import * as schema from "../../schema";
import { getSetting, setSetting } from "../../services/settings";
import {
  buildFacebookOAuthUrl,
  exchangeCodeForUserToken,
  exchangeForLongLivedUserToken,
  syncFacebookAssets,
} from "../../services/publishing/facebookOAuth";
import { debugFacebookToken } from "../../services/publishing/facebookGraphApi";

export const oauthActions = {
  /**
   * Lấy cấu hình Facebook App hiện tại (App ID)
   */
  getFacebookAppConfig: defineAction({
    request: z.object({}),
    response: z.object({
      configured: z.boolean(),
      app_id: z.string(),
      has_app_secret: z.boolean(),
    }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const appId = await getSetting(db, "fb_app_id");
      const appSecret = await getSetting(db, "fb_app_secret");
      return {
        configured: Boolean(appId && appSecret),
        app_id: appId || "",
        has_app_secret: Boolean(appSecret),
      };
    },
  }),

  /**
   * Lưu App ID và App Secret của Facebook App
   */
  saveFacebookAppCredentials: defineAction({
    request: z.object({
      app_id: z.string().min(1, "Vui lòng nhập Facebook App ID"),
      app_secret: z.string().min(1, "Vui lòng nhập Facebook App Secret"),
    }),
    response: z.object({ ok: z.boolean(), message: z.string() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      await setSetting(db, "fb_app_id", args.app_id.trim());
      await setSetting(db, "fb_app_secret", args.app_secret.trim());
      ctx.invalidateQueries();
      return {
        ok: true,
        message: "Đã lưu thông tin cấu hình Facebook App thành công.",
      };
    },
  }),

  /**
   * Sinh đường dẫn đăng nhập Facebook OAuth
   */
  getFacebookOAuthUrl: defineAction({
    request: z.object({
      redirect_uri: z.string().min(1, "Thiếu redirect_uri"),
    }),
    response: z.object({
      ok: z.boolean(),
      auth_url: z.string(),
      message: z.string(),
    }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const appId = await getSetting(db, "fb_app_id");
      if (!appId) {
        return {
          ok: false,
          auth_url: "",
          message:
            "Chưa cấu hình Facebook App ID. Vui lòng vào Cài đặt cấu hình Facebook App trước.",
        };
      }
      const authUrl = buildFacebookOAuthUrl(appId, args.redirect_uri);
      return { ok: true, auth_url: authUrl, message: "" };
    },
  }),

  /**
   * Xử lý callback sau khi người dùng đồng ý ủy quyền trên Facebook
   */
  handleFacebookOAuthCallback: defineAction({
    request: z.object({
      code: z.string().min(1, "Thiếu mã xác thực code"),
      redirect_uri: z.string().min(1, "Thiếu redirect_uri"),
      account_id: z.number().int().positive().optional(),
    }),
    response: z.object({
      ok: z.boolean(),
      message: z.string(),
      pages_synced: z.number(),
      instagram_synced: z.number(),
    }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const appId = await getSetting(db, "fb_app_id");
      const appSecret = await getSetting(db, "fb_app_secret");

      if (!appId || !appSecret) {
        return {
          ok: false,
          message: "Chưa cấu hình App ID hoặc App Secret.",
          pages_synced: 0,
          instagram_synced: 0,
        };
      }

      // 1. Đổi code lấy short-lived user token
      const shortRes = await exchangeCodeForUserToken(
        appId,
        appSecret,
        args.redirect_uri,
        args.code,
      );
      if (!shortRes.ok || !shortRes.accessToken) {
        return {
          ok: false,
          message: shortRes.error || "Không đổi được mã xác thực lấy Access Token.",
          pages_synced: 0,
          instagram_synced: 0,
        };
      }

      // 2. Đổi sang long-lived user token (60 ngày)
      const longRes = await exchangeForLongLivedUserToken(
        appId,
        appSecret,
        shortRes.accessToken,
      );
      const finalUserToken = longRes.accessToken || shortRes.accessToken;

      // 3. Đồng bộ Pages và Instagram Business Accounts (tự động phân loại nick cũ vs tạo nick mới)
      const syncRes = await syncFacebookAssets(
        db,
        args.account_id,
        finalUserToken,
      );

      ctx.invalidateQueries();
      return {
        ok: syncRes.ok,
        message: syncRes.message,
        pages_synced: syncRes.pagesSynced,
        instagram_synced: syncRes.instagramSynced,
      };
    },
  }),

  /**
   * Cài đặt thủ công API Token & Page ID cho một Fanpage
   */
  setPageApiToken: defineAction({
    request: z.object({
      id: z.number().int().positive(),
      fb_page_id: z.string().default(""),
      access_token: z.string().default(""),
    }),
    response: z.object({
      ok: z.boolean(),
      message: z.string(),
      is_valid: z.boolean(),
    }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const [page] = await db
        .select()
        .from(schema.fbPages)
        .where(eq(schema.fbPages.id, args.id));

      if (!page) {
        return { ok: false, message: "Không tìm thấy Fanpage.", is_valid: false };
      }

      const cleanToken = args.access_token.trim();
      const cleanPageId = args.fb_page_id.trim();

      let isValid = false;
      let extraNote = "";

      if (cleanToken) {
        const debug = await debugFacebookToken(cleanToken, cleanToken);
        isValid = debug.is_valid;
        if (!debug.is_valid) {
          extraNote = ` (Lưu ý: Token không hợp lệ: ${debug.error || "hết hạn hoặc sai mã"})`;
        } else {
          extraNote = ` (Token hợp lệ, quyền: ${debug.scopes?.join(", ") || "cơ bản"})`;
        }
      }

      await db
        .update(schema.fbPages)
        .set({
          fbPageId: cleanPageId,
          accessToken: cleanToken,
        })
        .where(eq(schema.fbPages.id, args.id));

      ctx.invalidateQueries();
      return {
        ok: true,
        is_valid: isValid,
        message: `Đã lưu thông tin API cho Fanpage “${page.name}”${extraNote}.`,
      };
    },
  }),

  /**
   * Cài đặt thủ công API Token & Instagram Business Account ID cho một tài khoản Instagram
   */
  setAccountApiToken: defineAction({
    request: z.object({
      id: z.number().int().positive(),
      ig_business_account_id: z.string().default(""),
      access_token: z.string().default(""),
    }),
    response: z.object({
      ok: z.boolean(),
      message: z.string(),
      is_valid: z.boolean(),
    }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const [acc] = await db
        .select()
        .from(schema.accounts)
        .where(eq(schema.accounts.id, args.id));

      if (!acc) {
        return { ok: false, message: "Không tìm thấy tài khoản.", is_valid: false };
      }

      const cleanToken = args.access_token.trim();
      const cleanIgId = args.ig_business_account_id.trim();

      let isValid = false;
      let extraNote = "";

      if (cleanToken) {
        const debug = await debugFacebookToken(cleanToken, cleanToken);
        isValid = debug.is_valid;
        if (!debug.is_valid) {
          extraNote = ` (Lưu ý: Token không hợp lệ: ${debug.error || "hết hạn hoặc sai mã"})`;
        } else {
          extraNote = ` (Token hợp lệ, quyền: ${debug.scopes?.join(", ") || "cơ bản"})`;
        }
      }

      await db
        .update(schema.accounts)
        .set({
          igBusinessAccountId: cleanIgId,
          accessToken: cleanToken,
          linked: cleanToken ? 1 : acc.linked,
        })
        .where(eq(schema.accounts.id, args.id));

      ctx.invalidateQueries();
      return {
        ok: true,
        is_valid: isValid,
        message: `Đã lưu thông tin API cho ${acc.name}${extraNote}.`,
      };
    },
  }),
};
