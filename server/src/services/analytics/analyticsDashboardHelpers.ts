import type { DashboardFilters } from "./analyticsDashboardTypes";

export const VIETNAM_TZ = "Asia/Ho_Chi_Minh";

export interface DateWindow {
  startMs: number;
  endMs: number;
  prevStartMs: number;
  prevEndMs: number;
  startDateIso: string;
  endDateIso: string;
}

/**
 * Tính toán cửa sổ thời gian hiện tại và kỳ trước đối ứng theo múi giờ Việt Nam
 */
export function computeDateWindow(filters: DashboardFilters): DateWindow {
  const now = new Date();
  let endMs = now.getTime();
  let startMs = endMs - 30 * 86400000;

  if (filters.dateRangePreset === "today") {
    const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: VIETNAM_TZ }).format(now);
    startMs = new Date(`${todayStr}T00:00:00+07:00`).getTime();
    endMs = new Date(`${todayStr}T23:59:59.999+07:00`).getTime();
  } else if (filters.dateRangePreset === "7d") {
    startMs = endMs - 7 * 86400000;
  } else if (filters.dateRangePreset === "30d") {
    startMs = endMs - 30 * 86400000;
  } else if (filters.dateRangePreset === "90d") {
    startMs = endMs - 90 * 86400000;
  } else if (filters.dateRangePreset === "custom" && filters.startDate && filters.endDate) {
    startMs = new Date(`${filters.startDate}T00:00:00+07:00`).getTime();
    endMs = new Date(`${filters.endDate}T23:59:59.999+07:00`).getTime();
  }

  const durationMs = Math.max(86400000, endMs - startMs);
  const prevEndMs = startMs;
  const prevStartMs = startMs - durationMs;

  return {
    startMs,
    endMs,
    prevStartMs,
    prevEndMs,
    startDateIso: new Date(startMs).toISOString().split("T")[0] ?? "",
    endDateIso: new Date(endMs).toISOString().split("T")[0] ?? "",
  };
}

/**
 * Tính toán điểm Weighted Engagement: WE = R * wr + C * wc + S * ws
 */
export function computeWE(
  reactions: number,
  comments: number,
  shares: number,
  wr: number = 1,
  wc: number = 3,
  ws: number = 5,
): number {
  return reactions * wr + comments * wc + shares * ws;
}

/**
 * Trích xuất link ảnh thumbnail đầu tiên từ driveImages JSON hoặc link trực tiếp
 */
export function extractThumbnail(driveImagesJson: string, directUrl: string): string {
  try {
    if (driveImagesJson) {
      const arr = JSON.parse(driveImagesJson);
      if (Array.isArray(arr) && arr.length > 0 && arr[0].jpeg_url) {
        return arr[0].jpeg_url;
      }
    }
  } catch {
    // fallback
  }
  return directUrl || "";
}

/**
 * Phân bổ slot theo giờ Việt Nam
 */
export function getHourSlotLabel(hour: number): string {
  if (hour >= 6 && hour < 9) return "06:00–09:00";
  if (hour >= 9 && hour < 12) return "09:00–12:00";
  if (hour >= 12 && hour < 15) return "12:00–15:00";
  if (hour >= 15 && hour < 18) return "15:00–18:00";
  if (hour >= 18 && hour < 21) return "18:00–21:00";
  if (hour >= 21 && hour < 24) return "21:00–24:00";
  return "00:00–06:00";
}

export const STANDARD_SLOTS = [
  "06:00–09:00",
  "09:00–12:00",
  "12:00–15:00",
  "15:00–18:00",
  "18:00–21:00",
  "21:00–24:00",
  "00:00–06:00",
];

export const DAYS_OF_WEEK = [
  "Thứ 2",
  "Thứ 3",
  "Thứ 4",
  "Thứ 5",
  "Thứ 6",
  "Thứ 7",
  "Chủ nhật",
];
