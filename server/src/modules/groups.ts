import { defineAction, z } from "@hatch/space-sdk";
import { and, asc, desc, eq } from "drizzle-orm";
import * as schema from "../schema";
import { privileged } from "../privileged";
import { runOut } from "../types";
import { fmtVnd } from "../services/copywriting";
import {
  groupOut,
  findGroupsResponse,
  loadJoinContext,
  syncStoredGroupJoined,
  accountCountsAsJoined,
  joinedPostingPages,
  buildMemberships,
  linkedFbAccountName,
} from "../services/groups";
import {
  scanAndUpsertGroupLinks,
  executeFindGroups,
} from "../services/groupScanner";

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

  // Dán LINK nhóm Facebook → bấm Lưu → app QUÉT từng link rồi LƯU THẲNG vào danh sách nhóm
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
    async handler(ctx, args) {
      const result = await scanAndUpsertGroupLinks(ctx, args.links_text);
      ctx.invalidateQueries();
      return result;
    },
  }),

  // Tìm hội nhóm Facebook theo những điều kiện người dùng chọn
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
    async handler(ctx, args) {
      return executeFindGroups(ctx, args);
    },
  }),
};
