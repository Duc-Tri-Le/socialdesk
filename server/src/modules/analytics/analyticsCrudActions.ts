import { defineAction, z } from "@hatch/space-sdk";
import { desc, eq, inArray } from "drizzle-orm";
import * as schema from "../../schema";
import {
  metricOut,
  toMetricOut,
  hourSlotOf,
  engagementScore,
  extractValidUrl,
  normalizeChannelKey,
  buildPublishUrlMap,
  type MetricRow,
} from "../../services/analytics";

export const analyticsCrudActions = {
  /**
   * Danh sách chỉ số bài viết hỗ trợ phân trang phía máy chủ, tìm kiếm,
   * lọc theo khoảng ngày, theo kênh và theo trạng thái bài viết trên Facebook.
   */
  listPostMetrics: defineAction({
    request: z.object({
      page: z.number().int().positive().optional(),
      pageSize: z.number().int().positive().optional(),
      channelType: z.enum(["all", "group", "page", "instagram"]).optional(),
      postStatus: z.enum(["all", "active", "pending_approval", "removed"]).optional(),
      search: z.string().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }).default({}),
    response: z.object({
      metrics: z.array(metricOut),
      total: z.number(),
      page: z.number(),
      pageSize: z.number(),
      totalPages: z.number(),
    }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const [rows, pubRecords] = await Promise.all([
        db.select().from(schema.postMetrics).orderBy(desc(schema.postMetrics.postedAt)),
        db.select().from(schema.publishRecords).where(eq(schema.publishRecords.status, "published")),
      ]);

      const urlMap = buildPublishUrlMap(pubRecords);

      let allMetrics = rows.map((r) => {
        const key = normalizeChannelKey(r.draftId, r.channelName);
        return toMetricOut(r, urlMap.get(key) || "");
      });

      // 1. Lọc theo loại kênh
      if (args.channelType && args.channelType !== "all") {
        allMetrics = allMetrics.filter((m) => m.channel_type === args.channelType);
      }

      // 2. Lọc theo trạng thái bài Facebook
      if (args.postStatus && args.postStatus !== "all") {
        allMetrics = allMetrics.filter((m) => m.post_status === args.postStatus);
      }

      // 3. Lọc theo từ khóa tìm kiếm (Sản phẩm, STT, Tên kênh, Link/Ghi chú)
      if (args.search && args.search.trim()) {
        const kw = args.search.trim().toLowerCase();
        allMetrics = allMetrics.filter(
          (m) =>
            m.product_name.toLowerCase().includes(kw) ||
            m.channel_name.toLowerCase().includes(kw) ||
            m.stt.toLowerCase().includes(kw) ||
            m.notes.toLowerCase().includes(kw) ||
            m.hour_slot.toLowerCase().includes(kw),
        );
      }

      // 4. Lọc theo khoảng ngày (startDate - endDate)
      if (args.startDate) {
        const startMs = new Date(args.startDate).getTime();
        if (!Number.isNaN(startMs)) {
          allMetrics = allMetrics.filter((m) => new Date(m.posted_at).getTime() >= startMs);
        }
      }
      if (args.endDate) {
        // Cộng thêm 1 ngày để bao gồm trọn vẹn cả ngày kết thúc
        const endMs = new Date(args.endDate).getTime() + 86400000;
        if (!Number.isNaN(endMs)) {
          allMetrics = allMetrics.filter((m) => new Date(m.posted_at).getTime() <= endMs);
        }
      }

      const total = allMetrics.length;
      const page = Math.max(1, args.page || 1);
      const pageSize = Math.max(1, args.pageSize || 10);
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const startIdx = (page - 1) * pageSize;
      const paginatedMetrics = allMetrics.slice(startIdx, startIdx + pageSize);

      return {
        metrics: paginatedMetrics,
        total,
        page,
        pageSize,
        totalPages,
      };
    },
  }),

  /**
   * Thêm bản ghi chỉ số bài viết mới.
   */
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
      post_url: z.string().optional(),
      post_status: z.enum(["active", "pending_approval", "removed"]).default("active"),
    }),
    response: z.object({ id: z.number(), hour_slot: z.string() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const postedAt = new Date(args.posted_at);
      if (Number.isNaN(postedAt.getTime())) {
        throw new Error("addPostMetric: Thời gian đăng bài không hợp lệ");
      }

      let notes = args.notes.trim();
      const sanitizedUrl = extractValidUrl(args.post_url || "");
      if (sanitizedUrl && !notes.includes(sanitizedUrl)) {
        notes = notes ? `${notes} | ${sanitizedUrl}` : sanitizedUrl;
      }

      const calculatedSlot = hourSlotOf(postedAt);
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
          hourSlot: calculatedSlot,
          reach: args.reach,
          likes: args.likes,
          comments: args.comments,
          shares: args.shares,
          clicks: args.clicks,
          inquiries: args.inquiries,
          orders: args.orders,
          notes,
          postStatus: args.post_status,
        })
        .returning({ id: schema.postMetrics.id });

      if (!row) throw new Error("addPostMetric: Lỗi khi thêm bản ghi chỉ số");
      ctx.invalidateQueries();
      return { id: row.id, hour_slot: calculatedSlot };
    },
  }),

  /**
   * Xóa một bản ghi chỉ số bài viết theo ID.
   */
  deletePostMetric: defineAction({
    request: z.object({ id: z.number().int().positive() }),
    response: z.object({ ok: z.boolean() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      await db.delete(schema.postMetrics).where(eq(schema.postMetrics.id, args.id));
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  /**
   * Xóa hàng loạt nhiều bản ghi bài đăng đã chọn.
   */
  batchDeletePostMetrics: defineAction({
    request: z.object({ ids: z.array(z.number().int().positive()) }),
    response: z.object({ deleted_count: z.number() }),
    async handler(ctx, args) {
      if (args.ids.length === 0) return { deleted_count: 0 };
      const db = ctx.db<typeof schema>();
      await db.delete(schema.postMetrics).where(inArray(schema.postMetrics.id, args.ids));
      ctx.invalidateQueries();
      return { deleted_count: args.ids.length };
    },
  }),

  /**
   * Cập nhật số liệu kinh doanh (Inbox, Đơn, Tiếp cận) và link/ghi chú bài viết.
   */
  updatePostMetricSales: defineAction({
    request: z.object({
      id: z.number().int().positive(),
      inquiries: z.number().int().min(0),
      orders: z.number().int().min(0),
      reach: z.number().int().min(0).optional(),
      notes: z.string().optional(),
      post_url: z.string().optional(),
    }),
    response: z.object({ ok: z.boolean(), score: z.number() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const [current] = await db
        .select()
        .from(schema.postMetrics)
        .where(eq(schema.postMetrics.id, args.id));
      if (!current) {
        throw new Error(`updatePostMetricSales: Không tìm thấy bản ghi chỉ số #${args.id}`);
      }

      let updatedNotes = args.notes !== undefined ? args.notes.trim() : current.notes;
      const sanitizedUrl = extractValidUrl(args.post_url || "");
      if (sanitizedUrl && !updatedNotes.includes(sanitizedUrl)) {
        updatedNotes = updatedNotes ? `${updatedNotes} | ${sanitizedUrl}` : sanitizedUrl;
      }

      const nextReach = args.reach !== undefined ? args.reach : current.reach;

      await db
        .update(schema.postMetrics)
        .set({
          inquiries: args.inquiries,
          orders: args.orders,
          reach: nextReach,
          notes: updatedNotes,
        })
        .where(eq(schema.postMetrics.id, args.id));

      const updatedRow: MetricRow = {
        ...current,
        inquiries: args.inquiries,
        orders: args.orders,
        reach: nextReach,
        notes: updatedNotes,
      };

      ctx.invalidateQueries();
      return { ok: true, score: engagementScore(updatedRow) };
    },
  }),

  /**
   * Cập nhật trạng thái hiển thị của bài đăng trên Facebook (Đang hiển thị, Chờ duyệt, Bị gỡ).
   */
  updatePostStatus: defineAction({
    request: z.object({
      id: z.number().int().positive(),
      post_status: z.enum(["active", "pending_approval", "removed"]),
    }),
    response: z.object({ ok: z.boolean() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      await db
        .update(schema.postMetrics)
        .set({ postStatus: args.post_status })
        .where(eq(schema.postMetrics.id, args.id));
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  /**
   * Cập nhật trạng thái Facebook hàng loạt cho nhiều bài đăng đã chọn.
   */
  batchUpdatePostStatus: defineAction({
    request: z.object({
      ids: z.array(z.number().int().positive()),
      post_status: z.enum(["active", "pending_approval", "removed"]),
    }),
    response: z.object({ updated_count: z.number() }),
    async handler(ctx, args) {
      if (args.ids.length === 0) return { updated_count: 0 };
      const db = ctx.db<typeof schema>();
      await db
        .update(schema.postMetrics)
        .set({ postStatus: args.post_status })
        .where(inArray(schema.postMetrics.id, args.ids));
      ctx.invalidateQueries();
      return { updated_count: args.ids.length };
    },
  }),
};
