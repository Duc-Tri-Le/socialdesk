import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api";
import type { Analytics, ChannelInsight, Metric } from "../../types";
import { btnPrimary, btnDanger, inputCls, labelCls } from "../../utils/styles";
import { fmtDate } from "../../utils/format";

/* ------------------------------------------------------------ Phân tích */

const SLOT_LABELS = [
  "06:00–09:00",
  "09:00–12:00",
  "12:00–13:00",
  "13:00–17:00",
  "17:00–19:00",
  "19:00–21:00",
  "21:00–23:00",
];

export function AnalyticsSection({ onGoQueue }: { onGoQueue: () => void }) {
  const queryClient = useQueryClient();
  const metrics = useQuery({
    queryKey: ["metrics"],
    queryFn: () => api.listPostMetrics({}),
  });
  const analytics = useQuery({
    queryKey: ["analytics"],
    queryFn: () => api.getAnalytics({}),
  });
  const groups = useQuery({
    queryKey: ["groups"],
    queryFn: () => api.listGroups({}),
  });
  const pagesQ = useQuery({
    queryKey: ["pages"],
    queryFn: () => api.listPages({}),
  });
  const accountsQ = useQuery({
    queryKey: ["accounts"],
    queryFn: () => api.listAccounts({}),
  });
  const draftsQ = useQuery({
    queryKey: ["drafts"],
    queryFn: () => api.listDrafts({}),
  });

  const [form, setForm] = useState({
    channel_type: "group" as "group" | "page" | "instagram",
    channel_key: "",
    media_kind: "video" as "image" | "video",
    draft_key: "",
    posted_at: "",
    reach: "",
    likes: "",
    comments: "",
    shares: "",
    clicks: "",
    inquiries: "",
    orders: "",
    notes: "",
  });
  const [msg, setMsg] = useState("");

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["metrics"] });
    queryClient.invalidateQueries({ queryKey: ["analytics"] });
    queryClient.invalidateQueries({ queryKey: ["overview"] });
  };
  const add = useMutation({
    mutationFn: () => {
      const [cidRaw, ...nameParts] = form.channel_key.split("|");
      const channel_id = Number(cidRaw || 0);
      const channel_name = nameParts.join("|");
      const draft = (draftsQ.data?.drafts ?? []).find(
        (d) => String(d.id) === form.draft_key,
      );
      return api.addPostMetric({
        draft_id: draft?.id,
        product_name: draft?.product_name ?? "",
        stt: draft?.stt ?? "",
        channel_type: form.channel_type,
        channel_id,
        channel_name,
        media_kind: form.media_kind,
        // Ô nhập là GIỜ VIỆT NAM (nhãn form đã ghi rõ) — phải hiểu
        // theo múi giờ VN bất kể máy đang đặt múi giờ nào, nếu không
        // giờ đăng và khung giờ tính ra sẽ lệch theo múi giờ của máy.
        posted_at: new Date(
          `${form.posted_at.length === 16 ? `${form.posted_at}:00` : form.posted_at}+07:00`,
        ).toISOString(),
        reach: Number(form.reach || 0),
        likes: Number(form.likes || 0),
        comments: Number(form.comments || 0),
        shares: Number(form.shares || 0),
        clicks: Number(form.clicks || 0),
        inquiries: Number(form.inquiries || 0),
        orders: Number(form.orders || 0),
        notes: form.notes,
      });
    },
    onSuccess: (res) => {
      setMsg(
        `Đã ghi chỉ số — bài này thuộc khung giờ ${res.hour_slot} (giờ VN). Khung giờ tốt nhất của kênh sẽ tự cập nhật bên dưới.`,
      );
      setForm({
        channel_type: form.channel_type,
        channel_key: form.channel_key,
        media_kind: form.media_kind,
        draft_key: "",
        posted_at: "",
        reach: "",
        likes: "",
        comments: "",
        shares: "",
        clicks: "",
        inquiries: "",
        orders: "",
        notes: "",
      });
      refresh();
    },
    onError: () => setMsg("Không ghi được — kiểm tra lại kênh và thời gian đăng."),
  });
  const del = useMutation({
    mutationFn: (id: number) => api.deletePostMetric({ id }),
    onSuccess: refresh,
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!form.channel_key) {
      setMsg("Chọn kênh đã đăng (hội nhóm, fanpage hoặc Instagram) trước.");
      return;
    }
    if (!form.posted_at) {
      setMsg("Nhập thời gian đã đăng bài.");
      return;
    }
    add.mutate();
  };

  const channelOptions =
    form.channel_type === "group"
      ? (groups.data?.groups ?? []).map((g) => ({
          key: `${g.id}|${g.name}`,
          label: g.name,
        }))
      : form.channel_type === "page"
        ? (pagesQ.data?.pages ?? []).map((p) => ({
            key: `${p.id}|${p.name}`,
            label: `Page ${p.name}`,
          }))
        : (accountsQ.data?.accounts ?? [])
            .filter((a) => a.platform === "Instagram" && a.linked)
            .map((a) => ({
              key: `${a.id}|${a.name}`,
              label: `Instagram ${a.name}`,
            }));
  const packedDrafts = (draftsQ.data?.drafts ?? []).filter(
    (d) => d.status === "packed" || d.status === "approved",
  );
  const a: Analytics | undefined = analytics.data;

  return (
    <div className="space-y-6">
      <section aria-label="Cách hệ thống tối ưu">
        <h2 className="text-lg font-bold">Phân tích chỉ số & tối ưu khung giờ</h2>
        <p className="mt-1 text-sm leading-6 text-[var(--dim)]">
          Sau khi đăng, ghi lại chỉ số của từng bài ở form dưới. Hệ thống tính{" "}
          <strong>điểm tương tác</strong> cho mỗi bài (like ×1, bình luận ×3,
          chia sẻ ×4, click ×2, inbox hỏi mua ×8, đơn chốt ×20) rồi xếp hạng{" "}
          <strong>7 khung giờ riêng cho từng hội nhóm, từng fanpage và từng tài khoản Instagram</strong>{" "}
          — nhóm nào hợp giờ nào, page nào hợp giờ nào, nick Instagram nào
          hợp giờ nào, không dùng một khung chung. Gói đăng ở Hàng đợi sẽ tự
          in khung giờ tốt nhất của đúng kênh đích.
          {a && a.total_posts > 0 && a.overall_best_slot
            ? ` Tổng thể các kênh, khung đang hiệu quả nhất là ${a.overall_best_slot} (điểm TB ${a.overall_best_avg}/bài) — nhưng hãy ưu tiên khung riêng của từng kênh bên dưới.`
            : ""}
        </p>
      </section>

      <section aria-label="Khung giờ tốt nhất theo từng kênh">
        <h2 className="text-lg font-bold">
          Khung giờ tốt nhất theo từng kênh ({a?.channels.length ?? 0} kênh đã có dữ liệu)
        </h2>
        {analytics.isPending && (
          <p className="mt-2 text-sm text-[var(--dim)]">Đang tải…</p>
        )}
        {a && a.channels.length === 0 && (
          <p className="mt-2 text-sm text-[var(--dim)]">
            Chưa có bài đăng nào được ghi chỉ số — đăng bài đầu tiên (duyệt bài
            ở{" "}
            <button className="underline" onClick={onGoQueue}>
              Hàng đợi
            </button>
            ), rồi quay lại đây ghi chỉ số để bắt đầu tối ưu.
          </p>
        )}
        <ul className="mt-3 space-y-3">
          {(a?.channels ?? []).map((c: ChannelInsight) => (
            <li
              key={`${c.channel_type}-${c.channel_id}-${c.channel_name}`}
              className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold">
                  <span className="mr-1.5 rounded-full bg-[var(--surface-alt)] px-2 py-0.5 text-xs font-semibold">
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
                  {c.total_reach.toLocaleString("vi-VN")} · {c.total_inquiries}{" "}
                  inbox · {c.total_orders} đơn
                </p>
              </div>
              <p className="mt-2 text-sm">
                Khung giờ tốt nhất:{" "}
                <strong className="font-mono text-[var(--accent-ink)]">
                  {c.best_slot || "—"}
                </strong>{" "}
                (điểm TB {c.best_slot_avg}/bài qua {c.best_slot_posts} bài)
              </p>
              <p className="mt-1 text-sm leading-6 text-[var(--dim)]">
                {c.recommendation}
              </p>
              <div
                className="mt-3 grid grid-cols-7 gap-1"
                role="img"
                aria-label={`Điểm tương tác theo khung giờ của ${c.channel_name}: ${c.slots
                  .map((s) => `${s.slot}: ${s.posts} bài, điểm TB ${s.avg_score}`)
                  .join("; ")}`}
              >
                {SLOT_LABELS.map((slot) => {
                  const s = c.slots.find((x) => x.slot === slot);
                  const isBest = s && c.best_slot === slot && s.posts > 0;
                  const maxAvg = Math.max(1, ...c.slots.map((x) => x.avg_score));
                  const h = s && s.posts > 0 ? Math.max(12, (s.avg_score / maxAvg) * 56) : 4;
                  return (
                    <div key={slot} className="text-center">
                      <div className="flex h-14 items-end justify-center">
                        <div
                          className={`w-full max-w-8 rounded-t ${
                            isBest
                              ? "bg-[var(--accent)]"
                              : "bg-[var(--surface-alt)]"
                          }`}
                          style={{ height: `${h}px` }}
                        />
                      </div>
                      <p className="mt-1 font-mono text-[10px] leading-3 text-[var(--dim)]">
                        {slot.replace("–", "–\n")}
                      </p>
                      <p className="font-mono text-[10px] font-semibold">
                        {s && s.posts > 0 ? `${s.avg_score}đ · ${s.posts} bài` : "—"}
                      </p>
                    </div>
                  );
                })}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Ghi chỉ số bài đã đăng">
        <h2 className="text-lg font-bold">Ghi chỉ số bài đã đăng</h2>
        <form
          onSubmit={submit}
          className="mt-3 space-y-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4"
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls} htmlFor="mt-type">Loại kênh *</label>
              <select
                id="mt-type"
                aria-label="Loại kênh"
                className={inputCls}
                value={form.channel_type}
                onChange={(e) =>
                  setForm({
                    ...form,
                    channel_type: e.target.value as "group" | "page" | "instagram",
                    channel_key: "",
                  })
                }
              >
                <option value="group">Hội nhóm</option>
                <option value="page">Fanpage</option>
                <option value="instagram">Instagram</option>
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="mt-media">Dạng media đã đăng</label>
              <select
                id="mt-media"
                aria-label="Dạng media đã đăng"
                className={inputCls}
                value={form.media_kind}
                onChange={(e) =>
                  setForm({ ...form, media_kind: e.target.value as "image" | "video" })
                }
              >
                <option value="image">Ảnh</option>
                <option value="video">Video</option>
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="mt-channel">Kênh đã đăng *</label>
              <select
                id="mt-channel"
                aria-label="Kênh đã đăng"
                className={inputCls}
                value={form.channel_key}
                onChange={(e) => setForm({ ...form, channel_key: e.target.value })}
                required
              >
                <option value="">— Chọn kênh —</option>
                {channelOptions.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
              {channelOptions.length === 0 && (
                <p className="mt-1 text-xs text-[var(--danger)]">
                  {form.channel_type === "group"
                    ? "Chưa có nhóm nào trong danh sách — thêm ở mục Hội nhóm."
                    : form.channel_type === "page"
                      ? "Chưa có Page nào — thêm Page ở mục Tài khoản."
                      : "Chưa có tài khoản Instagram nào đã liên kết — liên kết ở mục Tài khoản."}
                </p>
              )}
            </div>
            <div>
              <label className={labelCls} htmlFor="mt-draft">Bài đăng (gói đã xuất)</label>
              <select
                id="mt-draft"
                aria-label="Bài đăng"
                className={inputCls}
                value={form.draft_key}
                onChange={(e) => setForm({ ...form, draft_key: e.target.value })}
              >
                <option value="">— Không gắn bài cụ thể —</option>
                {packedDrafts.map((d) => (
                  <option key={d.id} value={String(d.id)}>
                    {d.stt ? `STT ${d.stt} · ` : ""}
                    {d.product_name} ({d.code})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="mt-when">Thời gian đã đăng (giờ VN) *</label>
              <input
                id="mt-when"
                aria-label="Thời gian đã đăng"
                type="datetime-local"
                className={inputCls}
                value={form.posted_at}
                onChange={(e) => setForm({ ...form, posted_at: e.target.value })}
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {(
              [
                ["reach", "Lượt tiếp cận"],
                ["likes", "Like"],
                ["comments", "Bình luận"],
                ["shares", "Chia sẻ"],
                ["clicks", "Click/xem ảnh"],
                ["inquiries", "Inbox hỏi mua"],
                ["orders", "Đơn đã chốt"],
              ] as const
            ).map(([key, label]) => (
              <div key={key}>
                <label className={labelCls} htmlFor={`mt-${key}`}>
                  {label}
                </label>
                <input
                  id={`mt-${key}`}
                  aria-label={label}
                  type="number"
                  min={0}
                  className={inputCls}
                  value={form[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                />
              </div>
            ))}
            <div>
              <label className={labelCls} htmlFor="mt-notes">Ghi chú</label>
              <input
                id="mt-notes"
                aria-label="Ghi chú chỉ số"
                className={inputCls}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Nhập ghi chú"
              />
            </div>
          </div>
          <p className="text-xs text-[var(--dim)]">
            Dạng media ghi theo đúng bài đã đăng thực tế (ảnh hoặc
            video), không ép theo kênh. Khung giờ được tự xếp theo giờ
            đăng (giờ VN).
          </p>
          <button type="submit" className={btnPrimary} disabled={add.isPending}>
            Ghi chỉ số & cập nhật tối ưu
          </button>
          {msg && (
            <p className="text-sm font-medium" role="status">
              {msg}
            </p>
          )}
        </form>
      </section>

      <section aria-label="Lịch sử chỉ số đã ghi">
        <h2 className="text-lg font-bold">
          Lịch sử bài đã đo ({metrics.data?.metrics.length ?? 0})
        </h2>
        {metrics.isPending && (
          <p className="mt-2 text-sm text-[var(--dim)]">Đang tải…</p>
        )}
        <ul className="mt-3 space-y-3">
          {(metrics.data?.metrics ?? []).map((m: Metric) => (
            <li
              key={m.id}
              className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">
                    {m.channel_type === "group"
                      ? "Nhóm"
                      : m.channel_type === "page"
                        ? "Page"
                        : "Instagram"}
                    : {m.channel_name}
                  </p>
                  <p className="text-xs text-[var(--dim)]">
                    {m.stt ? `STT ${m.stt} · ` : ""}
                    {m.product_name || "Sản phẩm không gắn bài"} · đăng{" "}
                    {fmtDate(m.posted_at)} · khung{" "}
                    <span className="font-mono font-semibold">{m.hour_slot}</span>{" "}
                    · {m.media_kind === "video"
                      ? "video"
                      : m.media_kind === "image"
                        ? "ảnh"
                        : "không media"}
                  </p>
                </div>
                <button
                  className={btnDanger}
                  onClick={() => del.mutate(m.id)}
                  aria-label={`Xóa chỉ số của bài ở ${m.channel_name}`}
                >
                  Xóa
                </button>
              </div>
              <dl className="mt-2 grid grid-cols-4 gap-x-3 gap-y-1 text-sm sm:grid-cols-8">
                {[
                  ["Tiếp cận", m.reach],
                  ["Like", m.likes],
                  ["Bình luận", m.comments],
                  ["Chia sẻ", m.shares],
                  ["Click", m.clicks],
                  ["Inbox", m.inquiries],
                  ["Đơn", m.orders],
                  ["Điểm", m.score],
                ].map(([label, v]) => (
                  <div key={label as string}>
                    <dt className="text-xs text-[var(--dim)]">{label}</dt>
                    <dd className="font-mono font-semibold">
                      {(v as number).toLocaleString("vi-VN")}
                    </dd>
                  </div>
                ))}
              </dl>
              {m.notes && (
                <p className="mt-1 text-xs text-[var(--dim)]">{m.notes}</p>
              )}
            </li>
          ))}
        </ul>
        {metrics.data && metrics.data.metrics.length === 0 && (
          <p className="mt-2 text-sm text-[var(--dim)]">
            Chưa ghi chỉ số nào.
          </p>
        )}
      </section>
    </div>
  );
}

