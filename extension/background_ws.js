// Social Desk Connector - WebSocket Connection Manager

let socket = null;
let isConnected = false;
let reconnectTimer = null;
let heartbeatTimer = null;
let pongTimeoutTimer = null;
let reconnectAttempts = 0;
let missedPongCount = 0;

const MIN_RECONNECT_MS = 1500;
const MAX_RECONNECT_MS = 20000;
const HEARTBEAT_INTERVAL_MS = 20000;
const PONG_TIMEOUT_MS = 25000;

async function getWsUrl() {
  const data = await chrome.storage.local.get("serverUrl");
  let base = (data.serverUrl || "http://localhost:3000").trim().replace(/\/+$/, "");
  if (base.startsWith("https://")) {
    return base.replace(/^https:\/\//, "wss://") + "/ws";
  }
  return base.replace(/^http:\/\//, "ws://") + "/ws";
}

async function sendRegistration() {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  try {
    const code = await getOrCreateExtensionCode();
    const stored = await chrome.storage.local.get(["fbName", "fbUrl"]);
    if (stored.fbName && /công cụ|kế hoạch|planner|quản trị|quản lý|chưa đọc/i.test(stored.fbName)) {
      await chrome.storage.local.remove(["fbName", "fbUrl"]);
      stored.fbName = "";
      stored.fbUrl = "";
    }
    const manifest = chrome.runtime.getManifest();
    socket.send(JSON.stringify({
      type: "REGISTER_EXTENSION",
      code: code,
      version: manifest?.version || "1.2.8",
      fbName: stored.fbName || "",
      fbUrl: stored.fbUrl || "",
      time: Date.now(),
    }));
    addLog(`Đã kết nối Chrome [${code}] v${manifest?.version || '1.2.8'}` + (stored.fbName ? ` (Nick: ${stored.fbName})` : ""), "success");
  } catch (err) {
    console.error("[Social Desk] Lỗi đăng ký:", err);
  }
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

  try {
    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      isConnected = true;
      reconnectAttempts = 0;
      updateBadge(true);
      addLog(`Đã kết nối Social Desk tại ${wsUrl}`, "success");

      missedPongCount = 0;
      sendRegistration();

      heartbeatTimer = setInterval(() => {
        if (socket && socket.readyState === WebSocket.OPEN) {
          try {
            socket.send(JSON.stringify({ type: "PING", time: Date.now() }));
            if (pongTimeoutTimer) clearTimeout(pongTimeoutTimer);
            pongTimeoutTimer = setTimeout(() => {
              missedPongCount++;
              if (missedPongCount >= 2) {
                console.warn("[Social Desk] Quá thời gian chờ PONG từ server 2 lần, kết nối lại...");
                if (socket) {
                  try { socket.close(); } catch (e) {}
                }
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
          missedPongCount = 0;
          if (pongTimeoutTimer) clearTimeout(pongTimeoutTimer);
          return;
        }

        if (msg.type === "REQUEST_REGISTRATION") {
          sendRegistration();
          return;
        }

        if (msg.type === "REGISTER_OK") {
          addLog(`Máy chủ đã xác nhận mã [${msg.code}] sẵn sàng!`, "success");
          return;
        }

        if (msg.type === "RELOAD_EXTENSION") {
          console.log("[Social Desk] Nhận lệnh nạp lại tiện ích từ máy chủ...");
          try {
            const stored = await chrome.storage.local.get("lastAutoReloadTime");
            const now = Date.now();
            if (stored.lastAutoReloadTime && now - stored.lastAutoReloadTime < 30000) {
              console.warn("[Social Desk] Tiện ích vừa nạp lại cách đây chưa đầy 30s. Bỏ qua để chống lặp vô tận.");
              return;
            }
            await chrome.storage.local.set({ lastAutoReloadTime: now });
          } catch {}
          addLog("Đang nạp lại tiện ích theo lệnh máy chủ...", "info");
          chrome.runtime.reload();
          return;
        }

        if (msg.action === "PUBLISH_POST") {
          handlePublishTask(msg);
        } else if (msg.action === "SCAN_POST_METRICS") {
          handleScanMetricsTask(msg);
        } else if (msg.action === "SWITCH_PROFILE") {
          handleSwitchProfileTask(msg);
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

