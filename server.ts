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
  handleExtensionWsMessage,
  handleExtensionWsClose,
} from "./server/src/devServer/extensionWs";
import { createLocalContext } from "./server/src/devServer/localContext";

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
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  },
  websocket: {
    open(_ws) {
      console.log(`[WebSocket] Một Chrome Extension vừa kết nối.`);
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
