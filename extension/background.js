// Social Desk Connector - Background Service Worker (Manifest V3)
// Quản lý kết nối WebSocket, điều phối tác vụ đăng bài Facebook đa tài khoản

importScripts("background_task_handlers.js");

let socket = null;
let isConnected = false;
let reconnectTimer = null;
let heartbeatTimer = null;
let pongTimeoutTimer = null;
let reconnectAttempts = 0;

const MIN_RECONNECT_MS = 2000;
const MAX_RECONNECT_MS = 30000;
const HEARTBEAT_INTERVAL_MS = 25000;
const PONG_TIMEOUT_MS = 12000;
const MAX_LOGS = 50;

// Bộ nhớ đệm chống xử lý trùng lặp Task ID (Idempotency)
const processedTaskIds = new Set();
const runningTaskIds = new Set();

function isTaskAlreadyHandled(taskId) {
  if (!taskId) return false;
  if (runningTaskIds.has(taskId) || processedTaskIds.has(taskId)) {
    return true;
  }
  return false;
}

function markTaskProcessed(taskId) {
  if (!taskId) return;
  runningTaskIds.delete(taskId);
  processedTaskIds.add(taskId);
  if (processedTaskIds.size > 200) {
    const first = processedTaskIds.values().next().value;
    processedTaskIds.delete(first);
  }
}

async function addLog(text, type = "") {
  const item = { time: Date.now(), text, type };
  try {
    const data = await chrome.storage.local.get("logs");
    const stored = data.logs || [];
    stored.push(item);
    if (stored.length > MAX_LOGS) stored.shift();
    await chrome.storage.local.set({ logs: stored });
  } catch (e) {
    // Không làm gián đoạn luồng nếu storage tạm thời lỗi
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

function scheduleReconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  const factor = Math.min(reconnectAttempts, 6);
  const delay = Math.min(MIN_RECONNECT_MS * Math.pow(1.5, factor), MAX_RECONNECT_MS);
  reconnectAttempts++;

  addLog(`Mất kết nối máy chủ Social Desk — thử lại sau ${Math.round(delay / 1000)}s...`, "error");
  reconnectTimer = setTimeout(() => {
    connectWebSocket();
  }, delay);
}

async function connectWebSocket() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }

  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  if (pongTimeoutTimer) clearTimeout(pongTimeoutTimer);

  const wsUrl = await getWsUrl();
  const data = await chrome.storage.local.get("extensionCode");
  const code = (data.extensionCode || "").trim().toUpperCase();

  try {
    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      isConnected = true;
      reconnectAttempts = 0;
      updateBadge(true);
      addLog(`Đã kết nối Social Desk tại ${wsUrl}`, "success");

      // Đăng ký mã Chrome này với máy chủ kèm tên nick Facebook nếu có
      chrome.storage.local.get(["extensionCode", "fbName", "fbUrl"]).then((stored) => {
        const c = (stored.extensionCode || code || "").trim().toUpperCase();
        if (c && socket && socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({
            type: "REGISTER_EXTENSION",
            code: c,
            fbName: stored.fbName || "",
            fbUrl: stored.fbUrl || "",
            time: Date.now()
          }));
          addLog(`Đã đăng ký mã nhận diện: [${c}]` + (stored.fbName ? ` (Nick: ${stored.fbName})` : ""), "success");
        }
      });

      // Khởi động chu kỳ Heartbeat PING/PONG kiểm tra kết nối sống
      heartbeatTimer = setInterval(() => {
        if (socket && socket.readyState === WebSocket.OPEN) {
          try {
            socket.send(JSON.stringify({ type: "PING", time: Date.now() }));
            // Đặt hẹn giờ kiểm tra PONG phản hồi
            if (pongTimeoutTimer) clearTimeout(pongTimeoutTimer);
            pongTimeoutTimer = setTimeout(() => {
              console.warn("[Social Desk] Không nhận được PONG từ server, ngắt kết nối để thử lại...");
              if (socket) {
                try { socket.close(); } catch (e) {}
              }
            }, PONG_TIMEOUT_MS);
          } catch (e) {
            console.error("[Social Desk] Lỗi gửi PING:", e);
          }
        }
      }, HEARTBEAT_INTERVAL_MS);
    };

    socket.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === "PONG") {
          if (pongTimeoutTimer) clearTimeout(pongTimeoutTimer);
          return;
        }

        if (msg.type === "REGISTER_OK") {
          addLog(`Máy chủ đã sẵn sàng cho mã [${msg.code}]`, "success");
          return;
        }

        if (msg.action === "PUBLISH_POST") {
          handlePublishTask(msg);
        } else if (msg.action === "SCAN_POST_METRICS") {
          handleScanMetricsTask(msg);
        }
      } catch (e) {
        console.error("[Social Desk] Lỗi phân tích gói tin WebSocket:", e);
      }
    };

    socket.onclose = () => {
      isConnected = false;
      updateBadge(false);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (pongTimeoutTimer) clearTimeout(pongTimeoutTimer);
      scheduleReconnect();
    };

    socket.onerror = () => {
      isConnected = false;
      updateBadge(false);
      try { socket.close(); } catch (e) {}
    };
  } catch (err) {
    isConnected = false;
    updateBadge(false);
    scheduleReconnect();
  }
}

// Lắng nghe message từ Popup và Content Script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "FB_PROFILE_DETECTED") {
    const { fbName, fbUrl } = request;
    if (fbName) {
      chrome.storage.local.set({ fbName, fbUrl });
      addLog(`Phát hiện nick Facebook: ${fbName}`, "success");
    }
    // Gửi cập nhật tên nick lên server ngay
    if (socket && socket.readyState === WebSocket.OPEN) {
      chrome.storage.local.get(["extensionCode"]).then((data) => {
        const code = (data.extensionCode || "").trim().toUpperCase();
        if (code) {
          socket.send(JSON.stringify({
            type: "REGISTER_EXTENSION",
            code: code,
            fbName: fbName || "",
            fbUrl: fbUrl || "",
            time: Date.now(),
          }));
        }
      });
    }
    sendResponse({ received: true });
    return true;
  }

  if (request.action === "GET_STATUS") {
    chrome.storage.local.get("logs").then((data) => {
      sendResponse({
        connected: isConnected,
        logs: data.logs || [],
      });
    }).catch(() => {
      sendResponse({ connected: isConnected, logs: [] });
    });
    return true;
  }

  if (request.action === "FETCH_IMAGE") {
    fetch(request.url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        const reader = new FileReader();
        reader.onloadend = () => sendResponse({ success: true, dataUrl: reader.result });
        reader.onerror = (e) => sendResponse({ success: false, error: e.message });
        reader.readAsDataURL(blob);
      })
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === "RECONNECT") {
    reconnectAttempts = 0;
    if (socket) {
      try { socket.close(); } catch (e) {}
    }
    connectWebSocket();
    sendResponse({ ok: true });
    return true;
  }
});

// Khởi chạy kết nối ngay khi Extension được load
connectWebSocket();
