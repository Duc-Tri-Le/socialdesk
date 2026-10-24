import { execFile } from "node:child_process";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { definePrivilegedHandlers } from "@hatch/space-sdk";
import { privileged } from "./privilegedContracts";

const GWS_CLI = "/opt/hatch/bin/hatch_gws_cli";
const FB_CLI = "/opt/hatch/bin/facebook-cli";
const IG_CLI = "/opt/hatch/bin/instagram-cli";

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
        let buf: Buffer;
        if (item.url.startsWith("/uploads/")) {
          const localPath = path.resolve("." + item.url);
          buf = await readFile(localPath);
        } else {
          const res = await fetch(item.url, { redirect: "follow" });
          if (!res.ok) throw new Error(`HTTP ${res.status} khi tải ảnh`);
          buf = Buffer.from(await res.arrayBuffer());
        }
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
