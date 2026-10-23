import { defineAction, z } from "@hatch/space-sdk";
import { desc, eq } from "drizzle-orm";
import * as schema from "../schema";
import {
  metricOut,
  toMetricOut,
  channelInsightOut,
  HOUR_SLOTS,
  hourSlotOf,
  engagementScore,
  type MetricRow,
} from "../services/analytics";

export const analyticsActions = {

  // ------------------------------------------------- phân tích & tối ưu
  // Sau khi đăng, ghi chỉ số từng bài theo kênh + giờ đăng. getAnalytics
  // tổng hợp điểm tương tác theo từng khung giờ RIÊNG cho từng nhóm/page
  // và trả về khung giờ tốt nhất + khuyến nghị cho lần đăng sau.
  listPostMetrics: defineAction({
    request: z.object({}),
    response: z.object({ metrics: z.array(metricOut) }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const rows = await db
        .select()
        .from(schema.postMetrics)
        .orderBy(desc(schema.postMetrics.postedAt));
      return { metrics: rows.map(toMetricOut) };
    },
  }),

  addPostMetric: defineAction({
    request: z.object({
      draft_id: z.number().int().positive().optional(),
      product_name: z.string().default(""),
      stt: z.string().default(""),
      channel_type: z.enum(["group", "page", "instagram"]),
      channel_id: z.number().int().min(0).default(0),
      channel_name: z.string().min(1),
      media_kind: z.enum(["image", "video", "none"]).default("image"),
      posted_at: z.string().min(1),
      reach: z.number().int().min(0).default(0),
      likes: z.number().int().min(0).default(0),
      comments: z.number().int().min(0).default(0),
      shares: z.number().int().min(0).default(0),
      clicks: z.number().int().min(0).default(0),
      inquiries: z.number().int().min(0).default(0),
      orders: z.number().int().min(0).default(0),
      notes: z.string().default(""),
    }),
    response: z.object({ id: z.number(), hour_slot: z.string() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const postedAt = new Date(args.posted_at);
      if (Number.isNaN(postedAt.getTime()))
        throw new Error("addPostMetric: posted_at không hợp lệ");
      const [row] = await db
        .insert(schema.postMetrics)
        .values({
          draftId: args.draft_id ?? null,
          productName: args.product_name.trim(),
          stt: args.stt.trim(),
          channelType: args.channel_type,
          channelId: args.channel_id,
          channelName: args.channel_name.trim(),
          mediaKind: args.media_kind,
          postedAt,
          hourSlot: hourSlotOf(postedAt),
          reach: args.reach,
          likes: args.likes,
          comments: args.comments,
          shares: args.shares,
          clicks: args.clicks,
          inquiries: args.inquiries,
          orders: args.orders,
          notes: args.notes.trim(),
        })
        .returning({ id: schema.postMetrics.id });
      if (!row) throw new Error("addPostMetric: insert returned no rows");
      ctx.invalidateQueries();
      return { id: row.id, hour_slot: hourSlotOf(postedAt) };
    },
  }),

  deletePostMetric: defineAction({
    request: z.object({ id: z.number().int().positive() }),
    response: z.object({ ok: z.boolean() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      await db
        .delete(schema.postMetrics)
        .where(eq(schema.postMetrics.id, args.id));
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

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
      const rows = await db.select().from(schema.postMetrics);
      const byChannel = new Map<
        string,
        {
          type: "group" | "page" | "instagram";
          id: number;
          name: string;
          rows: MetricRow[];
        }
      >();
      for (const r of rows) {
        const key = `${r.channelType}:${r.channelId}:${r.channelName}`;
        const cur = byChannel.get(key) ?? {
          type: r.channelType,
          id: r.channelId,
          name: r.channelName,
          rows: [],
        };
        cur.rows.push(r);
        byChannel.set(key, cur);
      }
      const channels: z.infer<typeof channelInsightOut>[] = [];
      for (const c of byChannel.values()) {
        const totalScore = c.rows.reduce((s, r) => s + engagementScore(r), 0);
        const slots = HOUR_SLOTS.map((slot) => {
          const inSlot = c.rows.filter((r) => r.hourSlot === slot);
          const t = inSlot.reduce((s, r) => s + engagementScore(r), 0);
          return {
            slot,
            posts: inSlot.length,
            avg_score: inSlot.length ? Math.round((t / inSlot.length) * 10) / 10 : 0,
            total_score: t,
          };
        });
        const withData = slots.filter((s) => s.posts > 0);
        const best = withData.reduce(
          (a, b) => (b.avg_score > a.avg_score ? b : a),
          withData[0] ?? { slot: "", posts: 0, avg_score: 0, total_score: 0 },
        );
        const totalInq = c.rows.reduce((s, r) => s + r.inquiries, 0);
        const totalOrd = c.rows.reduce((s, r) => s + r.orders, 0);
        let recommendation: string;
        if (c.rows.length < 3) {
          recommendation = `Mới có ${c.rows.length} bài được đo ở kênh này — cần ít nhất 3 bài ở các khung giờ khác nhau mới kết luận được khung giờ tốt nhất. Tạm ưu tiên ${best.slot || "19:00–21:00"}.`;
        } else if (best.posts >= 2) {
          recommendation = `Đăng vào khung ${best.slot} cho kênh này: điểm tương tác trung bình cao nhất (${best.avg_score} điểm/bài qua ${best.posts} bài). Giữ mô tả icon đúng chỗ theo mẫu và dùng đúng media đã gắn vào bài như các bài hiệu quả.`;
        } else {
          recommendation = `Khung ${best.slot} đang dẫn đầu nhưng mới có 1 bài — đăng thử thêm 1–2 bài nữa vào khung này để xác nhận trước khi chốt lịch cố định cho kênh.`;
        }
        channels.push({
          channel_type: c.type,
          channel_id: c.id,
          channel_name: c.name,
          posts: c.rows.length,
          total_score: totalScore,
          avg_score: Math.round((totalScore / c.rows.length) * 10) / 10,
          total_reach: c.rows.reduce((s, r) => s + r.reach, 0),
          total_inquiries: totalInq,
          total_orders: totalOrd,
          best_slot: best.slot,
          best_slot_avg: best.avg_score,
          best_slot_posts: best.posts,
          recommendation,
          slots,
        });
      }
      channels.sort((a, b) => b.avg_score - a.avg_score);
      const overallSlots = HOUR_SLOTS.map((slot) => {
        const inSlot = rows.filter((r) => r.hourSlot === slot);
        const t = inSlot.reduce((s, r) => s + engagementScore(r), 0);
        return { slot, avg: inSlot.length ? t / inSlot.length : 0 };
      }).filter((s) => s.avg > 0);
      const overallBest = overallSlots.reduce(
        (a, b) => (b.avg > a.avg ? b : a),
        overallSlots[0] ?? { slot: "", avg: 0 },
      );
      return {
        total_posts: rows.length,
        channels,
        overall_best_slot: overallBest.slot,
        overall_best_avg: Math.round(overallBest.avg * 10) / 10,
      };
    },
  }),
};
