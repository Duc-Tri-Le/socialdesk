import { computeWE, extractThumbnail, getHourSlotLabel, DAYS_OF_WEEK } from "./analyticsDashboardHelpers";
import type * as schema from "../../schema";

type MetricRow = typeof schema.postMetrics.$inferSelect;
type GroupRow = typeof schema.fbGroups.$inferSelect;
type DraftRow = typeof schema.drafts.$inferSelect;

export function computeTopGroups(
  currentPosts: MetricRow[],
  allGroups: GroupRow[],
  wr: number,
  wc: number,
  ws: number,
) {
  const groupStatsMap = new Map<
    string,
    {
      totalPosts: number;
      reactions: number;
      comments: number;
      shares: number;
      reach: number;
      reachPosts: number;
      slotCounts: Map<string, number>;
    }
  >();

  for (const p of currentPosts) {
    const gName = p.channelName || "Chưa rõ nhóm";
    let entry = groupStatsMap.get(gName);
    if (!entry) {
      entry = {
        totalPosts: 0,
        reactions: 0,
        comments: 0,
        shares: 0,
        reach: 0,
        reachPosts: 0,
        slotCounts: new Map(),
      };
      groupStatsMap.set(gName, entry);
    }
    entry.totalPosts++;
    entry.reactions += p.likes;
    entry.comments += p.comments;
    entry.shares += p.shares;
    if (p.reach > 0) {
      entry.reach += p.reach;
      entry.reachPosts++;
    }
    const slot = p.hourSlot || getHourSlotLabel(p.postedAt.getHours());
    entry.slotCounts.set(slot, (entry.slotCounts.get(slot) || 0) + 1);
  }

  const topGroupList = Array.from(groupStatsMap.entries()).map(([name, s]) => {
    const totalEng = s.reactions + s.comments + s.shares;
    const avgEng = s.totalPosts > 0 ? Number((totalEng / s.totalPosts).toFixed(1)) : 0;
    const avgWE =
      s.totalPosts > 0
        ? Number((computeWE(s.reactions, s.comments, s.shares, wr, wc, ws) / s.totalPosts).toFixed(1))
        : 0;
    const er = s.reach > 0 ? Number(((totalEng / s.reach) * 100).toFixed(2)) : null;
    let bestSlot = "—";
    let maxSlotPosts = 0;
    for (const [slot, cnt] of s.slotCounts.entries()) {
      if (cnt > maxSlotPosts) {
        maxSlotPosts = cnt;
        bestSlot = slot;
      }
    }
    const matchedGroup = allGroups.find((g) => g.name === name);
    return {
      rank: 1,
      groupId: matchedGroup ? matchedGroup.id : 0,
      groupName: name,
      totalPosts: s.totalPosts,
      avgEngagement: avgEng,
      avgWeightedEngagement: avgWE,
      engagementRate: er,
      bestSlot,
      trendPct: null as number | null,
      eligiblePostsCount: s.totalPosts,
    };
  });
  topGroupList.sort((a, b) => b.avgEngagement - a.avgEngagement);
  topGroupList.forEach((g, idx) => (g.rank = idx + 1));
  return topGroupList;
}

export function computeTopContent(
  currentPosts: MetricRow[],
  allDrafts: DraftRow[],
  wr: number,
  wc: number,
  ws: number,
) {
  const contentStatsMap = new Map<
    number,
    {
      productName: string;
      variantLabel: string;
      thumbnail: string;
      groupNames: Set<string>;
      postsCount: number;
      reactions: number;
      comments: number;
      shares: number;
      bestGroupCounts: Map<string, number>;
    }
  >();

  for (const p of currentPosts) {
    const draftId = p.draftId || 0;
    let entry = contentStatsMap.get(draftId);
    if (!entry) {
      const d = allDrafts.find((item) => item.id === draftId);
      const thumbnail = d ? extractThumbnail(d.driveImages, d.imageUrl) : "";
      const captionSnippet = d?.caption
        ? d.caption.replace(/\s+/g, " ").trim().slice(0, 45) + (d.caption.length > 45 ? "…" : "")
        : "";
      const label = d?.sku
        ? d.sku
        : captionSnippet
          ? `#${p.stt || draftId}: "${captionSnippet}"`
          : `#${p.stt || draftId} ${p.productName}`;
      entry = {
        productName: p.productName || d?.productName || "Sản phẩm",
        variantLabel: label,
        thumbnail,
        groupNames: new Set(),
        postsCount: 0,
        reactions: 0,
        comments: 0,
        shares: 0,
        bestGroupCounts: new Map(),
      };
      contentStatsMap.set(draftId, entry);
    }
    entry.postsCount++;
    if (p.channelName) entry.groupNames.add(p.channelName);
    entry.reactions += p.likes;
    entry.comments += p.comments;
    entry.shares += p.shares;
    const gKey = p.channelName || "Chưa rõ";
    entry.bestGroupCounts.set(
      gKey,
      (entry.bestGroupCounts.get(gKey) || 0) + (p.likes + p.comments + p.shares),
    );
  }

  const topContentList = Array.from(contentStatsMap.entries()).map(([draftId, c]) => {
    const totalEng = c.reactions + c.comments + c.shares;
    const avgEng = c.postsCount > 0 ? Number((totalEng / c.postsCount).toFixed(1)) : 0;
    const avgWE =
      c.postsCount > 0
        ? Number((computeWE(c.reactions, c.comments, c.shares, wr, wc, ws) / c.postsCount).toFixed(1))
        : 0;
    let bestGroupName = "—";
    let maxGroupScore = -1;
    for (const [gName, score] of c.bestGroupCounts.entries()) {
      if (score > maxGroupScore) {
        maxGroupScore = score;
        bestGroupName = gName;
      }
    }
    return {
      draftId,
      productName: c.productName,
      variantLabel: c.variantLabel,
      thumbnail: c.thumbnail,
      groupsCount: c.groupNames.size,
      postsCount: c.postsCount,
      avgEngagement: avgEng,
      avgWeightedEngagement: avgWE,
      bestGroupName,
    };
  });
  topContentList.sort((a, b) => b.avgEngagement - a.avgEngagement);
  return topContentList;
}

export function computeHeatmapRows(
  currentPosts: MetricRow[],
  activeSlots: string[],
  view: "all_groups" | "by_group" | "by_dow",
  topGroups: ReturnType<typeof computeTopGroups>,
  wr: number,
  wc: number,
  ws: number,
) {
  const heatmapRows: Array<{
    rowKey: string;
    rowLabel: string;
    cells: Array<{
      slot: string;
      avgWeightedEngagement: number;
      postsCount: number;
      confidenceTier: "none" | "low" | "medium" | "high";
      label: string;
    }>;
  }> = [];

  const buildCells = (postsMatcher: (p: MetricRow, slot: string) => boolean) =>
    activeSlots.map((slot) => {
      const matching = currentPosts.filter((p) => postsMatcher(p, slot));
      const cnt = matching.length;
      let sumWE = 0;
      for (const m of matching) {
        sumWE += computeWE(m.likes, m.comments, m.shares, wr, wc, ws);
      }
      const avg = cnt > 0 ? Number((sumWE / cnt).toFixed(1)) : 0;
      const tier: "none" | "low" | "medium" | "high" =
        cnt === 0 ? "none" : cnt <= 2 ? "low" : cnt <= 9 ? "medium" : "high";
      const label =
        tier === "none"
          ? "No Data"
          : tier === "low"
            ? "Collecting Data"
            : tier === "medium"
              ? "Preliminary"
              : "Eligible for Trend Analysis";
      return { slot, avgWeightedEngagement: avg, postsCount: cnt, confidenceTier: tier, label };
    });

  if (view === "by_dow") {
    DAYS_OF_WEEK.forEach((dow, dowIdx) => {
      const cells = buildCells((p, slot) => {
        const jsDay = p.postedAt.getDay();
        const vnDayIdx = jsDay === 0 ? 6 : jsDay - 1;
        const pSlot = p.hourSlot || getHourSlotLabel(p.postedAt.getHours());
        return vnDayIdx === dowIdx && pSlot === slot;
      });
      heatmapRows.push({ rowKey: `dow_${dowIdx}`, rowLabel: dow, cells });
    });
  } else if (view === "by_group") {
    const groupsToRender = topGroups.slice(0, 10);
    for (const g of groupsToRender) {
      const cells = buildCells((p, slot) => {
        const pSlot = p.hourSlot || getHourSlotLabel(p.postedAt.getHours());
        return p.channelName === g.groupName && pSlot === slot;
      });
      heatmapRows.push({ rowKey: `grp_${g.groupId}`, rowLabel: g.groupName, cells });
    }
  } else {
    const cells = buildCells((p, slot) => {
      const pSlot = p.hourSlot || getHourSlotLabel(p.postedAt.getHours());
      return pSlot === slot;
    });
    heatmapRows.push({ rowKey: "all", rowLabel: "Tất cả các nhóm", cells });
  }

  return heatmapRows;
}
