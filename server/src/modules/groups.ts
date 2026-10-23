import { defineAction, z } from "@hatch/space-sdk";
import { and, asc, desc, eq } from "drizzle-orm";
import * as schema from "../schema";
import { privileged } from "../privileged";
import { runOut } from "../types";
import { fmtVnd } from "../services/copywriting";
import {
  groupOut,
  foundGroupOut,
  findGroupsResponse,
  loadJoinContext,
  syncStoredGroupJoined,
  extractGroupRows,
  accountCountsAsJoined,
  joinedPostingPages,
  buildMemberships,
  linkedFbAccountName,
  pickStr,
  parseMemberCount,
  findGroupsAttempt,
} from "../services/groups";

export const groupActions = {

  // -------------------------------------------------------------- research
  listResearch: defineAction({
    request: z.object({}),
    response: z.object({ runs: z.array(runOut) }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const rows = await db
        .select()
        .from(schema.researchRuns)
        .orderBy(desc(schema.researchRuns.ranAt));
      return {
        runs: rows.map((r) => ({
          id: r.id,
          query: r.query,
          ran_at: r.ranAt.toISOString(),
          marketplace_count: r.marketplaceCount,
          price_count: r.priceCount,
          price_min: r.priceMin,
          price_median: r.priceMedian,
          price_max: r.priceMax,
          price_min_fmt: r.priceMin != null ? fmtVnd(r.priceMin) : "—",
          price_median_fmt: r.priceMedian != null ? fmtVnd(r.priceMedian) : "—",
          price_max_fmt: r.priceMax != null ? fmtVnd(r.priceMax) : "—",
          groups_found: r.groupsFound,
          notes: r.notes,
        })),
      };
    },
  }),

  addResearch: defineAction({
    request: z.object({
      query: z.string().min(1),
      marketplace_count: z.number().int().min(0).default(0),
      price_count: z.number().int().min(0).default(0),
      price_min: z.number().int().min(0).optional(),
      price_median: z.number().int().min(0).optional(),
      price_max: z.number().int().min(0).optional(),
      groups_found: z.number().int().min(0).default(0),
      notes: z.string().default(""),
    }),
    response: z.object({ id: z.number() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const [row] = await db
        .insert(schema.researchRuns)
        .values({
          query: args.query.trim(),
          ranAt: new Date(),
          marketplaceCount: args.marketplace_count,
          priceCount: args.price_count,
          priceMin: args.price_min ?? null,
          priceMedian: args.price_median ?? null,
          priceMax: args.price_max ?? null,
          groupsFound: args.groups_found,
          notes: args.notes.trim(),
        })
        .returning({ id: schema.researchRuns.id });
      if (!row) throw new Error("addResearch: insert returned no rows");
      ctx.invalidateQueries();
      return { id: row.id };
    },
  }),

  deleteResearch: defineAction({
    request: z.object({ id: z.number().int().positive() }),
    response: z.object({ ok: z.boolean() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      await db
        .delete(schema.researchRuns)
        .where(eq(schema.researchRuns.id, args.id));
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  // ---------------------------------------------------------------- groups
  listGroups: defineAction({
    request: z.object({}),
    response: z.object({ groups: z.array(groupOut) }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const rows = await db
        .select()
        .from(schema.fbGroups)
        .orderBy(asc(schema.fbGroups.name));
      // Các danh tính đối chiếu trạng thái tham gia nhóm: mọi tài
      // khoản Facebook + mọi Page thuộc các tài khoản đó. Instagram
      // không tham gia được nhóm Facebook nên không đưa vào danh
      // sách này. Trạng thái trả về TÁCH RIÊNG theo danh tính:
      // joined/account_joined chỉ là của tài khoản chính, còn
      // joined_pages liệt kê từng Page con đang chọn đăng đã tham
      // gia — Page và tài khoản chính có thể khác trạng thái nên
      // không gộp thành một cờ của cả nhóm.
      const jc = await loadJoinContext(db);
      return {
        groups: rows.map((r) => ({
          id: r.id,
          name: r.name,
          url: r.url,
          members: r.members,
          joined: accountCountsAsJoined(jc, r),
          account_joined: accountCountsAsJoined(jc, r),
          joined_pages: joinedPostingPages(jc, r).map((p) => ({
            id: p.id,
            name: p.name,
          })),
          is_target: r.isTarget === 1,
          created_at: r.createdAt.toISOString(),
          memberships: buildMemberships(jc, r),
        })),
      };
    },
  }),

  // Đặt trạng thái tham gia của MỘT tài khoản/Page đối với MỘT nhóm
  // (người dùng xác nhận sau khi kiểm tra trên Facebook) — chỉ hai
  // trạng thái: đã tham gia / chưa tham gia. Đặt cho danh tính nào
  // chỉ ghi cho ĐÚNG danh tính đó: đặt ở dòng Page không đổi trạng
  // thái của tài khoản chính và ngược lại. Sau đó cột
  // fb_groups.joined được đồng bộ lại theo RIÊNG tài khoản chính.
  setGroupMembership: defineAction({
    request: z.object({
      group_id: z.number().int().positive(),
      identity_kind: z.enum(["account", "page"]),
      identity_id: z.number().int().positive(),
      status: z.enum(["joined", "not_joined"]),
    }),
    response: z.object({ ok: z.boolean() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const [existing] = await db
        .select()
        .from(schema.groupMemberships)
        .where(
          and(
            eq(schema.groupMemberships.groupId, args.group_id),
            eq(schema.groupMemberships.identityKind, args.identity_kind),
            eq(schema.groupMemberships.identityId, args.identity_id),
          ),
        );
      if (existing) {
        await db
          .update(schema.groupMemberships)
          .set({ status: args.status, updatedAt: Date.now() })
          .where(eq(schema.groupMemberships.id, existing.id));
      } else {
        await db.insert(schema.groupMemberships).values({
          groupId: args.group_id,
          identityKind: args.identity_kind,
          identityId: args.identity_id,
          status: args.status,
          updatedAt: Date.now(),
        });
      }
      await syncStoredGroupJoined(db, args.group_id);
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  // Tài khoản Facebook đã liên kết sẽ thực hiện việc thêm nhóm —
  // giao diện mục Hội nhóm hiển thị dòng xác nhận này trong panel
  // dán link để người dùng biết nhóm sắp thêm mang tên nick nào.
  getGroupAdderAccount: defineAction({
    request: z.object({}),
    response: z.object({ linked: z.boolean(), name: z.string() }),
    async handler(ctx): Promise<{ linked: boolean; name: string }> {
      const db = ctx.db<typeof schema>();
      const name = await linkedFbAccountName(db);
      return { linked: name.length > 0, name };
    },
  }),

  addGroup: defineAction({
    request: z.object({
      name: z.string().min(1),
      url: z.string().default(""),
      members: z.number().int().min(0).default(0),
      joined: z.boolean().default(false),
    }),
    response: z.object({ id: z.number() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const [row] = await db
        .insert(schema.fbGroups)
        .values({
          name: args.name.trim(),
          url: args.url.trim(),
          members: args.members,
          joined: args.joined ? 1 : 0,
          isTarget: 0,
        })
        .returning({ id: schema.fbGroups.id });
      if (!row) throw new Error("addGroup: insert returned no rows");
      ctx.invalidateQueries();
      return { id: row.id };
    },
  }),

  setGroupFlags: defineAction({
    request: z.object({
      id: z.number().int().positive(),
      joined: z.boolean().optional(),
      is_target: z.boolean().optional(),
    }),
    response: z.object({ ok: z.boolean() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const patch: { joined?: number; isTarget?: number } = {};
      if (args.joined !== undefined) patch.joined = args.joined ? 1 : 0;
      if (args.is_target !== undefined)
        patch.isTarget = args.is_target ? 1 : 0;
      if (Object.keys(patch).length > 0) {
        await db
          .update(schema.fbGroups)
          .set(patch)
          .where(eq(schema.fbGroups.id, args.id));
      }
      // Bật/tắt cờ joined = đặt trạng thái tham gia của tài
      // khoản Facebook chính (cột joined chỉ nói về tài khoản
      // chính, không liên quan trạng thái của các Page con), rồi
      // đồng bộ lại cột theo đúng tài khoản chính để hai nơi
      // không lệch nhau.
      if (args.joined !== undefined) {
        const fbAccounts = await db
          .select()
          .from(schema.accounts)
          .where(eq(schema.accounts.platform, "Facebook"))
          .orderBy(desc(schema.accounts.selected), asc(schema.accounts.id));
        const primary = fbAccounts[0];
        if (primary) {
          const status = args.joined ? "joined" : "not_joined";
          const [existing] = await db
            .select()
            .from(schema.groupMemberships)
            .where(
              and(
                eq(schema.groupMemberships.groupId, args.id),
                eq(schema.groupMemberships.identityKind, "account"),
                eq(schema.groupMemberships.identityId, primary.id),
              ),
            );
          if (existing) {
            await db
              .update(schema.groupMemberships)
              .set({ status, updatedAt: Date.now() })
              .where(eq(schema.groupMemberships.id, existing.id));
          } else {
            await db.insert(schema.groupMemberships).values({
              groupId: args.id,
              identityKind: "account",
              identityId: primary.id,
              status,
              updatedAt: Date.now(),
            });
          }
        }
        await syncStoredGroupJoined(db, args.id);
      }
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  deleteGroup: defineAction({
    request: z.object({ id: z.number().int().positive() }),
    response: z.object({ ok: z.boolean() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      await db.delete(schema.fbGroups).where(eq(schema.fbGroups.id, args.id));
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  // Dán LINK nhóm Facebook → bấm Lưu → app QUÉT từng link rồi LƯU
  // THẲNG vào danh sách nhóm (xem ghi chú "hội nhóm theo LINK" ở
  // trên): tách mã nhóm từ từng link, đọc chi tiết thật (tên, số
  // thành viên, mô tả) bằng `groups details` qua tài khoản Facebook
  // đã liên kết, kiểm tra trạng thái tham gia của nick đó bằng các
  // bằng chứng kênh liên kết cung cấp được (danh sách nhóm đã kết
  // nối; nhóm kín đọc được bài bên trong). Có bằng chứng "đã tham
  // gia" thì ghi trạng thái joined cho đúng nick đó; không có bằng
  // chứng thì lượt quét báo "chưa tham gia" (chỉ hai trạng thái —
  // không có "Chưa rõ") nhưng KHÔNG ghi đè trạng thái người dùng
  // đã đặt tay. Nhóm trùng link được cập nhật tên/số thành viên
  // thay vì nhân đôi.
  saveGroupLinks: defineAction({
    request: z.object({
      links_text: z.string().min(1).max(20000),
    }),
    response: z.object({
      ok: z.boolean(),
      message: z.string(),
      parsed_links: z.number(),
      inserted: z.number(),
      updated: z.number(),
      scanned: z.array(
        z.object({
          id: z.number(),
          name: z.string(),
          url: z.string(),
          members: z.number(),
          description: z.string(),
          detail_ok: z.boolean(),
          fb_status: z.enum(["joined", "not_joined"]),
          note: z.string(),
        }),
      ),
    }),
    privileged: [
      privileged.getFbGroupDetails,
      privileged.searchFbGroups,
      privileged.getFbGroupPosts,
    ],
    async handler(
      ctx,
      args,
    ): Promise<{
      ok: boolean;
      message: string;
      parsed_links: number;
      inserted: number;
      updated: number;
      scanned: Array<{
        id: number;
        name: string;
        url: string;
        members: number;
        description: string;
        detail_ok: boolean;
        fb_status: "joined" | "not_joined";
        note: string;
      }>;
    }> {
      const db = ctx.db<typeof schema>();
      type Scanned = {
        id: number;
        name: string;
        url: string;
        members: number;
        description: string;
        detail_ok: boolean;
        fb_status: "joined" | "not_joined";
        note: string;
      };
      // 1) Tách mã nhóm từ mọi link facebook.com/groups/<mã> trong
      // văn bản đã dán; cũng chấp nhận dòng chỉ gồm mã/tên vanity.
      const segments: string[] = [];
      const seenSeg = new Set<string>();
      const pushSeg = (seg: string) => {
        const s = seg.trim().replace(/\/+$/, "");
        if (!s || s === "search" || seenSeg.has(s)) return;
        seenSeg.add(s);
        segments.push(s);
      };
      const linkRe = /facebook\.com\/groups\/([A-Za-z0-9._-]+)/g;
      for (const m of args.links_text.matchAll(linkRe)) {
        if (m[1]) pushSeg(m[1]);
      }
      if (segments.length === 0) {
        for (const line of args.links_text.split(/\r?\n/)) {
          const t = line.trim();
          if (/^[A-Za-z0-9._-]{3,}$/.test(t)) pushSeg(t);
        }
      }
      if (segments.length === 0) {
        const msg =
          "Chưa thấy link nhóm nào trong nội dung đã dán. Hãy dán link các nhóm (dạng facebook.com/groups/…), mỗi link một dòng.";
        return {
          ok: false,
          message: msg,
          parsed_links: 0,
          inserted: 0,
          updated: 0,
          scanned: [],
        };
      }

      // 2) Nick Facebook ĐANG HÀNH ĐỘNG (đã liên kết, ưu tiên nick
      // đang chọn dùng) — kênh liên kết quét nhóm dưới danh tính
      // nick này, nên bằng chứng tham gia chỉ áp cho nick này.
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

      // 3) Bằng chứng (a): danh sách nhóm nick đã kết nối theo kênh
      // liên kết (`groups search --role connected`). Chỉ mục này có
      // thể trả rỗng — khi đó bước này đơn giản là không cho bằng
      // chứng nào, KHÔNG suy ra "chưa tham gia".
      const connectedIds = new Set<string>();
      const connectedNames = new Set<string>();
      if (acting) {
        try {
          const res = await ctx.executePrivileged(
            privileged.searchFbGroups,
            {
              keywords: "",
              role: "connected",
              sortBy: "MOST_RELEVANT",
              status: "any",
              limit: 25,
            },
          );
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
          // Bằng chứng phụ — lỗi thì bỏ qua, coi như không có bằng chứng.
        }
      }

      // 4) Quét từng link: chi tiết thật + trạng thái tham gia +
      // lưu/cập nhật vào danh sách.
      const existing = await db.select().from(schema.fbGroups);
      const bySeg = new Map<string, (typeof existing)[number]>();
      for (const g of existing) {
        const gm = g.url.match(/groups\/([^/?#]+)/);
        if (gm?.[1]) bySeg.set(gm[1], g);
      }
      let inserted = 0;
      let updated = 0;
      const scanned: Scanned[] = [];
      for (const seg of segments.slice(0, 25)) {
        const url = `https://www.facebook.com/groups/${seg}`;
        let name = "";
        let members = 0;
        let description = "";
        let detailOk = false;
        let isPublic = true;
        try {
          const res = await ctx.executePrivileged(
            privileged.getFbGroupDetails,
            { groupId: seg },
          );
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
          // Bằng chứng (b): nhóm KÍN — chỉ thành viên mới đọc được
          // bài bên trong.
          try {
            const pres = await ctx.executePrivileged(
              privileged.getFbGroupPosts,
              { groupId: seg },
            );
            if (pres.ok && pres.stdout.trim()) {
              const pp = JSON.parse(pres.stdout) as Record<
                string,
                unknown
              >;
              if (Array.isArray(pp.data) && pp.data.length > 0)
                fbStatus = "joined";
            }
          } catch {
            // Không có bằng chứng — giữ "chưa tham gia".
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
          const patch: { name?: string; members?: number; url?: string } =
            {};
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
          if (!row)
            throw new Error("saveGroupLinks: insert returned no rows");
          groupId = row.id;
          inserted += 1;
        }

        // Có bằng chứng đã tham gia → ghi trạng thái joined cho
        // đúng nick đang hành động (chỉ nick đó — không suy ra
        // trạng thái cho Page con hay tài khoản khác) + đồng bộ
        // cột joined của nhóm theo riêng tài khoản chính.
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
      const joinedCount = scanned.filter(
        (s) => s.fb_status === "joined",
      ).length;
      const message =
        `Đã quét ${scanned.length} link nhóm và lưu vào danh sách: ` +
        `thêm mới ${inserted}, cập nhật ${updated} · đọc được chi tiết ` +
        `${detailCount} nhóm` +
        (acting
          ? ` · xác minh được ${joinedCount} nhóm ${acting.name} đã tham gia (số còn lại đang để “Chưa tham gia” — đặt lại trên thẻ nhóm nếu đã tham gia).`
          : " · chưa liên kết tài khoản Facebook nên chưa quét được trạng thái tham gia.") +
        " Danh sách nhóm bên dưới hiển thị theo tên nhóm.";
      ctx.invalidateQueries();
      return {
        ok: true,
        message,
        parsed_links: segments.length,
        inserted,
        updated,
        scanned,
      };
    },
  }),

  // Tìm hội nhóm Facebook theo những điều kiện người dùng chọn (từ khóa,
  // phạm vi, sắp xếp, trạng thái, số kết quả, số thành viên tối thiểu) —
  // chạy facebook-cli qua privileged ngay trong lần bấm, trả kết quả thật
  // kèm cờ "đã có trong danh sách" để giao diện không thêm trùng.
  //
  // LƯU Ý: action này là kênh lập trình CLI CŨ — giao diện KHÔNG
  // còn dùng nữa. Người dùng đã kiểm chứng kết quả tìm bằng từ khóa
  // của CLI khác hẳn ô tìm kiếm trên web Facebook (từ khóa tiếng
  // Việt trả 0 nhóm trong khi web có kết quả) và nay chốt luồng hội
  // nhóm theo LINK: dán link nhóm → saveGroupLinks quét từng link
  // (chi tiết + trạng thái tham gia) → lưu thẳng vào danh sách.
  // Giữ action này chỉ để tương thích.
  //
  // Nguyên tắc TÌM KIẾM CHUẨN FACEBOOK (người dùng chốt): mỗi lần bấm
  // tìm = đúng MỘT lần gọi `groups search` — đường tìm nhóm gốc của
  // Facebook — với từ khóa nguyên văn và đúng điều kiện đã chọn, hệt
  // như gõ vào ô tìm nhóm trên Facebook. App không tự nới điều kiện,
  // không sinh biến thể từ khóa, không tự thử lại (cơ chế cũ từng biến
  // "mô hình xe" thành "hình xe mô" và làm kết quả lệch hẳn khỏi tìm
  // tay trên Facebook). Mặc định cũng theo chuẩn Facebook/CLI: sắp xếp
  // MOST_RELEVANT (liên quan nhất — cách Facebook xếp kết quả tìm
  // kiếm), trạng thái non_archived, tối đa 25 kết quả (mức trần của
  // lệnh gốc).
  //
  // Chẩn đoán vẫn giữ: 1) kiểm tra phiên Facebook (lệnh `me`) TRƯỚC khi
  // tìm — phiên chết thì báo rõ phiên, không giả vờ "0 nhóm"; 2) bộ đọc
  // chấp nhận các định dạng kết quả của CLI (groups/results ở gốc hoặc
  // trong data, id/group_id, member_count dạng số hoặc chuỗi
  // "16,000"/"16K"); 3) thông báo phân biệt "Facebook trả N nhóm, 0
  // nhóm khớp sau lọc" với "Facebook trả 0 nhóm".
  findGroups: defineAction({
    request: z.object({
      keywords: z.string().max(200).default(""),
      role: z
        .enum(["any", "connected", "admin", "admod"])
        .default("any"),
      sort_by: z
        .enum([
          "MOST_RELEVANT",
          "LARGEST",
          "RECENT_ACTIVITY",
          "LAST_VISITED",
          "ALPHABETICAL",
        ])
        .default("MOST_RELEVANT"),
      status: z
        .enum(["any", "weekly_active", "non_archived", "archived"])
        .default("non_archived"),
      limit: z.number().int().min(1).max(25).default(25),
      min_members: z.number().int().min(0).default(0),
    }),
    response: findGroupsResponse,
    privileged: [privileged.searchFbGroups, privileged.checkFbSession],
    async handler(ctx, args): Promise<z.infer<typeof findGroupsResponse>> {
      const db = ctx.db<typeof schema>();
      const empty: z.infer<typeof foundGroupOut>[] = [];
      const attempts: z.infer<typeof findGroupsAttempt>[] = [];
      const kw = args.keywords.trim();
      const filtersDesc =
        `từ khóa "${kw || "(trống)"}", phạm vi ${args.role}, ` +
        `sắp xếp ${args.sort_by}, trạng thái ${args.status}, tối đa ${args.limit}, ` +
        `thành viên tối thiểu ${args.min_members}`;
      const finish = async (
        ok: boolean,
        message: string,
        rawCount: number,
        results: z.infer<typeof foundGroupOut>[],
        detail: string,
      ): Promise<z.infer<typeof findGroupsResponse>> => {
        void filtersDesc;
        void detail;
        return {
          ok,
          message,
          raw_count: rawCount,
          matched_count: results.length,
          results,
          attempts,
        };
      };

      // 1) Kiểm tra phiên Facebook trước khi tìm.
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
          `kiểm tra phiên thất bại: ${sessionErr}`,
        );
      }

      // 2) Tìm kiếm CHUẨN FACEBOOK: đúng MỘT lần tìm bằng lệnh
      // `groups search` của facebook-cli — đường tìm kiếm nhóm gốc của
      // Facebook — với từ khóa NGUYÊN VĂN người dùng nhập và đúng các
      // điều kiện đã chọn (phạm vi, sắp xếp, trạng thái, số kết quả).
      // App KHÔNG tự nới điều kiện, KHÔNG sinh biến thể từ khóa, KHÔNG
      // tự thử lại: Facebook trả gì thì hiển thị đúng như vậy, hệt như
      // gõ từ khóa vào ô tìm nhóm trên Facebook. (Người dùng chốt yêu
      // cầu này sau khi cơ chế tự thử bằng biến thể từ khóa — đảo thứ
      // tự từ, thêm "1:18" — làm kết quả lệch hẳn khỏi tìm tay trên
      // Facebook.)
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
        return finish(
          false,
          hint,
          0,
          empty,
          `tìm chuẩn Facebook bị lỗi: ${lastError}`,
        );
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
        return finish(
          false,
          `Tìm nhóm thất bại: ${lastError}.`,
          0,
          empty,
          `lỗi đọc dữ liệu · stdout 200 ký tự đầu: ${res.stdout.slice(0, 200)}`,
        );
      }
      const rows = extractGroupRows(parsed);

      // 3) Facebook trả 0 nhóm cho đúng từ khóa + điều kiện này → báo
      // đúng như vậy. App không tự thử cụm từ nào khác — muốn kết quả
      // khác, người dùng đổi từ khóa/điều kiện như khi tìm trên
      // Facebook.
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
          `Facebook trả 0 nhóm cho từ khóa nguyên văn` +
            (sessionName ? ` · phiên: ${sessionName}` : ""),
        );
      }

      // 4) Lọc kết quả Facebook trả về theo điều kiện của người dùng
      // (thành viên tối thiểu), đếm riêng từng lý do bị loại để thông
      // báo nói rõ Facebook trả bao nhiêu nhóm và bộ lọc giữ lại bao
      // nhiêu.
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
      const dropDetail =
        `Facebook trả ${rawCount} nhóm · khớp ${results.length} · ` +
        `loại: thiếu mã ${droppedNoId}, trùng ${droppedDup}, ` +
        `dưới ${args.min_members} thành viên ${droppedMembers}` +
        (sessionName ? ` · phiên: ${sessionName}` : "");
      if (results.length > 0) {
        return finish(
          true,
          `Tìm thấy ${results.length} nhóm khớp điều kiện` +
            (rawCount > results.length
              ? ` (Facebook trả về ${rawCount} nhóm, ${rawCount - results.length} nhóm bị loại bởi bộ lọc).`
              : "."),
          rawCount,
          results,
          dropDetail,
        );
      }
      return finish(
        true,
        `Facebook trả về ${rawCount} nhóm nhưng 0 nhóm khớp sau khi lọc: ${droppedMembers} nhóm dưới mức tối thiểu ${args.min_members} thành viên${droppedNoId ? `, ${droppedNoId} nhóm thiếu mã định danh` : ""}${droppedDup ? `, ${droppedDup} nhóm trùng lặp` : ""}. Hãy giảm “Thành viên tối thiểu” rồi tìm lại.`,
        rawCount,
        empty,
        dropDetail,
      );
    },
  }),
};
