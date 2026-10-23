import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api";
import type { Account, Overview, Page } from "../../types";
import { fmtDate } from "../../utils/format";
import { btnGhost, btnPrimary } from "../../utils/styles";

export function OverviewSection({
  overview,
  loading,
  onGoQueue,
  onGoCompose,
  onGoProducts,
  onGoAccounts,
  onGoAnalytics,
}: {
  overview: Overview | undefined;
  loading: boolean;
  onGoQueue: () => void;
  onGoCompose: () => void;
  onGoProducts: () => void;
  onGoAccounts: () => void;
  onGoAnalytics: () => void;
}) {
  if (loading || !overview) return <p className="text-sm text-[var(--dim)]">Đang tải…</p>;
  const c = overview.counts;
  const slotsLeft = Math.max(0, overview.limits.max_posts_per_day - c.packed_today);

  return (
    <div className="space-y-6">
      <section aria-label="Quy trình vận hành">
        <h2 className="text-lg font-bold">Quy trình vận hành</h2>
        <ol className="mt-3 grid gap-2 sm:grid-cols-2">
          {[
            [
              "1 · Lấy sản phẩm từ Google Sheet",
              "Sheet BUSINESS: STT, hãng xe, mẫu, tỉ lệ (1:24…), kích thước Dài x Rộng x Cao, màu, giá, tồn kho, link thư mục ảnh Drive — tên sản phẩm = hãng xe + mẫu. Sản phẩm được PHÂN LOẠI theo hãng xe + mẫu + tỉ lệ + kích thước + màu sắc: mỗi màu là MỘT sản phẩm riêng với tồn kho riêng, SKU nội bộ “STT-Tên-Màu”, vận chuyển mặc định COD. Tên sản phẩm giữ nguyên văn như trong Sheet.",
            ],
            [
              "2 · Viết bài phong cách ĐỨC GARAGE",
              "Từ thông tin sản phẩm đã có (tên xe giữ nguyên văn, hãng xe, tỉ lệ, màu, kích thước, giá, tồn kho, vận chuyển), AI tự soạn toàn bộ bài đăng chính cho cả nhóm, fanpage và Instagram theo phong cách ĐỨC GARAGE — Emotional Sales Copywriting pha Luxury Product Marketing: tiêu đề emoji chủ đề + tên xe nguyên văn + tagline IN HOA, 1–2 đoạn mở đầu gợi cảm xúc (khí chất dòng xe, giá trị trưng bày, quà tặng, gọi “anh em”), mục ĐIỂM NỔI BẬT ~5 dòng ✅ về thiết kế đặc trưng, mục 📌 THÔNG TIN SẢN PHẨM đầy đủ (hãng xe, dòng xe, tỷ lệ, màu sắc, chất liệu Die-cast, kích thước dạng ~, chức năng theo quy tắc tỉ lệ của shop — 1:18 và 1:24 mở được cửa/cốp/capo, 1:32 sealed không mở — phụ kiện hộp + đế mica, rồi 💰 giá bán dạng che 3xx.xxxđ ghi rõ giá khuyến mãi, 🎁 ưu đãi, ⏰ thời gian khuyến mãi = ngày đăng + 7 ngày chỉ nằm trong khối thông tin, 📦 tình trạng, 🚚 vận chuyển mặc định COD; mục nào chưa có thông tin thì ghi “Cần xác nhận” và vẫn bị chặn duyệt), CTA “📩 Inbox ĐỨC GARAGE…” và cuối bài là hashtag (#DucGarage đứng đầu + tag theo đúng tỉ lệ của xe). Không banner khuyến mãi ở dòng 2. Bạn chỉ đối chiếu với ảnh/video rồi duyệt ở Hàng đợi trước khi đăng; không in mã STT/SKU vào caption.",
            ],
            [
              "3 · Chọn đích nào đăng đích đó",
              "App mở thư mục Drive theo link trong Sheet để liệt kê ảnh THẬT khi đồng bộ Sheet (bản JPEG do Drive kết xuất — file gốc HEIC không đăng trực tiếp được). Khi soạn bài, bạn kiểm soát thêm/bớt ảnh ngay trong form và tập ảnh đó được chốt vào bản nháp; xuất gói đăng dùng đúng tập đã chốt, không quét lại Drive. Không kênh nào bị ép một loại media: gói đăng liệt kê đúng media đã gắn vào bài (ảnh đã chốt và video nếu có) cho mọi đích bạn chọn — nhóm đích, fanpage, tài khoản Instagram hay tài khoản chính thức — và bạn chọn đích nào thì chỉ đăng lên đích đó.",
            ],
            [
              "4 · Đo chỉ số, tối ưu khung giờ riêng",
              `Đã ghi ${c.metrics_posts} bài đã đăng. Mục Phân tích tính khung giờ tốt nhất riêng cho từng nhóm, từng Page và từng tài khoản Instagram — không dùng một khung chung.`,
            ],
          ].map(([title, desc]) => (
            <li
              key={title}
              className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-3"
            >
              <p className="text-sm font-semibold">{title}</p>
              <p className="mt-1 text-xs leading-5 text-[var(--dim)]">{desc}</p>
            </li>
          ))}
        </ol>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className={btnGhost} onClick={onGoProducts}>
            Đồng bộ sản phẩm từ Sheet
          </button>
          <button className={btnGhost} onClick={onGoAnalytics}>
            Xem phân tích khung giờ
          </button>
        </div>
        <p className="mt-2 text-xs text-[var(--dim)]">
          Sản phẩm có ảnh THẬT từ Drive (đã liệt kê được file ảnh trong
          thư mục):{" "}
          <strong className="font-mono">{c.products_with_image}</strong> · có
          video: <strong className="font-mono">{c.products_with_video}</strong>{" "}
          / tổng <strong className="font-mono">{c.products}</strong> sản phẩm.
          Sản phẩm chỉ có link thư mục nhưng thư mục rỗng/lỗi/chưa quét
          thì KHÔNG tính là có ảnh.
        </p>
      </section>

      <section aria-label="Việc cần xử lý">
        <h2 className="text-lg font-bold">Việc cần xử lý</h2>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <button
            onClick={onGoQueue}
            className="rounded-[var(--radius)] border-2 border-[var(--accent)] bg-[var(--surface)] p-4 text-left"
          >
            <p className="font-mono text-3xl font-semibold text-[var(--accent-ink)]">
              {c.drafts_pending}
            </p>
            <p className="mt-1 text-sm font-medium">bản nháp chờ duyệt</p>
            <p className="text-xs text-[var(--dim)]">
              {c.drafts_approved + c.drafts_packed} bài đã duyệt
            </p>
          </button>
          <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="font-mono text-3xl font-semibold">
              {c.packed_today}
              <span className="text-lg text-[var(--dim)]">
                /{overview.limits.max_posts_per_day}
              </span>
            </p>
            <p className="mt-1 text-sm font-medium">gói đăng đã xuất hôm nay</p>
            <p className="text-xs text-[var(--dim)]">
              {slotsLeft > 0
                ? `Còn ${slotsLeft} lượt trong hạn mức an toàn`
                : "Đã chạm hạn mức — mai đăng tiếp"}
            </p>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <button className={btnPrimary} onClick={onGoCompose}>
            Soạn bài mới
          </button>
          <button className={btnGhost} onClick={onGoQueue}>
            Mở hàng đợi duyệt
          </button>
        </div>
      </section>

      <LoggedInSummary
        accounts={overview.accounts}
        pages={overview.pages}
        onGoAccounts={onGoAccounts}
      />

      <section aria-label="Nguồn danh sách sản phẩm">
        <h2 className="text-lg font-bold">Danh sách sản phẩm</h2>
        <div className="mt-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4">
          {overview.sheet.configured ? (
            <p className="text-sm leading-6">
              Nguồn: <strong>Google Sheet</strong>
              {overview.sheet.title ? ` — “${overview.sheet.title}”` : ""}
              {overview.sheet.sheet_name
                ? ` · tab ${overview.sheet.sheet_name}`
                : ""}
              . Đã có{" "}
              <strong className="font-mono">{overview.sheet.product_count}</strong>{" "}
              sản phẩm lấy từ Sheet
              {overview.sheet.last_sync_at
                ? ` · đồng bộ gần nhất ${fmtDate(overview.sheet.last_sync_at)}`
                : " · chưa đồng bộ lần nào"}
              .
            </p>
          ) : (
            <p className="text-sm leading-6">
              Danh sách sản phẩm đang nhập tay. Gắn một file{" "}
              <strong>Google Sheet</strong> để danh sách tự lấy từ Sheet.
            </p>
          )}
          <button className={`${btnPrimary} mt-3`} onClick={onGoProducts}>
            Mở mục Sản phẩm
          </button>
        </div>
      </section>

      <section aria-label="Giới hạn an toàn">
        <h2 className="text-lg font-bold">Giới hạn an toàn chống khóa nick</h2>
        <div className="mt-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4 text-sm leading-6">
          <p>
            Tối đa{" "}
            <strong className="font-mono">{overview.limits.max_posts_per_day} bài nhóm/ngày</strong>,
            mỗi bài cách nhau ≥{" "}
            <strong className="font-mono">{overview.limits.min_interval_minutes} phút</strong>.
          </p>
          <p>
            Khung giờ tương tác cao (giờ VN):{" "}
            <strong className="font-mono">{overview.limits.windows.join(" · ")}</strong>
          </p>
          <p className="text-[var(--dim)]">
            Chỉ đăng vào nhóm bạn đã tham gia. Mọi bài đều qua duyệt ở mục Hàng
            đợi — không có nút tự đăng.
          </p>
        </div>
      </section>

      <section aria-label="Số liệu">
        <h2 className="text-lg font-bold">Số liệu bàn làm việc</h2>
        <dl className="mt-3 grid grid-cols-3 gap-3 text-center">
          {[
            ["Tài khoản đang dùng", c.accounts_selected],
            ["Pages quản lý", c.pages_total],
            ["Pages chọn đăng", c.pages_selected],
            ["Sản phẩm", c.products],
            ["Hội nhóm", c.groups],
            ["Nhóm tài khoản chính đã tham gia", c.groups_joined_by_account],
            ["Nhóm có Page đã tham gia", c.groups_joined_by_page],
            ["Nhóm đích", c.groups_target],
            ["Ảnh/video", c.media],
            ["Tổng bản nháp", c.drafts_pending + c.drafts_approved + c.drafts_packed],
          ].map(([label, value]) => (
            <div
              key={label as string}
              className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-3"
            >
              <dd className="font-mono text-xl font-semibold">{value}</dd>
              <dt className="mt-0.5 text-xs text-[var(--dim)]">{label}</dt>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}

export function LoggedInSummary({
  accounts,
  pages,
  onGoAccounts,
}: {
  accounts: Account[];
  pages: Page[];
  onGoAccounts: () => void;
}) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const enable = useMutation({
    mutationFn: (id: number) =>
      api.setAccountSelected({ id, selected: true }),
    onSuccess: (res) => {
      setNote(res.message);
      queryClient.invalidateQueries({ queryKey: ["overview"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
    },
  });
  const loggedIn = accounts.filter((a) => a.linked && a.selected);
  const linkedNotUsed = accounts.filter((a) => a.linked && !a.selected);
  return (
    <section aria-label="Tài khoản đang đăng nhập">
      <h2 className="text-lg font-bold">Đang đăng nhập</h2>
      <div className="mt-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4">
        {loggedIn.length > 0 ? (
          <ul className="space-y-2">
            {loggedIn.map((a) => {
              const myPages = pages.filter(
                (p) => p.account_id === a.id && p.selected,
              );
              return (
                <li key={a.id} className="text-sm">
                  <div className="flex items-center gap-2.5">
                    <span
                      aria-hidden
                      className="h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--ok)]"
                    />
                    {a.profile_url ? (
                      <a
                        href={a.profile_url}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Mở trang ${a.platform} của ${a.name}`}
                        className="font-semibold text-[var(--accent-ink)] underline decoration-dotted underline-offset-2"
                      >
                        {a.platform} — {a.name} ↗
                      </a>
                    ) : (
                      <span className="font-semibold">
                        {a.platform} — {a.name}
                      </span>
                    )}
                    <span className="text-xs text-[var(--dim)]">
                      đang đăng nhập · dùng để đăng bài
                    </span>
                  </div>
                  {myPages.length > 0 && (
                    <ul className="ml-5 mt-1 space-y-0.5">
                      {myPages.map((p) => (
                        <li
                          key={p.id}
                          className="text-xs text-[var(--dim)]"
                        >
                          Page đăng bài:{" "}
                          {p.url ? (
                            <a
                              href={p.url}
                              target="_blank"
                              rel="noreferrer"
                              aria-label={`Mở Page ${p.name}`}
                              className="font-semibold text-[var(--accent-ink)] underline decoration-dotted underline-offset-2"
                            >
                              {p.name} ↗
                            </a>
                          ) : (
                            <span className="font-semibold">{p.name}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-[var(--dim)]">
            Chưa có nick nào đang đăng nhập để đăng bài.
          </p>
        )}
        {linkedNotUsed.length > 0 && (
          <div className="mt-3 border-t border-[var(--border)] pt-3">
            <p className="text-xs font-semibold text-[var(--dim)]">
              Đã liên kết nhưng chưa dùng để đăng — các nick này đang bị ẩn
              khỏi gói đăng:
            </p>
            <ul className="mt-2 space-y-2">
              {linkedNotUsed.map((a) => (
                <li
                  key={a.id}
                  className="flex flex-wrap items-center gap-2 text-sm"
                >
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 shrink-0 rounded-full border border-[var(--border)] bg-[var(--surface-alt)]"
                  />
                  <span className="font-semibold">
                    {a.platform} — {a.name}
                  </span>
                  <span className="text-xs text-[var(--dim)]">
                    đã liên kết nhưng chưa dùng để đăng
                  </span>
                  <button
                    className="rounded-full bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                    disabled={enable.isPending}
                    onClick={() => enable.mutate(a.id)}
                    aria-label={`Bật dùng để đăng cho ${a.platform} ${a.name}`}
                  >
                    Bật dùng để đăng
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {note && (
          <p className="mt-2 text-sm font-medium" role="status">
            {note}
          </p>
        )}
        <button className={`${btnGhost} mt-3`} onClick={onGoAccounts}>
          Xem danh sách tài khoản
        </button>
      </div>
    </section>
  );
}
