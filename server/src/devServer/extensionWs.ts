import type { Database } from "bun:sqlite";

export interface ExtensionWsData {
  code: string;
  connectedAt: number;
}

export const extensionSockets = new Map<string, any>();
export const pendingExtensionTasks = new Map<
  string,
  { resolve: (val: any) => void; reject: (err: any) => void; timer: any }
>();
export const allSockets = new Set<any>();

export function registerGlobalExtensionHelpers() {
  (globalThis as any).__socialDeskGetOnlineExtensionCodes = () => {
    const active: string[] = [];
    for (const [code, ws] of extensionSockets.entries()) {
      if (ws && (ws.readyState === 1 || ws.readyState === undefined)) {
        active.push(code);
      } else {
        extensionSockets.delete(code);
      }
    }
    return active;
  };
  (globalThis as any).__socialDeskIsExtensionOnline = (code: string) => {
    if (!code) return false;
    const norm = code.trim().toUpperCase();
    const ws = extensionSockets.get(norm);
    if (!ws) return false;
    if (ws.readyState === 1 || ws.readyState === undefined) return true;
    extensionSockets.delete(norm);
    return false;
  };
  (globalThis as any).__socialDeskPingExtensions = () => {
    for (const ws of allSockets) {
      try {
        ws.send(JSON.stringify({ type: "REQUEST_REGISTRATION" }));
      } catch {}
    }
  };
  (globalThis as any).__socialDeskReloadExtensions = () => {
    for (const ws of allSockets) {
      try {
        ws.send(JSON.stringify({ type: "RELOAD_EXTENSION" }));
      } catch {}
    }
  };
  (globalThis as any).__socialDeskSendExtensionTask = async (
    code: string,
    task: any,
    timeoutMs = 60000,
  ) => {
    const normCode = (code || "").trim().toUpperCase();
    const ws = extensionSockets.get(normCode);
    if (!ws) {
      throw new Error(
        `Chrome với mã [${normCode}] chưa kết nối. Vui lòng mở Chrome tương ứng và kiểm tra Extension.`,
      );
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingExtensionTasks.delete(task.taskId);
        reject(
          new Error(
            `Quá thời gian chờ phản hồi từ Chrome [${normCode}] (${Math.round(timeoutMs / 1000)}s)`,
          ),
        );
      }, timeoutMs);

      pendingExtensionTasks.set(task.taskId, { resolve, reject, timer });

      try {
        ws.send(JSON.stringify(task));
      } catch (err) {
        clearTimeout(timer);
        pendingExtensionTasks.delete(task.taskId);
        reject(err);
      }
    });
  };
}

export function handleExtensionWsOpen(ws: any) {
  allSockets.add(ws);
  console.log(`[WebSocket] Một Chrome Extension vừa kết nối.`);
  try {
    ws.send(JSON.stringify({ type: "REQUEST_REGISTRATION" }));
  } catch (err) {
    console.error(`[WebSocket] Lỗi gửi REQUEST_REGISTRATION:`, err);
  }
}

export function handleExtensionWsMessage(
  ws: any,
  message: string | Buffer,
  sqlite: Database,
) {
  try {
    const text = typeof message === "string" ? message : message.toString();
    const data = JSON.parse(text);

    if (data.type === "REGISTER_EXTENSION") {
      const code = (data.code || "").trim().toUpperCase();
      if (code) {
        if (ws.data?.code && ws.data.code !== code) {
          console.log(
            `[WebSocket] Trình duyệt đổi mã từ [${ws.data.code}] sang [${code}]. Đang gỡ mã cũ...`,
          );
          extensionSockets.delete(ws.data.code);
        }
        ws.data = ws.data || {};
        ws.data.code = code;
        extensionSockets.set(code, ws);
        console.log(`[WebSocket] ✓ Đã ghi nhận Chrome Extension mã: [${code}]`);

        const rawName = (data.fbName || "").trim();
        const isGarbage =
          rawName.includes("\n") ||
          rawName.length < 2 ||
          rawName.length > 50 ||
          /chưa đọc|tin nhắn|thông báo|messenger|bảng tin|facebook|công cụ|kế hoạch|planner|quản trị|quản lý|trung tâm|quảng cáo|cài đặt|kỷ niệm|đã lưu|bảng feed|chợ|marketplace|meta|business|suite/i.test(
            rawName,
          );
        const fbName = isGarbage ? "" : rawName;
        const fbUrl = (data.fbUrl || "").trim();

        // Tự động đồng bộ tài khoản Facebook
        try {
          const rows = sqlite
            .query("SELECT * FROM accounts WHERE platform = 'Facebook' AND extension_code = ?")
            .all(code) as any[];
          if (rows.length === 0) {
            // Tìm tài khoản Facebook đã có để gắn mã thay vì tạo tài khoản rác
            let existingAccount: any = null;
            if (fbUrl && !/^https?:\/\/(www\.)?facebook\.com\/?$/i.test(fbUrl)) {
              const byUrl = sqlite
                .query("SELECT * FROM accounts WHERE profile_url = ?")
                .all(fbUrl) as any[];
              if (byUrl.length > 0) existingAccount = byUrl[0];
            }
            if (!existingAccount && fbName) {
              const byName = sqlite
                .query("SELECT * FROM accounts WHERE platform = 'Facebook' AND name = ?")
                .all(fbName) as any[];
              if (byName.length > 0) existingAccount = byName[0];
            }
            if (!existingAccount) {
              const fbAccounts = sqlite
                .query("SELECT * FROM accounts WHERE platform = 'Facebook'")
                .all() as any[];
              if (fbAccounts.length === 1) {
                const single = fbAccounts[0];
                const oldCode = (single.extension_code || "").trim().toUpperCase();
                if (!oldCode || !extensionSockets.has(oldCode)) {
                  existingAccount = single;
                }
              }
            }

            if (existingAccount) {
              sqlite.run(
                "UPDATE accounts SET extension_code = ?, profile_url = CASE WHEN ? != '' AND ? NOT LIKE '%facebook.com/' THEN ? ELSE profile_url END WHERE id = ?",
                [code, fbUrl, fbUrl, fbUrl, existingAccount.id],
              );
              console.log(
                `[WebSocket] ✓ Tự động gán mã Chrome [${code}] cho tài khoản Facebook "${existingAccount.name}" (id: ${existingAccount.id})`,
              );
            } else {
              // TUYỆT ĐỐI KHÔNG TỰ ĐỘNG TẠO TÀI KHOẢN MỚI
              console.log(
                `[WebSocket] ℹ Chrome [${code}] đã kết nối. Hệ thống không tự động tạo tài khoản (chờ người dùng gán hoặc thêm thủ công trong mục Tài khoản).`,
              );
            }
          } else if (fbName && rows[0].name !== fbName) {
            const isGenericPlaceholder =
              /^Nick Facebook(\s*\(?[A-Z0-9-]+\)?)?$/i.test(rows[0].name.trim());
            if (isGenericPlaceholder) {
              sqlite.run(
                "UPDATE accounts SET name = ? WHERE id = ?",
                [fbName, rows[0].id],
              );
              console.log(
                `[WebSocket] ✓ Gán tên nick Facebook: "${fbName}" cho mã [${code}]`,
              );
            }
          }
        } catch (dbErr) {
          console.warn("[WebSocket] Lỗi đồng bộ tài khoản:", dbErr);
        }

        const clientVersion = (data.version || "").trim();
        console.log(
          `[WebSocket] Chrome [${code}] đã đăng ký thành công (v${clientVersion || "unknown"})`,
        );

        ws.send(JSON.stringify({ type: "REGISTER_OK", code, fbName }));
      }
    } else if (data.type === "PING") {
      ws.send(JSON.stringify({ type: "PONG" }));
    } else if (data.type === "TASK_RESULT") {
      const { taskId } = data;
      if (taskId && pendingExtensionTasks.has(taskId)) {
        const p = pendingExtensionTasks.get(taskId)!;
        clearTimeout(p.timer);
        pendingExtensionTasks.delete(taskId);
        p.resolve(data);
      }
    }
  } catch (err) {
    console.error("[WebSocket] Lỗi xử lý message:", err);
  }
}

export function handleExtensionWsClose(ws: any) {
  allSockets.delete(ws);
  if (ws.data?.code) {
    extensionSockets.delete(ws.data.code);
    console.log(
      `[WebSocket] Chrome Extension mã [${ws.data.code}] đã ngắt kết nối.`,
    );
  }
  for (const [code, sock] of extensionSockets.entries()) {
    if (sock === ws) {
      extensionSockets.delete(code);
    }
  }
}
