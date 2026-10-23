import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api";
import type { Account, Page } from "../../types";
import { btnPrimary, btnGhost, inputCls, labelCls } from "../../utils/styles";
import { fmtDate } from "../../utils/format";

const IG_LINK_URL = "https://agent.meta.ai/foa_ac_link/instagram";
const FB_LOGIN_URL_LABEL = "facebook.com/login";

export function AccountsSection({
  accounts,
  pages,
}: {
  accounts: Account[];
  pages: Page[];
}) {
  const queryClient = useQueryClient();
  const [msg, setMsg] = useState("");
  const [editingUrlId, setEditingUrlId] = useState(0);
  const [urlDraft, setUrlDraft] = useState("");
  const [editingCodeId, setEditingCodeId] = useState(0);
  const [codeDraft, setCodeDraft] = useState("");
  const [platform, setPlatform] = useState<"Facebook" | "Instagram">(
    "Instagram",
  );
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["overview"] });
    queryClient.invalidateQueries({ queryKey: ["accounts"] });
  };
  const connectedExtQ = useQuery({
    queryKey: ["connectedExtensions"],
    queryFn: () => api.getConnectedExtensions({}),
    refetchInterval: 3000,
  });
  const onlineCodes = (connectedExtQ.data?.online_codes || []).map((c: string) =>
    c.toUpperCase(),
  );
  const saveExtensionCode = useMutation({
    mutationFn: (args: { id: number; extension_code: string }) =>
      api.setAccountExtensionCode(args),
    onSuccess: (res) => {
      setMsg(res.message);
      if (res.ok) setEditingCodeId(0);
      refresh();
      connectedExtQ.refetch();
    },
  });
  const select = useMutation({
    mutationFn: (args: { id: number; selected: boolean }) =>
      api.setAccountSelected(args),
    onSuccess: (res) => {
      setMsg(res.message);
      refresh();
    },
  });
  const link = useMutation({
    mutationFn: (args: { id: number; linked: boolean }) =>
      api.setAccountLinked(args),
    onSuccess: (res) => {
      setMsg(res.message);
      refresh();
    },
  });
  const del = useMutation({
    mutationFn: (id: number) => api.deleteAccount({ id }),
    onSuccess: refresh,
  });
  const saveUrl = useMutation({
    mutationFn: (args: { id: number; profile_url: string }) =>
      api.setAccountProfileUrl(args),
    onSuccess: (res) => {
      setMsg(res.message);
      if (res.ok) setEditingUrlId(0);
      refresh();
    },
  });
  const fbBrowserLogin = useQuery({
    queryKey: ["fbBrowserLogin"],
    queryFn: () => api.getFacebookBrowserLoginStatus({}),
    refetchInterval: 5000,
  });
  const openFbBrowser = useMutation({
    mutationFn: (args: { account_id: number; account_name: string }) =>
      api.requestFacebookBrowserLogin(args),
    onSuccess: (res) => {
      setMsg(res.message);
      queryClient.invalidateQueries({ queryKey: ["fbBrowserLogin"] });
    },
    onError: (e) => {
      setMsg(
        e instanceof Error
          ? `Không gửi được yêu cầu mở trình duyệt Muse: ${e.message}`
          : "Không gửi được yêu cầu mở trình duyệt Muse — thử bấm lại.",
      );
    },
  });
  const fbLoginStatus = fbBrowserLogin.data?.status ?? "";
  const fbLoginLabel =
    fbLoginStatus === "logged_in"
      ? `✓ Đã đăng nhập Facebook trong trình duyệt Muse${fbBrowserLogin.data?.account_name ? ` — ${fbBrowserLogin.data.account_name}` : ""} — sẵn sàng đăng bài vào nhóm`
      : fbLoginStatus === "waiting_login"
        ? "🔑 Cửa sổ trình duyệt Muse đang ở trang đăng nhập Facebook — đăng nhập 1 lần trong cửa sổ đó"
        : fbLoginStatus === "requested"
          ? "⏳ Đã gửi yêu cầu — Muse đang mở cửa sổ trình duyệt tới trang đăng nhập Facebook…"
          : fbLoginStatus === "failed"
            ? "✗ Chưa mở được trình duyệt Muse tới trang đăng nhập Facebook"
            : "";

  const loggedIn = accounts.filter((a) => a.linked && a.selected);
  const linkedNotUsed = accounts.filter((a) => a.linked && !a.selected);
  const notLinked = accounts.filter((a) => !a.linked);

  return (
    <section aria-label="Danh sách tài khoản">
      <h2 className="text-lg font-bold">Danh sách tài khoản</h2>

      <p className="mt-1 text-xs text-[var(--dim)]">
        {loggedIn.length} nick đang đăng nhập
        {linkedNotUsed.length > 0 &&
          ` · ${linkedNotUsed.length} nick đã liên kết nhưng chưa dùng để đăng`}
        {notLinked.length > 0 && ` · ${notLinked.length} nick chưa liên kết`}
      </p>

      {/* Box hướng dẫn Chrome Extension */}
      <div className="mt-3 rounded-[var(--radius)] border border-sky-500/30 bg-sky-500/10 p-3.5 text-xs text-[var(--text)]">
        <div className="flex flex-wrap items-center justify-between gap-2 font-bold text-sky-400">
          <span className="flex items-center gap-1.5">
            <span className="text-base">🚀</span> Đăng bài đa tài khoản qua Chrome Extension
          </span>
          <span className="rounded-full bg-sky-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-sky-300">
            {onlineCodes.length > 0
              ? `🟢 ${onlineCodes.length} Chrome đang kết nối`
              : "⚪ Chưa có Chrome nào kết nối"}
          </span>
        </div>
        <p className="mt-1 text-[var(--dim)]">
          Mỗi tài khoản Facebook đăng nhập ở 1 cửa sổ/profile Chrome riêng biệt. Hãy mở Chrome của tài khoản đó &rarr; tải extension trong thư mục <code className="rounded bg-[var(--surface-alt)] px-1.5 py-0.5 font-mono text-sky-300">extension</code> &rarr; lấy mã trong popup và dán vào tài khoản tương ứng dưới đây. Khi bấm <strong>Đăng bài</strong>, hệ thống sẽ xác minh mã và tự động kích hoạt cửa sổ Chrome đó để đăng!
        </p>
        {onlineCodes.length > 0 && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-sky-500/20 pt-2">
            <span className="text-[11px] font-medium text-emerald-400">Các mã Chrome đang sẵn sàng:</span>
            {onlineCodes.map((code) => (
              <span
                key={code}
                className="rounded-md bg-emerald-500/20 px-2 py-0.5 font-mono text-[11px] font-bold text-emerald-300"
              >
                {code}
              </span>
            ))}
          </div>
        )}
      </div>

      <ul className="mt-3 space-y-3">
        {accounts.map((a) => {
          const isFb = a.platform === "Facebook";
          const extCode = (a.extension_code || "").trim().toUpperCase();
          const isChromeOnline = isFb && extCode && onlineCodes.includes(extCode);

          return (
            <li
              key={a.id}
              className={`rounded-[var(--radius)] border bg-[var(--surface)] p-4 ${
                a.selected && a.linked
                  ? "border-2 border-[var(--accent)]"
                  : "border-[var(--border)]"
              }`}
            >
              <div className="flex items-center gap-3">
                <span
                  aria-hidden
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--surface-alt)] text-sm font-bold"
                >
                  {a.platform === "Facebook" ? "f" : "◎"}
                </span>
                <div className="min-w-0 flex-1">
                  {a.profile_url ? (
                    <a
                      href={a.profile_url}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Mở trang ${a.platform} của ${a.name}`}
                      className="block truncate text-sm font-semibold text-[var(--accent-ink)] underline decoration-dotted underline-offset-2"
                    >
                      {a.platform} — {a.name} ↗
                    </a>
                  ) : (
                    <p className="truncate text-sm font-semibold">
                      {a.platform} — {a.name}
                    </p>
                  )}
                  <p className="truncate text-xs text-[var(--dim)]">
                    {a.handle || "Chưa có ghi chú"}
                  </p>
                </div>
                {a.linked && a.selected ? (
                  <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--ok)] px-2 py-1 text-xs font-semibold text-white">
                    <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-white" />
                    Đang đăng nhập
                  </span>
                ) : (
                  <span
                    className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${
                      a.linked
                        ? "bg-[var(--surface-alt)] text-[var(--ok)]"
                        : "bg-[var(--surface-alt)] text-[var(--dim)]"
                    }`}
                  >
                    {a.linked ? "Đã liên kết" : "Chưa liên kết"}
                  </span>
                )}
              </div>

              {/* Khối quản lý mã Chrome Extension cho tài khoản Facebook */}
              {isFb && (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-alt)] p-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-[var(--dim)]">Chrome kết nối:</span>
                    {extCode ? (
                      <span className="rounded bg-sky-500/10 px-2 py-0.5 font-mono text-xs font-bold text-sky-400">
                        {extCode}
                      </span>
                    ) : (
                      <span className="text-xs italic text-[var(--dim)]">Chưa gán mã Chrome</span>
                    )}

                    {isChromeOnline ? (
                      <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300">
                        <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                        Chrome đang Online
                      </span>
                    ) : extCode ? (
                      <span className="rounded-full bg-[var(--border)] px-2 py-0.5 text-[11px] font-medium text-[var(--dim)]">
                        Chrome chưa mở
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-300">
                        ⚠️ Cần gán mã để tự động đăng
                      </span>
                    )}
                  </div>

                  <div>
                    <button
                      onClick={() => {
                        setEditingCodeId(editingCodeId === a.id ? 0 : a.id);
                        setCodeDraft(a.extension_code || "");
                      }}
                      className="rounded-full border border-[var(--border)] px-3 py-1 text-xs font-semibold text-[var(--dim)] hover:text-[var(--text)]"
                    >
                      {extCode ? "Đổi mã Chrome" : "Gán mã Chrome"}
                    </button>
                  </div>
                </div>
              )}

              {editingCodeId === a.id && (
                <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-sky-500/30 bg-[var(--surface-alt)] p-2.5">
                  <span className="text-xs text-[var(--dim)]">Nhập mã từ popup extension của Chrome này:</span>
                  <input
                    aria-label={`Mã Chrome của ${a.name}`}
                    className={`${inputCls} max-w-xs uppercase font-mono`}
                    value={codeDraft}
                    onChange={(e) => setCodeDraft(e.target.value.toUpperCase())}
                    placeholder="Ví dụ: SD-8492, CHROME-1..."
                  />
                  <button
                    className={btnPrimary}
                    disabled={saveExtensionCode.isPending}
                    onClick={() =>
                      saveExtensionCode.mutate({ id: a.id, extension_code: codeDraft })
                    }
                  >
                    Lưu mã
                  </button>
                  <button
                    className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--dim)]"
                    onClick={() => setEditingCodeId(0)}
                  >
                    Hủy
                  </button>
                </div>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
              {a.profile_url ? (
                <a
                  href={a.profile_url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Mở trang tài khoản ${a.name}`}
                  className="rounded-full bg-[var(--text)] px-3 py-1.5 text-xs font-semibold text-[var(--bg)]"
                >
                  Mở trang tài khoản ↗
                </a>
              ) : (
                <button
                  onClick={() => {
                    setEditingUrlId(a.id);
                    setUrlDraft("");
                  }}
                  className="rounded-full bg-[var(--text)] px-3 py-1.5 text-xs font-semibold text-[var(--bg)]"
                >
                  Thêm link trang để bấm vào mở được
                </button>
              )}
              {a.platform === "Facebook" && (
                <button
                  onClick={() =>
                    openFbBrowser.mutate({
                      account_id: a.id,
                      account_name: a.name,
                    })
                  }
                  disabled={openFbBrowser.isPending}
                  aria-label={`Mở trình duyệt Muse tới trang đăng nhập Facebook để đăng nhóm bằng nick ${a.name}`}
                  className="rounded-full bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {openFbBrowser.isPending
                    ? "Đang mở trình duyệt Muse…"
                    : "Mở trình duyệt Muse — đăng nhập FB để đăng nhóm"}
                </button>
              )}
              <button
                onClick={() =>
                  select.mutate({ id: a.id, selected: !a.selected })
                }
                aria-pressed={a.selected}
                disabled={select.isPending}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                  a.selected && a.linked
                    ? "bg-[var(--accent)] text-white"
                    : "border border-[var(--border)] text-[var(--dim)]"
                }`}
              >
                {a.selected ? "✓ Đang đăng nhập" : "Đăng nhập bằng nick này"}
              </button>
              <button
                onClick={() => link.mutate({ id: a.id, linked: !a.linked })}
                aria-pressed={a.linked}
                disabled={link.isPending}
                className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--dim)]"
              >
                {a.linked ? "Gỡ liên kết" : "Đánh dấu đã liên kết"}
              </button>
              <button
                className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--danger)]"
                onClick={() => del.mutate(a.id)}
                aria-label={`Xóa tài khoản ${a.name}`}
              >
                Xóa
              </button>
              <button
                className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--dim)]"
                onClick={() => {
                  setEditingUrlId(editingUrlId === a.id ? 0 : a.id);
                  setUrlDraft(a.profile_url);
                }}
                aria-expanded={editingUrlId === a.id}
                aria-label={`Sửa link trang của ${a.name}`}
              >
                Sửa link trang
              </button>
            </div>
            {editingUrlId === a.id && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  aria-label={`Link trang cá nhân của ${a.name}`}
                  className={`${inputCls} min-w-0 flex-1`}
                  value={urlDraft}
                  onChange={(e) => setUrlDraft(e.target.value)}
                  placeholder={
                    a.platform === "Facebook"
                      ? "https://www.facebook.com/username…"
                      : "https://www.instagram.com/username/"
                  }
                />
                <button
                  className={btnPrimary}
                  disabled={saveUrl.isPending}
                  onClick={() =>
                    saveUrl.mutate({ id: a.id, profile_url: urlDraft })
                  }
                >
                  Lưu link
                </button>
              </div>
            )}
            {a.profile_url && (
              <p className="mt-2 truncate text-xs text-[var(--dim)]">
                Link trang:{" "}
                <a
                  href={a.profile_url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-[var(--accent-ink)] underline decoration-dotted underline-offset-2"
                >
                  {a.profile_url}
                </a>
              </p>
            )}
            {a.platform === "Facebook" && (
              <AccountPages
                account={a}
                pages={pages.filter((p) => p.account_id === a.id)}
                onMsg={setMsg}
              />
            )}
          </li>
          );
        })}
      </ul>
      {accounts.length === 0 && (
        <p className="mt-2 text-sm text-[var(--dim)]">
          Chưa có tài khoản nào.
        </p>
      )}
      {msg && (
        <p className="mt-2 text-sm font-medium" role="status">
          {msg}
        </p>
      )}

      <div className="mt-4 space-y-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4">
        <div>
          <p className="text-base font-bold">Kết nối tài khoản mới</p>
          <p className="mt-1 text-sm text-[var(--dim)]">
            Chọn nền tảng để bắt đầu. Facebook để đăng nhóm: mở trình duyệt
            Muse tới trang đăng nhập Facebook. Instagram: mở trang liên kết
            chính thức.
          </p>
        </div>
        <div
          className="grid grid-cols-2 gap-3"
          role="group"
          aria-label="Chọn nền tảng để liên kết"
        >
          {(
            [
              { id: "Instagram", icon: "◎" },
              { id: "Facebook", icon: "f" },
            ] as const
          ).map((p) => {
            const tileSelected = platform === p.id;
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={tileSelected}
                aria-label={`Chọn nền tảng ${p.id}`}
                onClick={() => setPlatform(p.id)}
                className={`flex flex-col items-center gap-1.5 rounded-[var(--radius)] border-2 px-3 py-5 text-sm font-semibold ${
                  tileSelected
                    ? "border-[var(--ok)] bg-[var(--surface-alt)]"
                    : "border-[var(--border)] bg-[var(--surface)]"
                }`}
              >
                <span aria-hidden className="text-3xl leading-none">
                  {p.icon}
                </span>
                <span>{p.id}</span>
                {tileSelected && (
                  <span
                    aria-hidden
                    className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--ok)] text-xs font-bold text-white"
                  >
                    ✓
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {platform === "Instagram" ? (
          <a
            href={IG_LINK_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="Mở Instagram để liên kết"
            className="flex w-full items-center justify-center gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-alt)] px-4 py-3 text-sm font-semibold text-[var(--text)]"
          >
            <span aria-hidden>↗</span>
            Mở Instagram để liên kết
          </a>
        ) : (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() =>
                openFbBrowser.mutate({ account_id: 0, account_name: "" })
              }
              disabled={openFbBrowser.isPending}
              aria-label="Mở trình duyệt Muse tới trang đăng nhập Facebook để đăng bài nhóm"
              className="flex w-full items-center justify-center gap-2 rounded-[var(--radius)] bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              <span aria-hidden>↗</span>
              {openFbBrowser.isPending
                ? "Đang gửi yêu cầu mở trình duyệt Muse…"
                : "Mở trình duyệt Muse — đăng nhập Facebook để đăng nhóm"}
            </button>
            <p className="text-sm leading-6 text-[var(--dim)]">
              Bấm nút này, Muse sẽ mở <strong>cửa sổ trình duyệt Muse</strong>{" "}
              tới trang đăng nhập Facebook (<span className="font-mono">{FB_LOGIN_URL_LABEL}</span>)
              — bạn đăng nhập 1 lần ngay trong cửa sổ đó bằng tài khoản quản trị
              Page, phiên được lưu trong hồ sơ trình duyệt đó để đăng bài vào
              nhóm. Nút này <strong>không</strong> còn mở trang liên kết Meta
              Accounts Center như trước, và không mở tab mới trong Chrome của bạn.
            </p>
            {fbLoginLabel && (
              <div
                role="status"
                className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-alt)] px-3 py-2.5 text-sm leading-6"
              >
                <p className="font-semibold">{fbLoginLabel}</p>
                {fbBrowserLogin.data?.message && (
                  <p className="mt-1 text-[var(--dim)]">
                    {fbBrowserLogin.data.message}
                  </p>
                )}
                {fbBrowserLogin.data?.updated_at && (
                  <p className="mt-1 text-xs text-[var(--dim)]">
                    Cập nhật: {fmtDate(fbBrowserLogin.data.updated_at)}
                  </p>
                )}
                {fbLoginStatus === "waiting_login" && (
                  <p className="mt-1 text-[var(--dim)]">
                    Đăng nhập xong trong cửa sổ trình duyệt Muse, quay lại đây —
                    trạng thái sẽ tự cập nhật khi Muse xác nhận phiên đăng nhập.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------- Pages của 1 nick FB */

function AccountPages({
  account,
  pages,
  onMsg,
}: {
  account: Account;
  pages: Page[];
  onMsg: (m: string) => void;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", url: "", role: "" });
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["overview"] });
    queryClient.invalidateQueries({ queryKey: ["accounts"] });
  };
  const add = useMutation({
    mutationFn: () =>
      api.addPage({
        account_id: account.id,
        name: form.name,
        url: form.url,
        role: form.role,
      }),
    onSuccess: (res) => {
      onMsg(res.message);
      if (res.ok) {
        setForm({ name: "", url: "", role: "" });
        setOpen(false);
      }
      refresh();
    },
  });
  const toggle = useMutation({
    mutationFn: (args: { id: number; selected: boolean }) =>
      api.setPageSelected(args),
    onSuccess: (res) => {
      onMsg(res.message);
      refresh();
    },
  });
  const del = useMutation({
    mutationFn: (id: number) => api.deletePage({ id }),
    onSuccess: refresh,
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (form.name.trim()) add.mutate();
  };

  return (
    <div className="mt-3 ml-5 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-alt)] p-3">
      <p className="text-xs font-semibold">
        Trang (Page) của nick này ({pages.length})
        {pages.length > 0 &&
          ` · ${pages.filter((p) => p.selected).length} đang chọn để đăng`}
      </p>
      {pages.length === 0 && (
        <p className="mt-1 text-xs leading-5 text-[var(--dim)]">
          Nick này chưa ghi Page nào. Nếu nick quản trị Page bán hàng, thêm
          Page vào đây để chọn đăng bài bằng Page thay vì trang cá nhân.
        </p>
      )}
      <ul className="mt-2 space-y-2">
        {pages.map((p) => (
          <li
            key={p.id}
            className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-3"
          >
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--surface-alt)] text-xs font-bold"
              >
                P
              </span>
              <div className="min-w-0 flex-1">
                {p.url ? (
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Mở Page ${p.name}`}
                    className="block truncate text-sm font-semibold text-[var(--accent-ink)] underline decoration-dotted underline-offset-2"
                  >
                    {p.name} ↗
                  </a>
                ) : (
                  <p className="truncate text-sm font-semibold">{p.name}</p>
                )}
                <p className="truncate text-xs text-[var(--dim)]">
                  {p.role || "Chưa ghi vai trò"}
                  {p.url ? ` · ${p.url}` : " · chưa có link Page"}
                </p>
              </div>
              {p.selected && (
                <span className="shrink-0 rounded-full bg-[var(--accent)] px-2 py-1 text-xs font-semibold text-white">
                  Đang chọn đăng
                </span>
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                onClick={() =>
                  toggle.mutate({ id: p.id, selected: !p.selected })
                }
                aria-pressed={p.selected}
                disabled={toggle.isPending}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                  p.selected
                    ? "bg-[var(--accent)] text-white"
                    : "border border-[var(--border)] text-[var(--dim)]"
                }`}
              >
                {p.selected ? "✓ Đăng bằng Page này" : "Chọn Page này để đăng"}
              </button>
              <button
                className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--danger)]"
                onClick={() => del.mutate(p.id)}
                aria-label={`Xóa Page ${p.name}`}
              >
                Xóa Page
              </button>
            </div>
          </li>
        ))}
      </ul>
      {open ? (
        <form onSubmit={submit} className="mt-3 space-y-2">
          <div>
            <label className={labelCls} htmlFor={`pg-name-${account.id}`}>
              Tên Page *
            </label>
            <input
              id={`pg-name-${account.id}`}
              aria-label="Tên Page"
              className={inputCls}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Nhập tên Page"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls} htmlFor={`pg-url-${account.id}`}>
                Link Page
              </label>
              <input
                id={`pg-url-${account.id}`}
                aria-label="Link Page"
                className={inputCls}
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder="https://www.facebook.com/…"
              />
            </div>
            <div>
              <label className={labelCls} htmlFor={`pg-role-${account.id}`}>
                Vai trò của bạn
              </label>
              <input
                id={`pg-role-${account.id}`}
                aria-label="Vai trò của bạn trên Page"
                className={inputCls}
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                placeholder="Nhập vai trò của bạn"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" className={btnPrimary} disabled={add.isPending}>
              Thêm Page
            </button>
            <button
              type="button"
              className={btnGhost}
              onClick={() => setOpen(false)}
            >
              Hủy
            </button>
          </div>
        </form>
      ) : (
        <button
          className={`${btnGhost} mt-3`}
          onClick={() => setOpen(true)}
          aria-label={`Thêm Page cho nick ${account.name}`}
        >
          + Thêm Page của nick này
        </button>
      )}
    </div>
  );
}
