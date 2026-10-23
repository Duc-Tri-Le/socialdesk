import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api";
import type { Group, ScannedGroup } from "../../types";
import { btnPrimary, btnDanger, inputCls, labelCls } from "../../utils/styles";
import { fmtDate, fmtMembers } from "../../utils/format";

export function GroupsSection() {
  const queryClient = useQueryClient();
  const groups = useQuery({
    queryKey: ["groups"],
    queryFn: () => api.listGroups({}),
  });
  // Tài khoản Facebook đã liên kết mà app dùng để quét link nhóm
  // (đọc chi tiết + kiểm tra trạng thái tham gia) — hiển thị trong
  // panel dán link để người dùng biết app quét bằng nick nào.
  const adderAccount = useQuery({
    queryKey: ["group-adder-account"],
    queryFn: () => api.getGroupAdderAccount({}),
  });
  const [pasteText, setPasteText] = useState("");
  const saveLinks = useMutation({
    mutationFn: () => api.saveGroupLinks({ links_text: pasteText }),
    onSuccess: (res) => {
      if (res.ok) setPasteText("");
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      queryClient.invalidateQueries({ queryKey: ["overview"] });
    },
  });
  const submitSave = (e: FormEvent) => {
    e.preventDefault();
    if (pasteText.trim()) saveLinks.mutate();
  };
  const setMembership = useMutation({
    mutationFn: (args: {
      group_id: number;
      identity_kind: "account" | "page";
      identity_id: number;
      status: "joined" | "not_joined";
    }) => api.setGroupMembership(args),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      queryClient.invalidateQueries({ queryKey: ["overview"] });
    },
  });
  const flags = useMutation({
    mutationFn: (args: { id: number; joined?: boolean; is_target?: boolean }) =>
      api.setGroupFlags(args),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      queryClient.invalidateQueries({ queryKey: ["overview"] });
    },
  });
  const del = useMutation({
    mutationFn: (id: number) => api.deleteGroup({ id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["groups"] });
      queryClient.invalidateQueries({ queryKey: ["overview"] });
    },
  });

  return (
    <div className="space-y-6">
      <section aria-label="Thêm nhóm bằng link Facebook">
        <h2 className="text-lg font-bold">Thêm nhóm bằng link Facebook</h2>
        <form onSubmit={submitSave} className="mt-3 space-y-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4">
          {!adderAccount.data?.linked && (
            <div
              className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-alt)] p-3"
              role="status"
            >
              <p className="text-sm font-medium text-[var(--danger)]">
                Chưa có tài khoản Facebook nào được liên kết — hãy
                liên kết tài khoản Facebook ở mục Tài khoản để app
                quét được chi tiết và trạng thái tham gia khi bạn
                dán link nhóm.
              </p>
            </div>
          )}
          <div>
            <label className={labelCls} htmlFor="gf-paste">
              Link nhóm Facebook (mỗi link một dòng)
            </label>
            <textarea
              id="gf-paste"
              aria-label="Dán link các nhóm Facebook"
              className={`${inputCls} min-h-24`}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={"https://www.facebook.com/groups/…\nhttps://www.facebook.com/groups/…"}
            />
            <p className="mt-1 text-xs leading-5 text-[var(--dim)]">
              Cách lấy link nhóm: mở nhóm trên Facebook → nút Chia sẻ →
              “Sao chép liên kết” (hoặc chuột phải vào tên nhóm → “Sao
              chép liên kết”). Dán cả đoạn văn bản có chứa link nhóm
              cũng được — app tự tách link dạng facebook.com/groups/…
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" className={btnPrimary} disabled={saveLinks.isPending || !pasteText.trim()}>
              {saveLinks.isPending ? "Đang quét từng link nhóm…" : "Lưu & quét nhóm"}
            </button>
            <span className="text-sm text-[var(--dim)]">
              Tối đa 25 link mỗi lần lưu.
            </span>
          </div>
        </form>

        {saveLinks.isError && (
          <p className="mt-3 text-sm font-medium text-[var(--danger)]" role="alert">
            Lưu &amp; quét nhóm thất bại:{" "}
            {saveLinks.error instanceof Error
              ? saveLinks.error.message
              : "lỗi không xác định."}
          </p>
        )}
        {saveLinks.data && !saveLinks.data.ok && (
          <p className="mt-3 text-sm font-medium text-[var(--danger)]" role="alert">
            {saveLinks.data.message}
          </p>
        )}
        {saveLinks.data?.ok && (
          <div className="mt-3">
            <p className="text-sm text-[var(--dim)]" role="status">
              {saveLinks.data.message}
            </p>
            {saveLinks.data.scanned.length > 0 && (
              <ul className="mt-3 space-y-3">
                {saveLinks.data.scanned.map((g: ScannedGroup) => (
                  <li key={g.id} className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <a href={g.url} target="_blank" rel="noreferrer" className="font-semibold text-[var(--accent-ink)] underline decoration-dotted underline-offset-2">
                          {g.name}
                        </a>
                        <p className="text-xs text-[var(--dim)]">
                          <span className="font-mono">{fmtMembers(g.members)}</span> thành viên
                          {!g.detail_ok && " · chưa đọc được chi tiết"}
                        </p>
                        {g.description && (
                          <p className="mt-1 line-clamp-2 text-sm text-[var(--dim)]">{g.description}</p>
                        )}
                        <p className="mt-1 text-xs text-[var(--dim)]">{g.note}</p>
                      </div>
                      {g.fb_status === "joined" ? (
                        <span className="shrink-0 rounded-full bg-[var(--ok)] px-3 py-1.5 text-xs font-semibold text-white">
                          ✓ Nick Facebook đã tham gia
                        </span>
                      ) : (
                        <span className="shrink-0 rounded-full border border-[var(--danger)] px-3 py-1.5 text-xs font-semibold text-[var(--danger)]">
                          Nick Facebook chưa tham gia
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-[var(--dim)]">
              Các nhóm trên đã nằm trong <strong>Danh sách nhóm</strong>{" "}
              bên dưới — kiểm tra và đặt đúng trạng thái tham gia của
              từng Page trên thẻ nhóm trước khi đăng bài.
            </p>
          </div>
        )}

      </section>

      <section aria-label="Danh sách hội nhóm">
        <h2 className="text-lg font-bold">Danh sách nhóm</h2>
        <p className="mt-1 text-sm text-[var(--dim)]">
          Hiển thị theo <strong>tên nhóm</strong>. Chỉ đăng vào nhóm bạn{" "}
          <strong>đã tham gia</strong> — đăng vào nhóm lạ dễ bị Facebook
          coi là spam.
        </p>
        {groups.isPending && <p className="mt-2 text-sm text-[var(--dim)]">Đang tải…</p>}
        <ul className="mt-3 space-y-3">
          {(groups.data?.groups ?? []).map((g: Group) => (
            <li key={g.id} className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  {g.url ? (
                    <a href={g.url} target="_blank" rel="noreferrer" className="font-semibold text-[var(--accent-ink)] underline decoration-dotted underline-offset-2">
                      {g.name}
                    </a>
                  ) : (
                    <p className="font-semibold">{g.name}</p>
                  )}
                  <p className="text-xs text-[var(--dim)]">
                    <span className="font-mono">{fmtMembers(g.members)}</span> thành viên
                    {g.created_at
                      ? ` · Thêm lúc ${fmtDate(g.created_at)} (giờ VN)`
                      : ""}
                  </p>
                </div>
                <button className={btnDanger} onClick={() => del.mutate(g.id)} aria-label={`Xóa nhóm ${g.name}`}>Xóa</button>
              </div>
              <div className="mt-3">
                <p className="text-xs font-semibold text-[var(--dim)]">
                  Trạng thái tham gia theo từng tài khoản/Page (mỗi danh tính một trạng thái riêng — Page và tài khoản chính có thể khác nhau)
                </p>
                <ul className="mt-1.5 space-y-1.5">
                  {g.memberships
                    .filter((m) => m.identity_kind !== "instagram")
                    .map((m) => (
                      <li
                        key={`${m.identity_kind}-${m.identity_id}`}
                        className={`flex flex-wrap items-center gap-2 text-sm ${
                          m.identity_kind === "page"
                            ? "ml-6 border-l-2 border-[var(--border)] pl-3"
                            : ""
                        }`}
                      >
                        <span className="min-w-0 flex-1 truncate">
                          {m.identity_name}{" "}
                          <span className="text-xs text-[var(--dim)]">
                            ({m.identity_kind === "page" ? "Page" : "Tài khoản"})
                          </span>
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            m.status === "joined"
                              ? "bg-[var(--ok)] text-white"
                              : "border border-[var(--danger)] text-[var(--danger)]"
                          }`}
                        >
                          {m.status === "joined"
                            ? "✓ Đã tham gia"
                            : "Chưa tham gia"}
                        </span>
                        <select
                          aria-label={`Đặt trạng thái tham gia của ${m.identity_name} trong nhóm ${g.name}`}
                          className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs"
                          value={m.status}
                          disabled={setMembership.isPending}
                          onChange={(e) =>
                            setMembership.mutate({
                              group_id: g.id,
                              identity_kind: m.identity_kind as "account" | "page",
                              identity_id: m.identity_id,
                              status: e.target.value as
                                | "joined"
                                | "not_joined",
                            })
                          }
                        >
                          <option value="joined">Đã tham gia</option>
                          <option value="not_joined">Chưa tham gia</option>
                        </select>
                      </li>
                    ))}
                </ul>
                {g.memberships.filter((m) => m.identity_kind !== "instagram")
                  .length === 0 && (
                  <p className="mt-1 text-xs text-[var(--dim)]">
                    Chưa có tài khoản/Page nào trong app để đối chiếu
                    trạng thái tham gia.
                  </p>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={() => flags.mutate({ id: g.id, is_target: !g.is_target })}
                  aria-pressed={g.is_target}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold ${g.is_target ? "bg-[var(--accent)] text-white" : "border border-[var(--border)] text-[var(--dim)]"}`}
                >
                  {g.is_target ? "★ Nhóm đích đăng bài" : "Đặt làm nhóm đích"}
                </button>
              </div>
            </li>
          ))}
        </ul>
        {groups.data && groups.data.groups.length === 0 && (
          <p className="mt-2 text-sm text-[var(--dim)]">
            Chưa có nhóm nào — dán link nhóm Facebook vào ô ở trên rồi
            bấm “Lưu &amp; quét nhóm”.
          </p>
        )}
      </section>
    </div>
  );
}
