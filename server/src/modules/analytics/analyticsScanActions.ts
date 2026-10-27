import { defineAction, z } from "@hatch/space-sdk";
import { desc, eq, inArray } from "drizzle-orm";
import * as schema from "../../schema";
import {
  extractValidUrl,
  normalizeChannelKey,
  buildPublishUrlMap,
  prepareSyncMetricsBatch,
  ensureMetricsSynced,
  type MetricRow,
} from "../../services/analytics";

function resolveTargetExtensionCode(
  target: MetricRow,
  postUrl: string,
  allAccounts: (typeof schema.accounts.$inferSelect)[],
  onlineCodes: string[],
  isOnlineFn?: (code: string) => boolean,
): string {
  const isOnline = (c: string) => {
    if (!c) return false;
    const norm = c.trim().toUpperCase();
    if (typeof isOnlineFn === "function") return isOnlineFn(norm);
    return onlineCodes.includes(norm);
  };

  const isIg =
    target.channelType === "instagram" ||
    (postUrl || "").includes("instagram.com");

  if (isIg) {
    const igAcc =
      allAccounts.find(
        (a) =>
          a.platform === "Instagram" &&
          a.name.toLowerCase() === (target.channelName || "").toLowerCase(),
      ) ||
      allAccounts.find((a) => a.platform === "Instagram" && a.selected === 1) ||
      allAccounts.find((a) => a.platform === "Instagram");
    const code = (igAcc?.extensionCode || "").trim().toUpperCase();
    if (code && isOnline(code)) return code;
  } else {
    const fbAcc =
      allAccounts.find(
        (a) =>
          a.platform === "Facebook" &&
          a.name.toLowerCase() === (target.channelName || "").toLowerCase(),
      ) ||
      allAccounts.find((a) => a.platform === "Facebook" && a.selected === 1) ||
      allAccounts.find((a) => a.platform === "Facebook");
    const code = (fbAcc?.extensionCode || "").trim().toUpperCase();
    if (code && isOnline(code)) return code;
  }

  // Thử bất kỳ tài khoản nào có mã đang online
  for (const a of allAccounts) {
    const code = (a.extensionCode || "").trim().toUpperCase();
    if (code && isOnline(code)) return code;
  }

  // Fallback về mã online gần nhất hoặc mã đầu tiên
  return onlineCodes[onlineCodes.length - 1] || onlineCodes[0] || "";
}

export const analyticsScanActions = {
  /**
   * Đồng bộ tự động toàn bộ bài đã đăng thành công từ Hàng đợi (publish_records)
   * vào bảng chỉ số phân tích bằng Batch Insert.
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
   * Quét chỉ số tương tác thực tế hoặc trạng thái bài viết từ Facebook qua Chrome Extension.
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
      const isOnlineFn = globalAny.__socialDeskIsExtensionOnline;

      const onlineCodes: string[] = typeof getCodes === "function" ? getCodes() : [];
      if (onlineCodes.length === 0) {
        throw new Error(
          "Chrome Extension chưa kết nối. Vui lòng mở trình duyệt Chrome có cài Extension Social Desk để tự động quét tương tác bài viết.",
        );
      }

      const db = ctx.db<typeof schema>();
      // Tự động đồng bộ các bài đã đăng từ hàng đợi vào bảng chỉ số
      await ensureMetricsSynced(db);

      const allAccounts = await db.select().from(schema.accounts);
      const usedCodes = new Set<string>();

      let targets: MetricRow[] = [];

      if (args.metric_id) {
        targets = await db
          .select()
          .from(schema.postMetrics)
          .where(eq(schema.postMetrics.id, args.metric_id));
        if (targets.length === 0) {
          throw new Error(`Không tìm thấy bài viết #${args.metric_id} cần quét chỉ số`);
        }
      } else {
        targets = await db
          .select()
          .from(schema.postMetrics)
          .orderBy(desc(schema.postMetrics.postedAt))
          .limit(15);
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

        if (!postUrl || (!postUrl.includes("facebook.com") && !postUrl.includes("instagram.com"))) continue;

        const targetExtCode = resolveTargetExtensionCode(
          m,
          postUrl,
          allAccounts,
          onlineCodes,
          isOnlineFn,
        );

        if (!targetExtCode) {
          console.warn(`[Analytics] Bỏ qua bài #${m.id}: Không có Chrome Extension nào online phù hợp.`);
          continue;
        }

        usedCodes.add(targetExtCode);

        try {
          const res = await sendTask(
            targetExtCode,
            {
              action: "SCAN_POST_METRICS",
              taskId: `scan_${Date.now()}_${m.id}`,
              postUrl,
            },
            45000,
          );

          if (res && res.status === "success") {
            const newLikes = typeof res.likes === "number" ? res.likes : m.likes;
            const newComments = typeof res.comments === "number" ? res.comments : m.comments;
            const newShares = typeof res.shares === "number" ? res.shares : m.shares;
            // Reach chỉ cập nhật khi kênh là Fanpage hoặc có dữ liệu Insights từ quyền Admin
            const newReach = typeof res.reach === "number" && res.reach > 0 ? res.reach : m.reach;

            const updateValues: Record<string, any> = {
              likes: newLikes,
              comments: newComments,
              shares: newShares,
              reach: newReach,
              postStatus: "active",
              scannedAt: new Date(),
            };
            if (res.postUrl && typeof res.postUrl === "string" && res.postUrl.length > 10 && res.postUrl !== m.notes) {
              updateValues.notes = res.postUrl;
            }

            await db
              .update(schema.postMetrics)
              .set(updateValues)
              .where(eq(schema.postMetrics.id, m.id));

            await db.insert(schema.postMetricSnapshots).values({
              postingId: m.id,
              capturedAt: new Date(),
              reactions: newLikes,
              comments: newComments,
              shares: newShares,
              reach: typeof res.reach === "number" && res.reach > 0 ? res.reach : null,
              source: "extension_dom",
              dataQuality: "full",
            });

            updatedCount++;
          } else if (res && res.status === "pending_approval") {
            await db
              .update(schema.postMetrics)
              .set({ postStatus: "pending_approval", scannedAt: new Date() })
              .where(eq(schema.postMetrics.id, m.id));
            updatedCount++;
          } else if (res && res.status === "removed") {
            await db
              .update(schema.postMetrics)
              .set({ postStatus: "removed", scannedAt: new Date() })
              .where(eq(schema.postMetrics.id, m.id));
            updatedCount++;
          }
        } catch (e: any) {
          console.warn(`[Analytics] Quét bài #${m.id} qua [${targetExtCode}] thất bại:`, e.message);
        }
      }

      ctx.invalidateQueries();

      const usedList = Array.from(usedCodes).join(", ") || onlineCodes[0];
      return {
        scanned_count: targets.length,
        updated_count: updatedCount,
        message:
          updatedCount > 0
            ? `Đã cập nhật chỉ số công khai (Like, Comment, Share) và trạng thái hiển thị cho ${updatedCount} bài viết qua Extension [${usedList}]. (Reach chỉ hiển thị khi có quyền Admin; Inbox/Đơn hàng bảo toàn từ dữ liệu bán hàng).`
            : "Chưa quét được tương tác nào. Vui lòng kiểm tra lại link bài viết hoặc quyền truy cập nhóm của tài khoản Facebook.",
      };
    },
  }),

  /**
   * Quét hàng loạt nhiều bài viết được người dùng chọn (Batch Scan).
   */
  batchScanPostMetrics: defineAction({
    request: z.object({
      metric_ids: z.array(z.number().int().positive()),
    }),
    response: z.object({
      scanned_count: z.number(),
      updated_count: z.number(),
      message: z.string(),
    }),
    async handler(ctx, args) {
      if (args.metric_ids.length === 0) {
        return { scanned_count: 0, updated_count: 0, message: "Chưa chọn bài nào để quét." };
      }

      const globalAny = globalThis as any;
      const getCodes = globalAny.__socialDeskGetOnlineExtensionCodes;
      const sendTask = globalAny.__socialDeskSendExtensionTask;
      const isOnlineFn = globalAny.__socialDeskIsExtensionOnline;

      const onlineCodes: string[] = typeof getCodes === "function" ? getCodes() : [];
      if (onlineCodes.length === 0) {
        throw new Error(
          "Chrome Extension chưa kết nối. Vui lòng mở trình duyệt Chrome có cài Extension Social Desk để quét hàng loạt.",
        );
      }

      const db = ctx.db<typeof schema>();
      await ensureMetricsSynced(db);

      const allAccounts = await db.select().from(schema.accounts);

      const targets = await db
        .select()
        .from(schema.postMetrics)
        .where(inArray(schema.postMetrics.id, args.metric_ids));

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

        if (!postUrl || (!postUrl.includes("facebook.com") && !postUrl.includes("instagram.com"))) continue;

        const targetExtCode = resolveTargetExtensionCode(
          m,
          postUrl,
          allAccounts,
          onlineCodes,
          isOnlineFn,
        );

        if (!targetExtCode) {
          console.warn(`[BatchScan] Bỏ qua bài #${m.id}: Không có Chrome Extension nào online phù hợp.`);
          continue;
        }

        try {
          const res = await sendTask(
            targetExtCode,
            {
              action: "SCAN_POST_METRICS",
              taskId: `batch_scan_${Date.now()}_${m.id}`,
              postUrl,
            },
            45000,
          );

          if (res && res.status === "success") {
            const newLikes = typeof res.likes === "number" ? res.likes : m.likes;
            const newComments = typeof res.comments === "number" ? res.comments : m.comments;
            const newShares = typeof res.shares === "number" ? res.shares : m.shares;
            // Reach chỉ cập nhật khi kênh là Fanpage hoặc có dữ liệu Insights từ quyền Admin
            const newReach = typeof res.reach === "number" && res.reach > 0 ? res.reach : m.reach;

            const updateValues: Record<string, any> = {
              likes: newLikes,
              comments: newComments,
              shares: newShares,
              reach: newReach,
              postStatus: "active",
              scannedAt: new Date(),
            };
            if (res.postUrl && typeof res.postUrl === "string" && res.postUrl.length > 10 && res.postUrl !== m.notes) {
              updateValues.notes = res.postUrl;
            }

            await db
              .update(schema.postMetrics)
              .set(updateValues)
              .where(eq(schema.postMetrics.id, m.id));

            await db.insert(schema.postMetricSnapshots).values({
              postingId: m.id,
              capturedAt: new Date(),
              reactions: newLikes,
              comments: newComments,
              shares: newShares,
              reach: typeof res.reach === "number" && res.reach > 0 ? res.reach : null,
              source: "extension_dom",
              dataQuality: "full",
            });

            updatedCount++;
          } else if (res && res.status === "pending_approval") {
            await db
              .update(schema.postMetrics)
              .set({ postStatus: "pending_approval", scannedAt: new Date() })
              .where(eq(schema.postMetrics.id, m.id));
            updatedCount++;
          } else if (res && res.status === "removed") {
            await db
              .update(schema.postMetrics)
              .set({ postStatus: "removed", scannedAt: new Date() })
              .where(eq(schema.postMetrics.id, m.id));
            updatedCount++;
          }
        } catch (e: any) {
          console.warn(`[BatchScan] Lỗi quét bài #${m.id}:`, e.message);
        }

        // Giãn cách an toàn 2.5 giây giữa các lượt quét theo chính sách Facebook, phòng ngừa checkpoint
        if (targets.indexOf(m) < targets.length - 1) {
          await new Promise((r) => setTimeout(r, 2500));
        }
      }

      ctx.invalidateQueries();

      return {
        scanned_count: targets.length,
        updated_count: updatedCount,
        message: `Đã hoàn tất quét an toàn cho ${updatedCount}/${targets.length} bài đăng đã chọn (giãn cách chống checkpoint). Chỉ số công khai & trạng thái hiển thị đã được cập nhật.`,
      };
    },
  }),
};
