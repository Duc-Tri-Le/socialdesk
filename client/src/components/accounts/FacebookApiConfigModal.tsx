import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "../../api";
import { btnPrimary, inputCls } from "../../utils/styles";
import { FacebookIcon } from "../ui";

export interface FacebookApiConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMsg: (m: string) => void;
  refresh: () => void;
}

export function FacebookApiConfigModal({
  isOpen,
  onClose,
  onMsg,
  refresh,
}: FacebookApiConfigModalProps) {
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [manualCode, setManualCode] = useState("");
  const [isManualCodeOpen, setIsManualCodeOpen] = useState(false);

  // Lấy cấu hình App ID hiện tại
  const appConfigQ = useQuery({
    queryKey: ["fbAppConfig"],
    queryFn: () => api.getFacebookAppConfig({}),
    enabled: isOpen,
  });

  useEffect(() => {
    if (appConfigQ.data) {
      setAppId(appConfigQ.data.app_id || "");
    }
  }, [appConfigQ.data]);

  const saveCredentialsMutation = useMutation({
    mutationFn: (args: { app_id: string; app_secret: string }) =>
      api.saveFacebookAppCredentials(args),
    onSuccess: (res) => {
      onMsg(res.message);
      appConfigQ.refetch();
    },
    onError: (err: any) => {
      onMsg(`Lỗi lưu cấu hình: ${err?.message || "Không rõ"}`);
    },
  });

  const oauthCallbackMutation = useMutation({
    mutationFn: (args: { code: string; redirect_uri: string }) =>
      api.handleFacebookOAuthCallback(args),
    onSuccess: (res) => {
      onMsg(res.message);
      if (res.ok) {
        refresh();
        onClose();
      }
    },
    onError: (err: any) => {
      onMsg(`Lỗi xác thực OAuth: ${err?.message || "Thất bại"}`);
    },
  });

  if (!isOpen) return null;

  const currentRedirectUri =
    window.location.origin + window.location.pathname;

  const handleStartOAuth = async () => {
    if (!appId.trim()) {
      onMsg("Vui lòng nhập Facebook App ID trước khi kết nối OAuth.");
      return;
    }
    try {
      const res = await api.getFacebookOAuthUrl({
        redirect_uri: currentRedirectUri,
      });
      if (res.ok && res.auth_url) {
        // Mở popup OAuth
        const width = 650;
        const height = 750;
        const left = window.screen.width / 2 - width / 2;
        const top = window.screen.height / 2 - height / 2;
        window.open(
          res.auth_url,
          "facebook_oauth_popup",
          `width=${width},height=${height},top=${top},left=${left},scrollbars=yes,status=no`,
        );
      } else {
        onMsg(res.message || "Không thể tạo liên kết đăng nhập Facebook.");
      }
    } catch (e: any) {
      onMsg(`Lỗi kết nối Facebook: ${e?.message || "Không xác định"}`);
    }
  };

  const handleManualCodeSubmit = () => {
    if (!manualCode.trim()) {
      onMsg("Vui lòng dán mã code xác thực.");
      return;
    }
    oauthCallbackMutation.mutate({
      code: manualCode.trim(),
      redirect_uri: currentRedirectUri,
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
    >
      <div className="w-full max-w-lg rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
        <header className="flex items-center justify-between border-b border-[var(--border)] pb-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600/10 text-blue-500">
              <FacebookIcon className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-base font-bold text-[var(--text)]">
                Cấu hình API & Kết nối Facebook
              </h3>
              <p className="text-xs text-[var(--dim)]">
                Đăng bài Fanpage và Instagram trực tiếp qua Meta Graph API
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-[var(--dim)] hover:bg-[var(--surface-alt)] hover:text-[var(--text)]"
          >
            ✕
          </button>
        </header>

        {/* 1. Phần cấu hình Facebook App */}
        <div className="space-y-3.5">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-alt)]/50 p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[var(--text)]">
                1. Thông tin Facebook App (Meta for Developers)
              </span>
              <span
                className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                  appConfigQ.data?.configured
                    ? "bg-emerald-500/15 text-emerald-400"
                    : "bg-amber-500/15 text-amber-400"
                }`}
              >
                {appConfigQ.data?.configured
                  ? "✓ Đã lưu cấu hình"
                  : "Chưa cấu hình"}
              </span>
            </div>

            <div className="space-y-2">
              <div>
                <label className="block text-[11px] font-semibold text-[var(--dim)] mb-1">
                  Facebook App ID:
                </label>
                <input
                  type="text"
                  value={appId}
                  onChange={(e) => setAppId(e.target.value)}
                  placeholder="Ví dụ: 123456789012345"
                  className={inputCls}
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[var(--dim)] mb-1">
                  Facebook App Secret:
                </label>
                <input
                  type="password"
                  value={appSecret}
                  onChange={(e) => setAppSecret(e.target.value)}
                  placeholder={
                    appConfigQ.data?.has_app_secret
                      ? "••••••••••••••••••••••••••••••••"
                      : "Dán App Secret từ Facebook Developer..."
                  }
                  className={inputCls}
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[var(--dim)] mb-1">
                  OAuth Redirect URI (Cần thêm vào Valid OAuth Redirect URIs trên Facebook):
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    readOnly
                    value={currentRedirectUri}
                    className={`${inputCls} bg-[var(--surface-alt)] text-[var(--dim)] select-all text-xs`}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(currentRedirectUri);
                      onMsg("Đã sao chép Redirect URI vào Clipboard!");
                    }}
                    className="shrink-0 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs font-semibold text-[var(--text)] hover:bg-[var(--surface-alt)]"
                  >
                    Chép
                  </button>
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={() =>
                    saveCredentialsMutation.mutate({
                      app_id: appId,
                      app_secret: appSecret,
                    })
                  }
                  disabled={saveCredentialsMutation.isPending || !appId.trim()}
                  className="rounded-lg bg-[var(--surface)] border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--text)] hover:border-[var(--accent)]"
                >
                  {saveCredentialsMutation.isPending
                    ? "Đang lưu..."
                    : "Lưu App ID & Secret"}
                </button>
              </div>
            </div>
          </div>

          {/* 2. Nút kích hoạt OAuth Flow */}
          <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-bold text-blue-400">
                  2. Đăng nhập & Đồng bộ Fanpage/Instagram
                </p>
                <p className="text-[11px] text-[var(--dim)] mt-0.5">
                  Tự động cấp quyền và đồng bộ toàn bộ Page & Instagram Business vĩnh viễn
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleStartOAuth}
              className={`w-full flex items-center justify-center gap-2 rounded-xl py-2.5 px-4 text-xs font-bold text-white shadow-md transition-all ${
                appId.trim()
                  ? "bg-blue-600 hover:bg-blue-500 cursor-pointer shadow-blue-600/25"
                  : "bg-zinc-700 opacity-60 cursor-not-allowed"
              }`}
            >
              <FacebookIcon className="h-4 w-4" />
              <span>Kết nối tài khoản Facebook qua OAuth</span>
            </button>

            {/* Mục nhập code thủ công nếu popup không tự đóng */}
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setIsManualCodeOpen(!isManualCodeOpen)}
                className="text-[11px] text-[var(--accent-ink)] hover:underline"
              >
                {isManualCodeOpen
                  ? "Ẩn ô dán mã code"
                  : "Popup bị chặn hoặc không tự đóng? Bấm để dán mã code..."}
              </button>

              {isManualCodeOpen && (
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="text"
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                    placeholder="Dán mã ?code=... từ URL Facebook sau khi đăng nhập"
                    className={`${inputCls} text-xs`}
                  />
                  <button
                    type="button"
                    onClick={handleManualCodeSubmit}
                    disabled={oauthCallbackMutation.isPending}
                    className={btnPrimary}
                  >
                    {oauthCallbackMutation.isPending ? "Đang xử lý..." : "Xác nhận"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <footer className="flex justify-end pt-2 border-t border-[var(--border)]">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] px-4 py-1.5 text-xs font-semibold text-[var(--text)] hover:bg-[var(--surface-alt)]"
          >
            Đóng
          </button>
        </footer>
      </div>
    </div>
  );
}

