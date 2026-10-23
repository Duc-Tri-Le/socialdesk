import { defineAction, z } from "@hatch/space-sdk";
import { asc, eq } from "drizzle-orm";
import * as schema from "../schema";
import { getSetting, setSetting } from "../services/settings";
import {
  accountOut,
  toAccountOut,
  pageOut,
  toPageOut,
} from "../types";

export const accountActions = {

  // -------------------------------------------------------------- accounts
  listAccounts: defineAction({
    request: z.object({}),
    response: z.object({ accounts: z.array(accountOut) }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const rows = await db
        .select()
        .from(schema.accounts)
        .orderBy(asc(schema.accounts.id));
      return { accounts: rows.map(toAccountOut) };
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
      // Tự bật "dùng để đăng" cho tài khoản mới THEO TỪNG NỀN TẢNG, để
      // không tài khoản nào bị ẩn lặng lẽ khỏi Tổng quan và gói đăng:
      // - Facebook chỉ chọn được 1 tài khoản tại một thời điểm → tự bật
      //   khi chưa có nick Facebook nào đang được chọn dùng.
      // - Instagram chọn được nhiều nick cùng lúc → tài khoản đã liên
      //   kết mới thêm được tự bật luôn.
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
      await db.insert(schema.accounts).values({
        platform: args.platform,
        name,
        handle: args.handle.trim(),
        profileUrl: args.profile_url.trim(),
        extensionCode: extCode,
        linked: args.linked ? 1 : 0,
        selected: autoSelect ? 1 : 0,
      });
      ctx.invalidateQueries();
      return {
        ok: true,
        message: autoSelect
          ? `Đã thêm tài khoản ${args.platform} — ${name} và đang chọn dùng để đăng bài.`
          : args.linked
            ? `Đã thêm tài khoản ${args.platform} — ${name} (đã liên kết, chưa chọn dùng để đăng — nick Facebook đang dùng vẫn giữ nguyên; bật “Đăng nhập bằng nick này” khi muốn chuyển).`
            : `Đã thêm tài khoản ${args.platform} — ${name} (chưa liên kết — liên kết xong hãy bật dùng để đăng ở mục Tài khoản).`,
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
      if (args.selected && row.linked !== 1)
        return {
          ok: false,
          message:
            "Tài khoản chưa được đánh dấu đã liên kết — liên kết trong Meta Accounts Center trước.",
        };
      if (args.selected && row.platform === "Facebook") {
        // Facebook: một lúc một tài khoản — bỏ chọn các nick Facebook khác.
        const others = await db
          .select()
          .from(schema.accounts)
          .where(eq(schema.accounts.platform, "Facebook"));
        for (const o of others) {
          if (o.id !== row.id && o.selected === 1) {
            await db
              .update(schema.accounts)
              .set({ selected: 0 })
              .where(eq(schema.accounts.id, o.id));
          }
        }
      }
      await db
        .update(schema.accounts)
        .set({ selected: args.selected ? 1 : 0 })
        .where(eq(schema.accounts.id, args.id));
      ctx.invalidateQueries();
      return {
        ok: true,
        message: args.selected
          ? `Đã chọn dùng ${row.platform} — ${row.name}.`
          : `Đã bỏ chọn ${row.platform} — ${row.name}.`,
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
      // Khi đánh dấu đã liên kết mà nick chưa được chọn dùng, áp dụng
      // cùng mặc định như lúc thêm mới (theo từng nền tảng) để nick
      // không bị ẩn lặng lẽ: Instagram tự bật; Facebook chỉ tự bật khi
      // chưa có nick Facebook nào đang dùng.
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

  // ------------------------------------------------------ facebook pages
  // Một tài khoản Facebook cá nhân có thể quản trị nhiều Page. Page thuộc
  // về đúng 1 tài khoản; chọn Page nào thì gói đăng ghi đăng bằng Page đó.
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
      name: z.string().min(1),
      url: z.string().default(""),
      role: z.string().default(""),
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
      const url = args.url.trim();
      if (url && !/^https:\/\/(www\.)?facebook\.com\//.test(url))
        return {
          ok: false,
          message:
            "Link Page chưa đúng — dán link bắt đầu bằng https://www.facebook.com/…",
        };
      await db.insert(schema.fbPages).values({
        accountId: acc.id,
        name: args.name.trim(),
        url,
        role: args.role.trim(),
        selected: 1,
      });
      ctx.invalidateQueries();
      return {
        ok: true,
        message: `Đã thêm Page “${args.name.trim()}” vào nick ${acc.name} và đang chọn để đăng.`,
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

  // ------------------------------------------- ĐĂNG NHẬP FACEBOOK BẰNG
  // TRÌNH DUYỆT Muse (để đăng bài NHÓM)
  // Nút "Mở … để liên kết" trước đây là một LINK TĨNH mở trang liên
  // kết Meta Accounts Center (agent.meta.ai/foa_ac_link/facebook →
  // accountscenter.meta.com/add_accounts) — kênh liên kết API, không
  // tạo phiên facebook.com nào và thường báo "Something went wrong".
  // Người dùng chốt: bấm mở liên kết trên tool phải MỞ CỬA SỔ TRÌNH
  // DUYỆT Muse tới TRANG ĐĂNG NHẬP FACEBOOK để đăng nhập 1 lần ở đó,
  // phiên lưu trong hồ sơ trình duyệt Muse đó dùng để đăng bài nhóm
  // (Meta không có API đăng nhóm — đăng nhóm bắt buộc qua facebook.com
  // trong trình duyệt). App tự nó không mở được cửa sổ trình duyệt tới
  // màn hình người dùng: nút bấm gọi action này, action kích hoạt MỘT
  // TÁC VỤ AGENT (ctx.agent.spawnTask) — đúng cơ chế nút Đăng Bài dùng
  // cho đích nhóm — với chỉ thị mở https://www.facebook.com/login
  // trong cửa sổ trình duyệt Muse mà người dùng nhìn thấy được, để
  // nguyên cửa sổ ở trang đăng nhập nếu chưa có phiên (TUYỆT ĐỐI không
  // tự nhập mật khẩu), và báo kết quả thật qua reportFacebookBrowserLogin.
  // Trạng thái lưu ở app_settings (khóa fb_browser_login_*) để giao
  // diện hiện đúng sự thật: requested (đã gửi yêu cầu, chưa có bằng
  // chứng cửa sổ đã mở) ≠ waiting_login (tác vụ đã mở và đang chờ
  // người dùng đăng nhập) ≠ logged_in (tác vụ xác nhận đã đăng nhập).
  getFacebookBrowserLoginStatus: defineAction({
    request: z.object({}),
    response: z.object({
      status: z.string(),
      message: z.string(),
      account_name: z.string(),
      updated_at: z.string(),
      login_url: z.string(),
    }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const [status, message, accountName, updatedAt] = await Promise.all([
        getSetting(db, "fb_browser_login_status"),
        getSetting(db, "fb_browser_login_message"),
        getSetting(db, "fb_browser_login_account"),
        getSetting(db, "fb_browser_login_at"),
      ]);
      return {
        status,
        message,
        account_name: accountName,
        updated_at: updatedAt,
        login_url: "https://www.facebook.com/login",
      };
    },
  }),

  requestFacebookBrowserLogin: defineAction({
    request: z.object({
      account_id: z.number().int().min(0).default(0),
      account_name: z.string().default(""),
    }),
    response: z.object({ ok: z.boolean(), message: z.string() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      // Tên tài khoản Facebook gợi ý: lấy từ args, nếu không có thì
      // lấy nick Facebook đang chọn dùng để đăng (nếu có).
      let accountName = args.account_name.trim();
      if (!accountName) {
        const accs = await db
          .select()
          .from(schema.accounts)
          .where(eq(schema.accounts.platform, "Facebook"));
        const picked =
          accs.find((a) => a.id === args.account_id) ??
          accs.find((a) => a.selected === 1) ??
          accs[0];
        accountName = picked?.name ?? "";
      }
      const nowIso = new Date().toISOString();
      const requestedMessage =
        "Đã gửi yêu cầu mở trình duyệt Muse tới trang đăng nhập Facebook — chờ Muse mở cửa sổ trình duyệt đó. Cửa sổ này hiện trong cuộc trò chuyện với Muse, không phải tab mới trong Chrome của bạn và không phải trang liên kết Meta Accounts Center.";
      await setSetting(db, "fb_browser_login_status", "requested");
      await setSetting(db, "fb_browser_login_message", requestedMessage);
      await setSetting(db, "fb_browser_login_account", accountName);
      await setSetting(db, "fb_browser_login_at", nowIso);
      const taskMessage = [
        `Người dùng vừa bấm nút “Mở trình duyệt Muse — đăng nhập Facebook để đăng nhóm” trong mục Tài khoản của app Social Desk (artifact social-desk) và muốn ĐÚNG điều này: mở CỬA SỔ TRÌNH DUYỆT Muse mà người dùng NHÌN THẤY ĐƯỢC trong cuộc trò chuyện này tới TRANG ĐĂNG NHẬP FACEBOOK để họ đăng nhập 1 lần ở đó, dùng phiên đó để đăng bài vào NHÓM sau này. Xử lý đúng như khi người dùng nhắn trực tiếp trong chat nhờ bạn mở trình duyệt — KHÔNG cần hỏi lại người dùng.`,
        `Địa chỉ cần mở: https://www.facebook.com/login (nếu Facebook tự chuyển hướng sang https://www.facebook.com/ thì đó là dấu hiệu có thể đã có phiên).${accountName ? ` Tài khoản người dùng dự kiến đăng nhập là tài khoản quản trị Page: “${accountName}” (chỉ để đối chiếu tên sau khi đăng nhập, KHÔNG dùng để tự điền vào form).` : ""}`,
        `Cách xử lý bắt buộc:\n1) Mở địa chỉ trên trong cửa sổ trình duyệt Muse (công cụ trình duyệt của bạn — cùng hồ sơ trình duyệt bền vững dùng cho các lần đăng nhóm bằng trình duyệt sau này).\n2) Nếu trang cho thấy ĐÃ ĐĂNG NHẬP (bảng tin/trang chủ Facebook kèm tên tài khoản): đọc TÊN TÀI KHOẢN thật đang đăng nhập trên trang, rồi gọi action reportFacebookBrowserLogin của artifact social-desk với status "logged_in", account_name là tên thật đó, message là tóm tắt ngắn bằng tiếng Việt.\n3) Nếu trang hiện MÀN HÌNH ĐĂNG NHẬP Facebook (form "Log into Facebook" / đăng nhập bằng email/số điện thoại + mật khẩu): TUYỆT ĐỐI KHÔNG tự nhập email/mật khẩu/mã xác minh, KHÔNG bấm thay người dùng. Hãy ĐỂ NGUYÊN cửa sổ trình duyệt đang mở ở trang đăng nhập đó (không đóng cửa sổ, không điều hướng đi nơi khác) để người dùng tự đăng nhập ngay trong cửa sổ đó — chỉ 1 lần, phiên sẽ được lưu trong hồ sơ trình duyệt cho mọi lần đăng nhóm sau. Rồi gọi action reportFacebookBrowserLogin với status "waiting_login", account_name là "${accountName}", message cho biết cửa sổ trình duyệt Muse đang mở ở trang đăng nhập Facebook và đang chờ người dùng đăng nhập 1 lần trong cửa sổ đó.\n4) Nếu không mở được trang hoặc gặp lỗi thật (trang lỗi, bị chặn, checkpoint bắt buộc…): gọi action reportFacebookBrowserLogin với status "failed" và message là lý do THẬT quan sát được — tuyệt đối không bịa rằng cửa sổ đã mở.`,
        `Phải gọi action reportFacebookBrowserLogin đúng MỘT lần ở cuối lượt này (dù kết quả là logged_in, waiting_login hay failed) để app Social Desk cập nhật trạng thái đăng nhập trình duyệt cho người dùng.`,
      ].join("\n\n");
      try {
        const res = await ctx.agent.spawnTask(taskMessage, {
          expectsAction: "reportFacebookBrowserLogin",
          dedupeKey: `fb-browser-login-${nowIso}`,
        });
        if (!res.ok) {
          const failMessage = `Không khởi động được tác vụ mở trình duyệt Muse: ${res.error} — bấm lại nút mở trình duyệt để thử lại, hoặc nhắn trực tiếp trong chat với Muse nhờ mở trang đăng nhập Facebook.`;
          await setSetting(db, "fb_browser_login_status", "failed");
          await setSetting(db, "fb_browser_login_message", failMessage);
          await setSetting(db, "fb_browser_login_at", new Date().toISOString());
          ctx.invalidateQueries();
          return { ok: false, message: failMessage };
        }
      } catch (e) {
        const reason = (e instanceof Error ? e.message : String(e)).slice(0, 240);
        const failMessage = `Không khởi động được tác vụ mở trình duyệt Muse: ${reason} — bấm lại nút mở trình duyệt để thử lại, hoặc nhắn trực tiếp trong chat với Muse nhờ mở trang đăng nhập Facebook.`;
        await setSetting(db, "fb_browser_login_status", "failed");
        await setSetting(db, "fb_browser_login_message", failMessage);
        await setSetting(db, "fb_browser_login_at", new Date().toISOString());
        ctx.invalidateQueries();
        return { ok: false, message: failMessage };
      }
      ctx.invalidateQueries();
      return {
        ok: true,
        message:
          "Đã gửi yêu cầu: Muse đang mở cửa sổ trình duyệt Muse tới trang đăng nhập Facebook (facebook.com/login). Hãy sang cửa sổ trình duyệt Muse đó và đăng nhập 1 lần bằng tài khoản quản trị Page — phiên được lưu trong hồ sơ trình duyệt đó để đăng bài vào nhóm. Đây không phải trang liên kết Meta Accounts Center và không mở tab mới trong Chrome của bạn.",
      };
    },
  }),

  reportFacebookBrowserLogin: defineAction({
    request: z.object({
      status: z.enum(["waiting_login", "logged_in", "failed"]),
      account_name: z.string().default(""),
      message: z.string().default(""),
    }),
    response: z.object({ ok: z.boolean() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const accountName = args.account_name.trim();
      const fallback =
        args.status === "logged_in"
          ? `Đã đăng nhập Facebook trong trình duyệt Muse${accountName ? ` — ${accountName}` : ""} — sẵn sàng đăng bài vào nhóm bằng phiên này.`
          : args.status === "waiting_login"
            ? "Cửa sổ trình duyệt Muse đang mở ở trang đăng nhập Facebook, chờ người dùng đăng nhập 1 lần trong cửa sổ đó rồi phiên được lưu cho các lần đăng nhóm sau."
            : "Chưa mở được trang đăng nhập Facebook trong trình duyệt Muse.";
      await setSetting(db, "fb_browser_login_status", args.status);
      await setSetting(
        db,
        "fb_browser_login_message",
        args.message.trim() || fallback,
      );
      if (accountName)
        await setSetting(db, "fb_browser_login_account", accountName);
      await setSetting(db, "fb_browser_login_at", new Date().toISOString());
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),
};
