// Privileged host handlers for Social Desk.
//
// The artifact server itself cannot reach the user's connected Google
// account, but the host CLI `/opt/hatch/bin/hatch_gws_cli` can (it is the
// Google Sheets connector's own command). Reading the product sheet used
// to be delegated to a background agent task, which frequently never ran
// to completion — the user pressed "Đồng bộ" and nothing ever loaded.
// This handler lets the sync action read the sheet synchronously, in the
// same click, and surface real errors (not connected, 403 sharing, …)
// instead of hanging forever on a "syncing" status.

import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
definePrivilegedContracts,
definePrivilegedHandlers,
z,
} from "@hatch/space-sdk";

const GWS_CLI = "/opt/hatch/bin/hatch_gws_cli";
const FB_CLI = "/opt/hatch/bin/facebook-cli";
const IG_CLI = "/opt/hatch/bin/instagram-cli";

export const privileged = definePrivilegedContracts({
  fetchSheetGrid: {
    request: z.object({
      spreadsheetId: z.string().min(1),
      ranges: z.array(z.string()).default([]),
      includeGridData: z.boolean().default(false),
      fields: z.string().min(1),
    }),
    response: z.object({
      ok: z.boolean(),
      stdout: z.string(),
      stderr: z.string(),
      exitCode: z.number(),
    }),
    capabilities: ["google_sheets.spreadsheets.get"],
    timeoutMs: 90000,
  },
  // Tìm hội nhóm Facebook theo điều kiện chọn (từ khóa, phạm vi, sắp xếp,
  // trạng thái, số kết quả) bằng facebook-cli của connector đã liên kết —
  // cùng lệnh mà lệnh `groups-find` của tool Social Desk trên máy chạy.
  searchFbGroups: {
    request: z.object({
      keywords: z.string().default(""),
      role: z.enum(["any", "connected", "admin", "admod"]),
      sortBy: z.enum([
        "MOST_RELEVANT",
        "LARGEST",
        "RECENT_ACTIVITY",
        "LAST_VISITED",
        "ALPHABETICAL",
      ]),
      status: z.enum(["any", "weekly_active", "non_archived", "archived"]),
      // Trần 25 theo đúng lệnh `groups search` gốc của Facebook/CLI.
      limit: z.number().int().min(1).max(25),
    }),
    response: z.object({
      ok: z.boolean(),
      stdout: z.string(),
      stderr: z.string(),
      exitCode: z.number(),
    }),
    capabilities: ["facebook.groups.search"],
    timeoutMs: 90000,
  },
  // Đọc chi tiết MỘT nhóm theo mã/tên vanity lấy từ link nhóm trên
  // trang kết quả tìm kiếm Facebook web mà người dùng tự mở trong
  // trình duyệt của mình và dán vào app. Lệnh `groups details` chạy
  // bằng tài khoản Facebook ĐÃ LIÊN KẾT (connector) — kênh này đọc
  // được chi tiết nhóm dù trình đọc web của hệ thống không có phiên
  // đăng nhập Facebook.
  getFbGroupDetails: {
    request: z.object({
      groupId: z.string().min(1).max(200),
    }),
    response: z.object({
      ok: z.boolean(),
      stdout: z.string(),
      stderr: z.string(),
      exitCode: z.number(),
    }),
    capabilities: ["facebook.groups.details"],
    timeoutMs: 45000,
  },
  // Đọc vài bài đăng trong MỘT nhóm: với nhóm KÍN (không công khai),
  // chỉ thành viên mới đọc được bài bên trong — nên đọc được bài là
  // bằng chứng tài khoản Facebook đã liên kết ĐÃ tham gia nhóm đó.
  // Với nhóm công khai, ai cũng đọc được nên kết quả không nói lên
  // trạng thái tham gia (action chỉ dùng tín hiệu này cho nhóm kín).
  getFbGroupPosts: {
    request: z.object({
      groupId: z.string().min(1).max(200),
    }),
    response: z.object({
      ok: z.boolean(),
      stdout: z.string(),
      stderr: z.string(),
      exitCode: z.number(),
    }),
    capabilities: ["facebook.groups.posts"],
    timeoutMs: 45000,
  },
  // Liệt kê file THẬT bên trong một thư mục Google Drive (cột "Link
  // ảnh" trong Sheet BUSINESS là link thư mục …/drive/folders/<ID>).
  // Chạy bằng tài khoản Google Drive ĐÃ KẾT NỐI (alexsander01102000)
  // qua CLI của connector Drive — cùng CLI với Sheets nhưng resource
  // `drive files list`. Trả JSON thô để action tự phân tích
  // (id/name/mimeType/size/thumbnailLink/webViewLink).
  listDriveFolder: {
    request: z.object({
      folderId: z.string().min(1).max(200),
    }),
    response: z.object({
      ok: z.boolean(),
      stdout: z.string(),
      stderr: z.string(),
      exitCode: z.number(),
    }),
    capabilities: ["google_drive.files.list"],
    timeoutMs: 60000,
  },
  // Kiểm tra phiên đăng nhập Facebook (lệnh `me`) TRƯỚC khi tìm nhóm:
  // nếu phiên hết hạn, lần tìm phải báo rõ "phiên hết hạn" thay vì trả
  // về 0 nhóm như thể không có nhóm nào khớp điều kiện.
  checkFbSession: {
    request: z.object({}),
    response: z.object({
      ok: z.boolean(),
      stdout: z.string(),
      stderr: z.string(),
      exitCode: z.number(),
    }),
    capabilities: ["facebook.me"],
    timeoutMs: 45000,
  },
  // ---- ĐĂNG THẬT (nút "Đăng thật" trong Hàng đợi duyệt) -----------
  // Liệt kê các Page mà tài khoản Facebook đã liên kết quản trị
  // (lệnh `pages list`) để action khớp Page trong app với page_id
  // thật của Meta theo TÊN Page.
  listFbPages: {
    request: z.object({}),
    response: z.object({
      ok: z.boolean(),
      stdout: z.string(),
      stderr: z.string(),
      exitCode: z.number(),
    }),
    capabilities: ["facebook.pages.list"],
    timeoutMs: 45000,
  },
  // Đăng THẬT một bài lên một Facebook Page (lệnh `pages posts
  // create --privacy PUBLIC`): đúng caption đã duyệt + đúng các file
  // ảnh đã chuẩn bị. Đây là lệnh ghi ra ngoài — chỉ chạy khi người
  // dùng bấm "Xác nhận đăng thật" trong app.
  publishFbPagePost: {
    request: z.object({
      pageId: z.string().min(1).max(64),
      text: z.string().min(1).max(8000),
      files: z.array(z.string().min(1).max(500)).max(12).default([]),
    }),
    response: z.object({
      ok: z.boolean(),
      stdout: z.string(),
      stderr: z.string(),
      exitCode: z.number(),
    }),
    capabilities: ["facebook.pages.posts.create"],
    timeoutMs: 240000,
  },
  // Liệt kê các tài khoản Instagram đã liên kết (lệnh `accounts`) để
  // action khớp tài khoản Instagram trong app với user_fbid thật
  // theo username.
  listIgAccounts: {
    request: z.object({}),
    response: z.object({
      ok: z.boolean(),
      stdout: z.string(),
      stderr: z.string(),
      exitCode: z.number(),
    }),
    capabilities: ["instagram.accounts"],
    timeoutMs: 45000,
  },
  // Đăng THẬT một bài lên Instagram (lệnh `post-feed`): một ảnh =
  // bài ảnh, nhiều ảnh = carousel, đúng thứ tự file đã chuẩn bị.
  publishIgPost: {
    request: z.object({
      accountId: z.string().min(1).max(64),
      caption: z.string().max(2200).default(""),
      files: z.array(z.string().min(1).max(500)).min(1).max(12),
    }),
    response: z.object({
      ok: z.boolean(),
      stdout: z.string(),
      stderr: z.string(),
      exitCode: z.number(),
    }),
    capabilities: ["instagram.post-feed"],
    timeoutMs: 240000,
  },
  // Tải các ảnh ĐÃ CHỐT của bản nháp (bản JPEG Drive kết xuất, hoặc
  // ảnh người dùng tải lên) về thư mục làm việc ~/workspace/
  // social-desk-publish/<mã bài>/ để hai lệnh đăng Page/Instagram
  // đính kèm file local. Chỉ nhận file thật sự là JPEG/PNG, tối đa
  // 20MB/ảnh. Trả JSON {dir, files:[{path, ok, error, bytes}]}.
  preparePublishMedia: {
    request: z.object({
      code: z.string().min(1).max(80),
      urls: z
        .array(
          z.object({
            url: z.string().min(1).max(2000),
            name: z.string().max(300).default(""),
          }),
        )
        .min(1)
        .max(12),
    }),
    response: z.object({
      ok: z.boolean(),
      stdout: z.string(),
      stderr: z.string(),
      exitCode: z.number(),
    }),
    capabilities: ["google_drive.files.list"],
    timeoutMs: 120000,
  },
});

function runCli(
  bin: string,
  cliArgs: string[],
  timeoutMs: number,
): Promise<{ ok: boolean; stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    execFile(
      bin,
      cliArgs,
      { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 },
      (error, stdout, stderr) => {
        const out = typeof stdout === "string" ? stdout : "";
        const errText =
          (typeof stderr === "string" ? stderr : "") ||
          (error ? String(error.message ?? error) : "");
        if (error) {
          const code =
            typeof (error as { code?: unknown }).code === "number"
              ? ((error as { code: number }).code as number)
              : 1;
          resolve({ ok: false, stdout: out, stderr: errText, exitCode: code });
          return;
        }
        resolve({ ok: true, stdout: out, stderr: errText, exitCode: 0 });
      },
    );
  });
}

function runFbCli(
  cliArgs: string[],
  timeoutMs: number,
): Promise<{ ok: boolean; stdout: string; stderr: string; exitCode: number }> {
  return runCli(FB_CLI, cliArgs, timeoutMs);
}

export const privilegedHandlers = definePrivilegedHandlers(privileged, {
  fetchSheetGrid(args) {
    const params: Record<string, unknown> = {
      spreadsheetId: args.spreadsheetId,
      fields: args.fields,
    };
    if (args.ranges.length > 0) params.ranges = args.ranges;
    if (args.includeGridData) params.includeGridData = true;
    return new Promise((resolve) => {
      execFile(
        GWS_CLI,
        [
          "sheets",
          "spreadsheets",
          "get",
          "--params",
          JSON.stringify(params),
        ],
        { timeout: 80000, maxBuffer: 32 * 1024 * 1024 },
        (error, stdout, stderr) => {
          const out = typeof stdout === "string" ? stdout : "";
          const errText =
            (typeof stderr === "string" ? stderr : "") ||
            (error ? String(error.message ?? error) : "");
          if (error) {
            const code =
              typeof (error as { code?: unknown }).code === "number"
                ? ((error as { code: number }).code as number)
                : 1;
            resolve({
              ok: false,
              stdout: out,
              stderr: errText,
              exitCode: code,
            });
            return;
          }
          resolve({ ok: true, stdout: out, stderr: errText, exitCode: 0 });
        },
      );
    });
  },
  searchFbGroups(args) {
    const cliArgs = [
      "groups",
      "search",
      "--role",
      args.role,
      "--sort-by",
      args.sortBy,
      "--status",
      args.status,
      "--limit",
      String(args.limit),
    ];
    const kw = args.keywords.trim();
    if (kw) cliArgs.push("--keywords", kw);
    return runFbCli(cliArgs, 80000);
  },
  getFbGroupDetails(args) {
    return runFbCli(["groups", "details", "--group-id", args.groupId], 40000);
  },
  getFbGroupPosts(args) {
    return runFbCli(
      ["groups", "posts", "--group-id", args.groupId, "--limit", "3"],
      40000,
    );
  },
  checkFbSession() {
    return runFbCli(["me"], 40000);
  },
  listFbPages() {
    return runFbCli(["pages", "list", "--limit", "20"], 40000);
  },
  publishFbPagePost(args) {
    const cliArgs = [
      "pages",
      "posts",
      "create",
      "--page-id",
      args.pageId,
      "--text",
      args.text,
      "--privacy",
      "PUBLIC",
    ];
    for (const f of args.files) cliArgs.push("--file", f);
    return runFbCli(cliArgs, 230000);
  },
  listIgAccounts() {
    return runCli(IG_CLI, ["accounts"], 40000);
  },
  publishIgPost(args) {
    const cliArgs = ["post-feed", "--account-id", args.accountId];
    for (const f of args.files) cliArgs.push("--file", f);
    if (args.caption.trim()) cliArgs.push("--caption", args.caption);
    return runCli(IG_CLI, cliArgs, 230000);
  },
  async preparePublishMedia(args) {
    const safeCode = args.code.replace(/[^\w-]+/g, "_").slice(0, 60) || "bai";
    const dir = path.join(
      os.homedir(),
      "workspace",
      "social-desk-publish",
      safeCode,
    );
    const files: Array<{
      path: string;
      ok: boolean;
      error: string;
      bytes: number;
    }> = [];
    try {
      await mkdir(dir, { recursive: true });
    } catch (e) {
      return {
        ok: false,
        stdout: JSON.stringify({ dir, files }),
        stderr: e instanceof Error ? e.message : String(e),
        exitCode: 1,
      };
    }
    for (let i = 0; i < args.urls.length; i += 1) {
      const item = args.urls[i];
      if (!item) continue;
      try {
        const res = await fetch(item.url, { redirect: "follow" });
        if (!res.ok) throw new Error(`HTTP ${res.status} khi tải ảnh`);
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length === 0) throw new Error("File ảnh tải về rỗng.");
        if (buf.length > 20 * 1024 * 1024)
          throw new Error("File ảnh quá lớn (hơn 20MB).");
        const isJpeg = buf[0] === 0xff && buf[1] === 0xd8;
        const isPng =
          buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
        if (!isJpeg && !isPng)
          throw new Error(
            "File tải về không phải ảnh JPEG/PNG (có thể link ảnh chưa chia sẻ công khai cho người có link).",
          );
        const filePath = path.join(dir, `anh-${i + 1}.${isPng ? "png" : "jpg"}`);
        await writeFile(filePath, buf);
        files.push({ path: filePath, ok: true, error: "", bytes: buf.length });
      } catch (e) {
        files.push({
          path: "",
          ok: false,
          error: e instanceof Error ? e.message : String(e),
          bytes: 0,
        });
      }
    }
    return {
      ok: files.some((f) => f.ok),
      stdout: JSON.stringify({ dir, files }),
      stderr: "",
      exitCode: 0,
    };
  },
  listDriveFolder(args) {
    const q = `'${args.folderId.replace(/'/g, "")}' in parents and trashed=false`;
    const params = JSON.stringify({
      q,
      pageSize: 100,
      fields:
        "files(id,name,mimeType,size,thumbnailLink,webViewLink,webContentLink)",
      orderBy: "name_natural",
    });
    return new Promise((resolve) => {
      execFile(
        GWS_CLI,
        ["drive", "files", "list", "--params", params],
        { timeout: 55000, maxBuffer: 16 * 1024 * 1024 },
        (error, stdout, stderr) => {
          const out = typeof stdout === "string" ? stdout : "";
          const errText =
            (typeof stderr === "string" ? stderr : "") ||
            (error ? String(error.message ?? error) : "");
          if (error) {
            const code =
              typeof (error as { code?: unknown }).code === "number"
                ? ((error as { code: number }).code as number)
                : 1;
            resolve({ ok: false, stdout: out, stderr: errText, exitCode: code });
            return;
          }
          resolve({ ok: true, stdout: out, stderr: errText, exitCode: 0 });
        },
      );
    });
  },
});
