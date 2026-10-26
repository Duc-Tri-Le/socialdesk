import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./server/src/schema";
import { Actions } from "./server/src/actions";
import path from "node:path";
import fs from "node:fs";
import {
  type ExtensionWsData,
  extensionSockets,
  registerGlobalExtensionHelpers,
  handleExtensionWsOpen,
  handleExtensionWsMessage,
  handleExtensionWsClose,
} from "./server/src/devServer/extensionWs";
import { createLocalContext } from "./server/src/devServer/localContext";
import { executePublishDraft } from "./server/src/services/publishing/publishOrchestrator";
import { defaultPackTargets } from "./server/src/services/posting/packBuilder";

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
try {
  sqlite.run("ALTER TABLE post_metrics ADD COLUMN post_status TEXT NOT NULL DEFAULT 'active';");
} catch {
  // Cột post_status đã tồn tại
}
try {
  sqlite.run("ALTER TABLE post_metrics ADD COLUMN scanned_at INTEGER;");
} catch {
  // Cột scanned_at đã tồn tại
}
try {
  sqlite.run("ALTER TABLE drafts ADD COLUMN scheduled_at INTEGER;");
} catch {
  // Cột scheduled_at đã tồn tại
}
try {
  sqlite.run(`CREATE TABLE IF NOT EXISTS post_metric_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    posting_id INTEGER NOT NULL,
    captured_at INTEGER NOT NULL,
    reactions INTEGER DEFAULT 0 NOT NULL,
    comments INTEGER DEFAULT 0 NOT NULL,
    shares INTEGER DEFAULT 0 NOT NULL,
    reach INTEGER,
    source TEXT DEFAULT 'extension_dom' NOT NULL,
    data_quality TEXT DEFAULT 'full' NOT NULL,
    created_at INTEGER NOT NULL
  );`);
  sqlite.run(`CREATE INDEX IF NOT EXISTS idx_snapshots_posting_id ON post_metric_snapshots(posting_id);`);
  sqlite.run(`CREATE INDEX IF NOT EXISTS idx_snapshots_captured_at ON post_metric_snapshots(captured_at);`);
} catch {
  // Bảng post_metric_snapshots đã tồn tại
}
const db = drizzle(sqlite, { schema });

registerGlobalExtensionHelpers();

// Thư mục lưu trữ media
const uploadsDir = path.resolve("./uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const ctx = createLocalContext(db, uploadsDir);

const clientDistDir = path.resolve("./client/dist");
const PORT = Number(process.env.PORT) || 3000;

const server = Bun.serve<ExtensionWsData>({
  port: PORT,
  idleTimeout: 0,
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
          online: Array.from(extensionSockets.keys()),
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

    // Endpoint kích hoạt nạp lại Extension từ xa
    if (url.pathname === "/api/reload-extensions") {
      let count = 0;
      for (const [, ws] of extensionSockets.entries()) {
        try {
          ws.send(JSON.stringify({ type: "RELOAD_EXTENSION" }));
          count++;
        } catch {}
      }
      return new Response(JSON.stringify({ ok: true, reloaded: count }), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
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

      // Tự động tải từ Google Drive về bộ nhớ tạm nếu file chưa có trên đĩa
      const match = url.pathname.match(/\/uploads\/drive\/[^_]+_([a-zA-Z0-9_-]+)\.(?:jpg|jpeg|png)$/i);
      if (match && match[1]) {
        const fileId = match[1];
        try {
          const driveUrls = [
            `https://lh3.googleusercontent.com/d/${fileId}=w1600`,
            `https://drive.google.com/thumbnail?id=${fileId}&sz=w1600`,
          ];
          for (const dUrl of driveUrls) {
            const resp = await fetch(dUrl, {
              headers: {
                "User-Agent":
                  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              },
            });
            if (resp.ok) {
              const buf = Buffer.from(await resp.arrayBuffer());
              if (buf.length > 1024) {
                const dir = path.dirname(filePath);
                if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                fs.writeFileSync(filePath, buf);
                return new Response(buf, {
                  headers: {
                    "Content-Type": "image/jpeg",
                    "Cache-Control": "public, max-age=86400",
                  },
                });
              }
            }
          }
        } catch (e) {
          console.error(`[Server uploads/drive fetch error]:`, e);
        }
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
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  },
  websocket: {
    idleTimeout: 0,
    open(ws) {
      handleExtensionWsOpen(ws);
    },
    message(ws, message) {
      handleExtensionWsMessage(ws, message, sqlite);
    },
    close(ws) {
      handleExtensionWsClose(ws);
    },
  },
});

console.log(`=======================================================`);
console.log(`🚀 Social Desk Standalone Server đang chạy tại:`);
console.log(`👉 http://localhost:${server.port}`);
console.log(`Database: ${dbPath}`);
console.log(`=======================================================`);

// =======================================================
// Bộ hẹn giờ: Tự động quét và đăng bài theo lịch hẹn mỗi 20 giây
// =======================================================
let isSchedulerRunning = false;
setInterval(async () => {
  if (isSchedulerRunning) return;
  isSchedulerRunning = true;
  try {
    const now = Date.now();
    const dueDrafts = sqlite
      .query(
        "SELECT * FROM drafts WHERE scheduled_at IS NOT NULL AND scheduled_at <= ? AND status IN ('approved', 'packed')",
      )
      .all(now) as any[];

    for (const d of dueDrafts) {
      console.log(
        `[Scheduler] ⏰ Phát hiện bài đăng #${d.id} ("${d.product_name}") đã đến giờ hẹn. Bắt đầu đăng tự động...`,
      );
      // Đặt scheduled_at = NULL trước để tránh trùng lặp nếu tác vụ kéo dài
      sqlite.run("UPDATE drafts SET scheduled_at = NULL WHERE id = ?", [d.id]);

      try {
        let targets = { group_ids: [] as number[], page_ids: [] as number[], instagram_account_ids: [] as number[] };
        const raw = d.pack_targets || "";
        if (raw.trim()) {
          try {
            const parsed = JSON.parse(raw);
            targets = {
              group_ids: Array.isArray(parsed.group_ids) ? parsed.group_ids : [],
              page_ids: Array.isArray(parsed.page_ids) ? parsed.page_ids : [],
              instagram_account_ids: Array.isArray(parsed.instagram_account_ids) ? parsed.instagram_account_ids : [],
            };
          } catch {}
        }

        if (
          targets.group_ids.length === 0 &&
          targets.page_ids.length === 0 &&
          targets.instagram_account_ids.length === 0
        ) {
          targets = await defaultPackTargets(db);
        }

        const res = await executePublishDraft(ctx, {
          id: d.id,
          group_ids: targets.group_ids,
          page_ids: targets.page_ids,
          instagram_account_ids: targets.instagram_account_ids,
        });

        console.log(
          `[Scheduler] ✓ Kết quả tự động đăng bài #${d.id}: ${res.ok ? "Thành công" : "Cần kiểm tra"} - ${res.message}`,
        );
      } catch (err: any) {
        console.error(`[Scheduler] ✗ Lỗi khi tự động đăng bài #${d.id}:`, err?.message || err);
      }
    }
  } catch (loopErr) {
    console.error("[Scheduler] Lỗi vòng lặp lịch hẹn:", loopErr);
  } finally {
    isSchedulerRunning = false;
  }
}, 20000);

