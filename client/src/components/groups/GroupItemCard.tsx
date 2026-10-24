import type { Group } from "../../types";
import { btnDanger } from "../../utils/styles";
import { fmtDate, fmtMembers } from "../../utils/format";

export interface GroupItemCardProps {
  group: Group;
  onDelete: (id: number) => void;
  isDeletePending?: boolean;
  onToggleTarget: (id: number, currentTarget: boolean) => void;
  isTargetPending?: boolean;
  onSetMembership: (args: {
    group_id: number;
    identity_kind: "account" | "page";
    identity_id: number;
    status: "joined" | "not_joined";
  }) => void;
  isMembershipPending?: boolean;
}

export function GroupItemCard({
  group: g,
  onDelete,
  isDeletePending = false,
  onToggleTarget,
  isTargetPending = false,
  onSetMembership,
  isMembershipPending = false,
}: GroupItemCardProps) {
  return (
    <li className={`rounded-[var(--radius)] border bg-[var(--surface)] p-4 ${
      g.is_target ? "border-2 border-[var(--accent)]" : "border-[var(--border)]"
    }`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {g.url ? (
              <a
                href={g.url}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-[var(--accent-ink)] underline decoration-dotted underline-offset-2"
              >
                {g.name}
              </a>
            ) : (
              <p className="font-semibold">{g.name}</p>
            )}

            {g.is_target && (
              <span className="rounded-full bg-[var(--accent)] px-2 py-0.5 text-xs font-semibold text-white">
                ★ Nhóm đích
              </span>
            )}
          </div>

          <p className="mt-1 text-xs text-[var(--dim)]">
            <span className="font-mono">{fmtMembers(g.members)}</span> thành viên
            {g.created_at ? ` · Thêm lúc ${fmtDate(g.created_at)} (giờ VN)` : ""}
          </p>
        </div>

        <button
          type="button"
          className={btnDanger}
          disabled={isDeletePending}
          onClick={() => onDelete(g.id)}
          aria-label={`Xóa nhóm ${g.name}`}
        >
          {isDeletePending ? "Đang xóa…" : "Xóa"}
        </button>
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
                  <span className="font-medium text-[var(--text)]">
                    {m.identity_name?.trim() || (m.identity_kind === "page" ? "Fanpage Facebook" : "Nick Facebook")}
                  </span>{" "}
                  <span className="text-xs text-[var(--dim)]">
                    ({m.identity_kind === "page" ? "Fanpage" : "Nick Facebook"})
                  </span>
                </span>

                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                    m.status === "joined"
                      ? "bg-[var(--ok)] text-white"
                      : "border border-[var(--danger)] text-[var(--danger)]"
                  }`}
                >
                  {m.status === "joined" ? "✓ Đã tham gia" : "Chưa tham gia"}
                </span>

                <select
                  aria-label={`Đặt trạng thái tham gia của ${m.identity_name?.trim() || (m.identity_kind === "page" ? "Fanpage" : "Nick Facebook")} trong nhóm ${g.name}`}
                  className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs"
                  value={m.status}
                  disabled={isMembershipPending}
                  onChange={(e) =>
                    onSetMembership({
                      group_id: g.id,
                      identity_kind: m.identity_kind as "account" | "page",
                      identity_id: m.identity_id,
                      status: e.target.value as "joined" | "not_joined",
                    })
                  }
                >
                  <option value="joined">Đã tham gia</option>
                  <option value="not_joined">Chưa tham gia</option>
                </select>
              </li>
            ))}
        </ul>

        {g.memberships.filter((m) => m.identity_kind !== "instagram").length === 0 && (
          <p className="mt-1 text-xs text-[var(--dim)]">
            Chưa có tài khoản/Page nào trong app để đối chiếu trạng thái tham gia.
          </p>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onToggleTarget(g.id, !!g.is_target)}
          disabled={isTargetPending}
          aria-pressed={g.is_target}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
            g.is_target
              ? "bg-[var(--accent)] text-white"
              : "border border-[var(--border)] text-[var(--dim)]"
          }`}
        >
          {g.is_target ? "★ Nhóm đích đăng bài" : "Đặt làm nhóm đích"}
        </button>
      </div>
    </li>
  );
}
