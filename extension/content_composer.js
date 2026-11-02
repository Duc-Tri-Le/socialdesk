// Social Desk Connector - Facebook Composer DOM Operations

// Định vị nút kích hoạt soạn bài theo từng kênh (Fanpage, Nhóm, Trang cá nhân)
function findFacebookComposerTriggerByKind(kind) {
  const elements = Array.from(document.querySelectorAll(
    'div[data-pagelet*="Composer"] div[role="button"], div[role="feed"] div[role="button"], div[role="main"] div[role="button"], div[role="button"], div[tabindex="0"], span'
  ));

  for (const el of elements) {
    if (!isElementVisible(el)) continue;
    const aria = (el.getAttribute("aria-label") || "").toLowerCase().trim();
    const text = (el.innerText || "").toLowerCase().trim();

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
      isMatch = /bạn đang nghĩ gì|what's on your mind|tạo bài viết/i.test(aria + " " + text);
    }

    if (isMatch) return el.closest('div[role="button"], div[tabindex="0"], button') || el;
  }

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
    handleInteractionSwitchModal(targetName);

    const dialogs = Array.from(document.querySelectorAll('div[role="dialog"]'))
      .filter(isElementVisible)
      .filter((d) => !isInteractionSwitchModal(d));

    dialog = dialogs.find((d) => d.querySelector('div[role="textbox"], div[data-lexical-editor="true"], div[contenteditable="true"]')) || (dialogs.length > 0 ? dialogs[dialogs.length - 1] : null);
    if (dialog && isElementVisible(dialog) && dialog.querySelector('div[role="textbox"], div[data-lexical-editor="true"], div[contenteditable="true"]')) {
      return dialog;
    }

    if (kind === "page") {
      const switchBtn = findFacebookSwitchButton(targetName);
      if (switchBtn) {
        console.log(`[Social Desk] Phát hiện nút chuyển profile sang Fanpage "${targetName}", chuyển giao an toàn cho background...`);
        return { needsSwitch: true };
      }
    }

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

// Điền nội dung văn bản và bảo toàn định dạng xuống dòng
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

