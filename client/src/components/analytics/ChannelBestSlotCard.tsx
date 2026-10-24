import { memo } from "react";
import type { ChannelInsight } from "./analyticsTypes";
import { SLOT_LABELS } from "./analyticsTypes";

interface ChannelBestSlotCardProps {
  channel: ChannelInsight;
}

export const ChannelBestSlotCard = memo(function ChannelBestSlotCard({
  channel: c,
}: ChannelBestSlotCardProps) {
  const maxAvg = Math.max(1, ...c.slots.map((x) => x.avg_score));

  return (
    <li className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm transition hover:border-[var(--accent)]/40">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold text-[var(--ink)]">
          <span className="mr-1.5 rounded-full bg-[var(--surface-alt)] px-2.5 py-0.5 text-xs font-semibold text-[var(--dim)]">
            {c.channel_type === "group"
              ? "Hội nhóm"
              : c.channel_type === "page"
                ? "Fanpage"
                : "Instagram"}
          </span>
          {c.channel_name}
        </p>
        <p className="font-mono text-xs text-[var(--dim)]">
          {c.posts} bài · điểm TB {c.avg_score} · tiếp cận{" "}
          {c.total_reach.toLocaleString("vi-VN")} · {c.total_inquiries} inbox ·{" "}
          {c.total_orders} đơn
        </p>
      </div>

      <div className="mt-2.5 flex items-center gap-2">
        <span className="text-sm text-[var(--dim)]">Khung giờ tốt nhất:</span>
        <strong className="rounded bg-[var(--accent)]/10 px-2 py-0.5 font-mono text-sm font-bold text-[var(--accent)]">
          {c.best_slot || "Chưa đủ dữ liệu"}
        </strong>
        {c.best_slot ? (
          <span className="text-xs text-[var(--dim)]">
            (điểm TB {c.best_slot_avg}/bài qua {c.best_slot_posts} bài)
          </span>
        ) : null}
      </div>

      <p className="mt-1.5 text-xs leading-5 text-[var(--dim)]">
        {c.recommendation}
      </p>

      {/* Biểu đồ thanh 7 khung giờ */}
      <div
        className="mt-3.5 grid grid-cols-7 gap-1.5 rounded bg-[var(--surface-alt)]/50 p-2"
        role="img"
        aria-label={`Điểm tương tác theo khung giờ của ${c.channel_name}: ${c.slots
          .map((s) => `${s.slot}: ${s.posts} bài, điểm TB ${s.avg_score}`)
          .join("; ")}`}
      >
        {SLOT_LABELS.map((slot) => {
          const s = c.slots.find((x) => x.slot === slot);
          const isBest = s && c.best_slot === slot && s.posts > 0;
          const h = s && s.posts > 0 ? Math.max(12, (s.avg_score / maxAvg) * 56) : 4;

          return (
            <div key={slot} className="flex flex-col items-center justify-end text-center">
              <div className="flex h-14 w-full items-end justify-center">
                <div
                  className={`w-full max-w-7 rounded-t transition-all ${
                    isBest
                      ? "bg-[var(--accent)] shadow-sm"
                      : s && s.posts > 0
                        ? "bg-[var(--border)]"
                        : "bg-[var(--surface-alt)]/60"
                  }`}
                  style={{ height: `${h}px` }}
                  title={`${slot}: ${s?.posts ?? 0} bài, TB ${s?.avg_score ?? 0} điểm`}
                />
              </div>
              <p className="mt-1.5 font-mono text-[9px] leading-3 text-[var(--dim)]">
                {slot.replace("–", "–\n")}
              </p>
              <p className="mt-0.5 font-mono text-[10px] font-semibold text-[var(--ink)]">
                {s && s.posts > 0 ? `${s.avg_score}đ` : "—"}
              </p>
            </div>
          );
        })}
      </div>
    </li>
  );
});
