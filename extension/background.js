// Social Desk Connector - Background Service Worker (Manifest V3)
// Quản lý kết nối WebSocket, điều phối tác vụ đăng bài Facebook đa tài khoản

importScripts("background_task_handlers.js");

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
const MAX_LOGS = 50;

function generateDefaultCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let randomPart = "";
  for (let i = 0; i < 4; i++) {
    randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `SD-${randomPart}`;
}

async function getOrCreateExtensionCode() {
  const data = await chrome.storage.local.get("extensionCode");
  let code = (data.extensionCode || "").trim().toUpperCase();
  if (!code) {
    code = generateDefaultCode();
    await chrome.storage.local.set({ extensionCode: code });
    addLog(`Đã tự động khởi tạo mã nhận diện: [${code}]`, "info");
  }
  return code;
}

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
      version: manifest?.version || "1.2.6",
      fbName: stored.fbName || "",
      fbUrl: stored.fbUrl || "",
      time: Date.now(),
    }));
    addLog(`Đã kết nối Chrome [${code}] v${manifest?.version || '1.2.6'}` + (stored.fbName ? ` (Nick: ${stored.fbName})` : ""), "success");
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

      // Đăng ký mã Chrome này với máy chủ ngay khi kết nối
      missedPongCount = 0;
      sendRegistration();

      // Khởi động chu kỳ Heartbeat PING/PONG kiểm tra kết nối sống
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

// Tự động gửi lại đăng ký khi mã extension thay đổi trong storage
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.extensionCode) {
    const newCode = (changes.extensionCode.newValue || "").trim().toUpperCase();
    if (newCode && socket && socket.readyState === WebSocket.OPEN) {
      sendRegistration();
    }
  }
});

// Lắng nghe message từ Popup và Content Script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "FB_PROFILE_DETECTED") {
    const { fbName, fbUrl } = request;
    if (fbName && !/công cụ|kế hoạch|planner|quản trị|quản lý|chưa đọc/i.test(fbName)) {
      chrome.storage.local.set({ fbName, fbUrl });
      addLog(`Phát hiện nick Facebook: ${fbName}`, "success");
      sendRegistration();
    }
    sendResponse({ received: true });
    return false;
  }

  if (request.action === "REGISTER") {
    sendRegistration();
    sendResponse({ ok: true });
    return false;
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

  if (request.action === "INJECT_LEXICAL_CAPTION" || request.action === "INJECT_MAIN_WORLD_IG_CAPTION") {
    const tabId = sender.tab?.id;
    if (!tabId || !request.caption) {
      sendResponse({ success: false });
      return false;
    }
    chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: (text) => {
        try {
          // 1. Tìm phần tử Lexical editor trong hộp thoại tạo bài viết Instagram
          const el = document.querySelector('div[role="dialog"] div[data-lexical-editor="true"]') ||
                     document.querySelector('div[data-lexical-editor="true"]') ||
                     document.querySelector('div[role="dialog"] div[contenteditable="true"]');
          if (!el) return false;

          // 2. Tìm đối tượng Lexical Editor instance (từ DOM hoặc React Fiber)
          function getLexicalEditorInstance(targetEl) {
            if (targetEl.__lexicalEditor) return targetEl.__lexicalEditor;
            const container = targetEl.closest('div[data-lexical-editor="true"]') || targetEl;
            if (container.__lexicalEditor) return container.__lexicalEditor;

            // Quét React Fiber nếu chưa có trực tiếp trên element
            const fiberKey = Object.keys(container).find((k) => k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$"));
            if (fiberKey) {
              let curr = container[fiberKey];
              let depth = 0;
              while (curr && depth < 30) {
                if (curr.memoizedProps?.editor && typeof curr.memoizedProps.editor.setEditorState === "function") {
                  return curr.memoizedProps.editor;
                }
                if (curr.memoizedProps?.initialEditor && typeof curr.memoizedProps.initialEditor.setEditorState === "function") {
                  return curr.memoizedProps.initialEditor;
                }
                if (curr.stateNode?.__lexicalEditor) {
                  return curr.stateNode.__lexicalEditor;
                }
                let s = curr.memoizedState;
                while (s) {
                  if (s.memoizedState?.setEditorState && typeof s.memoizedState.setEditorState === "function") {
                    return s.memoizedState;
                  }
                  if (s.memoizedState?.editor && typeof s.memoizedState.editor.setEditorState === "function") {
                    return s.memoizedState.editor;
                  }
                  s = s.next;
                }
                curr = curr.return;
                depth++;
              }
            }
            return null;
          }

          const editor = getLexicalEditorInstance(el);
          if (editor) {
            try { editor.focus(); } catch (e) {}
          } else {
            el.focus();
          }

          // 3. Chuẩn bị cấu trúc Lexical State JSON chuẩn xác
          const lines = text.split(/\r?\n/);
          const paragraphs = lines.map((line) => {
            if (!line || line.trim().length === 0) {
              return {
                children: [],
                direction: "ltr",
                format: "",
                indent: 0,
                type: "paragraph",
                version: 1,
              };
            }
            return {
              children: [
                {
                  detail: 0,
                  format: 0,
                  mode: "normal",
                  style: "",
                  text: line,
                  type: "text",
                  version: 1,
                },
              ],
              direction: "ltr",
              format: "",
              indent: 0,
              type: "paragraph",
              version: 1,
            };
          });

          const lexicalState = {
            root: {
              children: paragraphs,
              direction: "ltr",
              format: "",
              indent: 0,
              type: "root",
              version: 1,
            },
          };

          let appliedViaLexical = false;

          // 4. Nạp trực tiếp qua Lexical Editor API (parseEditorState & setEditorState)
          if (editor && typeof editor.parseEditorState === "function" && typeof editor.setEditorState === "function") {
            try {
              const parsed = editor.parseEditorState(JSON.stringify(lexicalState));
              editor.setEditorState(parsed);
              if (typeof editor.focus === "function") editor.focus();
              appliedViaLexical = true;
            } catch (err) {
              console.warn("[Social Desk] Lỗi setEditorState Lexical:", err);
            }
          }

          // 5. Thử dispatch sự kiện beforeinput và paste với DataTransfer (Native Lexical PASTE_COMMAND)
          try {
            const dt = new DataTransfer();
            dt.setData("text/plain", text);
            dt.setData("text/html", text.replace(/\n/g, "<br>"));

            const beforeInputEvt = new InputEvent("beforeinput", {
              inputType: "insertFromPaste",
              dataTransfer: dt,
              bubbles: true,
              cancelable: true,
              composed: true,
            });
            el.dispatchEvent(beforeInputEvt);

            const pasteEvt = new ClipboardEvent("paste", {
              clipboardData: dt,
              bubbles: true,
              cancelable: true,
              composed: true,
            });
            el.dispatchEvent(pasteEvt);
          } catch (e) {}

          // 6. Phát sự kiện input và change
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));

          // 7. Kiểm tra trạng thái đã được Lexical xác nhận
          let astOk = false;
          if (editor && typeof editor.getEditorState === "function") {
            try {
              const s = JSON.stringify(editor.getEditorState().toJSON());
              astOk = s.length > 50 && !s.includes('"children":[]') && s.includes(text.slice(0, 10));
            } catch (e) {}
          }

          const lexicalSpans = el.querySelectorAll('span[data-lexical-text="true"]');
          let spanTextLen = 0;
          for (const sp of lexicalSpans) spanTextLen += (sp.textContent || "").length;

          return appliedViaLexical || astOk || spanTextLen >= Math.min(text.length * 0.4, 25);
        } catch (err) {
          console.error("[Social Desk] Lỗi tiêm caption Lexical:", err);
          return false;
        }
      },
      args: [request.caption],
    }).then((res) => sendResponse({ success: !!res?.[0]?.result })).catch(() => sendResponse({ success: false }));
    return true;
  }

  if (request.action === "RECONNECT") {
    reconnectAttempts = 0;
    if (socket) {
      try { socket.close(); } catch (e) {}
    }
    connectWebSocket();
    sendResponse({ ok: true });
    return false;
  }
});

// Khởi chạy kết nối ngay khi Extension được load
connectWebSocket();
