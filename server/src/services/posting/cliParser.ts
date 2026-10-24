import { normalizeNameKey, type FbPageRef, type IgAccountRef } from "./postingTypes";

export { normalizeNameKey };

// CLI của connector in JSON (có thể kèm khối _meta) — lấy JSON object cuối cùng parse được từ stdout.
export function parseCliJson(stdout: string): Record<string, unknown> | null {
  const text = stdout.trim();
  if (!text) return null;
  try {
    const v = JSON.parse(text) as unknown;
    return typeof v === "object" && v !== null
      ? (v as Record<string, unknown>)
      : null;
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        const v = JSON.parse(text.slice(start, end + 1)) as unknown;
        return typeof v === "object" && v !== null
          ? (v as Record<string, unknown>)
          : null;
      } catch {
        return null;
      }
    }
    return null;
  }
}

export function cliErrorText(res: { stdout: string; stderr: string }): string {
  const j = parseCliJson(res.stdout);
  const err =
    (typeof j?.error === "string" && j.error) ||
    (typeof (j?.error as { message?: unknown } | undefined)?.message ===
      "string" &&
      ((j?.error as { message: string }).message as string)) ||
    "";
  const raw = (err || res.stderr || res.stdout || "").trim();
  return raw.slice(0, 400);
}

// Tìm link/ID bài đã đăng trong JSON trả về của lệnh đăng
export function extractPostRef(j: Record<string, unknown> | null): {
  url: string;
  state: string;
} {
  if (!j) return { url: "", state: "" };
  const data =
    typeof j.data === "object" && j.data !== null
      ? (j.data as Record<string, unknown>)
      : j;
  const pick = (o: Record<string, unknown>, keys: string[]): string => {
    for (const k of keys) {
      const v = o[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return "";
  };
  const url =
    pick(data, ["post_url", "url", "permalink", "postUrl"]) ||
    pick(j, ["post_url", "url", "permalink"]);
  const state = pick(data, ["state", "status"]) || pick(j, ["state", "status"]);
  return { url, state };
}

export function parseFbPages(stdout: string): FbPageRef[] {
  const j = parseCliJson(stdout);
  const arr = Array.isArray(j?.data) ? j.data : [];
  const out: FbPageRef[] = [];
  for (const item of arr) {
    if (typeof item !== "object" || item === null) continue;
    const o = item as Record<string, unknown>;
    const pageId =
      typeof o.page_id === "string" || typeof o.page_id === "number"
        ? String(o.page_id)
        : "";
    const name = typeof o.name === "string" ? o.name : "";
    if (pageId) out.push({ page_id: pageId, name });
  }
  return out;
}

export function parseIgAccounts(stdout: string): IgAccountRef[] {
  const j = parseCliJson(stdout);
  const arr = Array.isArray(j?.accounts) ? j.accounts : [];
  const out: IgAccountRef[] = [];
  for (const item of arr) {
    if (typeof item !== "object" || item === null) continue;
    const o = item as Record<string, unknown>;
    const fbid =
      typeof o.user_fbid === "string" || typeof o.user_fbid === "number"
        ? String(o.user_fbid)
        : "";
    const username = typeof o.username === "string" ? o.username : "";
    if (fbid) out.push({ user_fbid: fbid, username });
  }
  return out;
}

// Username Instagram suy từ tài khoản trong app: handle (@tên / tên) hoặc link hồ sơ instagram.com/<tên>/.
export function igUsernameOf(a: {
  name: string;
  handle: string;
  profileUrl: string;
}): string {
  const fromUrl = a.profileUrl.match(/instagram\.com\/([^/?#]+)/);
  if (fromUrl && fromUrl[1]) return fromUrl[1].replace(/^@/, "").toLowerCase();
  const h = a.handle.trim().replace(/^@/, "");
  if (h && !/\s/.test(h)) return h.toLowerCase();
  const n = a.name.trim();
  return /\s/.test(n) ? "" : n.toLowerCase();
}
