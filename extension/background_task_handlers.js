// Social Desk Connector - Background Task Handlers
// Điều phối tác vụ đăng bài Facebook và quét chỉ số tương tác

// Đảm bảo Content Script đã sẵn sàng trong Tab trước khi gửi lệnh
async function ensureContentScriptReady(tabId, maxRetries = 4, isIg = false) {
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

    try {
      const scriptFiles = isIg
        ? ["instagram_utils.js", "instagram_content.js"]
        : ["content_utils.js", "content_profile.js", "content_composer.js", "content.js"];
      await chrome.scripting.executeScript({
        target: { tabId },
        files: scriptFiles,
      });
    } catch (e) {
      console.warn(`[Social Desk] Lần ${attempt} nạp script:`, e.message);
    }

    await new Promise((r) => setTimeout(r, 600));
  }

  return false;
}

// Hàm điều phối chung: Rạch ròi 4 kênh đăng bài độc lập
async function handlePublishTask(task) {
  const { taskId, draftId, targetKind = "" } = task;

  if (isTaskAlreadyHandled(taskId)) {
    console.warn(`[Social Desk] Bỏ qua taskId trùng lặp: ${taskId}`);
    addLog(`Bỏ qua yêu cầu đăng trùng lặp cho tác vụ #${taskId}`, "info");
    return;
  }
  runningTaskIds.add(taskId);

  const kind = targetKind.toLowerCase().trim();
  console.log(`[Social Desk] Phân loại điều phối kênh: [${kind}] - "${task.targetName || ''}"`);

  if (kind === "page") {
    return handlePublishToFanpage(task);
  } else if (kind === "group") {
    return handlePublishToGroup(task);
  } else if (kind === "instagram") {
    return handlePublishToInstagram(task);
  } else if (kind === "account") {
    return handlePublishToPersonalAccount(task);
  } else {
    const targetUrl = (task.targetUrl || "").toLowerCase();
    if (targetUrl.includes("instagram.com")) {
      return handlePublishToInstagram(task);
    } else if (targetUrl.includes("/groups/")) {
      return handlePublishToGroup(task);
    } else if (targetUrl.includes("facebook.com")) {
      return handlePublishToFanpage(task);
    } else {
      markTaskProcessed(taskId);
      addLog(`Kênh đăng không hợp lệ: "${kind}"`, "error");
      sendTaskResult({
        taskId,
        draftId,
        status: "failed",
        postUrl: "",
        message: `Kênh đăng không được hỗ trợ: ${kind}`,
      });
    }
  }
}

// Xử lý quét chỉ số tương tác bài viết Facebook và Instagram
async function handleScanMetricsTask(task) {
  const { taskId, postUrl } = task;
  if (!postUrl) {
    sendTaskResult({
      taskId,
      status: "failed",
      message: "Không có URL bài viết để quét",
    });
    return;
  }

  const isIg = (postUrl || "").includes("instagram.com");
  const platformLabel = isIg ? "Instagram" : "Facebook";

  addLog(`Bắt đầu quét chỉ số bài viết ${platformLabel}...`, "info");
  let createdTabId = null;

  try {
    const tab = await chrome.tabs.create({ url: postUrl, active: false });
    createdTabId = tab.id;

    await waitForTabComplete(createdTabId, 15000);
    await new Promise((r) => setTimeout(r, 2000));

    const ready = await ensureContentScriptReady(createdTabId, 4, isIg);
    if (!ready) {
      throw new Error(`Không thể kết nối với trang ${platformLabel} để đọc chỉ số`);
    }

    try {
      await chrome.scripting.executeScript({
        target: { tabId: createdTabId },
        func: () => { window.scrollBy(0, 350); },
      });
      await new Promise((r) => setTimeout(r, 700));
    } catch (e) {}

    const metrics = await new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(createdTabId, { action: "SCRAPE_POST_METRICS" }, (res) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(res || {});
        }
      });
    });

    addLog(
      `✓ Đã quét chỉ số ${platformLabel}: ${metrics.likes || 0} Like, ${metrics.comments || 0} Bình luận, ${metrics.shares || 0} Chia sẻ`,
      "success"
    );

    sendTaskResult({
      taskId,
      status: "success",
      likes: metrics.likes || 0,
      comments: metrics.comments || 0,
      shares: metrics.shares || 0,
      reach: metrics.reach || 0,
      postUrl: metrics.postUrl || postUrl,
      message: `Quét tương tác bài viết ${platformLabel} thành công`,
    });
  } catch (err) {
    addLog(`✗ Lỗi quét chỉ số ${platformLabel}: ${err.message}`, "error");
    sendTaskResult({
      taskId,
      status: "failed",
      message: `Lỗi quét chỉ số: ${err.message}`,
    });
  } finally {
    if (createdTabId) {
      try {
        await chrome.tabs.remove(createdTabId);
      } catch (e) {}
    }
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

function waitForTabComplete(tabId, timeoutMs = 25000, checkImmediate = true) {
  return new Promise((resolve) => {
    let resolved = false;

    if (checkImmediate) {
      chrome.tabs.get(tabId, (tab) => {
        if (!chrome.runtime.lastError && tab && tab.status === "complete") {
          cleanup();
          resolve();
        }
      });
    }

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

// Xử lý tác vụ chuyển đổi Profile Facebook tự động trên Chrome
async function handleSwitchProfileTask(task) {
  const { taskId, targetName = "", targetUrl = "https://www.facebook.com/" } = task;
  addLog(`Bắt đầu chuyển sang tài khoản: "${targetName || 'Facebook'}"...`, "info");
  try {
    const fbTabs = await chrome.tabs.query({ url: "*://*.facebook.com/*" });
    let tab = fbTabs.find((t) => t.active) || fbTabs[0];
    if (tab) {
      await chrome.tabs.update(tab.id, { url: targetUrl, active: true });
    } else {
      tab = await chrome.tabs.create({ url: targetUrl, active: true });
    }
    await waitForTabComplete(tab.id, 20000);
    await new Promise((r) => setTimeout(r, 2000));
    const ready = await ensureContentScriptReady(tab.id, 3, false);
    if (!ready) throw new Error("Không thể kết nối với script điều khiển trên tab Facebook.");

    const res = await new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tab.id, { action: "DO_SWITCH_PROFILE", targetName }, (r) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(r || { success: false, message: "Không nhận được phản hồi chuyển profile" });
      });
    });

    if (res.success) {
      addLog(`✓ ${res.message}`, "success");
    } else {
      addLog(`✗ ${res.message}`, "error");
    }
    sendTaskResult({ taskId, status: res.success ? "success" : "failed", message: res.message });
  } catch (err) {
    addLog(`✗ Lỗi chuyển tài khoản: ${err.message}`, "error");
    sendTaskResult({ taskId, status: "failed", message: err.message });
  }
}
