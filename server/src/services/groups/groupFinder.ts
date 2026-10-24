import type { Ctx, z } from "@hatch/space-sdk";
import * as schema from "../../schema";
import { privileged } from "../../privileged";
import {
  extractGroupRows,
  pickStr,
  parseMemberCount,
  type foundGroupOut,
  type findGroupsAttempt,
  type findGroupsResponse,
} from "../groups";

export type FindGroupsArgs = {
  keywords: string;
  role: "any" | "connected" | "admin" | "admod";
  sort_by:
    | "MOST_RELEVANT"
    | "LARGEST"
    | "RECENT_ACTIVITY"
    | "LAST_VISITED"
    | "ALPHABETICAL";
  status: "any" | "weekly_active" | "non_archived" | "archived";
  limit: number;
  min_members: number;
};

/**
 * Tìm kiếm nhóm Facebook qua CLI chuẩn.
 */
export async function executeFindGroups(
  ctx: Ctx,
  args: FindGroupsArgs,
): Promise<z.infer<typeof findGroupsResponse>> {
  const db = ctx.db<typeof schema>();
  const empty: z.infer<typeof foundGroupOut>[] = [];
  const attempts: z.infer<typeof findGroupsAttempt>[] = [];
  const kw = args.keywords.trim();

  const finish = (
    ok: boolean,
    message: string,
    rawCount: number,
    results: z.infer<typeof foundGroupOut>[],
  ): z.infer<typeof findGroupsResponse> => ({
    ok,
    message,
    raw_count: rawCount,
    matched_count: results.length,
    results,
    attempts,
  });

  let sessionName = "";
  let sessionErr = "";
  try {
    const s = await ctx.executePrivileged(privileged.checkFbSession, {});
    if (s.ok) {
      try {
        const p = JSON.parse(s.stdout) as {
          name?: unknown;
          fb_user_id?: unknown;
        };
        if (typeof p.fb_user_id === "string" && p.fb_user_id) {
          sessionName = typeof p.name === "string" ? p.name : "";
        } else {
          sessionErr = "lệnh kiểm tra phiên không trả về tài khoản";
        }
      } catch {
        sessionErr = "dữ liệu kiểm tra phiên không hợp lệ";
      }
    } else {
      sessionErr = (s.stderr || s.stdout || "").trim().slice(0, 300);
    }
  } catch (e) {
    sessionErr = e instanceof Error ? e.message : String(e);
  }

  if (!sessionName && sessionErr) {
    return finish(
      false,
      "Không kiểm tra được phiên đăng nhập Facebook trên máy chủ — phiên có thể đã hết hạn. Mở mục Tài khoản để kiểm tra tài khoản Facebook đã liên kết, rồi thử tìm lại." +
        (sessionErr ? ` Chi tiết lỗi: ${sessionErr}` : ""),
      0,
      empty,
    );
  }

  let res: { ok: boolean; stdout: string; stderr: string } | null = null;
  let callErr = "";
  try {
    res = await ctx.executePrivileged(privileged.searchFbGroups, {
      keywords: kw,
      role: args.role,
      sortBy: args.sort_by,
      status: args.status,
      limit: args.limit,
    });
  } catch (e) {
    callErr = e instanceof Error ? e.message : String(e);
  }

  if (callErr || !res || !res.ok) {
    const rawErr = callErr
      ? callErr
      : (res?.stderr || res?.stdout || "").trim();
    const lastError = (rawErr || "CLI lỗi không rõ").slice(0, 300);
    attempts.push({
      keywords: kw,
      sort_by: args.sort_by,
      status: args.status,
      raw_count: 0,
      matched_count: 0,
      note: `lỗi: ${lastError}`,
    });
    const hint = /login|log in|session|auth|đăng nhập/i.test(lastError)
      ? "Phiên Facebook trên máy chủ đã hết hạn hoặc chưa đăng nhập — kiểm tra mục Tài khoản rồi thử lại."
      : /timeout|timed out/i.test(lastError)
        ? "Facebook phản hồi quá chậm (timeout) khi tìm nhóm — thử lại sau ít giây."
        : `Tìm nhóm thất bại. Lỗi từ Facebook: ${lastError}`;
    return finish(false, hint, 0, empty);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(res.stdout) as unknown;
  } catch {
    const lastError = "dữ liệu Facebook trả về không phải JSON hợp lệ";
    attempts.push({
      keywords: kw,
      sort_by: args.sort_by,
      status: args.status,
      raw_count: 0,
      matched_count: 0,
      note: `lỗi: ${lastError}`,
    });
    return finish(false, `Tìm nhóm thất bại: ${lastError}.`, 0, empty);
  }

  const rows = extractGroupRows(parsed);
  if (rows.length === 0) {
    attempts.push({
      keywords: kw,
      sort_by: args.sort_by,
      status: args.status,
      raw_count: 0,
      matched_count: 0,
      note: "tìm kiếm chuẩn Facebook",
    });
    const suggestion =
      args.role === "any" && !kw
        ? "Phạm vi “Tất cả nhóm trên Facebook” bắt buộc phải có từ khóa — hãy nhập từ khóa rồi tìm lại."
        : args.role !== "any"
          ? `Phạm vi này chỉ gồm nhóm của tài khoản đang đăng nhập${sessionName ? ` (${sessionName})` : ""} — nếu nhóm chưa tham gia, hãy chọn phạm vi “Tất cả nhóm trên Facebook”.`
          : "Hãy kiểm tra lại từ khóa hoặc nới điều kiện (phạm vi, trạng thái) — app tìm đúng nguyên văn như trên Facebook, không tự sửa cụm từ.";
    return finish(
      true,
      `Facebook không trả về nhóm nào cho từ khóa “${kw || "(trống)"}” với điều kiện đã chọn. ${suggestion}`,
      0,
      empty,
    );
  }

  const rawCount = rows.length;
  const saved = await db.select().from(schema.fbGroups);
  const savedKeys = new Set<string>();
  for (const g of saved) {
    const m = g.url.match(/groups\/([^/?#]+)/);
    if (m?.[1]) savedKeys.add(m[1]);
    if (g.url.trim()) savedKeys.add(g.url.trim().replace(/\/$/, ""));
  }

  const seen = new Set<string>();
  const results: z.infer<typeof foundGroupOut>[] = [];
  let droppedNoId = 0;
  let droppedDup = 0;
  let droppedMembers = 0;

  for (const g of rows) {
    const fbId = pickStr(g, ["group_id", "id", "fb_id", "groupId"]);
    if (!fbId) {
      droppedNoId += 1;
      continue;
    }
    if (seen.has(fbId)) {
      droppedDup += 1;
      continue;
    }
    seen.add(fbId);
    const members = parseMemberCount(
      g.member_count ?? g.members ?? g.memberCount ?? g.member_count_fmt,
    );
    if (members < args.min_members) {
      droppedMembers += 1;
      continue;
    }
    const url = pickStr(g, ["group_url", "url", "link"]);
    results.push({
      fb_id: fbId,
      name: pickStr(g, ["name", "title"]) || "(Không tên)",
      url,
      members,
      description: pickStr(g, ["description", "about"]),
      already_added:
        savedKeys.has(fbId) ||
        (url ? savedKeys.has(url.replace(/\/$/, "")) : false),
    });
  }

  attempts.push({
    keywords: kw,
    sort_by: args.sort_by,
    status: args.status,
    raw_count: rawCount,
    matched_count: results.length,
    note: "tìm kiếm chuẩn Facebook",
  });

  if (results.length > 0) {
    return finish(
      true,
      `Tìm thấy ${results.length} nhóm khớp điều kiện` +
        (rawCount > results.length
          ? ` (Facebook trả về ${rawCount} nhóm, ${rawCount - results.length} nhóm bị loại bởi bộ lọc).`
          : "."),
      rawCount,
      results,
    );
  }

  return finish(
    true,
    `Facebook trả về ${rawCount} nhóm nhưng 0 nhóm khớp sau khi lọc: ${droppedMembers} nhóm dưới mức tối thiểu ${args.min_members} thành viên${droppedNoId ? `, ${droppedNoId} nhóm thiếu mã định danh` : ""}${droppedDup ? `, ${droppedDup} nhóm trùng lặp` : ""}. Hãy giảm “Thành viên tối thiểu” rồi tìm lại.`,
    rawCount,
    empty,
  );
}
