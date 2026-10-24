import type { Metric, ChannelInsight, Analytics } from "../../types";

export const SLOT_LABELS = [
  "06:00–09:00",
  "09:00–12:00",
  "12:00–13:00",
  "13:00–17:00",
  "17:00–19:00",
  "19:00–21:00",
  "21:00–23:00",
] as const;

export type SlotLabel = (typeof SLOT_LABELS)[number];

export type ChannelType = "group" | "page" | "instagram";

export interface QuickEditSalesData {
  id: number;
  inquiries: number;
  orders: number;
  reach: number;
  notes: string;
  post_url: string;
}

export interface AnalyticsFeedback {
  text: string;
  type: "success" | "error" | "info";
}

export type { Metric, ChannelInsight, Analytics };
