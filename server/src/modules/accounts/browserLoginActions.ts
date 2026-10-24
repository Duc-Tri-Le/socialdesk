import { defineAction, z } from "@hatch/space-sdk";
import { eq } from "drizzle-orm";
import * as schema from "../../schema";
import { getSetting, setSetting } from "../../services/settings";

export const browserLoginActions = {
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
