// Social Desk Connector - Facebook Automation Content Script
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

function findFacebookComposerTrigger(isGroup) {
  const elements = Array.from(document.querySelectorAll(
    'div[data-pagelet*="Composer"] div[role="button"], div[role="feed"] div[role="button"], div[role="main"] div[role="button"], div[role="button"], div[tabindex="0"], span'
  ));
  for (const el of elements) {
    if (!isElementVisible(el)) continue;
    const aria = (el.getAttribute("aria-label") || "").toLowerCase().trim();
    const text = (el.innerText || "").toLowerCase().trim();
    if (aria.includes("menu") || text.includes("menu") || aria.includes("tìm kiếm") || text.includes("tìm kiếm")) continue;

    const isMatch =
      /bạn đang nghĩ gì|what's on your mind|tạo bài viết|viết gì đó/i.test(aria + " " + text) ||
      (isGroup && /thảo luận|bán gì/i.test(aria + " " + text));

    if (isMatch) return el.closest('div[role="button"], div[tabindex="0"], button') || el;
  }

  // Fallback: Tìm nút "Ảnh/video" trong khu vực tạo bài viết của Profile / Feed
  const photoBtn = Array.from(
    document.querySelectorAll('div[data-pagelet*="Composer"] div[role="button"], div[role="main"] div[role="button"], div[role="feed"] div[role="button"], div[role="button"]')
  ).find((b) => {
    if (!isElementVisible(b)) return false;
    const t = (b.innerText || b.getAttribute("aria-label") || "").toLowerCase().trim();
    return (t === "ảnh/video" || t === "photo/video" || t.startsWith("ảnh/video")) && !t.includes("menu");
  });
  return photoBtn || null;
}

async function handlePost(payload) {
  const { caption, images = [], targetKind = "", targetName = "" } = payload;

  // 1. Kiểm tra trạng thái đăng nhập Facebook
  if (/Log into Facebook|Đăng nhập Facebook/i.test(document.body.innerText) || window.location.pathname.startsWith("/login") || document.querySelector('form[action*="/login"]')) {
    return { success: false, message: "Tài khoản Facebook chưa đăng nhập trong Chrome này. Vui lòng đăng nhập 1 lần rồi bấm Đăng Bài lại." };
  }

  // 2. Chờ và mở hộp thoại soạn bài (hỗ trợ Trang cá nhân / Fanpage / Nhóm)
  const isGroup = targetKind === "group" || window.location.pathname.includes("/groups/");
  const isPage = targetKind === "page";
  console.log(`[Social Desk] Tìm ô đăng bài cho đích: ${targetKind || (isGroup ? "nhóm" : isPage ? "fanpage" : "cá nhân")}...`);

  let dialog = null;
  for (let attempt = 0; attempt < 20; attempt++) {
    // A. Kiểm tra nếu hộp thoại soạn thảo đã mở sẵn (có textbox / lexical)
    const dialogs = Array.from(document.querySelectorAll('div[role="dialog"]')).filter(isElementVisible);
    dialog = dialogs.find((d) => d.querySelector('div[role="textbox"], div[data-lexical-editor="true"], div[contenteditable="true"]')) || (dialogs.length > 0 ? dialogs[dialogs.length - 1] : null);
    if (dialog && isElementVisible(dialog) && dialog.querySelector('div[role="textbox"], div[data-lexical-editor="true"], div[contenteditable="true"]')) {
      break;
    }

    // B. Kiểm tra nút chuyển profile nếu Facebook đang ở chế độ Fanpage
    const switchBtn = findFacebookSwitchButton(targetName);
    if (switchBtn) {
      console.log(`[Social Desk] Bấm chuyển profile Facebook: "${switchBtn.innerText || switchBtn.getAttribute("aria-label")}"`);
      triggerClick(switchBtn);
      await sleep(3500);
      continue;
    }
    if (attempt === 3 && !isGroup) {
      const switched = await attemptMenuProfileSwitch(targetName);
      if (switched) continue;
    }

    // C. Tìm ô kích hoạt soạn bài ("Bạn đang nghĩ gì", "Đức Trí ơi...", "Tạo bài viết", "Ảnh/video")
    const trigger = findFacebookComposerTrigger(isGroup);
    if (trigger) {
      trigger.scrollIntoView({ behavior: "smooth", block: "center" });
      await sleep(350);
      triggerClick(trigger);
      console.log("[Social Desk] Đã bấm nút mở hộp thoại soạn bài Facebook.");
      await sleep(1200);
    } else {
      if (attempt === 1) window.scrollBy(0, 450);
      else if (attempt === 4) window.scrollBy(0, 300);
      else if (attempt === 7) window.scrollTo(0, 0);
      await sleep(800);
    }
  }

  if (!dialog) {
    const targetLabel = isGroup ? "Nhóm" : isPage ? "Fanpage" : "Trang cá nhân";
    return { success: false, message: `Không tìm thấy ô bắt đầu tạo bài viết trên ${targetLabel} Facebook (Bạn đang nghĩ gì? / Tạo bài viết).` };
  }
  await sleep(800);

  // 4. Tìm ô nhập văn bản và điền caption
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
    const currentDialog = Array.from(document.querySelectorAll('div[role="dialog"]')).filter(isElementVisible).pop() || dialog;
    for (const sel of editorSelectors) {
      editor = currentDialog.querySelector(sel) || document.querySelector(`div[role="dialog"] ${sel}`);
      if (editor && isElementVisible(editor)) break;
    }
    if (editor) break;
    await sleep(600);
  }
  if (!editor) return { success: false, message: "Không tìm thấy ô nhập nội dung bài viết trong hộp thoại Facebook." };

  await fillFormattedCaption(editor, caption || "");
  console.log("[Social Desk] Đã điền xong nội dung bài viết với đầy đủ ngắt dòng và khoảng cách");
  await sleep(1000);
  if (caption && caption.trim().length > 0 && (editor.innerText || "").trim().length < 10) {
    return { success: false, message: "Lỗi điền nội dung: Facebook chưa tiếp nhận bài viết vào khung. Đã dừng để tránh đăng bài trống." };
  }

  // 5. Đính kèm ảnh (nếu có)
  if (images && images.length > 0) {
    console.log(`[Social Desk] Tải và đính kèm ${images.length} ảnh...`);
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

    if (fileObjects.length > 0) {
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
          console.log(`[Social Desk] Đã nạp ${fileObjects.length} file ảnh vào form`);
          await sleep(2000);
        } catch (e) {
          console.warn("[Social Desk] Lỗi gán file ảnh:", e);
        }
      }
    }
  }

  // 6. Chờ nút Đăng hoặc Tiếp sẵn sàng
  let postSuccessClicked = false;
  let lastDetectedButtons = [];
  const maxWaitSeconds = 60;

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
      console.log(`[Social Desk] Bấm nút Tiếp trên Fanpage sau ${second}s...`);
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

  if (!postSuccessClicked) {
    const btnNames = lastDetectedButtons.slice(0, 4).map((b) => `"${b.text}"(${b.type}, disabled=${b.disabled})`).join(", ");
    return { success: false, message: `Nút 'Đăng' chưa sẵn sàng sau 60s. Các nút: [${btnNames || "không tìm thấy"}]. Hãy thử lại.` };
  }

  // 7. Chờ bài đăng gửi xong
  console.log("[Social Desk] Đang chờ Facebook xử lý đăng bài...");
  let postFinished = false;
  let isPendingApproval = false;
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
    const currentDialogs = Array.from(document.querySelectorAll('div[role="dialog"]')).filter(isElementVisible);
    if (currentDialogs.length === 0) {
      postFinished = true;
      break;
    }
  }

  if (!postFinished) return { success: false, message: "Facebook xử lý đăng bài quá lâu hoặc xuất hiện cảnh báo chặn tính năng." };

  // 8. Trích xuất permalink bài viết
  await sleep(2000);
  const detectedPostUrl = await tryDetectPostPermalink(payload.targetUrl || window.location.href);

  let successMsg = `Đã đăng bài thành công lên trang cá nhân "${targetName || "Facebook"}"`;
  if (isGroup) {
    successMsg = isPendingApproval
      ? `Đã gửi bài vào nhóm "${targetName || "Facebook"}" (đang chờ Quản trị viên duyệt)`
      : `Đã đăng bài thành công vào nhóm "${targetName || "Facebook"}"`;
  } else if (isPage) {
    successMsg = `Đã đăng bài thành công lên Fanpage "${targetName || "Facebook"}"`;
  }

  return {
    success: true,
    postUrl: detectedPostUrl || payload.targetUrl || window.location.href,
    pendingApproval: isPendingApproval,
    message: successMsg,
  };
}

// Điền nội dung bài viết giữ trọn vẹn định dạng xuống dòng và khoảng cách dòng
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
