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

    // 1. Pre-flight kiểm tra & chuyển ngữ cảnh Fanpage an toàn (tránh mất port do reload)
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

    // 2. Kênh Fanpage
    if (request.action === "DO_FANPAGE_POST") {
      handleFanpagePost(request.payload)
        .then((res) => sendResponse(res || { success: true }))
        .catch((err) => sendResponse({ success: false, message: err?.message || "Lỗi đăng bài Fanpage" }));
      return true;
    }

    // 3. Kênh Nhóm (Group)
    if (request.action === "DO_GROUP_POST") {
      handleGroupPost(request.payload)
        .then((res) => sendResponse(res || { success: true }))
        .catch((err) => sendResponse({ success: false, message: err?.message || "Lỗi đăng bài Nhóm Facebook" }));
      return true;
    }

    // 4. Kênh Trang cá nhân / Nick chính
    if (request.action === "DO_PERSONAL_ACCOUNT_POST") {
      handlePersonalAccountPost(request.payload)
        .then((res) => sendResponse(res || { success: true }))
        .catch((err) => sendResponse({ success: false, message: err?.message || "Lỗi đăng bài Trang cá nhân Facebook" }));
      return true;
    }

    // Fallback định tuyến chung
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
            console.log(`[Social Desk] Tìm thấy nút chuyển profile banner: "${switchBtn.innerText || switchBtn.getAttribute("aria-label")}"`);
            triggerClick(switchBtn);
            await sleep(3500);
            return { success: true, message: `Đã bấm nút chuyển sang tài khoản "${targetName || 'mới'}" trên Facebook.` };
          }
          if (attempt >= 2) {
            const inMenu = await attemptMenuProfileSwitch(targetName);
            if (inMenu) return { success: true, message: `Đã chọn chuyển sang tài khoản "${targetName}" qua menu Facebook.` };
          }
          await sleep(1000);
        }
        return { success: false, message: `Không tìm thấy nút hoặc menu chuyển sang "${targetName}" trên Facebook sau 15s.` };
      })()
        .then(sendResponse)
        .catch((err) => sendResponse({ success: false, message: err?.message || "Lỗi chuyển profile" }));
      return true;
    }
  });
}

// ----------------------------------------------------
// ĐỊNH VỊ NÚT KÍCH HOẠT SOẠN BÀI THEO TỪNG KÊNH
// ----------------------------------------------------
function findFacebookComposerTriggerByKind(kind) {
  const elements = Array.from(document.querySelectorAll(
    'div[data-pagelet*="Composer"] div[role="button"], div[role="feed"] div[role="button"], div[role="main"] div[role="button"], div[role="button"], div[tabindex="0"], span'
  ));

  for (const el of elements) {
    if (!isElementVisible(el)) continue;
    const aria = (el.getAttribute("aria-label") || "").toLowerCase().trim();
    const text = (el.innerText || "").toLowerCase().trim();

    // Loại trừ tuyệt đối các nút điều hướng phụ, tương tác bài viết, bộ lọc
    if (
      aria.includes("menu") || text.includes("menu") ||
      aria.includes("tìm kiếm") || text.includes("tìm kiếm") ||
      aria.includes("tương tác") || text.includes("tương tác") ||
      aria.includes("vai trò") || text.includes("vai trò") ||
      aria.includes("trang & trang cá nhân") || text.includes("trang & trang cá nhân") ||
      aria.includes("quản lý") || text.includes("quản lý") ||
      aria.includes("chế độ xem") || text.includes("chế độ xem") ||
      aria.includes("bộ lọc") || text.includes("bộ lọc") ||
      aria.includes("ghim") || text.includes("ghim") ||
      aria.includes("thông báo") || text.includes("thông báo")
    ) continue;

    let isMatch = false;
    if (kind === "group") {
      isMatch = /thảo luận|viết gì đó|bạn viết gì đi|write something|bán gì đó|tạo bài viết/i.test(aria + " " + text);
    } else if (kind === "page") {
      isMatch = /tạo bài viết|bạn đang nghĩ gì|what's on your mind|viết bài viết|viết gì đó/i.test(aria + " " + text);
    } else {
      // account (cá nhân)
      isMatch = /bạn đang nghĩ gì|what's on your mind|tạo bài viết/i.test(aria + " " + text);
    }

    if (isMatch) return el.closest('div[role="button"], div[tabindex="0"], button') || el;
  }

  // Fallback chung: Tìm nút "Ảnh/video" trong khu vực tạo bài viết
  const photoBtn = Array.from(
    document.querySelectorAll('div[data-pagelet*="Composer"] div[role="button"], div[role="main"] div[role="button"], div[role="feed"] div[role="button"], div[role="button"]')
  ).find((b) => {
    if (!isElementVisible(b)) return false;
    const t = (b.innerText || b.getAttribute("aria-label") || "").toLowerCase().trim();
    if (t.includes("menu") || t.includes("tương tác") || t.includes("quản lý")) return false;
    return (t === "ảnh/video" || t === "photo/video" || t.startsWith("ảnh/video"));
  });
  return photoBtn || null;
}

// Mở hộp thoại soạn bài theo từng kênh
async function openFacebookComposerDialog(kind, targetName = "") {
  let dialog = null;

  for (let attempt = 0; attempt < 20; attempt++) {
    // 0. Đóng modal tương tác nếu đang hiển thị
    handleInteractionSwitchModal(targetName);

    // 1. Kiểm tra nếu hộp thoại soạn bài đã mở sẵn (bỏ qua modal chuyển tương tác)
    const dialogs = Array.from(document.querySelectorAll('div[role="dialog"]'))
      .filter(isElementVisible)
      .filter((d) => !isInteractionSwitchModal(d));

    dialog = dialogs.find((d) => d.querySelector('div[role="textbox"], div[data-lexical-editor="true"], div[contenteditable="true"]')) || (dialogs.length > 0 ? dialogs[dialogs.length - 1] : null);
    if (dialog && isElementVisible(dialog) && dialog.querySelector('div[role="textbox"], div[data-lexical-editor="true"], div[contenteditable="true"]')) {
      return dialog;
    }

    // 2. Nếu là Fanpage và phát hiện nút chuyển banner, KHÔNG click trực tiếp làm sập port!
    if (kind === "page") {
      const switchBtn = findFacebookSwitchButton(targetName);
      if (switchBtn) {
        console.log(`[Social Desk] Phát hiện nút chuyển profile sang Fanpage "${targetName}", chuyển giao an toàn cho background...`);
        return { needsSwitch: true };
      }
    }

    // 3. Tìm nút kích hoạt ô soạn bài theo kênh
    const trigger = findFacebookComposerTriggerByKind(kind);
    if (trigger) {
      trigger.scrollIntoView({ behavior: "smooth", block: "center" });
      await sleep(350);
      triggerClick(trigger);
      console.log(`[Social Desk] Đã bấm nút mở hộp thoại soạn bài Facebook (${kind}).`);
      await sleep(1200);
    } else {
      if (attempt === 1) window.scrollBy(0, 450);
      else if (attempt === 4) window.scrollBy(0, 300);
      else if (attempt === 7) window.scrollTo(0, 0);
      await sleep(800);
    }
  }

  return dialog;
}

// Tìm ô nhập nội dung văn bản (editor) trong dialog Facebook
async function findFacebookEditor(dialog) {
  const editorSelectors = [
    'div[role="textbox"][contenteditable="true"]',
    'div[data-lexical-editor="true"]',
    'div[data-editor="true"]',
    'div[role="textbox"]',
    'div[contenteditable="true"]',
    'div[aria-label*="bạn đang nghĩ gì"]',
    'div[aria-label*="viết"]',
  ];
  let editor = null;
  for (let w = 0; w < 15; w++) {
    handleInteractionSwitchModal();
    const currentDialog = Array.from(document.querySelectorAll('div[role="dialog"]'))
      .filter(isElementVisible)
      .filter((d) => !isInteractionSwitchModal(d))
      .pop() || dialog;

    for (const sel of editorSelectors) {
      editor = currentDialog?.querySelector(sel) || document.querySelector(`div[role="dialog"] ${sel}`);
      if (editor && isElementVisible(editor)) break;
    }
    if (editor) break;
    await sleep(600);
  }
  return editor;
}

// Tải và đính kèm danh sách ảnh vào hộp thoại Facebook
async function attachImagesToFacebookComposer(dialog, images = []) {
  if (!images || images.length === 0) return true;
  console.log(`[Social Desk] Tải và đính kèm ${images.length} ảnh vào form Facebook...`);

  const fileObjects = [];
  for (let i = 0; i < images.length; i++) {
    try {
      let fileDataUrl = images[i];
      if (!fileDataUrl.startsWith("data:")) {
        fileDataUrl = await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({ action: "FETCH_IMAGE", url: images[i] }, (res) => {
            if (chrome.runtime.lastError || !res?.success) reject(new Error(res?.error || "Lỗi tải ảnh"));
            else resolve(res.dataUrl);
          });
        });
      }
      const arr = fileDataUrl.split(",");
      const mime = arr[0].match(/:(.*?);/)?.[1] || "image/jpeg";
      const bstr = atob(arr[1]);
      const u8arr = new Uint8Array(bstr.length);
      for (let j = 0; j < bstr.length; j++) u8arr[j] = bstr.charCodeAt(j);
      fileObjects.push(new File([u8arr], `product_img_${i + 1}.jpg`, { type: mime }));
    } catch (err) {
      console.warn(`[Social Desk] Bỏ qua ảnh #${i + 1}:`, err.message);
    }
  }

  if (fileObjects.length === 0) return false;

  let fileInput = dialog.querySelector('input[type="file"][accept*="image"]');
  if (!fileInput) {
    const photoButtons = Array.from(dialog.querySelectorAll('div[aria-label*="Ảnh/video"], div[aria-label*="Photo/video"], div[aria-label*="Ảnh"]'));
    for (const pb of photoButtons) {
      if (isElementVisible(pb)) {
        triggerClick(pb);
        await sleep(800);
        fileInput = dialog.querySelector('input[type="file"][accept*="image"]');
        break;
      }
    }
  }

  if (fileInput) {
    try {
      const dt = new DataTransfer();
      fileObjects.forEach((f) => dt.items.add(f));
      fileInput.files = dt.files;
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
      console.log(`[Social Desk] Đã nạp ${fileObjects.length} file ảnh vào form Facebook.`);
      await sleep(2500);
      return true;
    } catch (e) {
      console.warn("[Social Desk] Lỗi gán file ảnh:", e);
    }
  }

  return false;
}

// Chờ các nút Đăng / Tiếp và bấm hoàn tất
async function waitForFacebookSubmitAndFinish(dialog, maxWaitSeconds = 60, isFanpage = false) {
  let postSuccessClicked = false;
  let lastDetectedButtons = [];

  for (let second = 0; second < maxWaitSeconds; second++) {
    const currentDialog = getFacebookComposerDialog() || dialog || document;
    let candidateButtons = Array.from(currentDialog.querySelectorAll('div[role="button"], button')).filter(isElementVisible);
    if (candidateButtons.length === 0) {
      candidateButtons = Array.from(document.querySelectorAll('div[role="dialog"] div[role="button"], div[role="dialog"] button')).filter(isElementVisible);
    }

    let foundPost = null;
    let foundNext = null;
    let hasDisabledAction = false;
    const currentDetected = [];

    for (const btn of candidateButtons) {
      const cat = categorizeFacebookButton(btn);
      if (!cat) continue;
      currentDetected.push({ type: cat.type, text: (btn.innerText || btn.getAttribute("aria-label") || "").trim(), disabled: cat.isDisabled });
      if (cat.type === "post") {
        if (!cat.isDisabled) { foundPost = cat.btn; break; }
        hasDisabledAction = true;
      } else if (cat.type === "next") {
        if (!cat.isDisabled) foundNext = cat.btn;
        else hasDisabledAction = true;
      }
    }
    if (currentDetected.length > 0) lastDetectedButtons = currentDetected;

    if (foundPost) {
      foundPost.scrollIntoView({ behavior: "smooth", block: "center" });
      await sleep(400);
      triggerClick(foundPost);
      console.log("[Social Desk] Đã bấm nút Đăng bài Facebook.");
      postSuccessClicked = true;
      break;
    }

    if (foundNext) {
      console.log(`[Social Desk] Bấm nút Tiếp (Fanpage step) sau ${second}s...`);
      foundNext.scrollIntoView({ behavior: "smooth", block: "center" });
      await sleep(400);
      triggerClick(foundNext);
      await sleep(2500);
      continue;
    }

    if (hasDisabledAction) {
      console.log(`[Social Desk] [${second + 1}/${maxWaitSeconds}s] Đang tải ảnh/nội dung, tiếp tục chờ...`);
    }
    await sleep(1000);
  }

  return { postSuccessClicked, lastDetectedButtons };
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

  // Điền Caption
  const editor = await findFacebookEditor(dialog);
  if (!editor) return { success: false, message: "Không tìm thấy ô nhập nội dung trên Fanpage." };

  await fillFormattedCaption(editor, caption || "");
  await sleep(1000);

  if (caption && caption.trim().length > 0 && (editor.innerText || "").trim().length < 10) {
    return { success: false, message: "Lỗi điền nội dung: Fanpage chưa tiếp nhận bài viết. Đã dừng để tránh đăng bài trống." };
  }

  // Đính kèm ảnh
  await attachImagesToFacebookComposer(dialog, images);

  // Bấm Đăng / Tiếp
  const { postSuccessClicked, lastDetectedButtons } = await waitForFacebookSubmitAndFinish(dialog, 60, true);
  if (!postSuccessClicked) {
    const btnNames = lastDetectedButtons.slice(0, 4).map((b) => `"${b.text}"(${b.type}, disabled=${b.disabled})`).join(", ");
    return { success: false, message: `Nút 'Đăng' trên Fanpage chưa sẵn sàng sau 60s. Các nút: [${btnNames || "không tìm thấy"}].` };
  }

  // Chờ hoàn tất & đóng modal
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

  await sleep(2000);
  const detectedPostUrl = await tryDetectPostPermalink(targetUrl || window.location.href);

  return {
    success: true,
    postUrl: detectedPostUrl || targetUrl || window.location.href,
    message: `Đã đăng bài thành công lên Fanpage "${targetName || 'Facebook'}"`,
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
    return { success: false, message: `Không tìm thấy ô tạo bài viết trong Nhóm "${targetName}" (Bạn viết gì đi... / Thảo luận).` };
  }
  await sleep(800);

  // Điền Caption
  const editor = await findFacebookEditor(dialog);
  if (!editor) return { success: false, message: "Không tìm thấy ô nhập nội dung trong Nhóm." };

  await fillFormattedCaption(editor, caption || "");
  await sleep(1000);

  if (caption && caption.trim().length > 0 && (editor.innerText || "").trim().length < 10) {
    return { success: false, message: "Lỗi điền nội dung: Nhóm chưa tiếp nhận bài viết. Đã dừng để tránh đăng bài trống." };
  }

  // Đính kèm ảnh
  await attachImagesToFacebookComposer(dialog, images);

  // Bấm Đăng
  const { postSuccessClicked, lastDetectedButtons } = await waitForFacebookSubmitAndFinish(dialog, 60, false);
  if (!postSuccessClicked) {
    const btnNames = lastDetectedButtons.slice(0, 4).map((b) => `"${b.text}"(${b.type}, disabled=${b.disabled})`).join(", ");
    return { success: false, message: `Nút 'Đăng' trong Nhóm chưa sẵn sàng sau 60s. Các nút: [${btnNames || "không tìm thấy"}].` };
  }

  // Chờ phê duyệt hoặc gửi xong
  console.log("[Nhóm] Chờ Nhóm xử lý bài đăng...");
  let isPendingApproval = false;
  let postFinished = false;

  for (let t = 0; t < 35; t++) {
    await sleep(1000);
    dismissFacebookUpsellPopups();
    const bodyText = document.body.innerText;
    if (
      bodyText.includes("đã gửi bài viết của bạn") ||
      bodyText.includes("bài viết của bạn đang chờ phê duyệt") ||
      bodyText.includes("chờ quản trị viên phê duyệt") ||
      bodyText.includes("pending approval") ||
      bodyText.includes("submitted for approval")
    ) {
      isPendingApproval = true;
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

  await sleep(2000);
  const detectedPostUrl = await tryDetectPostPermalink(targetUrl || window.location.href);

  const successMsg = isPendingApproval
    ? `Đã gửi bài vào nhóm "${targetName || "Facebook"}" (đang chờ Quản trị viên duyệt)`
    : `Đã đăng bài thành công vào nhóm "${targetName || "Facebook"}"`;

  return {
    success: true,
    postUrl: detectedPostUrl || targetUrl || window.location.href,
    pendingApproval: isPendingApproval,
    message: successMsg,
  };
}

// ----------------------------------------------------
// XỬ LÝ KÊNH 3: TRANG CÁ NHÂN FACEBOOK / NICK CHÍNH
// ----------------------------------------------------
async function handlePersonalAccountPost(payload) {
  const { caption, images = [], targetName = "", targetUrl = "" } = payload;

  if (/Log into Facebook|Đăng nhập Facebook/i.test(document.body.innerText) || window.location.pathname.startsWith("/login") || document.querySelector('form[action*="/login"]')) {
    return { success: false, message: "Tài khoản Facebook chưa đăng nhập trong Chrome này. Vui lòng đăng nhập 1 lần rồi bấm Đăng Bài lại." };
  }

  console.log(`[Cá nhân] Bắt đầu đăng lên Trang cá nhân "${targetName}"...`);
  const dialog = await openFacebookComposerDialog("account", targetName);
  if (!dialog) {
    return { success: false, message: `Không tìm thấy ô tạo bài viết trên Trang cá nhân "${targetName}" (Bạn đang nghĩ gì?).` };
  }
  await sleep(800);

  // Điền Caption
  const editor = await findFacebookEditor(dialog);
  if (!editor) return { success: false, message: "Không tìm thấy ô nhập nội dung trên Trang cá nhân." };

  await fillFormattedCaption(editor, caption || "");
  await sleep(1000);

  if (caption && caption.trim().length > 0 && (editor.innerText || "").trim().length < 10) {
    return { success: false, message: "Lỗi điền nội dung: Facebook chưa tiếp nhận bài viết. Đã dừng để tránh đăng bài trống." };
  }

  // Đính kèm ảnh
  await attachImagesToFacebookComposer(dialog, images);

  // Bấm Đăng
  const { postSuccessClicked, lastDetectedButtons } = await waitForFacebookSubmitAndFinish(dialog, 60, false);
  if (!postSuccessClicked) {
    const btnNames = lastDetectedButtons.slice(0, 4).map((b) => `"${b.text}"(${b.type}, disabled=${b.disabled})`).join(", ");
    return { success: false, message: `Nút 'Đăng' trên Trang cá nhân chưa sẵn sàng sau 60s. Các nút: [${btnNames || "không tìm thấy"}].` };
  }

  // Chờ hoàn tất & đóng modal
  console.log("[Cá nhân] Chờ Facebook ghi nhận bài đăng...");
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

  await sleep(2000);
  const detectedPostUrl = await tryDetectPostPermalink(targetUrl || window.location.href);

  return {
    success: true,
    postUrl: detectedPostUrl || targetUrl || window.location.href,
    message: `Đã đăng bài thành công lên Trang cá nhân "${targetName || "Facebook"}"`,
  };
}

// Fallback hàm tổng điều hướng theo targetKind
async function handlePost(payload) {
  const kind = (payload?.targetKind || "").toLowerCase();
  if (kind === "page") return handleFanpagePost(payload);
  if (kind === "group" || window.location.pathname.includes("/groups/")) return handleGroupPost(payload);
  return handlePersonalAccountPost(payload);
}

// ----------------------------------------------------
// ĐIỀN NỘI DUNG VĂN BẢN VÀ BẢO TOÀN ĐỊNH DẠNG
// ----------------------------------------------------
async function fillFormattedCaption(editor, caption) {
  if (!editor || !caption) return;
  const rawText = caption.trim();
  triggerClick(editor);
  editor.focus();
  await sleep(250);

  try {
    const sel = window.getSelection();
    const range = document.createRange();
    if (editor.childNodes.length > 0) { range.selectNodeContents(editor); range.collapse(false); }
    else { range.setStart(editor, 0); range.setEnd(editor, 0); }
    sel.removeAllRanges();
    sel.addRange(range);
  } catch {}

  let pasteOk = false;
  try {
    const dt = new DataTransfer();
    dt.setData("text/plain", rawText);
    editor.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    await sleep(400);

    const now = (editor.innerText || editor.textContent || "").trim();
    if (now.length >= Math.min(rawText.length * 0.4, 30) && (!rawText.includes("\n") || now.includes("\n"))) {
      pasteOk = true;
    }
  } catch {}

  if (!pasteOk) {
    try {
      await navigator.clipboard.writeText(rawText);
      document.execCommand("paste");
      await sleep(300);
      const now2 = (editor.innerText || editor.textContent || "").trim();
      if (now2.length >= 20) pasteOk = true;
    } catch {}
  }

  if (!pasteOk) {
    editor.focus();
    document.execCommand("selectAll", false, null);
    document.execCommand("delete", false, null);
    await sleep(100);

    const lines = rawText.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (i > 0) {
        editor.dispatchEvent(new InputEvent("beforeinput", { inputType: "insertParagraph", bubbles: true, cancelable: true }));
        if (!document.execCommand("insertParagraph", false, null)) document.execCommand("insertLineBreak", false, null);
      }
      if (line.length > 0) {
        document.execCommand("insertText", false, line);
      } else {
        document.execCommand("insertText", false, "\u200B");
      }
    }
  }

  editor.dispatchEvent(new Event("input", { bubbles: true }));
  editor.dispatchEvent(new Event("change", { bubbles: true }));
}
