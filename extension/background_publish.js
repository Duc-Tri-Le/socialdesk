// Social Desk Connector - Background Publishing Handlers
// Chứa logic đăng bài cho từng kênh: Fanpage, Group, Personal Account, Instagram

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

    let response = await executeTabPostAction(tab.id, "DO_FANPAGE_POST", {
      caption,
      images,
      targetUrl: safeTargetUrl,
      targetKind: "page",
      targetName: targetName || "",
      taskId,
    }, false);

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

