// Social Desk Connector - Popup Script

function generateDefaultCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let randomPart = "";
  for (let i = 0; i < 4; i++) {
    randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `SD-${randomPart}`;
}

document.addEventListener("DOMContentLoaded", async () => {
  const codeEl = document.getElementById("extensionCode");
  const copyBtn = document.getElementById("copyBtn");
  const copyBtnText = document.getElementById("copyBtnText");
  const editCodeBtn = document.getElementById("editCodeBtn");
  const refreshCodeBtn = document.getElementById("refreshCodeBtn");
  const editCodeRow = document.getElementById("editCodeRow");
  const customCodeInput = document.getElementById("customCodeInput");
  const saveCustomCodeBtn = document.getElementById("saveCustomCodeBtn");
  const cancelCustomCodeBtn = document.getElementById("cancelCustomCodeBtn");
  const statusBadge = document.getElementById("statusBadge");
  const statusText = document.getElementById("statusText");
  const toggleSettings = document.getElementById("toggleSettings");
  const settingsBody = document.getElementById("settingsBody");
  const serverUrlInput = document.getElementById("serverUrlInput");
  const saveServerBtn = document.getElementById("saveServerBtn");
  const logsContainer = document.getElementById("logsContainer");
  const clearLogsBtn = document.getElementById("clearLogsBtn");
  const toast = document.getElementById("toast");

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");
    setTimeout(() => {
      toast.classList.remove("show");
    }, 2000);
  }

  // 1. Khởi tạo mã kết nối
  const data = await chrome.storage.local.get(["extensionCode", "serverUrl", "logs"]);
  let currentCode = data.extensionCode;
  if (!currentCode) {
    currentCode = generateDefaultCode();
    await chrome.storage.local.set({ extensionCode: currentCode });
  }
  codeEl.textContent = currentCode;

  if (data.serverUrl) {
    serverUrlInput.value = data.serverUrl;
  }

  // 2. Render logs
  // 2. Render logs (Chống HTML Injection / XSS an toàn bằng DOM API)
  function renderLogs(logs = []) {
    logsContainer.textContent = "";
    if (!logs || logs.length === 0) {
      const dim = document.createElement("div");
      dim.className = "log-item dim";
      dim.textContent = "Chưa có hoạt động nào.";
      logsContainer.appendChild(dim);
      return;
    }
    const fragment = document.createDocumentFragment();
    logs
      .slice(-15)
      .reverse()
      .forEach((item) => {
        const time = new Date(item.time).toLocaleTimeString("vi-VN", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        });
        const div = document.createElement("div");
        div.className = `log-item ${item.type || ""}`;
        div.textContent = `[${time}] ${item.text || ""}`;
        fragment.appendChild(div);
      });
    logsContainer.appendChild(fragment);
  }
  renderLogs(data.logs);

  // 3. Sao chép mã
  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(currentCode);
      copyBtnText.textContent = "Đã chép!";
      showToast("Đã sao chép mã kết nối: " + currentCode);
      setTimeout(() => {
        copyBtnText.textContent = "Sao chép";
      }, 1500);
    } catch (e) {
      showToast("Không thể chép mã: " + e.message);
    }
  });

  // 4. Đổi mã riêng
  editCodeBtn.addEventListener("click", () => {
    customCodeInput.value = currentCode;
    editCodeRow.style.display = "flex";
    customCodeInput.focus();
  });

  cancelCustomCodeBtn.addEventListener("click", () => {
    editCodeRow.style.display = "none";
  });

  saveCustomCodeBtn.addEventListener("click", async () => {
    const val = customCodeInput.value.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "");
    if (!val) {
      showToast("Mã không được để trống!");
      return;
    }
    currentCode = val;
    codeEl.textContent = currentCode;
    await chrome.storage.local.set({ extensionCode: currentCode });
    editCodeRow.style.display = "none";
    showToast("Đã đổi mã thành: " + currentCode);
    chrome.runtime.sendMessage({ action: "RECONNECT" });
  });

  // 5. Sinh mã ngẫu nhiên mới
  refreshCodeBtn.addEventListener("click", async () => {
    currentCode = generateDefaultCode();
    codeEl.textContent = currentCode;
    await chrome.storage.local.set({ extensionCode: currentCode });
    showToast("Đã sinh mã mới: " + currentCode);
    chrome.runtime.sendMessage({ action: "RECONNECT" });
  });

  // 6. Cấu hình máy chủ
  toggleSettings.addEventListener("click", () => {
    const isHidden = settingsBody.style.display === "none";
    settingsBody.style.display = isHidden ? "block" : "none";
    const chevron = toggleSettings.querySelector(".chevron");
    if (chevron) chevron.classList.toggle("open", isHidden);
  });

  saveServerBtn.addEventListener("click", async () => {
    let url = serverUrlInput.value.trim();
    if (!url) url = "http://localhost:3000";
    url = url.replace(/\/+$/, "");
    await chrome.storage.local.set({ serverUrl: url });
    showToast("Đã lưu địa chỉ máy chủ: " + url);
    chrome.runtime.sendMessage({ action: "RECONNECT" });
    checkConnection();
  });

  // 7. Xóa logs
  clearLogsBtn.addEventListener("click", async () => {
    await chrome.storage.local.set({ logs: [] });
    renderLogs([]);
    showToast("Đã xóa nhật ký!");
  });

  // 8. Kiểm tra trạng thái kết nối
  async function checkConnection() {
    try {
      chrome.runtime.sendMessage({ action: "GET_STATUS" }, (response) => {
        if (chrome.runtime.lastError || !response) {
          statusBadge.className = "status-badge status-offline";
          statusText.textContent = "Chưa kết nối";
          return;
        }

        if (response.connected) {
          statusBadge.className = "status-badge status-online";
          statusText.textContent = "Đã kết nối";
        } else {
          statusBadge.className = "status-badge status-offline";
          statusText.textContent = "Chưa kết nối";
        }

        if (response.logs) {
          renderLogs(response.logs);
        }
      });
    } catch (e) {
      statusBadge.className = "status-badge status-offline";
      statusText.textContent = "Chưa kết nối";
    }
  }

  checkConnection();
  const pollTimer = setInterval(checkConnection, 2000);
  window.addEventListener("unload", () => clearInterval(pollTimer));
});
