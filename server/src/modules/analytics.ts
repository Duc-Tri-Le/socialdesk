import { defineAction, z } from "@hatch/space-sdk";
import { desc, eq } from "drizzle-orm";
import * as schema from "../schema";
import {
  metricOut,
  toMetricOut,
  channelInsightOut,
  hourSlotOf,
  engagementScore,
  extractValidUrl,
  normalizeChannelKey,
  buildPublishUrlMap,
  aggregateAnalytics,
  prepareSyncMetricsBatch,
  type MetricRow,
} from "../services/analytics";

export const analyticsActions = {
  /**
   * Danh sách toàn bộ chỉ số bài viết đã ghi nhận,
   * tự động ghép nối với đường link bài đăng thực tế từ lịch sử xuất bản (publish_records).
   */
  listPostMetrics: defineAction({
    request: z.object({}),
    response: z.object({ metrics: z.array(metricOut) }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const [rows, pubRecords] = await Promise.all([
        db.select().from(schema.postMetrics).orderBy(desc(schema.postMetrics.postedAt)),
        db.select().from(schema.publishRecords).where(eq(schema.publishRecords.status, "published")),
      ]);

      const urlMap = buildPublishUrlMap(pubRecords);

      return {
        metrics: rows.map((r) => {
          const key = normalizeChannelKey(r.draftId, r.channelName);
          return toMetricOut(r, urlMap.get(key) || "");
        }),
      };
    },
  }),

  /**
   * Ghi chỉ số bài đăng thủ công hoặc tùy chỉnh:
   * Tự động xác định khung giờ chuẩn theo múi giờ Việt Nam (+07:00).
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
    }),
    response: z.object({ id: z.number(), hour_slot: z.string() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const postedAt = new Date(args.posted_at);
      if (Number.isNaN(postedAt.getTime())) {
        throw new Error("addPostMetric: Thời gian đăng bài (posted_at) không hợp lệ");
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
        })
        .returning({ id: schema.postMetrics.id });

      if (!row) throw new Error("addPostMetric: Lỗi cơ sở dữ liệu khi tạo chỉ số bài đăng");
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
      await db
        .delete(schema.postMetrics)
        .where(eq(schema.postMetrics.id, args.id));
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  /**
   * Sửa nhanh số liệu chuyển đổi kinh doanh (Inbox hỏi mua, Đơn chốt):
   * Tự động tính lại điểm tương tác tổng hợp mà không cần nhập lại metadata bài viết.
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
   * Đồng bộ tự động toàn bộ bài đã đăng thành công từ Hàng đợi (publish_records)
   * vào bảng chỉ số phân tích bằng kỹ thuật Batch Insert (giải quyết triệt để N+1 queries).
   */
  syncPublishedPostsToMetrics: defineAction({
    request: z.object({}),
    response: z.object({
      synced_count: z.number(),
      total_published: z.number(),
      message: z.string(),
    }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const [pubRecords, existingMetrics, allDrafts] = await Promise.all([
        db.select().from(schema.publishRecords).where(eq(schema.publishRecords.status, "published")),
        db.select().from(schema.postMetrics),
        db.select().from(schema.drafts),
      ]);

      const batchToInsert = prepareSyncMetricsBatch(pubRecords, existingMetrics, allDrafts);

      if (batchToInsert.length > 0) {
        await db.insert(schema.postMetrics).values(batchToInsert);
      }

      ctx.invalidateQueries();

      const syncedCount = batchToInsert.length;
      const message =
        syncedCount > 0
          ? `Đã đồng bộ ${syncedCount} bài đã đăng mới vào danh sách phân tích.`
          : `Tất cả ${pubRecords.length} bài đăng đã có trong bảng chỉ số.`;

      return {
        synced_count: syncedCount,
        total_published: pubRecords.length,
        message,
      };
    },
  }),

  /**
   * Tự động quét chỉ số tương tác thực tế từ Facebook (Like, Comment, Share) qua Chrome Extension.
   */
  scanPostMetricsViaExtension: defineAction({
    request: z.object({
      metric_id: z.number().int().positive().optional(),
    }),
    response: z.object({
      scanned_count: z.number(),
      updated_count: z.number(),
      message: z.string(),
    }),
    async handler(ctx, args) {
      const globalAny = globalThis as any;
      const getCodes = globalAny.__socialDeskGetOnlineExtensionCodes;
      const sendTask = globalAny.__socialDeskSendExtensionTask;

      const onlineCodes: string[] = typeof getCodes === "function" ? getCodes() : [];
      if (onlineCodes.length === 0) {
        throw new Error(
          "Chrome Extension chưa kết nối. Vui lòng mở trình duyệt Chrome có cài Extension Social Desk để tự động quét tương tác bài viết.",
        );
      }
      const extCode = onlineCodes[0];

      const db = ctx.db<typeof schema>();
      let targets: MetricRow[] = [];

      if (args.metric_id) {
        const row = await db
          .select()
          .from(schema.postMetrics)
          .where(eq(schema.postMetrics.id, args.metric_id));
        if (row.length === 0) {
          throw new Error(`Không tìm thấy bài viết #${args.metric_id} cần quét chỉ số`);
        }
        targets = row;
      } else {
        // Quét tối đa 5 bài đăng gần nhất chưa có tương tác hoặc cần cập nhật
        targets = await db
          .select()
          .from(schema.postMetrics)
          .orderBy(desc(schema.postMetrics.postedAt))
          .limit(5);
      }

      const pubRecords = await db
        .select()
        .from(schema.publishRecords)
        .where(eq(schema.publishRecords.status, "published"));
      const urlMap = buildPublishUrlMap(pubRecords);

      let updatedCount = 0;

      for (const m of targets) {
        let postUrl = extractValidUrl(m.notes);
        if (!postUrl && m.draftId) {
          const key = normalizeChannelKey(m.draftId, m.channelName);
          postUrl = urlMap.get(key) || "";
        }

        if (!postUrl || !postUrl.includes("facebook.com")) {
          continue;
        }

        try {
          const res = await sendTask(
            extCode,
            {
              action: "SCAN_POST_METRICS",
              taskId: `scan_${Date.now()}_${m.id}`,
              postUrl,
            },
            25000,
          );

          if (res && res.status === "success") {
            const newLikes = typeof res.likes === "number" ? res.likes : m.likes;
            const newComments = typeof res.comments === "number" ? res.comments : m.comments;
            const newShares = typeof res.shares === "number" ? res.shares : m.shares;
            const newReach = typeof res.reach === "number" && res.reach > 0 ? res.reach : m.reach;

            await db
              .update(schema.postMetrics)
              .set({
                likes: newLikes,
                comments: newComments,
                shares: newShares,
                reach: newReach,
              })
              .where(eq(schema.postMetrics.id, m.id));

            updatedCount++;
          }
        } catch (e: any) {
          console.warn(`[Analytics] Quét bài #${m.id} thất bại:`, e.message);
        }
      }

      ctx.invalidateQueries();

      return {
        scanned_count: targets.length,
        updated_count: updatedCount,
        message:
          updatedCount > 0
            ? `Đã cập nhật chỉ số tương tác tự động cho ${updatedCount} bài viết qua Extension [${extCode}].`
            : "Chưa quét được tương tác nào. Vui lòng kiểm tra lại link bài viết hoặc quyền truy cập của nick Facebook.",
      };
    },
  }),

  /**
   * Tính toán báo cáo phân tích tương tác và khuyến nghị khung giờ tối ưu theo từng kênh:
   * Single Responsibility: toàn bộ thuật toán phân tích được ủy quyền cho aggregateAnalytics.
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
      const rows = await db.select().from(schema.postMetrics);
      return aggregateAnalytics(rows);
    },
  }),
};
