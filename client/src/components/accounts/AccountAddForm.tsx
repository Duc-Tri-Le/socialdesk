import { useState, type FormEvent } from "react";
import { btnGhost, btnPrimary, inputCls, labelCls } from "../../utils/styles";
import { CollapsibleCard, FacebookIcon, InstagramIcon } from "../ui";

export interface AccountAddFormProps {
  isOpen: boolean;
  onToggle: (isOpen: boolean) => void;
  onSubmit: (args: {
    platform: "Facebook" | "Instagram";
    name: string;
    profile_url: string;
    extension_code: string;
  }) => void;
  isPending: boolean;
  initialPlatform?: "Facebook" | "Instagram";
}

export function AccountAddForm({
  isOpen,
  onToggle,
  onSubmit,
  isPending,
  initialPlatform = "Facebook",
}: AccountAddFormProps) {
  const [platform, setPlatform] = useState<"Facebook" | "Instagram">(initialPlatform);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [code, setCode] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (platform === "Facebook" && !code.trim()) return;
    if (platform === "Instagram" && !name.trim()) return;

    onSubmit({
      platform,
      name: platform === "Instagram" ? name : "",
      profile_url: url,
      extension_code: code.trim().toUpperCase(),
    });

    // Reset fields
    setName("");
    setUrl("");
    setCode("");
  };

  return (
    <CollapsibleCard
      title="Thêm tài khoản mới"
      subtitle="Hỗ trợ kết nối Facebook qua Chrome Extension hoặc thêm tài khoản Instagram"
      isOpen={isOpen}
      onToggle={onToggle}
      actionTextOpen="Đóng form"
      actionTextClosed="+ Thêm tài khoản"
      className="mt-4"
    >
      <form onSubmit={handleSubmit} className="space-y-4 p-4">
        <div>
          <label className={labelCls}>Chọn nền tảng tài khoản:</label>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setPlatform("Facebook")}
              className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
                platform === "Facebook"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "border border-[var(--border)] bg-[var(--surface-alt)] text-[var(--text)] hover:border-[var(--text)]"
              }`}
            >
              <FacebookIcon className="h-3.5 w-3.5" />
              <span>Facebook (qua Chrome Extension)</span>
            </button>
            <button
              type="button"
              onClick={() => setPlatform("Instagram")}
              className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
                platform === "Instagram"
                  ? "bg-gradient-to-r from-amber-500 via-pink-500 to-purple-600 text-white shadow-sm"
                  : "border border-[var(--border)] bg-[var(--surface-alt)] text-[var(--text)] hover:border-[var(--text)]"
              }`}
            >
              <InstagramIcon className="h-3.5 w-3.5" />
              <span>Instagram</span>
            </button>
          </div>
        </div>

        {platform === "Facebook" ? (
          <>
            <p className="text-xs leading-5 text-[var(--dim)]">
              Mở extension trên cửa sổ Chrome của nick Facebook &rarr; sao
              chép mã (ví dụ: SD-8492) dán vào đây. <strong>Tên nick sẽ được tự động nhận diện từ tài khoản Facebook</strong>, bạn không cần phải nhập tên.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Mã Chrome Extension (*):</label>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="Ví dụ: SD-8492, CHROME-1..."
                  className={`${inputCls} font-mono uppercase font-bold text-sky-400`}
                  required
                />
                <p className="mt-1 text-[11px] text-[var(--dim)]">
                  Mỗi nick Facebook dùng 1 profile Chrome riêng biệt có mã kết nối này.
                </p>
              </div>
              <div>
                <label className={labelCls}>Link trang cá nhân (tùy chọn):</label>
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://www.facebook.com/..."
                  className={inputCls}
                />
              </div>
            </div>
          </>
        ) : (
          <>
            <p className="text-xs leading-5 text-[var(--dim)]">
              Nhập tên tài khoản hoặc username Instagram để phân loại và theo dõi chỉ số tối ưu khung giờ riêng cho kênh Instagram.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className={labelCls}>Tên / Username Instagram (*):</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ví dụ: mohinhxe_shop..."
                  className={inputCls}
                  required
                />
              </div>
              <div>
                <label className={labelCls}>Mã Chrome Extension (tùy chọn):</label>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="Ví dụ: SD-8492, IG-1..."
                  className={`${inputCls} font-mono uppercase font-bold text-sky-400`}
                />
              </div>
              <div>
                <label className={labelCls}>Link profile Instagram (tùy chọn):</label>
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://www.instagram.com/..."
                  className={inputCls}
                />
              </div>
            </div>
          </>
        )}

        <div className="flex items-center gap-2 pt-2 border-t border-[var(--border)]">
          <button
            type="submit"
            disabled={
              isPending ||
              (platform === "Facebook" && !code.trim()) ||
              (platform === "Instagram" && !name.trim())
            }
            className={btnPrimary}
          >
            {isPending
              ? "Đang lưu..."
              : platform === "Facebook"
              ? "Kết nối Chrome Facebook"
              : "Lưu tài khoản Instagram"}
          </button>
          <button
            type="button"
            onClick={() => onToggle(false)}
            className={btnGhost}
          >
            Hủy
          </button>
        </div>
      </form>
    </CollapsibleCard>
  );
}
