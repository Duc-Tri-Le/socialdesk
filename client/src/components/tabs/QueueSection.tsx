import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api";
import type { Draft } from "../../types";
import { btnPrimary, btnGhost, btnDanger, inputCls, labelCls } from "../../utils/styles";
import { fmtDate } from "../../utils/format";
import { DriveImageStrip } from "../ui/DriveImageStrip";
import { useComposeJobs } from "../../context/ComposeJobsContext";

export function QueueSection({
  drafts,
  loading,
  onGoGroups,
  onGoMedia,
}: {
  drafts: Draft[];
  loading: boolean;
  onGoGroups: () => void;
  onGoMedia: () => void;
}) {
  const queryClient = useQueryClient();
  const groups = useQuery({ queryKey: ["groups"], queryFn: () => api.listGroups({}) });
  const pagesQ = useQuery({ queryKey: ["pages"], queryFn: () => api.listPages({}) });
  const accountsQ = useQuery({ queryKey: ["accounts"], queryFn: () => api.listAccounts({}) });
  const [feedback, setFeedback] = useState<Record<number, { ok: boolean; text: string }>>({});
  const [editing, setEditing] = useState<Record<number, { caption: string }>>({});
  const [packGroups, setPackGroups] = useState<Record<number, number[]>>({});
  const [packPages, setPackPages] = useState<Record<number, number[]>>({});
  const [packIg, setPackIg] = useState<Record<number, number[]>>({});
  const [pickerOpen, setPickerOpen] = useState<Record<number, boolean>>({});
  const [packOpen, setPackOpen] = useState<Record<number, boolean>>({});
  const [historyOpen, setHistoryOpen] = useState<Record<number, boolean>>({});
  const [copied, setCopied] = useState<number | null>(null);
  const QUEUE_PAGE_SIZE = 5;
  // Hai trang: "Chờ duyệt" và "Đã duyệt". CẢ HAI trang đều có bộ
  // chọn "Chọn đích đăng" ngay trên thẻ bài (người dùng chốt):
  // chọn đích ngay từ lúc chờ duyệt, lựa chọn lưu bền theo từng
  // bài và duyệt bài là XUẤT GÓI ĐĂNG LUÔN trong cùng một thao
  // tác theo đúng bộ đích đã chọn đó (máy chủ sinh gói ngay khi
  // duyệt) — không còn bước xuất gói riêng sau khi duyệt: bài
  // duyệt xong đã có sẵn gói đăng trên thẻ và bấm "Đăng Bài"
  // ngay tại trang "Đã duyệt". Nút duyệt mang tên "Duyệt bài
  // viết". Riêng "Cập nhật gói đăng" ĐƯỢC GIỮ LẠI (người dùng
  // chốt): nội dung gói THAY ĐỔI theo đích đăng đã chọn, nên đổi
  // đích thì gói tự cập nhật theo ở máy chủ, và nút "Cập nhật
  // gói đăng" vẫn nằm trên thẻ ở trang "Đã duyệt" để bấm cập
  // nhật tay theo đúng bộ đích đang chọn khi cần — trang "Đã
  // duyệt" KHÔNG còn nút mang tên "Xuất gói đăng".
  // Trang thứ ba "Lịch sử bài đăng": chỉ gồm các bài ĐÃ ĐĂNG
  // THÀNH CÔNG lên ít nhất một đích (có publish_records ở trạng
  // thái "published"). Bài ở trang này hiện GỌN — một dòng tóm
  // tắt — bấm mở mới hiện chi tiết, và thẻ bài CHỈ còn nút
  // "Xóa": không còn chọn đích đăng, Đăng Bài, Cập nhật gói
  // đăng, viết lại hay sửa nội dung.
  type QueueTab = "draft" | "ready" | "history";
  const [queueTab, setQueueTab] = useState<QueueTab>("draft");
  const [queuePage, setQueuePage] = useState<Record<QueueTab, number>>({
    draft: 1,
    ready: 1,
    history: 1,
  });
  // Tài khoản chính thức (Facebook) chọn ngay trong danh sách đích
  // đăng: đổi lựa chọn ở đây chính là đổi tài khoản "dùng để đăng"
  // ở mục Tài khoản — gói đăng ghi đúng tài khoản đang chọn.
  const setMainAccount = useMutation({
    mutationFn: (args: { id: number; selected: boolean }) => api.setAccountSelected(args),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      queryClient.invalidateQueries({ queryKey: ["overview"] });
    },
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["drafts"] });
    queryClient.invalidateQueries({ queryKey: ["overview"] });
  };
  const approve = useMutation({
    mutationFn: (id: number) => api.approveDraft({ id }),
    onSuccess: (res, id) => {
      setFeedback((f) => ({ ...f, [id]: { ok: res.ok, text: res.message } }));
      // Duyệt xong là gói đăng đã được xuất luôn và bài đã sang
      // trang "Đã duyệt" — chuyển thẳng sang trang đó để thấy gói
      // đăng và nút "Đăng Bài" ngay, khỏi tìm lại.
      if (res.ok) {
        setQueueTab("ready");
        setQueuePage((s) => ({ ...s, ready: 1 }));
      }
      refresh();
    },
  });
  const update = useMutation({
    mutationFn: (args: { id: number; caption: string }) => api.updateDraft(args),
    onSuccess: (res, args) => {
      if (res.ok) {
        setEditing((e) => {
          const next = { ...e };
          delete next[args.id];
          return next;
        });
        setFeedback((f) => ({ ...f, [args.id]: { ok: true, text: "Đã lưu nội dung." } }));
      } else {
        setFeedback((f) => ({ ...f, [args.id]: { ok: false, text: res.error } }));
      }
      refresh();
    },
  });
  // "Cập nhật gói đăng" thủ công: sinh lại text gói theo đúng bộ
  // đích đang chọn trên thẻ. Nút này ĐƯỢC GIỮ LẠI vì nội dung gói
  // thay đổi theo đích đăng — bấm là gói phản ánh đúng bộ đích
  // hiện tại. Ở trang "Đã duyệt" nút LUÔN mang tên "Cập nhật gói
  // đăng", kể cả với bài đã duyệt từ trước chưa có gói.
  const pack = useMutation({
    mutationFn: (args: { id: number; group_ids: number[]; page_ids: number[]; instagram_account_ids: number[] }) => api.buildPack(args),
    onSuccess: (res, args) => {
      setFeedback((f) => ({ ...f, [args.id]: { ok: res.ok, text: res.message } }));
      refresh();
    },
  });
  // Lưu đích đăng đã chọn cho TỪNG bài ngay khi người dùng đổi
  // lựa chọn — mở lại trang vẫn giữ đúng bộ đích cũ, không chọn
  // lại từ mặc định. Bộ chọn đích có ở cả trang "Chờ duyệt" (chỉ
  // lưu đích; gói sinh theo đúng bộ đích này khi duyệt bài) lẫn
  // trang "Đã duyệt" (máy chủ đồng thời TỰ CẬP NHẬT gói đăng
  // theo bộ đích mới — gói thay đổi theo đích đăng, phần cập
  // nhật này được giữ lại theo yêu cầu người dùng, bên cạnh nút
  // "Cập nhật gói đăng" thủ công ở trên).
  const saveTargets = useMutation({
    mutationFn: (args: { id: number; group_ids: number[]; page_ids: number[]; instagram_account_ids: number[] }) => api.saveDraftTargets(args),
    onSuccess: (res, args) => {
      if (!res.ok) {
        setFeedback((f) => ({ ...f, [args.id]: { ok: false, text: res.message } }));
      }
      refresh();
    },
  });
  const [publishConfirm, setPublishConfirm] = useState<Record<number, boolean>>({});
  const publish = useMutation({
    mutationFn: (args: { id: number; group_ids: number[]; page_ids: number[]; instagram_account_ids: number[] }) => api.publishDraft(args),
    onSuccess: (res, args) => {
      setFeedback((f) => ({ ...f, [args.id]: { ok: res.ok, text: res.message } }));
      setPublishConfirm((s) => ({ ...s, [args.id]: false }));
      refresh();
    },
    onError: (err, args) => {
      setFeedback((f) => ({
        ...f,
        [args.id]: {
          ok: false,
          text: `Đăng Bài không chạy được: ${err instanceof Error ? err.message : "lỗi không rõ"} — kiểm tra đích đăng trước khi thử lại để tránh trùng.`,
        },
      }));
    },
  });
  const del = useMutation({
    mutationFn: (id: number) => api.deleteDraft({ id }),
    onSuccess: refresh,
  });
  // Viết lại cũng đi qua HÀNG ĐỢI SOẠN BÀI toàn cục: bấm nút là bài
  // vào hàng đợi (theo dõi ở vòng tròn tiến trình), không phải chờ
  // ngay tại nút. Kết quả ok=false của action (bài trùng hệt, bản
  // nháp đã duyệt…) được ném thành lỗi để hiện trong danh sách tiến
  // trình kèm nút Thử lại, thay vì báo "xong" giả.
  const composeJobs = useComposeJobs();
  const enqueueRewrite = (d: Draft) => {
    composeJobs.enqueue({
      kind: "rewrite",
      draftId: d.id,
      label: d.product_name,
      run: async () => {
        const res = await api.rewriteDraft({ id: d.id });
        if (!res.ok) throw new Error(res.message);
        return res;
      },
      onDone: (result) => {
        const res = result as { ok: boolean; message: string };
        setFeedback((f) => ({ ...f, [d.id]: { ok: true, text: res.message } }));
        refresh();
      },
      onError: (message) => {
        setFeedback((f) => ({
          ...f,
          [d.id]: { ok: false, text: `Không viết lại được: ${message}` },
        }));
      },
    });
    setFeedback((f) => ({
      ...f,
      [d.id]: {
        ok: true,
        text: "Đã đưa bài vào hàng đợi viết lại — vòng tròn tiến trình trên màn hình cho biết khi nào bài đang chạy/đang chờ.",
      },
    }));
  };

  const copyPack = async (d: Draft) => {
    try {
      await navigator.clipboard.writeText(d.pack_text);
      setCopied(d.id);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setFeedback((f) => ({ ...f, [d.id]: { ok: false, text: "Không chép tự động được — bôi đen nội dung gói đăng để chép tay." } }));
    }
  };

  // Nhóm đăng được = có ÍT NHẤT MỘT danh tính sẽ đăng đã tham gia
  // nhóm đó; trạng thái của tài khoản chính và từng Page con tách
  // riêng (account_joined / joined_pages) vì hai phía có thể khác
  // trạng thái — nút chọn nhóm ghi rõ đăng được bằng danh tính nào.
  const joinedGroups = (groups.data?.groups ?? []).filter(
    (g) => g.account_joined || g.joined_pages.length > 0,
  );
  const allPages = pagesQ.data?.pages ?? [];
  const igAccounts = (accountsQ.data?.accounts ?? []).filter(
    (a) => a.platform === "Instagram" && a.linked,
  );
  const mainAccounts = (accountsQ.data?.accounts ?? []).filter(
    (a) => a.platform === "Facebook" && a.linked,
  );
  const selectedMainCount = mainAccounts.filter((a) => a.selected).length;


  const renderDraft = (d: Draft) => {
    const fb = feedback[d.id];
    const edit = editing[d.id];
    // Đích đăng của bài: lựa chọn ĐÃ LƯU cho bài này thắng mọi mặc
    // định; chỉ khi bài chưa từng lưu lựa chọn mới suy từ các cờ
    // chọn mặc định (nhóm đích / Page đang chọn / nick IG đang
    // chọn). Lựa chọn vừa đổi trong phiên (state cục bộ) thắng cả
    // bản đã lưu vì nó mới hơn.
    const savedTargets = d.pack_targets;
    const selected =
      packGroups[d.id] ??
      (savedTargets.saved
        ? savedTargets.group_ids
        : joinedGroups.filter((g) => g.is_target).map((g) => g.id));
    const selectedPages =
      packPages[d.id] ??
      (savedTargets.saved
        ? savedTargets.page_ids
        : allPages.filter((p) => p.selected).map((p) => p.id));
    const selectedIg =
      packIg[d.id] ??
      (savedTargets.saved
        ? savedTargets.instagram_account_ids
        : igAccounts.filter((a) => a.selected).map((a) => a.id));
    // Đổi đích đăng ở bất cứ mục nào cũng áp dụng ngay cho cả ba
    // mục VÀ lưu bền theo bài — một bộ chọn đích duy nhất cho cả
    // thẻ bài ở mọi trang (Chờ duyệt lẫn Đã duyệt), dùng cho
    // duyệt bài và "Đăng Bài"; với bài đã duyệt, gói đăng tự cập
    // nhật theo bộ đích này ở máy chủ mỗi lần đổi.
    const applyTargets = (groups: number[], pages: number[], igs: number[]) => {
      setPackGroups((s) => ({ ...s, [d.id]: groups }));
      setPackPages((s) => ({ ...s, [d.id]: pages }));
      setPackIg((s) => ({ ...s, [d.id]: igs }));
      saveTargets.mutate({
        id: d.id,
        group_ids: groups,
        page_ids: pages,
        instagram_account_ids: igs,
      });
    };
    return (
      <li key={d.id} className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-semibold">{d.product_name}</p>
          <p className="font-mono text-xs text-[var(--dim)]">{d.code} · {fmtDate(d.created_at)}</p>
        </div>
        <p className="mt-0.5 text-xs text-[var(--dim)]">
          {d.sku ? `SKU ${d.sku} · ` : d.stt ? `STT ${d.stt} · ` : ""}
          {d.maker ? `Hãng xe ${d.maker} · ` : ""}
          {d.color || "chưa rõ màu"} · {d.price || "chưa có giá"} · tồn {d.stock}
          {d.selling_point ? ` · Chi tiết tự ghi đè: ${d.selling_point}` : " · Chi tiết: AI tự soạn"}
          {d.size_cm ? ` · Kích thước: ${d.size_cm}` : ""}
        </p>
        <p className="mt-1 flex flex-wrap gap-1.5 text-xs">
          {d.has_real_image ? (
            <a href={d.image_url} target="_blank" rel="noreferrer" aria-label={`Thư mục Drive của ${d.product_name} — đã gắn ${d.drive_images.length} ảnh vào bài`} className="rounded-full bg-[var(--surface-alt)] px-2 py-0.5 font-semibold text-[var(--ok)]">
              Có {d.drive_images.length} ảnh đã gắn vào bài
            </a>
          ) : (
            <span className="rounded-full bg-[var(--surface-alt)] px-2 py-0.5 font-semibold text-[var(--dim)]">
              {d.drive_status === "empty"
                ? d.drive_error
                  ? `Chưa có ảnh — ${d.drive_error}`
                  : "Chưa có ảnh — thư mục Drive đang rỗng"
                : d.drive_status === "error"
                  ? `Chưa có ảnh — ${d.drive_error || "không đọc được thư mục Drive"}`
                  : d.drive_status === "no_link"
                    ? `Chưa có ảnh — ${d.drive_error || "chưa có link thư mục Drive"}`
                    : "Chưa có ảnh thật từ Drive"}
            </span>
          )}
          {d.video_url ? (
            <a href={d.video_url} target="_blank" rel="noreferrer" aria-label={`Video của ${d.product_name}`} className="rounded-full bg-[var(--surface-alt)] px-2 py-0.5 font-semibold text-[var(--ok)]">
              Có video đã gắn vào bài
            </a>
          ) : (
            <span className="rounded-full bg-[var(--surface-alt)] px-2 py-0.5 font-semibold text-[var(--dim)]">
              Chưa có video
            </span>
          )}
          {d.caption_source === "ai" && (
            <span className="rounded-full bg-[var(--surface-alt)] px-2 py-0.5 font-semibold text-[var(--ok)]">
              Bài do AI viết
            </span>
          )}
          {d.caption_source === "template" && (
            <span className="rounded-full bg-[var(--surface-alt)] px-2 py-0.5 font-semibold text-[var(--danger)]">
              Bài theo mẫu dự phòng — AI chưa viết được
            </span>
          )}
          {d.caption_source === "manual" && (
            <span className="rounded-full bg-[var(--surface-alt)] px-2 py-0.5 font-semibold text-[var(--dim)]">
              Nội dung bạn đã sửa tay
            </span>
          )}
        </p>

        <DriveImageStrip images={d.drive_images} label={d.product_name} />

        {d.placeholders.length > 0 && (
          <p className="mt-2 text-xs font-medium text-[var(--danger)]">
            Chưa điền: {d.placeholders.join("  ")}
          </p>
        )}

        {edit ? (
          <div className="mt-3 space-y-3">
            <div>
              <label className={labelCls} htmlFor={`cap-${d.id}`}>Bài đăng (nhóm + fanpage + Instagram)</label>
              <textarea id={`cap-${d.id}`} rows={12} className={`${inputCls} font-mono text-xs leading-5`} value={edit.caption} onChange={(e) => setEditing((s) => ({ ...s, [d.id]: { ...edit, caption: e.target.value }}))} />
            </div>
            <div className="flex gap-2">
              <button className={btnPrimary} disabled={update.isPending} onClick={() => update.mutate({ id: d.id, caption: edit.caption })}>
                Lưu nội dung
              </button>
              <button className={btnGhost} onClick={() => setEditing((s) => { const n = { ...s }; delete n[d.id]; return n; })}>
                Hủy
              </button>
            </div>
          </div>
        ) : (
          <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-[var(--radius)] bg-[var(--surface-alt)] p-3 font-mono text-xs leading-5">{d.caption}</pre>
        )}

        {d.pack_text && (() => {
          const packShown = !!packOpen[d.id];
          return (
            <div className="mt-3">
              <button
                type="button"
                className={`${btnGhost} flex w-full items-center justify-between gap-2 text-left`}
                aria-expanded={packShown}
                aria-label={`Gói đăng ${d.code}`}
                onClick={() => setPackOpen((s) => ({ ...s, [d.id]: !packShown }))}
              >
                <span className="text-xs font-semibold text-[var(--ok)]">
                  Gói đăng{d.packed_at ? ` · ${fmtDate(d.packed_at)}` : ""}
                </span>
                <span className="text-xs font-medium text-[var(--dim)]">{packShown ? "Ẩn ▲" : "Xem ▼"}</span>
              </button>
              {packShown && (
                <div className="mt-2">
                  <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-[var(--radius)] border border-[var(--ok)] p-3 font-mono text-xs leading-5">{d.pack_text}</pre>
                  <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
                    <button className={btnGhost} onClick={() => copyPack(d)} aria-label={`Chép gói đăng ${d.code}`}>
                      {copied === d.id ? "Đã chép ✓" : "Chép gói đăng"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {d.publish_records.length > 0 &&
          (() => {
            // Lịch sử đăng Bài chỉ hiện thông tin MỚI NHẤT theo
            // từng đích (người dùng chốt): mỗi đích chỉ hiện một
            // bản ghi — bản ghi đã đăng thành công nếu có, không
            // thì bản ghi mới nhất của đích đó. Bản ghi cũ bị
            // thay thế được máy chủ tự xóa khi có bản ghi mới;
            // bộ lọc này bảo đảm giao diện không bao giờ chồng
            // thông tin cũ lên thông tin mới.
            const statusRank = (s: string) =>
              s === "published"
                ? 0
                : s === "queued"
                  ? 1
                  : s === "uncertain"
                    ? 2
                    : 3;
            const latestByTarget = new Map<
              string,
              Draft["publish_records"][number]
            >();
            for (const r of d.publish_records) {
              const key = `${r.target_kind}:${r.target_name}`;
              const cur = latestByTarget.get(key);
              if (
                !cur ||
                statusRank(r.status) < statusRank(cur.status)
              )
                latestByTarget.set(key, r);
            }
            const latestRecords = [...latestByTarget.values()].sort(
              (a, b) =>
                new Date(b.created_at).getTime() -
                new Date(a.created_at).getTime(),
            );
            return (
          <div className="mt-3 rounded-[var(--radius)] border border-[var(--border)] p-3">
            <p className="text-xs font-bold">Lịch sử đăng Bài</p>
            <ul className="mt-1.5 space-y-1.5">
              {latestRecords.map((r) => (
                <li key={r.id} className="text-xs leading-5">
                  <span
                    className={`mr-1.5 rounded-full px-2 py-0.5 font-semibold ${
                      r.status === "published"
                        ? "bg-[var(--surface-alt)] text-[var(--ok)]"
                        : r.status === "failed"
                          ? "bg-[var(--surface-alt)] text-[var(--danger)]"
                          : r.status === "uncertain" || r.status === "needs_login"
                            ? "bg-[var(--surface-alt)] text-[var(--warn)]"
                            : "bg-[var(--surface-alt)] text-[var(--dim)]"
                    }`}
                  >
                    {r.status === "published"
                      ? "✓ Đã đăng"
                      : r.status === "failed"
                        ? "✗ Đăng lỗi"
                        : r.status === "uncertain"
                          ? "⚠ Chưa xác định — kiểm tra Instagram"
                          : r.status === "needs_login"
                            ? "🔑 Chờ bạn đăng nhập Facebook"
                            : r.status === "queued"
                              ? "⏳ Đang xử lý đăng"
                              : r.status === "skipped"
                                ? "↷ Bỏ qua — đã đăng"
                                : "— Chưa đăng trực tiếp được"}
                  </span>
                  <span className="font-semibold">
                    {r.target_kind === "page"
                      ? "Fanpage"
                      : r.target_kind === "instagram"
                        ? "Instagram"
                        : r.target_kind === "group"
                          ? "Nhóm"
                          : "Tài khoản"}{" "}
                    {r.target_name}
                  </span>{" "}
                  <span className="text-[var(--dim)]">· {fmtDate(r.created_at)}</span>
                  <span className="block text-[var(--dim)]">{r.message}</span>
                  {r.post_url && (
                    <a
                      href={r.post_url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold underline"
                      aria-label={`Xem bài đã đăng của ${d.product_name} trên ${r.target_name}`}
                    >
                      Xem bài đã đăng
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
            );
          })()}

        {d.status !== "draft" &&
          (() => {
            // Đích mà lượt đăng GẦN NHẤT đang ở trạng thái "Chờ
            // đăng nhập": trình duyệt Muse đã mở ở trang đăng
            // nhập Facebook và đang chờ người dùng vào đăng nhập
            // 1 lần — đây không phải đăng lỗi, nên hiện banner
            // hướng dẫn + nút đăng lại ngay trên thẻ bài.
            const latestByTarget = new Map<string, Draft["publish_records"][number]>();
            for (const r of d.publish_records) {
              const key = `${r.target_kind}:${r.target_name}`;
              if (!latestByTarget.has(key)) latestByTarget.set(key, r);
            }
            const waitingLogin = [...latestByTarget.values()].filter(
              (r) => r.status === "needs_login",
            );
            if (waitingLogin.length === 0) return null;
            return (
              <div
                className="mt-3 rounded-[var(--radius)] border border-[var(--warn)] p-3"
                role="group"
                aria-label={`Chờ đăng nhập Facebook để đăng tiếp ${d.product_name}`}
              >
                <p className="text-sm font-bold text-[var(--warn)]">
                  🔑 Chờ bạn đăng nhập Facebook — chưa phải đăng lỗi
                </p>
                <p className="mt-1 text-xs leading-5">
                  Các đích này đăng bằng trình duyệt nên cần phiên Facebook trong{" "}
                  <strong>chính cửa sổ trình duyệt Muse</strong> — cửa sổ mà tác vụ đăng
                  vừa mở ra (không phải tab Facebook trong Chrome của bạn, và “Đã liên
                  kết” ở mục Tài khoản là kênh API, không thay được phiên trình duyệt).
                  Đang chờ:{" "}
                  {waitingLogin
                    .map(
                      (r) =>
                        `${r.target_kind === "group" ? "Nhóm" : "Fanpage"} ${r.target_name}`,
                    )
                    .join(" · ")}
                  .
                </p>
                <ol className="mt-1.5 list-decimal space-y-0.5 pl-5 text-xs leading-5">
                  <li>
                    Sang cửa sổ trình duyệt Muse đang dừng ở trang đăng nhập Facebook.
                  </li>
                  <li>
                    Đăng nhập bằng tài khoản quản trị Page — chỉ 1 lần, phiên được lưu
                    trong trình duyệt đó cho mọi lần đăng sau.
                  </li>
                  <li>Quay lại đây bấm nút dưới đây — bài đăng tiếp bằng phiên đã lưu.</li>
                </ol>
                <div className="mt-2.5">
                  <button
                    type="button"
                    className={btnPrimary}
                    disabled={publish.isPending}
                    aria-label={`Đã đăng nhập xong, đăng Bài lại ${d.product_name}`}
                    onClick={() =>
                      publish.mutate({
                        id: d.id,
                        group_ids: selected,
                        page_ids: selectedPages,
                        instagram_account_ids: selectedIg,
                      })
                    }
                  >
                    {publish.isPending
                      ? "Đang đăng…"
                      : "Đã đăng nhập xong — Đăng Bài lại"}
                  </button>
                </div>
              </div>
            );
          })()}

        {fb && (
          <p className={`mt-3 text-sm font-medium ${fb.ok ? "text-[var(--ok)]" : "text-[var(--danger)]"}`} role="status">
            {fb.text}
          </p>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          {d.status === "draft" && (
            <>
              {!edit && (
                <>
                  {(() => {
                    const rwJob = composeJobs.jobs.find(
                      (j) =>
                        j.kind === "rewrite" &&
                        j.draftId === d.id &&
                        (j.status === "waiting" || j.status === "running"),
                    );
                    return (
                      <button
                        className={btnGhost}
                        disabled={!!rwJob}
                        onClick={() => enqueueRewrite(d)}
                      >
                        {rwJob
                          ? rwJob.status === "running"
                            ? "Đang viết lại…"
                            : "Đang chờ viết lại…"
                          : "Viết lại chuyên nghiệp"}
                      </button>
                    );
                  })()}
                  <button className={btnGhost} onClick={() => setEditing((s) => ({ ...s, [d.id]: { caption: d.caption } }))}>
                    Sửa nội dung
                  </button>
                </>
              )}
            </>
          )}
          {/* Bộ chọn "Chọn đích đăng" có ở MỌI trang của Hàng đợi
              — cả "Chờ duyệt" (chọn đích trước, duyệt bài xuất gói
              theo đúng bộ đích đã chọn) lẫn "Đã duyệt". Khối này
              render cho mọi trạng thái; hàng nút dưới bộ chọn đổi
              theo trạng thái của bài. */}
          {(() => {
            const open = !!pickerOpen[d.id];
            const totalPicked =
              selected.length + selectedPages.length + selectedIg.length + selectedMainCount;
            const allGroupsPicked =
              joinedGroups.length > 0 && selected.length === joinedGroups.length;
            return (
            <div className="w-full space-y-2">
              <div className="relative">
                <button
                  type="button"
                  className={`${btnGhost} flex w-full flex-wrap items-center justify-between gap-2 text-left`}
                  aria-expanded={open}
                  aria-label={`Chọn đích đăng cho ${d.product_name} — đã chọn ${selected.length} nhóm đích, ${selectedPages.length} fanpage, ${selectedIg.length} tài khoản Instagram, ${selectedMainCount} tài khoản chính thức`}
                  onClick={() => setPickerOpen((s) => ({ ...s, [d.id]: !open }))}
                >
                  <span className="font-semibold">Chọn đích đăng</span>
                  <span className="text-xs font-medium text-[var(--dim)]">
                    Đã chọn: {selected.length} nhóm đích · {selectedPages.length} fanpage · {selectedIg.length} tài khoản Instagram · {selectedMainCount} tài khoản chính thức (tổng {totalPicked} đích) {open ? "▲" : "▼"}
                  </span>
                </button>
                {open && (
                  <div
                    role="group"
                    aria-label={`Danh sách đích đăng cho ${d.product_name}`}
                    className="absolute inset-x-0 top-full z-30 mt-2 max-h-[70vh] space-y-4 overflow-auto rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-3 shadow-xl"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-bold">Danh sách đích đăng</p>
                      <button
                        type="button"
                        className={btnGhost}
                        aria-label={`Đóng danh sách đích đăng của ${d.product_name}`}
                        onClick={() => setPickerOpen((s) => ({ ...s, [d.id]: false }))}
                      >
                        Đóng
                      </button>
                    </div>

                    <div>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium">
                          Nhóm đích — đã chọn {selected.length}/{joinedGroups.length} nhóm
                        </p>
                        {joinedGroups.length > 0 && (
                          <button
                            type="button"
                            className={btnGhost}
                            disabled={allGroupsPicked}
                            aria-label={`Chọn tất cả nhóm đích cho ${d.product_name}`}
                            onClick={() =>
                              applyTargets(
                                joinedGroups.map((g) => g.id),
                                selectedPages,
                                selectedIg,
                              )
                            }
                          >
                            Chọn tất cả nhóm đích
                          </button>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-[var(--dim)]">
                        Chỉ đăng bằng danh tính đã tham gia nhóm đó — trạng thái của tài khoản chính và từng Page tính riêng.
                      </p>
                      {joinedGroups.length === 0 ? (
                        <p className="mt-1 text-sm text-[var(--danger)]">
                          Chưa có nhóm nào có tài khoản chính hoặc Page đang chọn đăng được đánh dấu “Đã tham gia”.{" "}
                          <button className="underline" onClick={onGoGroups}>Sang mục Hội nhóm để đánh dấu</button>{" "}
                          — hoặc cứ để trống nhóm rồi bổ sung sau, gói đăng tự cập nhật theo.
                        </p>
                      ) : (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {joinedGroups.map((g) => {
                            const on = selected.includes(g.id);
                            const via = [
                              ...(g.account_joined ? ["tài khoản chính"] : []),
                              ...g.joined_pages.map((p) => `Page ${p.name}`),
                            ].join(" · ");
                            return (
                              <button
                                key={g.id}
                                aria-pressed={on}
                                onClick={() =>
                                  applyTargets(
                                    on
                                      ? selected.filter((x) => x !== g.id)
                                      : [...selected, g.id],
                                    selectedPages,
                                    selectedIg,
                                  )
                                }
                                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${on ? "bg-[var(--text)] text-[var(--bg)]" : "border border-[var(--border)] text-[var(--dim)]"}`}
                              >
                                {g.name} — đăng bằng: {via}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div>
                      <p className="text-sm font-medium">
                        Fanpage đích — đã chọn {selectedPages.length}/{allPages.length} fanpage
                      </p>
                      {allPages.length === 0 ? (
                        <p className="mt-1 text-sm text-[var(--dim)]">
                          Chưa có Page nào — thêm Page ở mục Tài khoản nếu muốn đăng
                          lên fanpage. Bài vẫn đăng được cho các đích khác.
                        </p>
                      ) : (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {allPages.map((p) => {
                            const on = selectedPages.includes(p.id);
                            return (
                              <button
                                key={p.id}
                                aria-pressed={on}
                                onClick={() =>
                                  applyTargets(
                                    selected,
                                    on
                                      ? selectedPages.filter((x) => x !== p.id)
                                      : [...selectedPages, p.id],
                                    selectedIg,
                                  )
                                }
                                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${on ? "bg-[var(--accent)] text-white" : "border border-[var(--border)] text-[var(--dim)]"}`}
                              >
                                Page: {p.name}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div>
                      <p className="text-sm font-medium">
                        Tài khoản Instagram đích — đã chọn {selectedIg.length}/{igAccounts.length} tài khoản
                      </p>
                      {igAccounts.length === 0 ? (
                        <p className="mt-1 text-sm text-[var(--dim)]">
                          Chưa có tài khoản Instagram nào đã liên kết — liên kết ở
                          mục Tài khoản nếu muốn đăng lên Instagram. Bài vẫn
                          đăng được cho các đích khác.
                        </p>
                      ) : (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {igAccounts.map((a) => {
                            const on = selectedIg.includes(a.id);
                            return (
                              <button
                                key={a.id}
                                aria-pressed={on}
                                onClick={() =>
                                  applyTargets(
                                    selected,
                                    selectedPages,
                                    on
                                      ? selectedIg.filter((x) => x !== a.id)
                                      : [...selectedIg, a.id],
                                  )
                                }
                                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${on ? "bg-[var(--accent)] text-white" : "border border-[var(--border)] text-[var(--dim)]"}`}
                              >
                                Instagram: {a.name}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div>
                      <p className="text-sm font-medium">
                        Tài khoản chính thức — đã chọn {selectedMainCount}/{mainAccounts.length} tài khoản
                      </p>
                      {mainAccounts.length === 0 ? (
                        <p className="mt-1 text-sm text-[var(--dim)]">
                          Chưa có tài khoản Facebook nào đã liên kết — liên kết ở mục Tài khoản.
                        </p>
                      ) : (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {mainAccounts.map((a) => {
                            const on = !!a.selected;
                            return (
                              <button
                                key={a.id}
                                aria-pressed={on}
                                disabled={setMainAccount.isPending}
                                onClick={() => setMainAccount.mutate({ id: a.id, selected: !on })}
                                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${on ? "bg-[var(--accent)] text-white" : "border border-[var(--border)] text-[var(--dim)]"}`}
                              >
                                Tài khoản: {a.name}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                {d.status === "draft" ? (
                  <button
                    className={`${btnPrimary} whitespace-nowrap`}
                    disabled={approve.isPending}
                    onClick={() => approve.mutate(d.id)}
                    aria-label={`Duyệt bài viết ${d.product_name}`}
                  >
                    {approve.isPending ? "Đang duyệt…" : "Duyệt bài viết"}
                  </button>
                ) : (
                  <>
                    <button
                      className={`${btnPrimary} whitespace-nowrap`}
                      disabled={publish.isPending}
                      aria-expanded={!!publishConfirm[d.id]}
                      aria-label={`Đăng Bài ${d.product_name} lên các đích đã chọn`}
                      onClick={() => setPublishConfirm((s) => ({ ...s, [d.id]: !s[d.id] }))}
                    >
                      Đăng Bài
                    </button>
                    <button
                      className={`${btnGhost} whitespace-nowrap`}
                      disabled={pack.isPending}
                      aria-label={`Cập nhật gói đăng cho ${d.product_name} theo các đích đã chọn`}
                      onClick={() => pack.mutate({ id: d.id, group_ids: selected, page_ids: selectedPages, instagram_account_ids: selectedIg })}
                    >
                      Cập nhật gói đăng
                    </button>
                    <button className={`${btnGhost} whitespace-nowrap`} onClick={onGoMedia}>Kiểm tra ảnh/video</button>
                    <button className={`${btnDanger} whitespace-nowrap`} onClick={() => del.mutate(d.id)} aria-label={`Xóa bản nháp ${d.code}`}>
                      Xóa
                    </button>
                  </>
                )}
              </div>
            </div>
            );
          })()}
                  {!!publishConfirm[d.id] && (() => {
                    const pickedPages = allPages.filter((p) => selectedPages.includes(p.id));
                    const pickedIg = igAccounts.filter((a) => selectedIg.includes(a.id));
                    const pickedGroups = joinedGroups.filter((g) => selected.includes(g.id));
                    const nothingPicked =
                      pickedPages.length === 0 && pickedIg.length === 0 && pickedGroups.length === 0;
                    const alreadyOn = (kind: "page" | "instagram" | "group", name: string) =>
                      d.publish_records.some(
                        (r) => r.target_kind === kind && r.target_name === name && r.status === "published",
                      );
                    return (
                      <div
                        className="mt-3 rounded-[var(--radius)] border border-[var(--accent)] p-3"
                        role="group"
                        aria-label={`Xác nhận đăng bài ${d.product_name}`}
                      >
                        <p className="text-sm font-bold">Đăng Bài ngay — bài sẽ lên công khai các đích này:</p>
                        <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm">
                          {pickedPages.map((p) => (
                            <li key={`pg-${p.id}`}>
                              Fanpage “{p.name}” — đăng kèm {d.drive_images.length} ảnh đã chốt
                              {d.caption.length > 1024 && (
                                <span className="text-[var(--dim)]"> (caption dài hơn giới hạn API — xử lý đăng bằng trình duyệt như khi bạn nhắn trực tiếp)</span>
                              )}
                              {alreadyOn("page", p.name) && (
                                <span className="font-semibold text-[var(--ok)]"> (đã đăng ở lần trước — sẽ tự bỏ qua)</span>
                              )}
                              {!alreadyOn("page", p.name) &&
                                d.publish_records.some(
                                  (r) => r.target_kind === "page" && r.target_name === p.name && r.status === "queued",
                                ) && (
                                  <span className="font-semibold text-[var(--ok)]"> (đang xử lý đăng — sẽ tự bỏ qua)</span>
                                )}
                              {!alreadyOn("page", p.name) &&
                                d.publish_records.some(
                                  (r) => r.target_kind === "page" && r.target_name === p.name && r.status === "needs_login",
                                ) && (
                                  <span className="font-semibold text-[var(--warn)]"> (lượt trước đang chờ bạn đăng nhập trong cửa sổ trình duyệt Muse — nếu đã đăng nhập ở cửa sổ đó rồi, lượt này đăng tiếp bằng phiên đã lưu)</span>
                                )}
                            </li>
                          ))}
                          {pickedIg.map((a) => (
                            <li key={`ig-${a.id}`}>
                              Instagram {a.name} — đăng {d.drive_images.length} ảnh đã chốt (xử lý đăng ở chế độ nền, kết quả hiện ở Lịch sử đăng Bài)
                              {alreadyOn("instagram", a.name) && (
                                <span className="font-semibold text-[var(--ok)]"> (đã đăng ở lần trước — sẽ tự bỏ qua)</span>
                              )}
                              {!alreadyOn("instagram", a.name) &&
                                d.publish_records.some(
                                  (r) => r.target_kind === "instagram" && r.target_name === a.name && r.status === "queued",
                                ) && (
                                  <span className="font-semibold text-[var(--ok)]"> (đang xử lý đăng — sẽ tự bỏ qua)</span>
                                )}
                              {!alreadyOn("instagram", a.name) &&
                                d.publish_records.some(
                                  (r) => r.target_kind === "instagram" && r.target_name === a.name && r.status === "uncertain",
                                ) && (
                                  <span className="font-semibold text-[var(--warn)]"> (lượt trước chưa xác định được kết quả — sẽ kiểm tra bài trùng trên Instagram trước khi đăng)</span>
                                )}
                            </li>
                          ))}
                          {pickedGroups.map((g) => (
                            <li key={`gr-${g.id}`}>
                              Nhóm {g.name} — khi bấm đăng, hệ thống xử lý đăng vào nhóm như khi bạn nhắn
                              trực tiếp trong chat (Muse mở cửa sổ trình duyệt của nó và đăng bằng
                              phiên Facebook đã lưu trong đó), kết quả hiện ở Lịch sử đăng Bài
                              {alreadyOn("group", g.name) && (
                                <span className="font-semibold text-[var(--ok)]"> (đã đăng ở lần trước — sẽ tự bỏ qua)</span>
                              )}
                              {!alreadyOn("group", g.name) &&
                                d.publish_records.some(
                                  (r) => r.target_kind === "group" && r.target_name === g.name && r.status === "queued",
                                ) && (
                                  <span className="font-semibold text-[var(--ok)]"> (đang xử lý đăng — sẽ tự bỏ qua)</span>
                                )}
                              {!alreadyOn("group", g.name) &&
                                d.publish_records.some(
                                  (r) => r.target_kind === "group" && r.target_name === g.name && r.status === "needs_login",
                                ) && (
                                  <span className="font-semibold text-[var(--warn)]"> (lượt trước đang chờ bạn đăng nhập trong cửa sổ trình duyệt Muse — nếu đã đăng nhập ở cửa sổ đó rồi, lượt này đăng tiếp bằng phiên đã lưu)</span>
                                )}
                            </li>
                          ))}
                          {nothingPicked && (
                            <li className="text-[var(--danger)]">
                              Chưa chọn đích nào — chọn ở “Chọn đích đăng” phía trên trước.
                            </li>
                          )}
                        </ul>
                        {pickedPages.length > 0 && d.caption.length > 1024 && (
                          <p className="mt-2 text-xs font-medium text-[var(--dim)]">
                            Lưu ý: caption dài {d.caption.length} ký tự — vượt giới hạn 1.024 ký tự của API
                            đăng Fanpage, nên Fanpage sẽ được xử lý đăng bằng trình duyệt như khi bạn nhắn
                            trực tiếp (app không tự cắt nội dung đã duyệt), kết quả hiện ở Lịch sử đăng Bài.
                            Instagram (giới hạn 2.200 ký tự) được xử lý đăng ở chế độ nền qua API, kết quả hiện ở Lịch sử đăng Bài.
                          </p>
                        )}
                        {pickedIg.length > 0 && d.drive_images.length === 0 && (
                          <p className="mt-2 text-xs font-medium text-[var(--danger)]">
                            Lưu ý: bài chưa có ảnh nào đã chốt — Instagram chỉ đăng được bài có ảnh, đích
                            Instagram sẽ báo lỗi.
                          </p>
                        )}
                        {(pickedGroups.length > 0 ||
                          (pickedPages.length > 0 && d.caption.length > 1024)) && (
                          <p className="mt-2 text-xs font-medium leading-5 text-[var(--dim)]">
                            Đích đăng bằng trình duyệt (nhóm, và fanpage khi caption dài): bấm
                            “Xác nhận đăng Bài” là app xử lý <strong>như khi bạn nhắn trực tiếp
                            trong chat</strong> — Muse mở cửa sổ trình duyệt của nó và đăng bằng
                            phiên Facebook đã lưu trong cửa sổ đó. Nếu cửa sổ đó chưa đăng nhập
                            Facebook, nó sẽ dừng ở trang đăng nhập và bài chuyển sang trạng thái
                            “🔑 Chờ bạn đăng nhập Facebook” (không tính là đăng lỗi): bạn đăng
                            nhập 1 lần ngay trong cửa sổ trình duyệt Muse đó bằng tài khoản
                            quản trị Page — phiên được lưu cho mọi lần sau — rồi bấm “Đăng Bài”
                            lại là đăng tiếp, không cần nhắn lại trong chat. Lưu ý: đăng nhập ở
                            tab Facebook trong Chrome của bạn hoặc trạng thái “Đã liên kết”
                            trong app không thay được phiên của cửa sổ này.
                          </p>
                        )}
                        <p className="mt-2 text-xs text-[var(--dim)]">
                          Nội dung đăng là caption nguyên văn đã duyệt, kèm đúng ảnh đã chốt trong bài.
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            className={btnPrimary}
                            disabled={nothingPicked || publish.isPending}
                            onClick={() =>
                              publish.mutate({
                                id: d.id,
                                group_ids: selected,
                                page_ids: selectedPages,
                                instagram_account_ids: selectedIg,
                              })
                            }
                          >
                            {publish.isPending ? "Đang đăng…" : "Xác nhận đăng Bài"}
                          </button>
                          <button
                            className={btnGhost}
                            disabled={publish.isPending}
                            onClick={() => setPublishConfirm((s) => ({ ...s, [d.id]: false }))}
                          >
                            Hủy
                          </button>
                        </div>
                      </div>
                    );
                  })()}
          {d.status === "draft" && (
            <button className={btnDanger} onClick={() => del.mutate(d.id)} aria-label={`Xóa bản nháp ${d.code}`}>
              Xóa
            </button>
          )}
        </div>
      </li>
    );
  };

  // Thẻ bài ở trang "Lịch sử bài đăng": GỌN theo mặc định — chỉ
  // tên bài, các đích đã đăng thành công và lần đăng gần nhất.
  // Bấm "Xem chi tiết" mới mở toàn bộ nội dung (ảnh đã chốt,
  // caption, các đích ĐÃ ĐĂNG kèm link bài thật). Trang này
  // KHÔNG hiện gói đăng, và CHỈ hiện đích đã đăng thành công —
  // đích không chọn / chưa đăng / đăng lỗi không hiện ở đây.
  // Hành động duy nhất trên thẻ là nút "Xóa" (xóa hẳn bản nháp
  // đó, như nút Xóa ở các trang còn lại).
  const renderHistoryDraft = (d: Draft) => {
    // Mỗi đích chỉ hiện bản ghi ĐÃ ĐĂNG mới nhất của đích đó —
    // không chồng nhiều lượt của cùng một đích lên nhau.
    const publishedByTarget = new Map<
      string,
      Draft["publish_records"][number]
    >();
    for (const r of d.publish_records) {
      if (r.status !== "published") continue;
      const key = `${r.target_kind}:${r.target_name}`;
      if (!publishedByTarget.has(key)) publishedByTarget.set(key, r);
    }
    const publishedRecords = [...publishedByTarget.values()].sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    const latestPublished = publishedRecords[0];
    const open = !!historyOpen[d.id];
    const kindLabel = (kind: string) =>
      kind === "page"
        ? "Fanpage"
        : kind === "instagram"
          ? "Instagram"
          : kind === "group"
            ? "Nhóm"
            : "Tài khoản";
    const targetSummary = publishedRecords
      .map((r) => `${kindLabel(r.target_kind)} ${r.target_name}`)
      .join(" · ");
    return (
      <li
        key={d.id}
        className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-semibold">{d.product_name}</p>
          <p className="font-mono text-xs text-[var(--dim)]">
            {d.code}
            {latestPublished
              ? ` · Đăng gần nhất ${fmtDate(latestPublished.created_at)}`
              : ""}
          </p>
        </div>
        <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="rounded-full bg-[var(--surface-alt)] px-2 py-0.5 font-semibold text-[var(--ok)]">
            ✓ Đã đăng
          </span>
          {targetSummary && (
            <span className="font-medium text-[var(--dim)]">{targetSummary}</span>
          )}
        </p>

        {open && (
          <div className="mt-3">
            <p className="text-xs text-[var(--dim)]">
              {d.sku ? `SKU ${d.sku} · ` : d.stt ? `STT ${d.stt} · ` : ""}
              {d.maker ? `Hãng xe ${d.maker} · ` : ""}
              {d.color || "chưa rõ màu"} · {d.price || "chưa có giá"} · tồn{" "}
              {d.stock}
              {d.size_cm ? ` · Kích thước: ${d.size_cm}` : ""}
              {` · Soạn ${fmtDate(d.created_at)}`}
            </p>

            <DriveImageStrip images={d.drive_images} label={d.product_name} />

            <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-[var(--radius)] bg-[var(--surface-alt)] p-3 font-mono text-xs leading-5">
              {d.caption}
            </pre>

            <div className="mt-3 rounded-[var(--radius)] border border-[var(--border)] p-3">
              <p className="text-xs font-bold">Đích đã đăng</p>
              <ul className="mt-1.5 space-y-1.5">
                {publishedRecords.map((r) => (
                  <li key={r.id} className="text-xs leading-5">
                    <span className="mr-1.5 rounded-full bg-[var(--surface-alt)] px-2 py-0.5 font-semibold text-[var(--ok)]">
                      ✓ Đã đăng
                    </span>
                    <span className="font-semibold">
                      {kindLabel(r.target_kind)} {r.target_name}
                    </span>{" "}
                    <span className="text-[var(--dim)]">
                      · {fmtDate(r.created_at)}
                    </span>
                    {r.message && (
                      <span className="block text-[var(--dim)]">{r.message}</span>
                    )}
                    {r.post_url && (
                      <a
                        href={r.post_url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold underline"
                        aria-label={`Xem bài đã đăng của ${d.product_name} trên ${r.target_name}`}
                      >
                        Xem bài đã đăng
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className={btnGhost}
            aria-expanded={open}
            aria-label={`${open ? "Thu gọn" : "Xem chi tiết"} bài đã đăng ${d.product_name}`}
            onClick={() =>
              setHistoryOpen((s) => ({ ...s, [d.id]: !open }))
            }
          >
            {open ? "Thu gọn ▲" : "Xem chi tiết ▼"}
          </button>
          <button
            type="button"
            className={btnDanger}
            disabled={del.isPending}
            onClick={() => del.mutate(d.id)}
            aria-label={`Xóa bài đã đăng ${d.product_name}`}
          >
            Xóa
          </button>
        </div>
      </li>
    );
  };

  const queueTabs: { id: QueueTab; label: string; emptyText: string; ariaLabel: string; matches: (d: Draft) => boolean }[] = [
    { id: "draft", label: "Chờ duyệt", emptyText: "Không có bản nháp nào đang chờ duyệt.", ariaLabel: "Chờ duyệt", matches: (d) => d.status === "draft" },
    { id: "ready", label: "Đã duyệt", emptyText: "Chưa có bài nào đã duyệt.", ariaLabel: "Đã duyệt", matches: (d) => d.status === "approved" || d.status === "packed" },
    { id: "history", label: "Lịch sử bài đăng", emptyText: "Chưa có bài nào đã đăng. Bài sẽ hiện ở đây sau khi đăng thành công lên ít nhất một đích ở trang “Đã duyệt”.", ariaLabel: "Lịch sử bài đăng", matches: (d) => d.publish_records.some((r) => r.status === "published") },
  ];
  const activeTabDef = queueTabs.find((t) => t.id === queueTab) ?? queueTabs[0]!;
  const listForTab = (t: (typeof queueTabs)[number]) => {
    const filtered = drafts.filter((d) => t.matches(d));
    if (t.id !== "history") return filtered;
    // Lịch sử xếp theo lần đăng thành công GẦN NHẤT lên đầu.
    const latestAt = (d: Draft) =>
      Math.max(
        0,
        ...d.publish_records
          .filter((r) => r.status === "published")
          .map((r) => new Date(r.created_at).getTime()),
      );
    return [...filtered].sort((a, b) => latestAt(b) - latestAt(a));
  };
  const activeList = listForTab(activeTabDef);
  const totalPages = Math.max(1, Math.ceil(activeList.length / QUEUE_PAGE_SIZE));
  const currentPage = Math.min(queuePage[queueTab], totalPages);
  const pageStart = (currentPage - 1) * QUEUE_PAGE_SIZE;
  const pagedList = activeList.slice(pageStart, pageStart + QUEUE_PAGE_SIZE);
  const setPageForTab = (tab: QueueTab, page: number) =>
    setQueuePage((s) => ({ ...s, [tab]: page }));

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Các trang Hàng đợi" className="flex flex-wrap gap-2">
        {queueTabs.map((t) => {
          const count = listForTab(t).length;
          const active = queueTab === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active}
              aria-label={`${t.label} (${count} bài)`}
              onClick={() => setQueueTab(t.id)}
              className={`rounded-full px-4 py-2 text-sm font-semibold whitespace-nowrap ${active ? "bg-[var(--accent)] text-white" : "border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]"}`}
            >
              {t.label} ({count})
            </button>
          );
        })}
      </div>

      <section aria-label={activeTabDef.ariaLabel}>
        <h2 className="text-lg font-bold">
          {`${activeTabDef.label} (${activeList.length})`}
        </h2>
        {loading && <p className="mt-2 text-sm text-[var(--dim)]">Đang tải…</p>}
        <ul className="mt-3 space-y-3">
          {queueTab === "history"
            ? pagedList.map(renderHistoryDraft)
            : pagedList.map(renderDraft)}
        </ul>
        {!loading && activeList.length === 0 && (
          <p className="mt-2 text-sm text-[var(--dim)]">{activeTabDef.emptyText}</p>
        )}
        {activeList.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3" aria-label={`Phân trang ${activeTabDef.label}`}>
            <p className="text-xs text-[var(--dim)]">
              Trang {currentPage}/{totalPages} — hiển thị {pagedList.length} / {activeList.length} bài (tối đa {QUEUE_PAGE_SIZE} bài/trang)
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                className={btnGhost}
                disabled={currentPage <= 1}
                aria-label={`Trang trước — ${activeTabDef.label}`}
                onClick={() => setPageForTab(queueTab, currentPage - 1)}
              >
                ‹ Trước
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  aria-label={`Trang ${p} — ${activeTabDef.label}`}
                  aria-current={p === currentPage ? "page" : undefined}
                  onClick={() => setPageForTab(queueTab, p)}
                  className={`min-w-9 rounded-[var(--radius)] px-2 py-2 text-sm font-semibold ${p === currentPage ? "bg-[var(--accent)] text-white" : "border border-[var(--border)] bg-[var(--surface)]"}`}
                >
                  {p}
                </button>
              ))}
              <button
                className={btnGhost}
                disabled={currentPage >= totalPages}
                aria-label={`Trang sau — ${activeTabDef.label}`}
                onClick={() => setPageForTab(queueTab, currentPage + 1)}
              >
                Sau ›
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
