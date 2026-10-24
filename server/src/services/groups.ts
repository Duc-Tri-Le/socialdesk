import { z } from "@hatch/space-sdk";
import { and, asc, desc, eq } from "drizzle-orm";
import * as schema from "../schema";
import type { Db } from "./settings";
import { extractFacebookPageName } from "../types";

export const groupMembershipOut = z.object({
  identity_kind: z.enum(["account", "page", "instagram"]),
  identity_id: z.number(),
  identity_name: z.string(),
  // CHỈ hai trạng thái (người dùng chốt — không có "Chưa rõ"):
  // joined = đã tham gia · not_joined = chưa tham gia.
  status: z.enum(["joined", "not_joined"]),
});

export type MembershipStatus = "joined" | "not_joined";

// ------------------------------------------------- trạng thái tham gia nhóm
// Trạng thái tham gia là của TỪNG cặp (nhóm, danh tính) — tài
// khoản Facebook chính và từng Page con là các danh tính ĐỘC LẬP:
// Page đã tham gia một nhóm KHÔNG có nghĩa tài khoản chính cũng
// đã tham gia nhóm đó, và ngược lại (người dùng chốt: "page con
// và tài khoản chính có thể không cùng trạng thái"). Vì vậy toàn
// app KHÔNG còn một cờ "nhóm đã tham gia" gộp chung:
//   - Trạng thái của một cặp (nhóm, danh tính) lấy từ bảng
//     group_memberships của ĐÚNG danh tính đó; chưa có dòng thì
//     là "chưa tham gia" — ngoại lệ duy nhất: tài khoản Facebook
//     chính (nick đang chọn, rồi tới nick có id nhỏ nhất) khi cờ
//     joined của nhóm đang bật, vì sau migration 0021 cờ đó chỉ
//     còn phản ánh đúng trạng thái của tài khoản chính.
//   - Cột fb_groups.joined từ nay CHỈ là trạng thái của tài
//     khoản chính (không OR trạng thái của Page vào nữa).
//   - Điều kiện đăng được vào một nhóm xét theo danh tính sẽ
//     đăng: chỉ đăng bằng danh tính nào có trạng thái joined với
//     nhóm đó; gói đăng ghi trạng thái RIÊNG của từng danh tính
//     cho từng nhóm để không ai hiểu nhầm Page và tài khoản
//     chính cùng một trạng thái.
export type JoinIdentity = {
  kind: "account" | "page";
  id: number;
  name: string;
  // true = danh tính sẽ đăng bài (đang chọn dùng để đăng).
  posting: boolean;
};

export type JoinContext = {
  identities: JoinIdentity[];
  memMap: Map<string, string>;
  primaryAccountId: number;
};

export async function loadJoinContext(db: Db): Promise<JoinContext> {
  const fbAccounts = await db
    .select()
    .from(schema.accounts)
    .where(eq(schema.accounts.platform, "Facebook"))
    .orderBy(desc(schema.accounts.selected), asc(schema.accounts.id));
  const pages = await db
    .select()
    .from(schema.fbPages)
    .orderBy(asc(schema.fbPages.id));
  const memRows = await db.select().from(schema.groupMemberships);
  const memMap = new Map<string, string>();
  for (const m of memRows)
    memMap.set(`${m.groupId}|${m.identityKind}|${m.identityId}`, m.status);
  const identities: JoinIdentity[] = [];
  for (const a of fbAccounts)
    identities.push({
      kind: "account",
      id: a.id,
      name: a.name,
      posting: a.selected === 1,
    });
  // "Danh tính đang chọn đăng" xét theo CHÍNH danh tính đó: Page
  // được chọn đăng thì tính là danh tính sẽ đăng theo cờ chọn của
  // Page — KHÔNG kèm điều kiện tài khoản chủ sở hữu cũng đang
  // chọn (trước đây có "cổng kép" này nên Page đã chọn đăng vẫn bị
  // loại khỏi danh sách nhóm đích khi nick chủ đang tắt chọn, trong
  // khi mục Fanpage chỉ xét cờ chọn của Page nên hai mục không
  // đồng nhất). Trạng thái của Page và tài khoản chính tính riêng.
  for (const p of pages) {
    identities.push({
      kind: "page",
      id: p.id,
      name: p.name.trim() || extractFacebookPageName(p.url),
      posting: p.selected === 1,
    });
  }
  return { identities, memMap, primaryAccountId: fbAccounts[0]?.id ?? 0 };
}

export type GroupRowForJoin = { id: number; joined: number };

export function membershipStatusOf(
  jc: JoinContext,
  group: GroupRowForJoin,
  identity: JoinIdentity,
): MembershipStatus {
  const stored = jc.memMap.get(`${group.id}|${identity.kind}|${identity.id}`);
  if (stored === "joined" || stored === "not_joined") return stored;
  if (
    identity.kind === "account" &&
    identity.id === jc.primaryAccountId &&
    group.joined === 1
  )
    return "joined";
  return "not_joined";
}

export function buildMemberships(
  jc: JoinContext,
  group: GroupRowForJoin,
): z.infer<typeof groupMembershipOut>[] {
  return jc.identities.map((identity) => ({
    identity_kind: identity.kind,
    identity_id: identity.id,
    identity_name: identity.name,
    status: membershipStatusOf(jc, group, identity),
  }));
}

// Danh tính sẽ đăng nào ĐÃ tham gia nhóm này — danh sách theo
// TỪNG danh tính (Page con và tài khoản chính tách riêng, không
// gộp thành một trạng thái của cả nhóm). Rỗng = chưa có danh
// tính sẽ đăng nào tham gia nhóm này nên chưa đăng được.
export function postingJoinedIdentities(
  jc: JoinContext,
  group: GroupRowForJoin,
): JoinIdentity[] {
  return jc.identities.filter(
    (i) => i.posting && membershipStatusOf(jc, group, i) === "joined",
  );
}

// Danh tính tài khoản Facebook chính (nick đang chọn dùng, rồi
// tới nick có id nhỏ nhất) — chủ của cờ fb_groups.joined.
export function mainAccountIdentity(jc: JoinContext): JoinIdentity | undefined {
  return jc.identities.find(
    (i) => i.kind === "account" && i.id === jc.primaryAccountId,
  );
}

// Trạng thái tham gia của RIÊNG tài khoản chính với nhóm này —
// KHÔNG suy từ trạng thái của bất kỳ Page con nào.
export function accountCountsAsJoined(
  jc: JoinContext,
  group: GroupRowForJoin,
): boolean {
  const main = mainAccountIdentity(jc);
  if (!main) return false;
  return membershipStatusOf(jc, group, main) === "joined";
}

// Các Page con đang chọn đăng ĐÃ tham gia nhóm này (từng Page
// tính riêng — Page này tham gia không kéo theo Page khác hay
// tài khoản chính).
export function joinedPostingPages(
  jc: JoinContext,
  group: GroupRowForJoin,
): JoinIdentity[] {
  return postingJoinedIdentities(jc, group).filter((i) => i.kind === "page");
}

// Đồng bộ cột fb_groups.joined theo trạng thái của RIÊNG tài
// khoản chính, để cột này không bao giờ mang trạng thái của một
// Page con (trước đây cột này là OR của mọi danh tính sẽ đăng
// nên Page tham gia cũng làm tài khoản chính trông như đã tham
// gia). Mọi luồng cần trạng thái của danh tính nào thì đọc đúng
// danh tính đó qua các hàm trên.
export async function syncStoredGroupJoined(
  db: Db,
  groupId: number,
  cachedJc?: JoinContext,
): Promise<void> {
  const [group] = await db
    .select()
    .from(schema.fbGroups)
    .where(eq(schema.fbGroups.id, groupId));
  if (!group) return;
  const jc = cachedJc ?? (await loadJoinContext(db));
  const joined = accountCountsAsJoined(jc, group);
  if ((group.joined === 1) !== joined) {
    await db
      .update(schema.fbGroups)
      .set({ joined: joined ? 1 : 0 })
      .where(eq(schema.fbGroups.id, groupId));
  }
}

export const groupOut = z.object({
  id: z.number(),
  name: z.string(),
  url: z.string(),
  members: z.number(),
  // joined / account_joined = trạng thái tham gia của RIÊNG tài
  // khoản Facebook chính với nhóm này — không gộp trạng thái của
  // Page con vào (Page và tài khoản chính có thể khác trạng thái).
  joined: z.boolean(),
  account_joined: z.boolean(),
  // Các Page con đang chọn đăng ĐÃ tham gia nhóm này (từng Page
  // riêng) — để Hàng đợi/gói đăng ghi rõ đăng được bằng Page nào,
  // tách khỏi trạng thái của tài khoản chính.
  joined_pages: z.array(z.object({ id: z.number(), name: z.string() })),
  is_target: z.boolean(),
  created_at: z.string(),
  // Trạng thái tham gia của TỪNG tài khoản Facebook / Page đối với
  // nhóm này (Đức Trí, Hôm nay xem gì, Ở đây có xe đẹp…).
  memberships: z.array(groupMembershipOut),
});

// Tên tài khoản Facebook ĐÃ LIÊN KẾT sẽ thực hiện việc thêm nhóm:
// ưu tiên nick đang được chọn dùng (selected), rồi tới nick liên kết
// có id nhỏ nhất. Chưa liên kết nick nào → "" (giao diện báo rõ cần
// liên kết trước, và nhóm thêm lúc đó không mang nhãn tài khoản).
export async function linkedFbAccountName(db: Db): Promise<string> {
  const rows = await db
    .select()
    .from(schema.accounts)
    .where(
      and(
        eq(schema.accounts.platform, "Facebook"),
        eq(schema.accounts.linked, 1),
      ),
    )
    .orderBy(desc(schema.accounts.selected), asc(schema.accounts.id));
  return rows[0]?.name.trim() ?? "";
}

export const foundGroupOut = z.object({
  fb_id: z.string(),
  name: z.string(),
  url: z.string(),
  members: z.number(),
  description: z.string(),
  already_added: z.boolean(),
});

export const findGroupsAttempt = z.object({
  keywords: z.string(),
  sort_by: z.string(),
  status: z.string(),
  raw_count: z.number(),
  matched_count: z.number(),
  note: z.string(),
});

export const findGroupsResponse = z.object({
  ok: z.boolean(),
  message: z.string(),
  raw_count: z.number(),
  matched_count: z.number(),
  results: z.array(foundGroupOut),
  attempts: z.array(findGroupsAttempt),
});

// ------------------------------------------------- hội nhóm theo LINK
// Người dùng chốt luồng hiện tại (thay toàn bộ các luồng tìm nhóm
// trước — tìm bằng CLI, spawn task đọc web, extension Chrome đều đã
// gỡ): người dùng tự gửi LINK nhóm Facebook vào app, bấm "Lưu" →
// action `saveGroupLinks` QUÉT từng link:
//   1) đọc chi tiết thật của nhóm (tên, số thành viên, mô tả, tính
//      công khai) bằng lệnh `groups details` qua tài khoản Facebook
//      ĐÃ LIÊN KẾT;
//   2) kiểm tra trạng thái tham gia của nick Facebook đó bằng hai
//      bằng chứng kênh liên kết thật sự cung cấp được: (a) nhóm nằm
//      trong danh sách `groups search --role connected`, (b) nhóm
//      KÍN mà tài khoản đọc được bài bên trong (`groups posts`) —
//      chỉ thành viên mới đọc được. Có bằng chứng mới ghi trạng
//      thái joined; không có bằng chứng thì lượt quét báo "chưa
//      tham gia" (người dùng chốt CHỈ hai trạng thái — không còn
//      "Chưa rõ") và ghi chú của lượt quét nói rõ đây là do chưa
//      thấy bằng chứng để người dùng đặt lại tay nếu nick đã tham
//      gia thật.
//   3) Page: kênh liên kết không có bề mặt đọc trạng thái tham gia
//      nhóm của Page, nên trên thẻ nhóm Page mặc định là "Chưa tham
//      gia" — người dùng đặt tay sau khi kiểm tra trên Facebook.
//      Instagram không tham gia được nhóm Facebook nên không hiển
//      thị trên thẻ nhóm.
// Nhóm được LƯU THẲNG vào danh sách (trùng link thì cập nhật tên/số
// thành viên, không nhân đôi, không ghi đè trạng thái tham gia người
// dùng đã đặt tay) và danh sách hiển thị theo TÊN nhóm.

export function asGroupRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

// Bộ đọc khoan dung cho kết quả `groups search`: CLI từng trả mảng nhóm
// ở khóa `groups` tại gốc, nhưng các biến thể (bọc trong `data`, khóa
// `results`/`items`, mảng trần) đều phải đọc được — lệch định dạng
// không được phép nuốt lặng kết quả như trước.
export function extractGroupRows(parsed: unknown): Record<string, unknown>[] {
  const candidates: unknown[] = [];
  if (Array.isArray(parsed)) candidates.push(parsed);
  const root = asGroupRecord(parsed);
  if (root) {
    candidates.push(root.groups, root.results, root.items);
    const data = asGroupRecord(root.data);
    if (data) candidates.push(data.groups, data.results, data.items);
  }
  for (const c of candidates) {
    if (Array.isArray(c)) {
      return c
        .map((x) => asGroupRecord(x))
        .filter((x): x is Record<string, unknown> => x !== null);
    }
  }
  return [];
}

export function pickStr(rec: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = rec[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return "";
}

// Số thành viên có thể là số, hoặc chuỗi "16,000" / "16.000" / "16K" /
// "1.2M" / "1,2 Tr" / "12 N" tùy biến thể đầu ra — đọc được hết theo
// đúng cách hiển thị rút gọn của Facebook VN (N = nghìn, Tr = triệu)
// như bộ đọc phía client, không đọc được thì 0.
export function parseMemberCount(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) {
    return Math.max(0, Math.round(v));
  }
  if (typeof v !== "string") return 0;
  const s = v.trim().toLowerCase().replace(/\s+/g, "");
  if (!s) return 0;
  let mult = 1;
  let core = s;
  if (s.endsWith("tr")) {
    mult = 1_000_000;
    core = s.slice(0, -2);
  } else if (s.endsWith("k") || s.endsWith("n")) {
    mult = 1000;
    core = s.slice(0, -1);
  } else if (s.endsWith("m")) {
    mult = 1_000_000;
    core = s.slice(0, -1);
  }
  let n: number;
  if (mult > 1) {
    n = parseFloat(core.replace(/,/g, "."));
  } else {
    n = parseFloat(
      core.replace(/[.,](?=\d{3}(?:\D|$))/g, "").replace(",", "."),
    );
  }
  return Number.isFinite(n) ? Math.max(0, Math.round(n * mult)) : 0;
}

// Một lần ĐĂNG THẬT lên một đích (từ nút "Đăng thật"): kết quả
// thật từ connector, kèm link bài khi đăng thành công.