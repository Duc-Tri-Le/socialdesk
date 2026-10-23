import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./server/src/schema";
import { Actions } from "./server/dist/actions.js";
import path from "node:path";
import fs from "node:fs";

// Khởi tạo Database SQLite cục bộ
const dbPath = path.resolve("./social-desk-database.db");
if (!fs.existsSync(dbPath)) {
  console.warn(`[Cảnh báo] Không tìm thấy file database tại ${dbPath}`);
}
const sqlite = new Database(dbPath);
sqlite.exec("PRAGMA journal_mode = WAL;");
try {
  sqlite.run("ALTER TABLE accounts ADD COLUMN extension_code TEXT NOT NULL DEFAULT '';");
} catch {
  // Cột extension_code đã tồn tại
}
const db = drizzle(sqlite, { schema });

// Quản lý kết nối Chrome Extension qua WebSocket
interface ExtensionWsData {
  code: string;
  connectedAt: number;
}
const extensionSockets = new Map<string, any>();
const pendingExtensionTasks = new Map<string, { resolve: (val: any) => void; reject: (err: any) => void; timer: any }>();

// Hàm toàn cục cho actions.ts gọi
(globalThis as any).__socialDeskGetOnlineExtensionCodes = () => Array.from(extensionSockets.keys());
(globalThis as any).__socialDeskIsExtensionOnline = (code: string) => !!code && extensionSockets.has(code.trim().toUpperCase());
(globalThis as any).__socialDeskSendExtensionTask = async (code: string, task: any, timeoutMs = 60000) => {
  const normCode = (code || "").trim().toUpperCase();
  const ws = extensionSockets.get(normCode);
  if (!ws) {
    throw new Error(`Chrome với mã [${normCode}] chưa kết nối. Vui lòng mở Chrome tương ứng và kiểm tra Extension.`);
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingExtensionTasks.delete(task.taskId);
      reject(new Error(`Quá thời gian chờ phản hồi từ Chrome [${normCode}] (${Math.round(timeoutMs / 1000)}s)`));
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

// Thư mục lưu trữ media
const uploadsDir = path.resolve("./uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Hàm đọc dữ liệu Google Sheet trực tiếp (độc lập, không cần CLI hệ thống)
async function fetchGoogleSheetGrid(
  spreadsheetId: string,
  rawRange?: string,
  includeGridData = false,
) {
  try {
    let sheetName = "";
    if (rawRange) {
      const match = rawRange.match(/^'?(.*?)'?!/);
      if (match && match[1]) {
        sheetName = match[1];
      } else {
        sheetName = rawRange.replace(/^'|'$/g, "").trim();
      }
    }

    const tabParam = sheetName ? `&sheet=${encodeURIComponent(sheetName)}` : "";
    const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:json${tabParam}`;

    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
    });

    if (!res.ok) {
      if (res.status === 403 || res.status === 401) {
        return {
          ok: false,
          stdout: "",
          stderr:
            "Lỗi quyền truy cập 403: File Sheet chưa được chia sẻ công khai. Hãy mở file Sheet → Chia sẻ → chọn 'Bất kỳ ai có đường link' (Quyền Người xem).",
          exitCode: 1,
        };
      }
      if (res.status === 404) {
        return {
          ok: false,
          stdout: "",
          stderr:
            "Lỗi 404: Không tìm thấy file Google Sheet. Hãy kiểm tra lại đường link nguồn Sheet đã lưu.",
          exitCode: 1,
        };
      }
      return {
        ok: false,
        stdout: "",
        stderr: `Lỗi kết nối Google Sheets (Mã HTTP ${res.status})`,
        exitCode: 1,
      };
    }

    const text = await res.text();
    const jsonStr = text.replace(/^[^{]*\(/, "").replace(/\);?$/, "");
    const gviz = JSON.parse(jsonStr);

    if (!includeGridData) {
      return {
        ok: true,
        stdout: JSON.stringify({
          properties: { title: "BUSINESS" },
          sheets: [{ properties: { title: sheetName || "Trang tính1" } }],
        }),
        stderr: "",
        exitCode: 0,
      };
    }

    // Trích xuất hàng tiêu đề
    const headerValues = gviz.table.cols.map((c: any) => ({
      formattedValue: c.label || "",
    }));

    // Trích xuất các hàng dữ liệu, tự động kế thừa Hãng xe khi bị gộp ô dọc (merged cells)
    let lastMaker = "";
    const dataRows = gviz.table.rows.map((r: any) => {
      const stt = r.c[0]?.v;
      const model = r.c[2]?.v;
      let maker = r.c[1]?.v;

      if (maker !== null && maker !== undefined && String(maker).trim() !== "") {
        lastMaker = String(maker).trim();
      } else if (
        (stt !== null && stt !== undefined) ||
        (model !== null && model !== undefined)
      ) {
        maker = lastMaker;
      }

      const values = r.c.map((cell: any, colIdx: number) => {
        let val =
          cell?.f ??
          (cell?.v !== null && cell?.v !== undefined ? String(cell?.v) : "");
        if (colIdx === 1 && maker) {
          val = maker;
        }
        return {
          formattedValue: val,
          hyperlink:
            typeof cell?.v === "string" && cell.v.startsWith("http")
              ? cell.v
              : undefined,
          userEnteredValue: { stringValue: val },
        };
      });

      return { values };
    });

    const gridJson = {
      properties: { title: "BUSINESS" },
      sheets: [
        {
          properties: { title: sheetName || "Trang tính1" },
          merges: [],
          data: [
            {
              startRow: 0,
              startColumn: 0,
              rowData: [{ values: headerValues }, ...dataRows],
            },
          ],
        },
      ],
    };

    return {
      ok: true,
      stdout: JSON.stringify(gridJson),
      stderr: "",
      exitCode: 0,
    };
  } catch (err: any) {
    return {
      ok: false,
      stdout: "",
      stderr: `Lỗi khi đọc file Google Sheet: ${err?.message || String(err)}`,
      exitCode: 1,
    };
  }
}

// Hàm đọc danh sách file ảnh trong thư mục Google Drive (độc lập, không cần CLI)
async function fetchGoogleDriveFolder(folderId: string) {
  try {
    const url = `https://drive.google.com/drive/folders/${folderId}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    if (!res.ok) {
      if (res.status === 403 || res.status === 401) {
        return {
          ok: false,
          stdout: "",
          stderr:
            "Không có quyền mở thư mục Drive (403). Hãy chia sẻ thư mục ở chế độ 'Bất kỳ ai có đường link' (Quyền Người xem).",
          exitCode: 1,
        };
      }
      return {
        ok: false,
        stdout: "",
        stderr: `Lỗi mở thư mục Drive (HTTP ${res.status})`,
        exitCode: 1,
      };
    }

    const text = await res.text();
    const files: Array<{
      id: string;
      name: string;
      mimeType: string;
      size: string;
      webViewLink: string;
    }> = [];

    const regex =
      /aria-label="([^"]+?\.(?:jpe?g|png|heic|heif|webp|gif))[^"]*"[^>]*ssk=['"][^'"]*?([a-zA-Z0-9_-]{28,45})/gi;
    let match;
    const seen = new Set<string>();

    while ((match = regex.exec(text)) !== null) {
      const name = match[1] || "";
      const rawId = match[2];
      if (!rawId) continue;
      let id = rawId.replace(/-\d+-\d+$/, "");
      if (!seen.has(id)) {
        seen.add(id);
        const ext = name.split(".").pop()?.toLowerCase() || "";
        const mimeType =
          ext === "png"
            ? "image/png"
            : ext === "webp"
              ? "image/webp"
              : ext === "heic" || ext === "heif"
                ? "image/heic"
                : "image/jpeg";
        files.push({
          id,
          name,
          mimeType,
          size: "0",
          webViewLink: `https://drive.google.com/file/d/${id}/view`,
        });
      }
    }

    return {
      ok: true,
      stdout: JSON.stringify({ files }),
      stderr: "",
      exitCode: 0,
    };
  } catch (err: any) {
    return {
      ok: false,
      stdout: "",
      stderr: `Lỗi kết nối khi quét thư mục Drive: ${err?.message || String(err)}`,
      exitCode: 1,
    };
  }
}

// Cấu hình ngữ cảnh (Context) cho backend
const ctx = {
  db() {
    return db;
  },
  invalidateQueries() {},
  async executePrivileged(contract: any, args: any) {
    // 1. Đồng bộ Google Sheets
    if (args && args.spreadsheetId) {
      const range = Array.isArray(args.ranges) && args.ranges.length > 0 ? args.ranges[0] : "";
      return await fetchGoogleSheetGrid(args.spreadsheetId, range, args.includeGridData);
    }

    // 2. Liệt kê thư mục Drive
    if (args && args.folderId) {
      return await fetchGoogleDriveFolder(args.folderId);
    }

    console.log("[Privileged Call]", contract, args);
    return {
      ok: false,
      stdout: "",
      stderr:
        "Tính năng dòng lệnh hệ thống chưa kết nối trực tiếp. Vui lòng cấu hình API hoặc thực hiện thủ công.",
      exitCode: 1,
    };
  },
  inference: {
    async complete(_prompt: string, _opts?: any) {
      // Mặc định fallback về mẫu viết bài ĐỨC GARAGE nếu chưa cấu hình API key AI
      throw new Error("Local AI inference not configured, falling back to template.");
    },
  },
  agent: {
    async spawnTask(msg: string, opts?: any) {
      console.log("[Agent Task Spawned]", msg, opts);
      return {
        ok: false,
        error: "Tác vụ tự động hóa trình duyệt chỉ hoạt động trên môi trường có browser runner.",
      };
    },
  },
  blobs: {
    async getUrl(key: string) {
      return `/uploads/${key}`;
    },
    async put(key: string, data: any, _opts?: any) {
      const targetPath = path.join(uploadsDir, key);
      fs.writeFileSync(targetPath, Buffer.from(data));
      return { key };
    },
    async delete(key: string) {
      const targetPath = path.join(uploadsDir, key);
      if (fs.existsSync(targetPath)) {
        fs.unlinkSync(targetPath);
      }
    },
  },
};

const clientDistDir = path.resolve("./client/dist");
const PORT = Number(process.env.PORT) || 3000;

const server = Bun.serve<ExtensionWsData>({
  port: PORT,
  async fetch(req, serverInstance) {
    const url = new URL(req.url);

    // 0. WebSocket Upgrade cho Chrome Extension
    if (url.pathname === "/ws" || url.pathname === "/ws/extension") {
      const upgraded = serverInstance.upgrade(req, {
        data: { code: "", connectedAt: Date.now() },
      });
      if (upgraded) return undefined;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    // API tra cứu danh sách Chrome Extension đang Online
    if (url.pathname === "/api/extensions") {
      return new Response(
        JSON.stringify({
          onlineCodes: Array.from(extensionSockets.keys()),
        }),
        {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        },
      );
    }

    // CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    // 1. Xử lý API Actions (RPC endpoint)
    if (url.pathname === "/actions" || url.pathname === "./actions") {
      if (req.method !== "POST") {
        return new Response("Method not allowed", { status: 405 });
      }

      try {
        const body = (await req.json()) as { action: string; args: any };
        const actionDef = (Actions as Record<string, any>)[body.action];

        if (!actionDef || typeof actionDef.handler !== "function") {
          console.error(`[RPC] Không tìm thấy action: ${body.action}`);
          return new Response(
            JSON.stringify({ error: `Action '${body.action}' not found` }),
            { status: 404, headers: { "Content-Type": "application/json" } },
          );
        }

        const result = await actionDef.handler(ctx, body.args ?? {});
        return new Response(JSON.stringify(result), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (err: any) {
        console.error(`[RPC Error]`, err);
        return new Response(
          JSON.stringify({
            error: err?.message || "Internal server error",
          }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        );
      }
    }

    // 2. Phục vụ file media trong /uploads/
    if (url.pathname.startsWith("/uploads/")) {
      const filePath = path.join(uploadsDir, url.pathname.replace(/^\/uploads\//, ""));
      const file = Bun.file(filePath);
      if (await file.exists()) {
        return new Response(file);
      }
      return new Response("Not found", { status: 404 });
    }

    // 3. Phục vụ Client tĩnh (React App)
    let filePath = path.join(clientDistDir, url.pathname === "/" ? "index.html" : url.pathname);
    let file = Bun.file(filePath);

    if (await file.exists()) {
      return new Response(file);
    }

    // SPA fallback: trả về index.html nếu không tìm thấy tệp tĩnh
    const indexFile = Bun.file(path.join(clientDistDir, "index.html"));
    if (await indexFile.exists()) {
      return new Response(indexFile);
    }

    return new Response("Social Desk: Client build not found. Please build client first.", {
      status: 404,
    });
  },
  websocket: {
    open(_ws) {
      console.log(`[WebSocket] Một Chrome Extension vừa kết nối.`);
    },
    message(ws, message) {
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
              const rows = sqlite.query("SELECT * FROM accounts WHERE extension_code = ?").all(code) as any[];
              if (rows.length === 0) {
                const autoName = fbName || `Nick Facebook ${code}`;
                sqlite.run(
                  "INSERT INTO accounts (platform, name, handle, profile_url, extension_code, linked, selected, created_at) VALUES (?, ?, ?, ?, ?, 1, 1, ?)",
                  ["Facebook", autoName, "Tài khoản Chrome Extension", fbUrl, code, Date.now()]
                );
                console.log(`[WebSocket] ✓ Tự động tạo tài khoản Facebook: "${autoName}" từ Chrome [${code}]`);
              } else if (fbName && rows[0].name !== fbName) {
                sqlite.run(
                  "UPDATE accounts SET name = ?, profile_url = COALESCE(NULLIF(?, ''), profile_url) WHERE id = ?",
                  [fbName, fbUrl, rows[0].id]
                );
                console.log(`[WebSocket] ✓ Cập nhật tên nick Facebook thành "${fbName}" cho mã [${code}]`);
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
    },
    close(ws) {
      if (ws.data?.code) {
        extensionSockets.delete(ws.data.code);
        console.log(`[WebSocket] Chrome Extension mã [${ws.data.code}] đã ngắt kết nối.`);
      }
    },
  },
});

console.log(`=======================================================`);
console.log(`🚀 Social Desk Standalone Server đang chạy tại:`);
console.log(`👉 http://localhost:${server.port}`);
console.log(`Database: ${dbPath}`);
console.log(`=======================================================`);
