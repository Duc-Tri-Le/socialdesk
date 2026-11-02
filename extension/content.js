// Social Desk Connector - Facebook Automation Content Script
// Rạch ròi quy trình tự động hóa cho 3 kênh Facebook: Fanpage, Nhóm, Trang cá nhân

if (!window.__socialDeskFbScriptLoaded) {
  window.__socialDeskFbScriptLoaded = true;

  setTimeout(() => {
    const info = getFacebookProfileInfo();
    if (info.name || info.profileUrl) {
      chrome.runtime.sendMessage({ action: "FB_PROFILE_DETECTED", fbName: info.name, fbUrl: info.profileUrl }).catch(() => {});
    }
  }, 1500);

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "PING") {
      const info = getFacebookProfileInfo();
      sendResponse({ pong: true, url: window.location.href, fbName: info.name, fbUrl: info.profileUrl });
      return false;
    }

    if (request.action === "SCRAPE_POST_METRICS") {
      sendResponse(scrapeFacebookPostEngagement());
      return false;
    }

    if (request.action === "PREPARE_FANPAGE_CONTEXT") {
      const targetName = request.targetName || "";
      handleInteractionSwitchModal(targetName);

      if (isFacebookAlreadyInPageMode(targetName)) {
        console.log(`[Social Desk] [Pre-flight] Đã ở ngữ cảnh quản trị Fanpage "${targetName}".`);
        sendResponse({ needsSwitch: false, ready: true, message: "Đã ở ngữ cảnh Fanpage" });
        return false;
      }

      (async () => {
        for (let i = 0; i < 12; i++) {
          handleInteractionSwitchModal(targetName);
          if (isFacebookAlreadyInPageMode(targetName)) {
            sendResponse({ needsSwitch: false, ready: true, message: "Đã ở ngữ cảnh Fanpage" });
            return;
          }
          const switchBtn = findFacebookSwitchButton(targetName);
          if (switchBtn) {
            console.log(`[Social Desk] [Pre-flight] Tìm thấy nút chuyển profile sang Fanpage "${targetName}": "${switchBtn.innerText || switchBtn.getAttribute("aria-label")}"`);
            sendResponse({ needsSwitch: true, message: `Bắt đầu chuyển sang Fanpage "${targetName}"` });
            setTimeout(() => triggerClick(switchBtn), 250);
            return;
          }
          const trigger = findFacebookComposerTriggerByKind("page");
          if (trigger) {
            sendResponse({ needsSwitch: false, message: "Đã ở ngữ cảnh Fanpage (thấy ô tạo bài viết)" });
            return;
          }
          await sleep(500);
        }
        sendResponse({ needsSwitch: false, message: "Không tìm thấy banner chuyển đổi sau 6s" });
      })();
      return true;
    }

    if (request.action === "DO_FANPAGE_POST") {
      handleFanpagePost(request.payload)
        .then((res) => sendResponse(res || { success: true }))
        .catch((err) => sendResponse({ success: false, message: err?.message || "Lỗi đăng bài Fanpage" }));
      return true;
    }

    if (request.action === "DO_GROUP_POST") {
      handleGroupPost(request.payload)
        .then((res) => sendResponse(res || { success: true }))
        .catch((err) => sendResponse({ success: false, message: err?.message || "Lỗi đăng bài Nhóm Facebook" }));
      return true;
    }

    if (request.action === "DO_PERSONAL_ACCOUNT_POST") {
      handlePersonalAccountPost(request.payload)
        .then((res) => sendResponse(res || { success: true }))
        .catch((err) => sendResponse({ success: false, message: err?.message || "Lỗi đăng bài Trang cá nhân Facebook" }));
      return true;
    }

    if (request.action === "DO_POST") {
      handlePost(request.payload)
        .then((res) => sendResponse(res || { success: true }))
        .catch((err) => sendResponse({ success: false, message: err?.message || "Lỗi tự động hóa Facebook" }));
      return true;
    }

    if (request.action === "DO_SWITCH_PROFILE") {
      (async () => {
        const targetName = request.targetName || "";
        console.log(`[Social Desk] Nhận lệnh chuyển profile sang: "${targetName}"...`);
        for (let attempt = 0; attempt < 15; attempt++) {
          const switchBtn = findFacebookSwitchButton(targetName);
          if (switchBtn) {
            console.log(`[Social Desk] Tìm thấy nút chuyển profile trên trang: "${switchBtn.innerText || switchBtn.getAttribute("aria-label")}"`);
            triggerClick(switchBtn);
            await sleep(3500);
            return { success: true, message: `Đã chuyển sang profile "${targetName}"` };
          }
          await sleep(600);
        }

        const switched = await attemptMenuProfileSwitch(targetName);
        if (switched) {
          return { success: true, message: `Đã chuyển sang "${targetName}" qua menu tài khoản.` };
        }
        return { success: false, message: `Không tìm thấy nút chuyển sang "${targetName}" trên giao diện Facebook.` };
      })()
        .then((res) => sendResponse(res))
        .catch((err) => sendResponse({ success: false, message: err?.message || "Lỗi chuyển profile" }));
      return true;
    }
  });
}

// ----------------------------------------------------
// XỬ LÝ KÊNH 1: FANPAGE FACEBOOK
// ----------------------------------------------------
async function handleFanpagePost(payload) {
  const { caption, images = [], targetName = "", targetUrl = "" } = payload;

  if (/Log into Facebook|Đăng nhập Facebook/i.test(document.body.innerText) || window.location.pathname.startsWith("/login") || document.querySelector('form[action*="/login"]')) {
    return { success: false, message: "Tài khoản Facebook chưa đăng nhập trong Chrome này. Vui lòng đăng nhập 1 lần rồi bấm Đăng Bài lại." };
  }

  console.log(`[Fanpage] Bắt đầu quy trình đăng bài lên Fanpage "${targetName}"...`);
  const dialogRes = await openFacebookComposerDialog("page", targetName);
  if (dialogRes && dialogRes.needsSwitch) {
    console.log(`[Fanpage] Phát hiện cần chuyển Profile Fanpage, gửi tín hiệu an toàn về background...`);
    setTimeout(() => {
      const btn = findFacebookSwitchButton(targetName);
      if (btn) triggerClick(btn);
    }, 250);
    return {
      success: false,
      needsSwitch: true,
      message: `Đang chuyển đổi sang Profile Fanpage "${targetName}"...`,
    };
  }
  const dialog = dialogRes;
  if (!dialog) {
    return { success: false, message: `Không tìm thấy ô tạo bài viết trên Fanpage "${targetName}" (Bạn đang nghĩ gì? / Tạo bài viết).` };
  }
  await sleep(800);

  const editor = await findFacebookEditor(dialog);
  if (!editor) return { success: false, message: "Không tìm thấy ô nhập nội dung trên Fanpage." };

  await fillFormattedCaption(editor, caption || "");
  await sleep(1000);

  if (caption && caption.trim().length > 0 && (editor.innerText || "").trim().length < 10) {
    return { success: false, message: "Lỗi điền nội dung: Fanpage chưa tiếp nhận bài viết. Đã dừng để tránh đăng bài trống." };
  }

  await attachImagesToFacebookComposer(dialog, images);

  const { postSuccessClicked, lastDetectedButtons } = await waitForFacebookSubmitAndFinish(dialog, 60, true);
  if (!postSuccessClicked) {
    const btnNames = lastDetectedButtons.slice(0, 4).map((b) => `"${b.text}"(${b.type}, disabled=${b.disabled})`).join(", ");
    return { success: false, message: `Nút 'Đăng' trên Fanpage chưa sẵn sàng sau 60s. Các nút: [${btnNames || "không tìm thấy"}].` };
  }

  console.log("[Fanpage] Chờ Facebook ghi nhận bài đăng...");
  let postFinished = false;
  for (let t = 0; t < 35; t++) {
    await sleep(1000);
    dismissFacebookUpsellPopups();
    const currentDialogs = Array.from(document.querySelectorAll('div[role="dialog"]'))
      .filter(isElementVisible)
      .filter((d) => !isInteractionSwitchModal(d));
    if (currentDialogs.length === 0) {
      postFinished = true;
      break;
    }
  }

  await sleep(2500);
  dismissFacebookUpsellPopups();

  const detectedPermalink = await tryDetectPostPermalink(targetUrl);
  return {
    success: true,
    postUrl: detectedPermalink || targetUrl || window.location.href,
    message: postFinished ? "Đã đăng bài thành công lên Fanpage Facebook" : "Đã gửi bài đăng lên Fanpage (đang chờ Facebook xử lý)",
  };
}

// ----------------------------------------------------
// XỬ LÝ KÊNH 2: NHÓM FACEBOOK (GROUP)
// ----------------------------------------------------
async function handleGroupPost(payload) {
  const { caption, images = [], targetName = "", targetUrl = "" } = payload;

  if (/Log into Facebook|Đăng nhập Facebook/i.test(document.body.innerText) || window.location.pathname.startsWith("/login") || document.querySelector('form[action*="/login"]')) {
    return { success: false, message: "Tài khoản Facebook chưa đăng nhập trong Chrome này. Vui lòng đăng nhập 1 lần rồi bấm Đăng Bài lại." };
  }

  console.log(`[Nhóm] Bắt đầu quy trình đăng bài vào Nhóm "${targetName}"...`);
  const dialog = await openFacebookComposerDialog("group", targetName);
  if (!dialog) {
    return { success: false, message: `Không tìm thấy ô tạo bài viết trong nhóm "${targetName}". Vui lòng kiểm tra quyền thành viên trong nhóm.` };
  }
  await sleep(800);

  const editor = await findFacebookEditor(dialog);
  if (!editor) return { success: false, message: "Không tìm thấy ô nhập nội dung trong nhóm." };

  await fillFormattedCaption(editor, caption || "");
  await sleep(1000);

  if (caption && caption.trim().length > 0 && (editor.innerText || "").trim().length < 10) {
    return { success: false, message: "Lỗi điền nội dung: Nhóm chưa tiếp nhận bài viết. Đã dừng để tránh đăng bài trống." };
  }

  await attachImagesToFacebookComposer(dialog, images);

  const { postSuccessClicked, lastDetectedButtons } = await waitForFacebookSubmitAndFinish(dialog, 60, false);
  if (!postSuccessClicked) {
    const btnNames = lastDetectedButtons.slice(0, 4).map((b) => `"${b.text}"(${b.type}, disabled=${b.disabled})`).join(", ");
    return { success: false, message: `Nút 'Đăng' trong Nhóm chưa sẵn sàng sau 60s. Các nút: [${btnNames || "không tìm thấy"}].` };
  }

  console.log("[Nhóm] Chờ Facebook hoàn tất đăng bài...");
  let pendingApproval = false;
  let postFinished = false;

  for (let t = 0; t < 35; t++) {
    await sleep(1000);
    dismissFacebookUpsellPopups();

    const fullBody = (document.body.innerText || "").toLowerCase();
    if (fullBody.includes("bài viết của bạn đã được gửi") || fullBody.includes("đang chờ quản trị viên phê duyệt") || fullBody.includes("pending approval")) {
      pendingApproval = true;
      postFinished = true;
      break;
    }

    const currentDialogs = Array.from(document.querySelectorAll('div[role="dialog"]'))
      .filter(isElementVisible)
      .filter((d) => !isInteractionSwitchModal(d));
    if (currentDialogs.length === 0) {
      postFinished = true;
      break;
    }
  }

  await sleep(2500);
  dismissFacebookUpsellPopups();

  const detectedPermalink = await tryDetectPostPermalink(targetUrl);
  return {
    success: true,
    pendingApproval,
    postUrl: detectedPermalink || targetUrl || window.location.href,
    message: pendingApproval
      ? "Đã gửi bài vào nhóm (Đang chờ Quản trị viên duyệt)"
      : (postFinished ? "Đã đăng bài thành công vào nhóm Facebook" : "Đã bấm Đăng vào nhóm"),
  };
}

// ----------------------------------------------------
// XỬ LÝ KÊNH 3: TRANG CÁ NHÂN FACEBOOK
// ----------------------------------------------------
async function handlePersonalAccountPost(payload) {
  const { caption, images = [], targetName = "", targetUrl = "" } = payload;

  if (/Log into Facebook|Đăng nhập Facebook/i.test(document.body.innerText) || window.location.pathname.startsWith("/login") || document.querySelector('form[action*="/login"]')) {
    return { success: false, message: "Tài khoản Facebook chưa đăng nhập trong Chrome này. Vui lòng đăng nhập 1 lần rồi bấm Đăng Bài lại." };
  }

  console.log(`[Cá nhân] Bắt đầu đăng lên Trang cá nhân "${targetName}"...`);
  const dialog = await openFacebookComposerDialog("account", targetName);
  if (!dialog) return { success: false, message: "Không tìm thấy ô tạo bài viết trên trang cá nhân." };
  await sleep(800);

  const editor = await findFacebookEditor(dialog);
  if (!editor) return { success: false, message: "Không tìm thấy ô nhập nội dung trên trang cá nhân." };

  await fillFormattedCaption(editor, caption || "");
  await sleep(1000);

  if (caption && caption.trim().length > 0 && (editor.innerText || "").trim().length < 10) {
    return { success: false, message: "Lỗi điền nội dung: Trang cá nhân chưa tiếp nhận bài viết." };
  }

  await attachImagesToFacebookComposer(dialog, images);

  const { postSuccessClicked, lastDetectedButtons } = await waitForFacebookSubmitAndFinish(dialog, 60, false);
  if (!postSuccessClicked) {
    const btnNames = lastDetectedButtons.slice(0, 4).map((b) => `"${b.text}"(${b.type}, disabled=${b.disabled})`).join(", ");
    return { success: false, message: `Nút 'Đăng' chưa sẵn sàng sau 60s. Các nút: [${btnNames || "không tìm thấy"}].` };
  }

  for (let t = 0; t < 35; t++) {
    await sleep(1000);
    dismissFacebookUpsellPopups();
    const currentDialogs = Array.from(document.querySelectorAll('div[role="dialog"]'))
      .filter(isElementVisible)
      .filter((d) => !isInteractionSwitchModal(d));
    if (currentDialogs.length === 0) break;
  }

  await sleep(2500);
  dismissFacebookUpsellPopups();

  const detectedPermalink = await tryDetectPostPermalink(targetUrl);
  return {
    success: true,
    postUrl: detectedPermalink || targetUrl || window.location.href,
    message: "Đã đăng bài thành công lên Trang cá nhân Facebook",
  };
}

// Định tuyến fallback chung
async function handlePost(payload) {
  const targetKind = (payload.targetKind || "").toLowerCase().trim();
  if (targetKind === "page") return handleFanpagePost(payload);
  if (targetKind === "group") return handleGroupPost(payload);
  return handlePersonalAccountPost(payload);
}
