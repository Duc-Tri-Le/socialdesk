import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api";
import type { Account, Page } from "../../types";
import { btnPrimary, inputCls, labelCls } from "../../utils/styles";
import { AccountItemCard } from "../accounts/AccountItemCard";

export function AccountsSection({
  accounts,
  pages,
}: {
  accounts: Account[];
  pages: Page[];
}) {
  const queryClient = useQueryClient();
  const [msg, setMsg] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [newAccUrl, setNewAccUrl] = useState("");
  const [newAccCode, setNewAccCode] = useState("");

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
      refresh();
      connectedExtQ.refetch();
    },
  });

  const addAccount = useMutation({
    mutationFn: () =>
      api.addAccount({
        platform: "Facebook",
        name: "",
        profile_url: newAccUrl,
        extension_code: newAccCode,
        handle: "Tài khoản Chrome Extension",
        linked: true,
      }),
    onSuccess: (res) => {
      setMsg(res.message);
      if (res.ok) {
        setNewAccUrl("");
        setNewAccCode("");
        setShowAddForm(false);
      }
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
      refresh();
    },
  });

  const saveName = useMutation({
    mutationFn: (args: { id: number; name: string }) =>
      api.setAccountName(args),
    onSuccess: (res) => {
      setMsg(res.message);
      refresh();
    },
  });

  const loggedIn = accounts.filter((a) => a.linked && a.selected);
  const linkedNotUsed = accounts.filter((a) => a.linked && !a.selected);
  const notLinked = accounts.filter((a) => !a.linked);

  return (
    <section aria-label="Danh sách tài khoản">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Danh sách tài khoản</h2>
          <p className="mt-1 text-xs text-[var(--dim)]">
            {loggedIn.length} nick đang đăng nhập
            {linkedNotUsed.length > 0 &&
              ` · ${linkedNotUsed.length} nick đã liên kết nhưng chưa dùng để đăng`}
            {notLinked.length > 0 && ` · ${notLinked.length} nick chưa liên kết`}
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="rounded-full bg-sky-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-sky-500 transition-colors"
        >
          {showAddForm ? "✕ Đóng form" : "+ Thêm tài khoản Facebook / Chrome"}
        </button>
      </div>

      {/* Form kết nối Chrome Extension */}
      {showAddForm && (
        <div className="mt-4 rounded-[var(--radius)] border border-sky-500/40 bg-[var(--surface)] p-4 shadow-sm animate-in fade-in duration-200">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-sky-400">
              Kết nối tài khoản Facebook qua Chrome Extension
            </h3>
            <button
              onClick={() => setShowAddForm(false)}
              className="text-xs text-[var(--dim)] hover:text-[var(--text)]"
            >
              ✕ Đóng
            </button>
          </div>
          <p className="mt-0.5 text-xs text-[var(--dim)]">
            Mở extension trên cửa sổ Chrome của nick Facebook &rarr; sao chép mã (ví dụ: SD-8492) dán vào đây. <strong>Tên nick sẽ được tự động nhận diện từ tài khoản Facebook</strong>, bạn không cần phải nhập tên.
          </p>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Mã Chrome Extension (*):</label>
              <input
                value={newAccCode}
                onChange={(e) => setNewAccCode(e.target.value.toUpperCase())}
                placeholder="Ví dụ: SD-8492, CHROME-1..."
                className={`${inputCls} font-mono uppercase font-bold text-sky-400`}
              />
              <p className="mt-1 text-[11px] text-[var(--dim)]">
                Mỗi nick Facebook dùng 1 profile Chrome riêng biệt có mã kết nối này.
              </p>
            </div>
            <div>
              <label className={labelCls}>Link trang cá nhân (tùy chọn):</label>
              <input
                value={newAccUrl}
                onChange={(e) => setNewAccUrl(e.target.value)}
                placeholder="https://www.facebook.com/..."
                className={inputCls}
              />
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <button
              onClick={() => addAccount.mutate()}
              disabled={!newAccCode.trim() || addAccount.isPending}
              className={btnPrimary}
            >
              {addAccount.isPending ? "Đang kết nối..." : "Kết nối Chrome"}
            </button>
            <button
              onClick={() => setShowAddForm(false)}
              className="rounded-full border border-[var(--border)] px-4 py-2 text-xs font-semibold text-[var(--dim)] hover:text-[var(--text)]"
            >
              Hủy
            </button>
          </div>
        </div>
      )}

      {/* Box trạng thái Chrome Extension */}
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
          Mỗi tài khoản Facebook đăng nhập ở 1 cửa sổ/profile Chrome riêng biệt. Hãy mở Chrome của tài khoản đó &rarr; bật extension &rarr; lấy mã trong popup và dán vào ô <strong>Mã Chrome</strong> của tài khoản tương ứng dưới đây. Khi bấm <strong>Đăng bài</strong>, hệ thống sẽ tự động kích hoạt cửa sổ Chrome đó để đăng!
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

      {/* Danh sách các tài khoản */}
      <ul className="mt-3 space-y-3">
        {accounts.map((a) => (
          <AccountItemCard
            key={a.id}
            account={a}
            pages={pages}
            onlineCodes={onlineCodes}
            onSaveExtensionCode={(args) => saveExtensionCode.mutate(args)}
            isSaveExtensionCodePending={saveExtensionCode.isPending}
            onSelect={(args) => select.mutate(args)}
            isSelectPending={select.isPending}
            onLink={(args) => link.mutate(args)}
            isLinkPending={link.isPending}
            onDelete={(id) => del.mutate(id)}
            onSaveUrl={(args) => saveUrl.mutate(args)}
            isSaveUrlPending={saveUrl.isPending}
            onSaveName={(args) => saveName.mutate(args)}
            isSaveNamePending={saveName.isPending}
            onMsg={setMsg}
          />
        ))}
      </ul>

      {accounts.length === 0 && (
        <div className="mt-3 rounded-[var(--radius)] border border-dashed border-[var(--border)] p-6 text-center">
          <p className="text-sm font-semibold text-[var(--dim)]">
            Chưa có tài khoản nào.
          </p>
          <button
            onClick={() => setShowAddForm(true)}
            className="mt-3 rounded-full bg-sky-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-sky-500"
          >
            + Thêm tài khoản Facebook / Chrome đầu tiên
          </button>
        </div>
      )}

      {msg && (
        <p className="mt-3 rounded-md bg-[var(--surface-alt)] px-3 py-2 text-sm font-medium" role="status">
          {msg}
        </p>
      )}
    </section>
  );
}
