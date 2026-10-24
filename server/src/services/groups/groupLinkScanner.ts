import type { Ctx } from "@hatch/space-sdk";
import { and, asc, desc, eq } from "drizzle-orm";
import * as schema from "../../schema";
import { privileged } from "../../privileged";
import {
  extractGroupRows,
  pickStr,
  parseMemberCount,
  syncStoredGroupJoined,
} from "../groups";

export type ScannedGroupResult = {
  id: number;
  name: string;
  url: string;
  members: number;
  description: string;
  detail_ok: boolean;
  fb_status: "joined" | "not_joined";
  note: string;
};

export type SaveGroupLinksResult = {
  ok: boolean;
  message: string;
  parsed_links: number;
  inserted: number;
  updated: number;
  scanned: ScannedGroupResult[];
};

/**
 * Tách mã nhóm / tên vanity từ văn bản liên kết Facebook Groups.
 */
export function parseGroupLinkSegments(linksText: string): string[] {
  const segments: string[] = [];
  const seenSeg = new Set<string>();
  const pushSeg = (seg: string) => {
    const s = seg.trim().replace(/\/+$/, "");
    if (!s || s === "search" || seenSeg.has(s)) return;
    seenSeg.add(s);
    segments.push(s);
  };
  const linkRe = /facebook\.com\/groups\/([A-Za-z0-9._-]+)/g;
  for (const m of linksText.matchAll(linkRe)) {
    if (m[1]) pushSeg(m[1]);
  }
  if (segments.length === 0) {
    for (const line of linksText.split(/\r?\n/)) {
      const t = line.trim();
      if (/^[A-Za-z0-9._-]{3,}$/.test(t)) pushSeg(t);
    }
  }
  return segments;
}

/**
 * Quét các link nhóm Facebook: lấy thông tin chi tiết, kiểm tra tư cách thành viên và lưu vào DB.
 */
export async function scanAndUpsertGroupLinks(
  ctx: Ctx,
  linksText: string,
): Promise<SaveGroupLinksResult> {
  const db = ctx.db<typeof schema>();
  const segments = parseGroupLinkSegments(linksText);

  if (segments.length === 0) {
    return {
      ok: false,
      message:
        "Chưa thấy link nhóm nào trong nội dung đã dán. Hãy dán link các nhóm (dạng facebook.com/groups/…), mỗi link một dòng.",
      parsed_links: 0,
      inserted: 0,
      updated: 0,
      scanned: [],
    };
  }

  const fbAccounts = await db
    .select()
    .from(schema.accounts)
    .where(
      and(
        eq(schema.accounts.platform, "Facebook"),
        eq(schema.accounts.linked, 1),
      ),
    )
    .orderBy(desc(schema.accounts.selected), asc(schema.accounts.id));
  const acting = fbAccounts[0];

  const connectedIds = new Set<string>();
  const connectedNames = new Set<string>();
  if (acting) {
    try {
      const res = await ctx.executePrivileged(privileged.searchFbGroups, {
        keywords: "",
        role: "connected",
        sortBy: "MOST_RELEVANT",
        status: "any",
        limit: 25,
      });
      if (res.ok && res.stdout.trim()) {
        const parsed = JSON.parse(res.stdout) as unknown;
        for (const row of extractGroupRows(parsed)) {
          const id = pickStr(row, ["group_id", "id", "fb_id", "groupId"]);
          if (id) connectedIds.add(id);
          const u = pickStr(row, ["group_url", "url", "link"]);
          const um = u.match(/groups\/([^/?#]+)/);
          if (um?.[1]) connectedIds.add(um[1]);
          const nm = pickStr(row, ["name", "title"]);
          if (nm) connectedNames.add(nm.toLowerCase());
        }
      }
    } catch {
      // Bỏ qua lỗi đọc danh sách phụ
    }
  }

  const existing = await db.select().from(schema.fbGroups);
  const bySeg = new Map<string, (typeof existing)[number]>();
  for (const g of existing) {
    const gm = g.url.match(/groups\/([^/?#]+)/);
    if (gm?.[1]) bySeg.set(gm[1], g);
  }

  let inserted = 0;
  let updated = 0;
  const scanned: ScannedGroupResult[] = [];

  for (const seg of segments.slice(0, 25)) {
    const url = `https://www.facebook.com/groups/${seg}`;
    let name = "";
    let members = 0;
    let description = "";
    let detailOk = false;
    let isPublic = true;

    try {
      const res = await ctx.executePrivileged(privileged.getFbGroupDetails, {
        groupId: seg,
      });
      if (res.ok && res.stdout.trim()) {
        const p = JSON.parse(res.stdout) as Record<string, unknown>;
        name = pickStr(p, ["name", "title"]);
        members = parseMemberCount(
          p.member_count ?? p.members ?? p.memberCount,
        );
        description = pickStr(p, ["about", "description"]);
        const visibility = pickStr(p, ["visibility"]);
        const audience = pickStr(p, [
          "audience_label",
          "audience_description",
        ]);
        isPublic =
          visibility.toUpperCase() === "OPEN" ||
          /công khai/i.test(audience);
        detailOk = name.length > 0;
      }
    } catch {
      detailOk = false;
    }

    let fbStatus: "joined" | "not_joined" = "not_joined";
    let note = "";
    if (!acting) {
      note =
        "Chưa liên kết tài khoản Facebook nên chưa quét được trạng thái tham gia — đang để Chưa tham gia.";
    } else if (
      connectedIds.has(seg) ||
      (name && connectedNames.has(name.toLowerCase()))
    ) {
      fbStatus = "joined";
      note = `${acting.name} đã tham gia — nhóm nằm trong danh sách nhóm đã kết nối của tài khoản.`;
    } else if (!isPublic && detailOk) {
      try {
        const pres = await ctx.executePrivileged(privileged.getFbGroupPosts, {
          groupId: seg,
        });
        if (pres.ok && pres.stdout.trim()) {
          const pp = JSON.parse(pres.stdout) as Record<string, unknown>;
          if (Array.isArray(pp.data) && pp.data.length > 0) fbStatus = "joined";
        }
      } catch {
        // Không đọc được bài đăng
      }
      note =
        fbStatus === "joined"
          ? `${acting.name} đã tham gia — nhóm kín nhưng tài khoản đọc được bài đăng bên trong nhóm.`
          : `Chưa thấy bằng chứng ${acting.name} đã tham gia (nhóm kín, kênh liên kết chưa kết luận được) — đang để Chưa tham gia; nếu nick đã tham gia, đặt lại trên thẻ nhóm.`;
    } else {
      note = `Chưa thấy bằng chứng ${acting.name} đã tham gia — kênh Facebook đã liên kết không liệt kê được danh sách nhóm tài khoản đã tham gia — đang để Chưa tham gia; nếu nick đã tham gia, đặt lại trên thẻ nhóm.`;
    }

    if (!detailOk) {
      note =
        "Chưa đọc được chi tiết nhóm này bằng tài khoản Facebook đã liên kết — nhóm vẫn được lưu bằng link đã dán. " +
        note;
    }

    const prev = bySeg.get(seg);
    let groupId = 0;
    if (prev) {
      const patch: { name?: string; members?: number; url?: string } = {};
      if (detailOk && name) patch.name = name;
      if (members > 0) patch.members = members;
      if (!prev.url.trim()) patch.url = url;
      if (Object.keys(patch).length > 0) {
        await db
          .update(schema.fbGroups)
          .set(patch)
          .where(eq(schema.fbGroups.id, prev.id));
      }
      groupId = prev.id;
      updated += 1;
    } else {
      const [row] = await db
        .insert(schema.fbGroups)
        .values({
          name: detailOk && name ? name : seg,
          url,
          members,
          joined: fbStatus === "joined" ? 1 : 0,
          isTarget: 0,
        })
        .returning({ id: schema.fbGroups.id });
      if (!row) throw new Error("saveGroupLinks: insert returned no rows");
      groupId = row.id;
      inserted += 1;
    }

    if (fbStatus === "joined" && acting) {
      const [mem] = await db
        .select()
        .from(schema.groupMemberships)
        .where(
          and(
            eq(schema.groupMemberships.groupId, groupId),
            eq(schema.groupMemberships.identityKind, "account"),
            eq(schema.groupMemberships.identityId, acting.id),
          ),
        );
      if (mem) {
        if (mem.status !== "joined") {
          await db
            .update(schema.groupMemberships)
            .set({ status: "joined", updatedAt: Date.now() })
            .where(eq(schema.groupMemberships.id, mem.id));
        }
      } else {
        await db.insert(schema.groupMemberships).values({
          groupId,
          identityKind: "account",
          identityId: acting.id,
          status: "joined",
          updatedAt: Date.now(),
        });
      }
      await syncStoredGroupJoined(db, groupId);
    }

    scanned.push({
      id: groupId,
      name: detailOk && name ? name : (prev?.name ?? seg),
      url,
      members: members > 0 ? members : (prev?.members ?? 0),
      description,
      detail_ok: detailOk,
      fb_status: fbStatus,
      note,
    });
  }

  const detailCount = scanned.filter((s) => s.detail_ok).length;
  const joinedCount = scanned.filter((s) => s.fb_status === "joined").length;
  const message =
    `Đã quét ${scanned.length} link nhóm và lưu vào danh sách: ` +
    `thêm mới ${inserted}, cập nhật ${updated} · đọc được chi tiết ` +
    `${detailCount} nhóm` +
    (acting
      ? ` · xác minh được ${joinedCount} nhóm ${acting.name} đã tham gia (số còn lại đang để “Chưa tham gia” — đặt lại trên thẻ nhóm nếu đã tham gia).`
      : " · chưa liên kết tài khoản Facebook nên chưa quét được trạng thái tham gia.") +
    " Danh sách nhóm bên dưới hiển thị theo tên nhóm.";

  return {
    ok: true,
    message,
    parsed_links: segments.length,
    inserted,
    updated,
    scanned,
  };
}
