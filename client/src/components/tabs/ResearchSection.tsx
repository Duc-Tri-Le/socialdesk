import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api";
import type { Run } from "../../types";
import { btnPrimary, btnDanger, inputCls, labelCls } from "../../utils/styles";
import { fmtDate } from "../../utils/format";

export function ResearchSection() {
  const queryClient = useQueryClient();
  const runs = useQuery({
    queryKey: ["research"],
    queryFn: () => api.listResearch({}),
  });
  const [form, setForm] = useState({
    query: "",
    marketplace_count: "",
    price_count: "",
    price_min: "",
    price_median: "",
    price_max: "",
    groups_found: "",
    notes: "",
  });
  const add = useMutation({
    mutationFn: () =>
      api.addResearch({
        query: form.query,
        marketplace_count: Number(form.marketplace_count || 0),
        price_count: Number(form.price_count || 0),
        price_min: form.price_min ? Number(form.price_min) : undefined,
        price_median: form.price_median ? Number(form.price_median) : undefined,
        price_max: form.price_max ? Number(form.price_max) : undefined,
        groups_found: Number(form.groups_found || 0),
        notes: form.notes,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["research"] });
      setForm({
        query: "",
        marketplace_count: "",
        price_count: "",
        price_min: "",
        price_median: "",
        price_max: "",
        groups_found: "",
        notes: "",
      });
    },
  });
  const del = useMutation({
    mutationFn: (id: number) => api.deleteResearch({ id }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["research"] }),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (form.query.trim()) add.mutate();
  };

  return (
    <div className="space-y-6">
      <section aria-label="Ghi kết quả nghiên cứu">
        <h2 className="text-lg font-bold">Ghi kết quả nghiên cứu</h2>
        <p className="mt-1 text-sm text-[var(--dim)]">
          Lượt quét Marketplace/hội nhóm chạy bằng tool Social Desk trên máy
          của bạn (hoặc nhờ Muse quét hộ) — ghi lại số liệu ở đây để đối
          chiếu khi định giá. Giá trích tự động có thể sai, kiểm tra tay trước
          khi đưa vào bài đăng.
        </p>
        <form
          onSubmit={submit}
          className="mt-3 space-y-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4"
        >
          <div>
            <label className={labelCls} htmlFor="rq-query">Từ khóa sản phẩm</label>
            <input
              id="rq-query" aria-label="Từ khóa sản phẩm"
              className={inputCls}
              value={form.query}
              onChange={(e) => setForm({ ...form, query: e.target.value })}
              placeholder="Nhập từ khóa sản phẩm"
              required
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelCls} htmlFor="rq-count">Số tin Marketplace</label>
              <input id="rq-count" aria-label="Số tin Marketplace" type="number" min={0} className={inputCls} value={form.marketplace_count} onChange={(e) => setForm({ ...form, marketplace_count: e.target.value })} />
            </div>
            <div>
              <label className={labelCls} htmlFor="rq-pcount">Số giá trích được</label>
              <input id="rq-pcount" aria-label="Số giá trích được" type="number" min={0} className={inputCls} value={form.price_count} onChange={(e) => setForm({ ...form, price_count: e.target.value })} />
            </div>
            <div>
              <label className={labelCls} htmlFor="rq-groups">Số nhóm liên quan</label>
              <input id="rq-groups" aria-label="Số nhóm liên quan" type="number" min={0} className={inputCls} value={form.groups_found} onChange={(e) => setForm({ ...form, groups_found: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelCls} htmlFor="rq-min">Giá thấp nhất (đ)</label>
              <input id="rq-min" aria-label="Giá thấp nhất (đ)" type="number" min={0} className={inputCls} value={form.price_min} onChange={(e) => setForm({ ...form, price_min: e.target.value })} />
            </div>
            <div>
              <label className={labelCls} htmlFor="rq-med">Giá trung vị (đ)</label>
              <input id="rq-med" aria-label="Giá trung vị (đ)" type="number" min={0} className={inputCls} value={form.price_median} onChange={(e) => setForm({ ...form, price_median: e.target.value })} />
            </div>
            <div>
              <label className={labelCls} htmlFor="rq-max">Giá cao nhất (đ)</label>
              <input id="rq-max" aria-label="Giá cao nhất (đ)" type="number" min={0} className={inputCls} value={form.price_max} onChange={(e) => setForm({ ...form, price_max: e.target.value })} />
            </div>
          </div>
          <div>
            <label className={labelCls} htmlFor="rq-notes">Ghi chú</label>
            <textarea id="rq-notes" aria-label="Ghi chú nghiên cứu" rows={2} className={inputCls} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <button type="submit" className={btnPrimary} disabled={add.isPending}>
            Lưu kết quả nghiên cứu
          </button>
        </form>
      </section>

      <section aria-label="Các lượt nghiên cứu đã lưu">
        <h2 className="text-lg font-bold">Các lượt đã chạy</h2>
        {runs.isPending && <p className="mt-2 text-sm text-[var(--dim)]">Đang tải…</p>}
        <ul className="mt-3 space-y-3">
          {(runs.data?.runs ?? []).map((r: Run) => (
            <li key={r.id} className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{r.query}</p>
                  <p className="text-xs text-[var(--dim)]">Chạy lúc {fmtDate(r.ran_at)} (giờ VN)</p>
                </div>
                <button className={btnDanger} onClick={() => del.mutate(r.id)} aria-label={`Xóa lượt nghiên cứu ${r.query}`}>
                  Xóa
                </button>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
                <div><dt className="text-xs text-[var(--dim)]">Tin Marketplace</dt><dd className="font-mono font-semibold">{r.marketplace_count}</dd></div>
                <div><dt className="text-xs text-[var(--dim)]">Giá thấp nhất</dt><dd className="font-mono font-semibold">{r.price_min_fmt}</dd></div>
                <div><dt className="text-xs text-[var(--dim)]">Giá trung vị</dt><dd className="font-mono font-semibold">{r.price_median_fmt}</dd></div>
                <div><dt className="text-xs text-[var(--dim)]">Giá cao nhất</dt><dd className="font-mono font-semibold">{r.price_max_fmt}</dd></div>
              </dl>
              <p className="mt-2 text-xs text-[var(--dim)]">
                {r.price_count} giá trích được · {r.groups_found} nhóm liên quan
                {r.notes ? ` · ${r.notes}` : ""}
              </p>
            </li>
          ))}
        </ul>
        {runs.data && runs.data.runs.length === 0 && (
          <p className="mt-2 text-sm text-[var(--dim)]">Chưa có lượt nghiên cứu nào được ghi.</p>
        )}
      </section>
    </div>
  );
}

/* --------------------------------------------------------------- Hội nhóm */

