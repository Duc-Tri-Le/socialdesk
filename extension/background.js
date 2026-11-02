// Social Desk Connector - Background Service Worker (Manifest V3)
// Quản lý kết nối WebSocket, điều phối tác vụ đăng bài Facebook đa tài khoản

importScripts("background_ws.js", "background_publish.js", "background_task_handlers.js");

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
  return runningTaskIds.has(taskId) || processedTaskIds.has(taskId);
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
          const el = document.querySelector('div[role="dialog"] div[data-lexical-editor="true"]') ||
                     document.querySelector('div[data-lexical-editor="true"]') ||
                     document.querySelector('div[role="dialog"] div[contenteditable="true"]');
          if (!el) return false;

          function getLexicalEditorInstance(targetEl) {
            if (targetEl.__lexicalEditor) return targetEl.__lexicalEditor;
            const container = targetEl.closest('div[data-lexical-editor="true"]') || targetEl;
            if (container.__lexicalEditor) return container.__lexicalEditor;

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

          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));

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
