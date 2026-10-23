// Social Desk Connector - Background Service Worker (Manifest V3)
// Quản lý kết nối WebSocket, điều phối tác vụ đăng bài Facebook đa tài khoản

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

// Đảm bảo Content Script đã sẵn sàng trong Tab trước khi gửi lệnh
async function ensureContentScriptReady(tabId, maxRetries = 4) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const isAlive = await new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, { action: "PING" }, (res) => {
        if (chrome.runtime.lastError || !res || !res.pong) {
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });

    if (isAlive) return true;

    // Nếu chưa phản hồi, chủ động nạp content.js vào tab
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["content.js"],
      });
    } catch (e) {
      console.warn(`[Social Desk] Lần ${attempt} nạp script:`, e.message);
    }

    await new Promise((r) => setTimeout(r, 600));
  }

  return false;
}

// Xử lý tác vụ đăng bài Facebook an toàn
async function handlePublishTask(task) {
  const { taskId, draftId, targetUrl, caption, images = [], targetName } = task;

  // 1. Kiểm tra chống trùng lặp Task ID (Idempotency)
  if (isTaskAlreadyHandled(taskId)) {
    console.warn(`[Social Desk] Bỏ qua taskId trùng lặp: ${taskId}`);
    addLog(`Bỏ qua yêu cầu đăng trùng lặp cho tác vụ #${taskId}`, "info");
    return;
  }
  runningTaskIds.add(taskId);

  // 2. Xác thực URL đích an toàn (phải thuộc tên miền facebook.com)
  const safeTargetUrl = (targetUrl || "https://www.facebook.com/").trim();
  try {
    const parsed = new URL(safeTargetUrl);
    if (!parsed.hostname.endsWith("facebook.com")) {
      throw new Error(`Tên miền không hợp lệ: ${parsed.hostname}. Chỉ chấp nhận facebook.com.`);
    }
  } catch (urlErr) {
    markTaskProcessed(taskId);
    addLog(`Từ chối URL không an toàn: ${urlErr.message}`, "error");
    sendTaskResult({
      taskId,
      draftId,
      status: "failed",
      postUrl: "",
      message: `Bảo mật: ${urlErr.message}`,
    });
    return;
  }

  addLog(`Bắt đầu xử lý đăng bài: "${targetName || 'Facebook'}"...`, "info");

  let createdTabId = null;

  try {
    // 3. Mở tab Facebook đích
    const tab = await chrome.tabs.create({
      url: safeTargetUrl,
      active: true,
    });
    createdTabId = tab.id;

    // 4. Chờ tab hoàn tất tải DOM
    await waitForTabComplete(tab.id, 30000);
    addLog("Trang Facebook đã tải xong, đang kiểm tra giao diện...", "");

    // Đợi 2.5s để React / Lexical editor khởi tạo
    await new Promise((r) => setTimeout(r, 2500));

    // 5. Kiểm tra & Bắt tay với Content Script
    const scriptReady = await ensureContentScriptReady(tab.id);
    if (!scriptReady) {
      throw new Error("Không thể kết nối với script điều khiển trên trang Facebook. Vui lòng kiểm tra quyền truy cập tab.");
    }

    // 6. Gửi lệnh đăng bài kèm thời gian chờ tối đa (90s)
    const postPromise = new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(
        tab.id,
        {
          action: "DO_POST",
          payload: { caption, images, targetUrl: safeTargetUrl, taskId },
        },
        (res) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message || "Mất liên lạc với trang Facebook"));
          } else {
            resolve(res || { success: false, message: "Không nhận được phản hồi kết quả từ Facebook" });
          }
        }
      );
    });

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Quá thời gian xử lý đăng bài (90 giây).")), 90000);
    });

    const response = await Promise.race([postPromise, timeoutPromise]);

    markTaskProcessed(taskId);

    // 7. Báo cáo kết quả chi tiết về máy chủ
    if (response.success) {
      const extraMsg = response.pendingApproval ? " (Đang chờ Quản trị viên duyệt)" : "";
      addLog(`✓ Đăng bài thành công lên "${targetName || 'Facebook'}"${extraMsg}`, "success");
    } else {
      addLog(`✗ Đăng bài thất bại: ${response.message}`, "error");
    }

    sendTaskResult({
      taskId,
      draftId,
      status: response.success ? "published" : "failed",
      postUrl: response.postUrl || safeTargetUrl,
      message: response.message || (response.success ? "Đã đăng bài thành công" : "Lỗi không xác định"),
      pendingApproval: !!response.pendingApproval,
    });

  } catch (err) {
    markTaskProcessed(taskId);
    addLog(`Lỗi xử lý tác vụ #${taskId}: ${err.message}`, "error");
    sendTaskResult({
      taskId,
      draftId,
      status: "failed",
      postUrl: "",
      message: `Lỗi Extension Chrome: ${err.message}`,
    });
  }
}

function sendTaskResult(data) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    try {
      socket.send(JSON.stringify({
        type: "TASK_RESULT",
        ...data,
      }));
    } catch (e) {
      console.error("[Social Desk] Không thể gửi TASK_RESULT về server:", e);
    }
  }
}

function waitForTabComplete(tabId, timeoutMs = 25000) {
  return new Promise((resolve) => {
    let resolved = false;
    function listener(id, info) {
      if (id === tabId && info.status === "complete") {
        cleanup();
        resolve();
      }
    }

    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, timeoutMs);

    function cleanup() {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
    }

    chrome.tabs.onUpdated.addListener(listener);
  });
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
