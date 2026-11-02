import { eq } from "drizzle-orm";
import * as schema from "../../schema";
import type { MetricRow } from "../../services/analytics";

export function resolveTargetExtensionCode(
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

export async function executeSingleMetricScan(
  db: any,
  m: MetricRow,
  postUrl: string,
  allAccounts: (typeof schema.accounts.$inferSelect)[],
  onlineCodes: string[],
  sendTask: any,
  isOnlineFn?: (code: string) => boolean,
  taskPrefix: string = "scan",
): Promise<{ updated: boolean; targetExtCode?: string }> {
  const targetExtCode = resolveTargetExtensionCode(
    m,
    postUrl,
    allAccounts,
    onlineCodes,
    isOnlineFn,
  );

  if (!targetExtCode) {
    console.warn(`[Analytics] Bỏ qua bài #${m.id}: Không có Chrome Extension nào online phù hợp.`);
    return { updated: false };
  }

  try {
    const res = await sendTask(
      targetExtCode,
      {
        action: "SCAN_POST_METRICS",
        taskId: `${taskPrefix}_${Date.now()}_${m.id}`,
        postUrl,
      },
      45000,
    );

    if (res && res.status === "success") {
      const newLikes = typeof res.likes === "number" ? res.likes : m.likes;
      const newComments = typeof res.comments === "number" ? res.comments : m.comments;
      const newShares = typeof res.shares === "number" ? res.shares : m.shares;
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

      return { updated: true, targetExtCode };
    } else if (res && res.status === "pending_approval") {
      await db
        .update(schema.postMetrics)
        .set({ postStatus: "pending_approval", scannedAt: new Date() })
        .where(eq(schema.postMetrics.id, m.id));
      return { updated: true, targetExtCode };
    } else if (res && res.status === "removed") {
      await db
        .update(schema.postMetrics)
        .set({ postStatus: "removed", scannedAt: new Date() })
        .where(eq(schema.postMetrics.id, m.id));
      return { updated: true, targetExtCode };
    }
  } catch (e: any) {
    console.warn(`[Analytics] Quét bài #${m.id} qua [${targetExtCode}] thất bại:`, e.message);
  }

  return { updated: false, targetExtCode };
}

