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

export function registerGlobalExtensionHelpers() {
  (globalThis as any).__socialDeskGetOnlineExtensionCodes = () =>
    Array.from(extensionSockets.keys());
  (globalThis as any).__socialDeskIsExtensionOnline = (code: string) =>
    !!code && extensionSockets.has(code.trim().toUpperCase());
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
        ws.data.code = code;
        extensionSockets.set(code, ws);
        console.log(`[WebSocket] ✓ Đã ghi nhận Chrome Extension mã: [${code}]`);

        const fbName = (data.fbName || "").trim();
        const fbUrl = (data.fbUrl || "").trim();

        // Tự động đồng bộ tài khoản Facebook lấy tên nick từ Facebook
        try {
          const rows = sqlite
            .query("SELECT * FROM accounts WHERE extension_code = ?")
            .all(code) as any[];
          if (rows.length === 0) {
            const autoName = fbName || `Nick Facebook ${code}`;
            const initialUrl =
              fbUrl && !/^https?:\/\/(www\.)?facebook\.com\/?$/i.test(fbUrl)
                ? fbUrl
                : "";
            sqlite.run(
              "INSERT INTO accounts (platform, name, handle, profile_url, extension_code, linked, selected, created_at) VALUES (?, ?, ?, ?, ?, 1, 1, ?)",
              [
                "Facebook",
                autoName,
                "Tài khoản Chrome Extension",
                initialUrl,
                code,
                Date.now(),
              ],
            );
            console.log(
              `[WebSocket] ✓ Tự động tạo tài khoản Facebook: "${autoName}" từ Chrome [${code}]`,
            );
          } else if (fbName && rows[0].name !== fbName) {
            const hasCustomUrl =
              rows[0].profile_url &&
              !/^https?:\/\/(www\.)?facebook\.com\/?$/i.test(
                rows[0].profile_url,
              );
            const isValidFbUrl =
              fbUrl && !/^https?:\/\/(www\.)?facebook\.com\/?$/i.test(fbUrl);
            if (!hasCustomUrl && isValidFbUrl) {
              sqlite.run(
                "UPDATE accounts SET name = ?, profile_url = ? WHERE id = ?",
                [fbName, fbUrl, rows[0].id],
              );
            } else {
              sqlite.run(
                "UPDATE accounts SET name = ? WHERE id = ?",
                [fbName, rows[0].id],
              );
            }
            console.log(
              `[WebSocket] ✓ Cập nhật tên nick Facebook thành "${fbName}" cho mã [${code}]`,
            );
          }
        } catch (dbErr) {
          console.warn("[WebSocket] Lỗi đồng bộ tài khoản:", dbErr);
        }

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
  if (ws.data?.code) {
    extensionSockets.delete(ws.data.code);
    console.log(
      `[WebSocket] Chrome Extension mã [${ws.data.code}] đã ngắt kết nối.`,
    );
  }
}
