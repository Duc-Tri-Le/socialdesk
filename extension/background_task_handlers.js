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

    // Nếu chưa phản hồi, chủ động nạp script vào tab
    try {
      const scriptFiles = isIg
        ? ["instagram_content.js"]
        : ["content_utils.js", "content.js"];
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

  // 1. Kiểm tra chống trùng lặp Task ID (Idempotency)
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
    // Tự động phân loại dựa trên URL nếu targetKind chưa được truyền chuẩn xác
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

// ----------------------------------------------------
// KÊNH 1: ĐĂNG BÀI LÊN FANPAGE FACEBOOK
// ----------------------------------------------------
async function handlePublishToFanpage(task) {
  const { taskId, draftId, targetUrl, caption, images = [], targetName } = task;
  const safeTargetUrl = (targetUrl || "https://www.facebook.com/").trim();

  try {
    const parsed = new URL(safeTargetUrl);
    if (!parsed.hostname.endsWith("facebook.com")) {
      throw new Error(`URL Fanpage không hợp lệ: ${parsed.hostname}`);
    }
  } catch (err) {
    markTaskProcessed(taskId);
    sendTaskResult({ taskId, draftId, status: "failed", postUrl: "", message: err.message });
    return;
  }

  addLog(`[Fanpage] Bắt đầu xử lý đăng lên Fanpage: "${targetName || 'Fanpage'}"...`, "info");
  let createdTabId = null;

  try {
    const tab = await chrome.tabs.create({ url: safeTargetUrl, active: true });
    createdTabId = tab.id;

    await waitForTabComplete(tab.id, 30000);
    addLog(`[Fanpage] Trang đã tải, kiểm tra quyền truy cập và ngữ cảnh Fanpage...`, "");
    await new Promise((r) => setTimeout(r, 2500));

    let scriptReady = await ensureContentScriptReady(tab.id, 4, false);
    if (!scriptReady) throw new Error("Không thể kết nối với script điều khiển trên tab Facebook.");

    // Bước kiểm tra chuyển đổi Profile Fanpage an toàn (Pre-flight handshake)
    // Nếu Facebook có nút "Chuyển ngay" sang Page, bấm chuyển và đợi trang tải lại trước khi gửi lệnh đăng
    const prepRes = await new Promise((resolve) => {
      chrome.tabs.sendMessage(tab.id, { action: "PREPARE_FANPAGE_CONTEXT", targetName: targetName || "" }, (r) => {
        if (chrome.runtime.lastError || !r) resolve({ needsSwitch: false });
        else resolve(r);
      });
    });

    if (prepRes && prepRes.needsSwitch) {
      addLog(`[Fanpage] Đang chuyển đổi sang Profile Fanpage "${targetName}"...`, "info");
      await new Promise((r) => setTimeout(r, 1500));
      await waitForTabComplete(tab.id, 25000, false);
      await new Promise((r) => setTimeout(r, 3000));
      scriptReady = await ensureContentScriptReady(tab.id, 4, false);
      if (!scriptReady) throw new Error("Mất kết nối script điều khiển sau khi chuyển sang Profile Fanpage.");
    }

    // Gửi lệnh đăng chuyên biệt cho Fanpage
    let response = await executeTabPostAction(tab.id, "DO_FANPAGE_POST", {
      caption,
      images,
      targetUrl: safeTargetUrl,
      targetKind: "page",
      targetName: targetName || "",
      taskId,
    }, false);

    // Nếu response báo needsSwitch = true (phát hiện nút chuyển muộn trong DO_FANPAGE_POST)
    if (response && response.needsSwitch) {
      addLog(`[Fanpage] Nhận diện yêu cầu chuyển Profile Fanpage "${targetName}", đang chuyển...`, "info");
      await new Promise((r) => setTimeout(r, 1500));
      await waitForTabComplete(tab.id, 25000, false);
      await new Promise((r) => setTimeout(r, 3000));
      scriptReady = await ensureContentScriptReady(tab.id, 4, false);
      if (!scriptReady) throw new Error("Mất kết nối script điều khiển sau khi chuyển Profile Fanpage.");

      response = await executeTabPostAction(tab.id, "DO_FANPAGE_POST", {
        caption,
        images,
        targetUrl: safeTargetUrl,
        targetKind: "page",
        targetName: targetName || "",
        taskId,
      }, false);
    }

    markTaskProcessed(taskId);

    if (response.success) {
      addLog(`✓ [Fanpage] Đăng bài thành công lên Fanpage "${targetName || 'Facebook'}"`, "success");
    } else {
      addLog(`✗ [Fanpage] Đăng bài thất bại: ${response.message}`, "error");
    }

    sendTaskResult({
      taskId,
      draftId,
      status: response.success ? "published" : "failed",
      postUrl: response.postUrl || safeTargetUrl,
      message: response.message || (response.success ? "Đã đăng bài thành công lên Fanpage" : "Lỗi đăng Fanpage"),
    });

  } catch (err) {
    markTaskProcessed(taskId);
    addLog(`[Fanpage] Lỗi tác vụ #${taskId}: ${err.message}`, "error");
    sendTaskResult({
      taskId,
      draftId,
      status: "failed",
      postUrl: "",
      message: `Lỗi đăng Fanpage: ${err.message}`,
    });
  }
}

// ----------------------------------------------------
// KÊNH 2: ĐĂNG BÀI VÀO NHÓM FACEBOOK (GROUP)
// ----------------------------------------------------
async function handlePublishToGroup(task) {
  const { taskId, draftId, targetUrl, caption, images = [], targetName } = task;
  const safeTargetUrl = (targetUrl || "https://www.facebook.com/groups/").trim();

  try {
    const parsed = new URL(safeTargetUrl);
    if (!parsed.hostname.endsWith("facebook.com")) {
      throw new Error(`URL Nhóm không hợp lệ: ${parsed.hostname}`);
    }
  } catch (err) {
    markTaskProcessed(taskId);
    sendTaskResult({ taskId, draftId, status: "failed", postUrl: "", message: err.message });
    return;
  }

  addLog(`[Nhóm] Bắt đầu xử lý đăng vào Nhóm: "${targetName || 'Hội nhóm'}"...`, "info");

  try {
    const tab = await chrome.tabs.create({ url: safeTargetUrl, active: true });
    await waitForTabComplete(tab.id, 30000);
    await new Promise((r) => setTimeout(r, 2500));

    const scriptReady = await ensureContentScriptReady(tab.id, 4, false);
    if (!scriptReady) throw new Error("Không thể kết nối với script điều khiển trên tab Nhóm Facebook.");

    // Gửi lệnh đăng chuyên biệt cho Nhóm
    const response = await executeTabPostAction(tab.id, "DO_GROUP_POST", {
      caption,
      images,
      targetUrl: safeTargetUrl,
      targetKind: "group",
      targetName: targetName || "",
      taskId,
    }, false);

    markTaskProcessed(taskId);

    const extraMsg = response.pendingApproval ? " (Đang chờ Quản trị viên duyệt)" : "";
    if (response.success) {
      addLog(`✓ [Nhóm] Đăng bài thành công vào nhóm "${targetName || 'Facebook'}"${extraMsg}`, "success");
    } else {
      addLog(`✗ [Nhóm] Đăng bài vào nhóm thất bại: ${response.message}`, "error");
    }

    sendTaskResult({
      taskId,
      draftId,
      status: response.success ? "published" : "failed",
      postUrl: response.postUrl || safeTargetUrl,
      message: response.message || (response.success ? `Đã đăng bài vào nhóm${extraMsg}` : "Lỗi đăng Nhóm"),
      pendingApproval: !!response.pendingApproval,
    });

  } catch (err) {
    markTaskProcessed(taskId);
    addLog(`[Nhóm] Lỗi tác vụ #${taskId}: ${err.message}`, "error");
    sendTaskResult({
      taskId,
      draftId,
      status: "failed",
      postUrl: "",
      message: `Lỗi đăng Nhóm Facebook: ${err.message}`,
    });
  }
}

// ----------------------------------------------------
// KÊNH 3: ĐĂNG BÀI LÊN TÀI KHOẢN CHÍNH / TRANG CÁ NHÂN FACEBOOK
// ----------------------------------------------------
async function handlePublishToPersonalAccount(task) {
  const { taskId, draftId, targetUrl, caption, images = [], targetName } = task;
  const safeTargetUrl = (targetUrl || "https://www.facebook.com/").trim();

  try {
    const parsed = new URL(safeTargetUrl);
    if (!parsed.hostname.endsWith("facebook.com")) {
      throw new Error(`URL Facebook không hợp lệ: ${parsed.hostname}`);
    }
  } catch (err) {
    markTaskProcessed(taskId);
    sendTaskResult({ taskId, draftId, status: "failed", postUrl: "", message: err.message });
    return;
  }

  addLog(`[Cá nhân] Bắt đầu đăng lên Trang cá nhân: "${targetName || 'Facebook'}"...`, "info");

  try {
    const tab = await chrome.tabs.create({ url: safeTargetUrl, active: true });
    await waitForTabComplete(tab.id, 30000);
    await new Promise((r) => setTimeout(r, 2500));

    const scriptReady = await ensureContentScriptReady(tab.id, 4, false);
    if (!scriptReady) throw new Error("Không thể kết nối với script điều khiển trên tab Facebook.");

    // Gửi lệnh đăng chuyên biệt cho Trang cá nhân
    const response = await executeTabPostAction(tab.id, "DO_PERSONAL_ACCOUNT_POST", {
      caption,
      images,
      targetUrl: safeTargetUrl,
      targetKind: "account",
      targetName: targetName || "",
      taskId,
    }, false);

    markTaskProcessed(taskId);

    if (response.success) {
      addLog(`✓ [Cá nhân] Đăng bài thành công lên Trang cá nhân "${targetName || 'Facebook'}"`, "success");
    } else {
      addLog(`✗ [Cá nhân] Đăng bài thất bại: ${response.message}`, "error");
    }

    sendTaskResult({
      taskId,
      draftId,
      status: response.success ? "published" : "failed",
      postUrl: response.postUrl || safeTargetUrl,
      message: response.message || (response.success ? "Đã đăng bài lên trang cá nhân" : "Lỗi đăng cá nhân"),
    });

  } catch (err) {
    markTaskProcessed(taskId);
    addLog(`[Cá nhân] Lỗi tác vụ #${taskId}: ${err.message}`, "error");
    sendTaskResult({
      taskId,
      draftId,
      status: "failed",
      postUrl: "",
      message: `Lỗi đăng Trang cá nhân Facebook: ${err.message}`,
    });
  }
}

// ----------------------------------------------------
// KÊNH 4: ĐĂNG BÀI LÊN INSTAGRAM
// ----------------------------------------------------
async function handlePublishToInstagram(task) {
  const { taskId, draftId, targetUrl, caption, images = [], targetName } = task;
  const safeTargetUrl = (targetUrl || "https://www.instagram.com/").trim();

  try {
    const parsed = new URL(safeTargetUrl);
    if (!parsed.hostname.endsWith("instagram.com")) {
      throw new Error(`URL Instagram không hợp lệ: ${parsed.hostname}`);
    }
  } catch (err) {
    markTaskProcessed(taskId);
    sendTaskResult({ taskId, draftId, status: "failed", postUrl: "", message: err.message });
    return;
  }

  addLog(`[Instagram] Bắt đầu đăng bài lên Instagram: "${targetName || 'Instagram'}"...`, "info");

  try {
    const tab = await chrome.tabs.create({ url: safeTargetUrl, active: true });
    await waitForTabComplete(tab.id, 30000);
    await new Promise((r) => setTimeout(r, 2500));

    const scriptReady = await ensureContentScriptReady(tab.id, 4, true);
    if (!scriptReady) throw new Error("Không thể kết nối với script điều khiển trên tab Instagram.");

    // Gửi lệnh đăng chuyên biệt cho Instagram
    const response = await executeTabPostAction(tab.id, "DO_INSTAGRAM_POST", {
      caption,
      images,
      targetUrl: safeTargetUrl,
      profileUrl: task.profileUrl || safeTargetUrl,
      targetKind: "instagram",
      targetName: targetName || "",
      taskId,
    }, true);

    markTaskProcessed(taskId);

    if (response.success) {
      addLog(`✓ [Instagram] Đăng bài thành công lên Instagram "${targetName || 'Instagram'}"`, "success");
    } else {
      addLog(`✗ [Instagram] Đăng bài thất bại: ${response.message}`, "error");
    }

    sendTaskResult({
      taskId,
      draftId,
      status: response.success ? "published" : "failed",
      postUrl: response.postUrl || safeTargetUrl,
      message: response.message || (response.success ? "Đã đăng bài lên Instagram" : "Lỗi đăng Instagram"),
    });

  } catch (err) {
    markTaskProcessed(taskId);
    addLog(`[Instagram] Lỗi tác vụ #${taskId}: ${err.message}`, "error");
    sendTaskResult({
      taskId,
      draftId,
      status: "failed",
      postUrl: "",
      message: `Lỗi đăng Instagram: ${err.message}`,
    });
  }
}

// Hàm hỗ trợ gửi lệnh đăng và tự động kết nối lại nếu trang điều hướng
async function executeTabPostAction(targetTabId, actionName, payload, isIg = false, timeoutMs = 90000) {
  const platformLabel = isIg ? "Instagram" : "Facebook";

  const actionPromise = (async () => {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await new Promise((resolve, reject) => {
          chrome.tabs.sendMessage(
            targetTabId,
            { action: actionName, payload },
            (r) => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message || `Mất liên lạc với trang ${platformLabel}`));
              } else {
                resolve(r || { success: false, message: `Không nhận được phản hồi kết quả từ ${platformLabel}` });
              }
            }
          );
        });
        return res;
      } catch (err) {
        const isChannelClosed = err.message && (
          err.message.includes("message channel closed") ||
          err.message.includes("Could not establish connection")
        );
        if (isChannelClosed && attempt < 3) {
          addLog(`Trang ${platformLabel} đang chuyển trang / tải lại, đợi trang ổn định (lần ${attempt})...`, "info");
          await new Promise((r) => setTimeout(r, 2000));
          await waitForTabComplete(targetTabId, 25000, false);
          await new Promise((r) => setTimeout(r, 2500));
          const ready = await ensureContentScriptReady(targetTabId, 4, isIg);
          if (ready) continue;
        }
        throw err;
      }
    }
  })();

  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`Quá thời gian xử lý đăng bài trên ${platformLabel} (90 giây).`)), timeoutMs);
  });

  return await Promise.race([actionPromise, timeoutPromise]);
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
    // Chờ 2 giây để giao diện tải đầy đủ các nút tương tác
    await new Promise((r) => setTimeout(r, 2000));

    const ready = await ensureContentScriptReady(createdTabId, 4, isIg);
    if (!ready) {
      throw new Error(`Không thể kết nối với trang ${platformLabel} để đọc chỉ số`);
    }

    // Cuộn nhẹ một đoạn để kích hoạt tải dữ liệu tương tác lười (lazy load) nếu là Feed
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

