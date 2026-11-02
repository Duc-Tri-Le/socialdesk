import { defineAction, z } from "@hatch/space-sdk";
import { eq, and } from "drizzle-orm";
import * as schema from "../../schema";
import {
  getFacebookPostMetrics,
  getInstagramMediaMetrics,
} from "../../services/publishing/metaInteractionApi";

export const metricScanActions = {
  /**
   * Quét chỉ số tương tác bài viết trực tiếp qua Graph API (Không cần Extension mở tab cào DOM)
   */
  scanPostMetricsViaApi: defineAction({
    request: z.object({
      metric_id: z.number().int().positive(),
    }),
    response: z.object({
      ok: z.boolean(),
      likes: z.number(),
      comments: z.number(),
      shares: z.number(),
      reach: z.number().nullable(),
      message: z.string(),
    }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const [metric] = await db
        .select()
        .from(schema.postMetrics)
        .where(eq(schema.postMetrics.id, args.metric_id));

      if (!metric) {
        return {
          ok: false,
          likes: 0,
          comments: 0,
          shares: 0,
          reach: null,
          message: "Không tìm thấy bản ghi chỉ số bài viết.",
        };
      }

      const isIg = metric.channelType === "instagram";
      const isPage = metric.channelType === "page";

      if (!isIg && !isPage) {
        return {
          ok: false,
          likes: metric.likes,
          comments: metric.comments,
          shares: metric.shares,
          reach: metric.reach,
          message: `Kênh "${metric.channelType}" (Group/Cá nhân) không hỗ trợ quét qua API — tiếp tục quét bằng Extension.`,
        };
      }

      // Tìm postUrl tương ứng từ bảng publishRecords
      let postUrl = "";
      if (metric.draftId) {
        const [pubRecord] = await db
          .select()
          .from(schema.publishRecords)
          .where(
            and(
              eq(schema.publishRecords.draftId, metric.draftId),
              eq(schema.publishRecords.targetName, metric.channelName),
            ),
          );
        postUrl = pubRecord?.postUrl || "";
      }

      let token = "";
      let targetPostId = "";

      // Tìm token và ID bài viết
      if (isPage) {
        const allPages = await db.select().from(schema.fbPages);
        const matchPage = allPages.find(
          (p) =>
            p.name.trim().toLowerCase() === metric.channelName.trim().toLowerCase() ||
            (postUrl && p.url && postUrl.includes(p.url)),
        );
        token = matchPage?.accessToken || "";

        const urlMatch = postUrl.match(/posts\/([0-9_]+)|\/([0-9]{10,})/);
        targetPostId = urlMatch?.[1] || urlMatch?.[2] || "";
      } else if (isIg) {
        const allIg = await db
          .select()
          .from(schema.accounts)
          .where(eq(schema.accounts.platform, "Instagram"));
        const matchIg = allIg.find(
          (a) => a.name.trim().toLowerCase() === metric.channelName.trim().toLowerCase(),
        ) || allIg[0];
        token = matchIg?.accessToken || "";

        const igMatch = postUrl.match(/\/p\/([a-zA-Z0-9_-]+)/);
        targetPostId = igMatch?.[1] || "";
      }

      if (!token) {
        return {
          ok: false,
          likes: metric.likes,
          comments: metric.comments,
          shares: metric.shares,
          reach: metric.reach,
          message: `Chưa có Access Token cho ${metric.channelName}. Vui lòng cài đặt Token API trước khi quét.`,
        };
      }

      const res = isIg
        ? await getInstagramMediaMetrics(targetPostId, token)
        : await getFacebookPostMetrics(targetPostId, token);

      if (!res.ok) {
        return {
          ok: false,
          likes: metric.likes,
          comments: metric.comments,
          shares: metric.shares,
          reach: metric.reach,
          message: `Lỗi quét chỉ số qua Graph API: ${res.error || "Không rõ"}`,
        };
      }

      const now = new Date();
      await db
        .update(schema.postMetrics)
        .set({
          likes: res.likes,
          comments: res.comments,
          shares: res.shares,
          reach: res.reach ?? metric.reach,
          scannedAt: now,
        })
        .where(eq(schema.postMetrics.id, metric.id));

      await db.insert(schema.postMetricSnapshots).values({
        postingId: metric.id,
        capturedAt: now,
        reactions: res.likes,
        comments: res.comments,
        shares: res.shares,
        reach: res.reach ?? null,
        source: "admin_insights",
        dataQuality: "full",
        createdAt: now,
      });

      ctx.invalidateQueries();
      return {
        ok: true,
        likes: res.likes,
        comments: res.comments,
        shares: res.shares,
        reach: res.reach ?? null,
        message: `Đã quét chỉ số qua Graph API: ${res.likes} Like, ${res.comments} Bình luận, ${res.shares} Chia sẻ!`,
      };
    },
  }),
};

