import { defineAction, z } from "@hatch/space-sdk";
import { eq } from "drizzle-orm";
import * as schema from "../../schema";
import {
  channelInsightOut,
  aggregateAnalytics,
  analyticsOverviewOut,
  buildAnalyticsOverview,
  groupPerformanceOut,
  buildGroupPerformanceList,
  productTreeOut,
  buildProductContentTree,
  buildPublishUrlMap,
  groupHeatmapOut,
  buildGroupSlotHeatmap,
  dashboardFiltersInput,
  engagementDashboardOut,
  buildEngagementDashboard,
  ensureMetricsSynced,
} from "../../services/analytics";

export const analyticsReportActions = {
  /**
   * Tính toán phân tích khung giờ tối ưu theo từng kênh (Hội nhóm, Page, Instagram).
   */
  getAnalytics: defineAction({
    request: z.object({}),
    response: z.object({
      total_posts: z.number(),
      channels: z.array(channelInsightOut),
      overall_best_slot: z.string(),
      overall_best_avg: z.number(),
    }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      await ensureMetricsSynced(db);
      const rows = await db.select().from(schema.postMetrics);
      return aggregateAnalytics(rows);
    },
  }),

  /**
   * Báo cáo tổng quan toàn diện (Overview KPI):
   * Thống kê tổng sản phẩm, số phiên bản nội dung gốc, tổng lượt đăng thực tế,
   * tỷ lệ trạng thái bài Facebook (hiển thị, chờ duyệt, bị gỡ), và tổng tương tác/chuyển đổi.
   */
  getAnalyticsOverview: defineAction({
    request: z.object({}),
    response: analyticsOverviewOut,
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      await ensureMetricsSynced(db);
      const [metrics, drafts, products] = await Promise.all([
        db.select().from(schema.postMetrics),
        db.select().from(schema.drafts),
        db.select().from(schema.products),
      ]);

      const productNames = new Set<string>();
      for (const p of products) {
        if (p.name) productNames.add(p.name.trim().toLowerCase());
      }
      for (const d of drafts) {
        if (d.productName) productNames.add(d.productName.trim().toLowerCase());
      }

      return buildAnalyticsOverview(metrics, productNames.size, drafts.length);
    },
  }),

  /**
   * Thống kê hiệu quả chi tiết theo từng Nhóm Facebook:
   * Số lượt đăng vào nhóm, số bài hiển thị/chờ duyệt/bị xóa, tỷ lệ duyệt bài,
   * tổng tương tác (like, cmt, share, reach) và kết quả bán hàng (inbox, đơn).
   */
  getGroupAnalytics: defineAction({
    request: z.object({}),
    response: z.object({
      groups: z.array(groupPerformanceOut),
    }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const rows = await db.select().from(schema.postMetrics);
      return { groups: buildGroupPerformanceList(rows) };
    },
  }),

  /**
   * Cây cấu trúc 3 cấp độ: Sản phẩm -> Các phiên bản nội dung gốc -> Các lượt đăng thực tế.
   * Phân biệt rạch ròi giữa 1 Sản phẩm (ví dụ BMW X5), các Phiên bản nội dung gốc (A, B...)
   * và các Lượt đăng thực tế vào từng nhóm/kênh.
   */
  getProductContentTree: defineAction({
    request: z.object({}),
    response: z.object({
      products: z.array(productTreeOut),
    }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const [drafts, metrics, pubRecords] = await Promise.all([
        db.select().from(schema.drafts),
        db.select().from(schema.postMetrics),
        db.select().from(schema.publishRecords).where(eq(schema.publishRecords.status, "published")),
      ]);

      const urlMap = buildPublishUrlMap(pubRecords);
      const tree = buildProductContentTree(drafts, metrics, urlMap);

      return { products: tree };
    },
  }),

  /**
   * Ma trận Heatmap Nhóm × Khung giờ:
   * Phân tích trực quan nhóm nào hiệu quả ở khung giờ nào theo giờ Việt Nam.
   * Chuẩn hóa theo thời gian hoạt động từ lúc đăng và đánh giá độ tin cậy mẫu.
   */
  getGroupSlotHeatmap: defineAction({
    request: z.object({}),
    response: groupHeatmapOut,
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const rows = await db.select().from(schema.postMetrics);
      return buildGroupSlotHeatmap(rows);
    },
  }),

  /**
   * Dashboard phân tích hiệu quả bài đăng trên nhiều nhóm Facebook (Facebook Groups · Performance Center).
   * Tổng hợp toàn bộ 8 Section (A -> H) theo bộ lọc toàn cục:
   * - Khoảng ngày (Date Range Presets & Custom)
   * - Nhóm Facebook (All / Một hoặc nhiều nhóm)
   * - Sản phẩm & Biến thể nội dung
   * - Trạng thái quét (Scan Status)
   * - Trọng số tương tác có trọng số (WE = R*wr + C*wc + S*ws)
   */
  getEngagementDashboard: defineAction({
    request: dashboardFiltersInput,
    response: engagementDashboardOut,
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      return buildEngagementDashboard(db, args);
    },
  }),

  /**
   * Cập nhật trọng số tính điểm tương tác (Reaction, Comment, Share Weights) vào cài đặt hệ thống.
   */
  updateAnalyticsWeights: defineAction({
    request: z.object({
      reactionWeight: z.number().min(0).max(100),
      commentWeight: z.number().min(0).max(100),
      shareWeight: z.number().min(0).max(100),
    }),
    response: z.object({
      ok: z.boolean(),
      message: z.string(),
    }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      await Promise.all([
        db
          .insert(schema.appSettings)
          .values({ key: "analytics_weight_reactions", value: String(args.reactionWeight) })
          .onConflictDoUpdate({
            target: schema.appSettings.key,
            set: { value: String(args.reactionWeight) },
          }),
        db
          .insert(schema.appSettings)
          .values({ key: "analytics_weight_comments", value: String(args.commentWeight) })
          .onConflictDoUpdate({
            target: schema.appSettings.key,
            set: { value: String(args.commentWeight) },
          }),
        db
          .insert(schema.appSettings)
          .values({ key: "analytics_weight_shares", value: String(args.shareWeight) })
          .onConflictDoUpdate({
            target: schema.appSettings.key,
            set: { value: String(args.shareWeight) },
          }),
      ]);
      ctx.invalidateQueries();
      return {
        ok: true,
        message: `Đã lưu trọng số: Like ×${args.reactionWeight}, Comment ×${args.commentWeight}, Share ×${args.shareWeight}`,
      };
    },
  }),
};
