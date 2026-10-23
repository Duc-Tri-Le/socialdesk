// Social Desk Connector - Background Service Worker

let socket = null;
let isConnected = false;
let reconnectTimer = null;
let heartbeatTimer = null;
const logs = [];

async function addLog(text, type = "") {
  const item = { time: Date.now(), text, type };
  logs.push(item);
  if (logs.length > 50) logs.shift();

  try {
    const data = await chrome.storage.local.get("logs");
    const stored = data.logs || [];
    stored.push(item);
    if (stored.length > 50) stored.shift();
    await chrome.storage.local.set({ logs: stored });
  } catch (e) {
    // Ignore storage errors in background
  }
}

function updateBadge(connected) {
  if (connected) {
    chrome.action.setBadgeText({ text: "ON" });
    chrome.action.setBadgeBackgroundColor({ color: "#22c55e" });
  } else {
    chrome.action.setBadgeText({ text: "OFF" });
    chrome.action.setBadgeBackgroundColor({ color: "#ef4444" });
  }
}

async function getWsUrl() {
  const data = await chrome.storage.local.get("serverUrl");
  let base = (data.serverUrl || "http://localhost:3000").trim().replace(/\/+$/, "");
  if (base.startsWith("https://")) {
    return base.replace(/^https:\/\//, "wss://") + "/ws";
  }
  return base.replace(/^http:\/\//, "ws://") + "/ws";
}

async function connectWebSocket() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }

  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (heartbeatTimer) clearInterval(heartbeatTimer);

  const wsUrl = await getWsUrl();
  const data = await chrome.storage.local.get("extensionCode");
  const code = (data.extensionCode || "").trim();

  try {
    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      isConnected = true;
      updateBadge(true);
      addLog(`Đã kết nối Social Desk tại ${wsUrl}`, "success");

      // Đăng ký mã Chrome này với máy chủ
      if (code) {
        socket.send(JSON.stringify({
          type: "REGISTER_EXTENSION",
          code: code,
          time: Date.now()
        }));
        addLog(`Đã đăng ký mã Chrome: [${code}]`, "success");
      }

      // Giữ heartbeat
      heartbeatTimer = setInterval(() => {
        if (socket && socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: "PING" }));
        }
      }, 25000);
    };

    socket.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "PONG") return;

        if (msg.type === "REGISTER_OK") {
          addLog(`Máy chủ xác nhận mã [${msg.code}] hợp lệ`, "success");
          return;
        }

        if (msg.action === "PUBLISH_POST") {
          addLog(`Nhận lệnh đăng bài: "${msg.title || msg.targetName || 'Bài đăng'}"`, "info");
          handlePublishTask(msg);
        }
      } catch (e) {
        console.error("Lỗi đọc thông điệp WebSocket:", e);
      }
    };

    socket.onclose = () => {
      isConnected = false;
      updateBadge(false);
      addLog("Mất kết nối máy chủ Social Desk — sẽ thử kết nối lại sau 3s...", "error");
      reconnectTimer = setTimeout(connectWebSocket, 3000);
    };

    socket.onerror = (err) => {
      isConnected = false;
      updateBadge(false);
    };
  } catch (err) {
    isConnected = false;
    updateBadge(false);
    reconnectTimer = setTimeout(connectWebSocket, 3000);
  }
}

// Xử lý tác vụ đăng bài Facebook
async function handlePublishTask(task) {
  const { taskId, draftId, targetUrl, caption, images = [], targetName } = task;

  try {
    addLog(`Đang mở trang Facebook: ${targetUrl || 'Facebook'}...`, "");

    // 1. Mở tab Facebook hoặc chuyển đến URL đích
    const tab = await chrome.tabs.create({
      url: targetUrl || "https://www.facebook.com/",
      active: true,
    });

    // 2. Chờ tab hoàn tất tải trang
    await waitForTabComplete(tab.id);
    addLog("Trang đã tải xong, đang chuẩn bị điền nội dung...", "");

    // Đợi thêm 3.5s để React / Lexical editor của Facebook ổn định
    await new Promise((r) => setTimeout(r, 3500));

    // 3. Inject content script nếu cần
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content.js"],
      });
    } catch (e) {
      // Content script có thể đã được nạp tự động qua manifest
    }

    // 4. Gửi lệnh thực thi tới Content Script trên tab đó
    const response = await new Promise((resolve) => {
      chrome.tabs.sendMessage(
        tab.id,
        { action: "DO_POST", payload: { caption, images, targetUrl } },
        (res) => {
          if (chrome.runtime.lastError) {
            resolve({
              success: false,
              message: chrome.runtime.lastError.message || "Không thể kết nối với trang Facebook.",
            });
          } else {
            resolve(res || { success: false, message: "Không nhận được phản hồi từ trang Facebook." });
          }
        }
      );
    });

    // 5. Báo cáo kết quả về lại cho Social Desk Server
    if (response.success) {
      addLog(`✓ Đăng bài thành công lên "${targetName || 'Facebook'}"`, "success");
    } else {
      addLog(`✗ Đăng bài thất bại: ${response.message}`, "error");
    }

    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: "TASK_RESULT",
        taskId,
        draftId,
        status: response.success ? "published" : "failed",
        postUrl: response.postUrl || "",
        message: response.message || "",
      }));
    }
  } catch (err) {
    addLog(`Lỗi xử lý tác vụ: ${err.message}`, "error");
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: "TASK_RESULT",
        taskId,
        draftId,
        status: "failed",
        postUrl: "",
        message: `Lỗi Extension Chrome: ${err.message}`,
      }));
    }
  }
}

function waitForTabComplete(tabId) {
  return new Promise((resolve) => {
    function listener(id, info) {
      if (id === tabId && info.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);

    // Timeout an toàn sau 25s
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, 25000);
  });
}

// Lắng nghe message từ Popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "GET_STATUS") {
    sendResponse({
      connected: isConnected,
      logs: logs,
    });
    return true;
  }

  if (request.action === "RECONNECT") {
    if (socket) {
      try { socket.close(); } catch (e) {}
    }
    connectWebSocket();
    sendResponse({ ok: true });
    return true;
  }
});

// Khởi chạy kết nối khi extension được load
connectWebSocket();
