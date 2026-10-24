// Social Desk Connector - Background Task Handlers
// Điều phối tác vụ đăng bài Facebook và quét chỉ số tương tác

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

    // Nếu chưa phản hồi, chủ động nạp script vào tab
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["content_utils.js", "content.js"],
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

// Xử lý quét chỉ số tương tác bài viết Facebook
async function handleScanMetricsTask(task) {
  const { taskId, postUrl } = task;
  if (!postUrl) {
    sendTaskResult({
      taskId,
      status: "failed",
      message: "Không có URL bài viết Facebook để quét",
    });
    return;
  }

  addLog(`Bắt đầu quét chỉ số bài viết Facebook...`, "info");
  let createdTabId = null;

  try {
    const tab = await chrome.tabs.create({ url: postUrl, active: false });
    createdTabId = tab.id;

    await waitForTabComplete(createdTabId, 25000);
    // Chờ 2 giây để giao diện Facebook hiển thị đầy đủ các nút tương tác
    await new Promise((r) => setTimeout(r, 2000));

    const ready = await ensureContentScriptReady(createdTabId, 4);
    if (!ready) {
      throw new Error("Không thể kết nối với trang Facebook để đọc chỉ số");
    }

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
      `✓ Đã quét chỉ số: ${metrics.likes || 0} Like, ${metrics.comments || 0} Bình luận, ${metrics.shares || 0} Chia sẻ`,
      "success"
    );

    sendTaskResult({
      taskId,
      status: "success",
      likes: metrics.likes || 0,
      comments: metrics.comments || 0,
      shares: metrics.shares || 0,
      reach: metrics.reach || 0,
      message: "Quét tương tác bài viết thành công",
    });
  } catch (err) {
    addLog(`✗ Lỗi quét chỉ số: ${err.message}`, "error");
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
