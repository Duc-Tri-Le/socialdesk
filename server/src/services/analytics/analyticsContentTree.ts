import * as schema from "../../schema";
import {
  toMetricOut,
  engagementScore,
  type MetricRow,
  type ContentDraftData,
  type ProductTreeData,
} from "./analyticsTypes";

type DraftRow = typeof schema.drafts.$inferSelect;

/**
 * Xây dựng cây dữ liệu 3 cấp:
 * 1. Sản phẩm (Product) -> 2. Các phiên bản nội dung gốc (Drafts A, B...) -> 3. Các lượt đăng thực tế (Post Instances).
 * Phân biệt rạch ròi giữa bản nội dung gốc và từng lượt xuất bản.
 */
export function buildProductContentTree(
  drafts: DraftRow[],
  metricRows: MetricRow[],
  pubUrlMap: Map<string, string>,
): ProductTreeData[] {
  // Gom các lượt đăng thực tế theo draftId
  const metricsByDraft = new Map<number, MetricRow[]>();
  for (const m of metricRows) {
    if (m.draftId) {
      const list = metricsByDraft.get(m.draftId);
      if (list) {
        list.push(m);
      } else {
        metricsByDraft.set(m.draftId, [m]);
      }
    }
  }

  // Gom các draft theo tên sản phẩm (chuẩn hóa chữ thường để nhóm chính xác)
  const draftsByProduct = new Map<string, { displayName: string; drafts: DraftRow[] }>();
  for (const d of drafts) {
    const pName = (d.productName || "Sản phẩm khác").trim();
    const key = pName.toLowerCase();
    let group = draftsByProduct.get(key);
    if (!group) {
      group = { displayName: pName, drafts: [] };
      draftsByProduct.set(key, group);
    }
    group.drafts.push(d);
  }

  const result: ProductTreeData[] = [];

  for (const group of draftsByProduct.values()) {
    const draftNodes: ContentDraftData[] = [];
    let productPostsCount = 0;
    let productScore = 0;
    let productOrders = 0;
    let productInquiries = 0;

    for (const d of group.drafts) {
      const rawPosts = metricsByDraft.get(d.id) ?? [];
      const posts = rawPosts.map((r) => {
        const key = `${r.draftId}:${(r.channelName || "").trim().toLowerCase()}`;
        return toMetricOut(r, pubUrlMap.get(key) || "");
      });

      const totalLikes = posts.reduce((s, p) => s + p.likes, 0);
      const totalComments = posts.reduce((s, p) => s + p.comments, 0);
      const totalShares = posts.reduce((s, p) => s + p.shares, 0);
      const totalInquiries = posts.reduce((s, p) => s + p.inquiries, 0);
      const totalOrders = posts.reduce((s, p) => s + p.orders, 0);
      const totalReach = posts.reduce((s, p) => s + p.reach, 0);
      const totalScore = rawPosts.reduce((s, r) => s + engagementScore(r), 0);

      let driveImages: string[] = [];
      try {
        if (d.driveImages) {
          const parsed = JSON.parse(d.driveImages);
          if (Array.isArray(parsed)) {
            driveImages = parsed.map((item: any) =>
              typeof item === "string" ? item : item?.url || item?.name || "",
            ).filter(Boolean);
          }
        }
      } catch {
        driveImages = [];
      }

      draftNodes.push({
        draft_id: d.id,
        stt: d.stt || "",
        angle: d.angle || "chot_don",
        caption: d.caption || "",
        drive_images: driveImages,
        posts_count: posts.length,
        total_likes: totalLikes,
        total_comments: totalComments,
        total_shares: totalShares,
        total_inquiries: totalInquiries,
        total_orders: totalOrders,
        total_reach: totalReach,
        total_score: totalScore,
        posts,
      });

      productPostsCount += posts.length;
      productScore += totalScore;
      productOrders += totalOrders;
      productInquiries += totalInquiries;
    }

    // Sắp xếp các bản nháp theo STT hoặc ID giảm dần
    draftNodes.sort((a, b) => b.draft_id - a.draft_id);

    result.push({
      product_name: group.displayName,
      drafts_count: group.drafts.length,
      total_posts: productPostsCount,
      total_score: productScore,
      total_orders: productOrders,
      total_inquiries: productInquiries,
      drafts: draftNodes,
    });
  }

  // Sắp xếp sản phẩm theo tổng số lượt đăng và điểm số
  result.sort((a, b) => b.total_posts - a.total_posts || b.total_score - a.total_score);

  return result;
}
