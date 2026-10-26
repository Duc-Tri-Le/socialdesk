// Social Desk Connector - Instagram Automation Content Script
// Tự động hóa đăng bài viết (ảnh carousel + caption) lên Instagram Web qua Chrome Extension

console.log("[Social Desk] Instagram content script đã sẵn sàng trên:", window.location.href);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isElementVisible(el) {
  if (!el) return false;
  const s = window.getComputedStyle(el);
  return s.display !== "none" && s.visibility !== "hidden" && s.opacity !== "0" && el.offsetWidth > 0 && el.offsetHeight > 0;
}

function triggerClick(el) {
  if (!el) return;
  try {
    for (const t of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
      el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true }));
    }
  } catch {
    el.click();
  }
}

// Tìm hộp thoại tạo bài viết Instagram (phân biệt với các modal khác)
function getInstagramDialog() {
  const dialogs = Array.from(document.querySelectorAll('div[role="dialog"], section[role="dialog"], div[aria-modal="true"]'));
  for (const d of dialogs) {
    if (!isElementVisible(d)) continue;
    const txt = (d.innerText || "").toLowerCase();
    if (d.querySelector('input[type="file"]') || txt.includes("chọn từ máy tính") || txt.includes("select from computer") || txt.includes("kéo ảnh") || txt.includes("tạo bài viết mới") || txt.includes("cắt") || txt.includes("chỉnh sửa")) return d;
  }
  for (let i = dialogs.length - 1; i >= 0; i--) {
    if (isElementVisible(dialogs[i])) return dialogs[i];
  }
  return null;
}

// Tìm ô nhập chú thích bài viết Instagram (ưu tiên Lexical editor trong hộp thoại tạo bài)
function getInstagramCaptionEditor(root) {
  const container = root || getInstagramDialog() || document;
  const selectors = [
    'div[data-lexical-editor="true"][aria-label*="chú thích"]',
    'div[data-lexical-editor="true"][aria-label*="caption"]',
    'div[data-lexical-editor="true"]',
    'div[aria-label*="chú thích"]',
    'div[aria-label*="caption"]',
    'div[role="textbox"]',
    'div[contenteditable="true"]',
    'textarea',
  ];
  for (const sel of selectors) {
    for (const el of Array.from(container.querySelectorAll(sel))) {
      if (!isElementVisible(el)) continue;
      const aria = (el.getAttribute("aria-label") || el.getAttribute("placeholder") || "").toLowerCase();
      if (aria.includes("tìm kiếm") || aria.includes("search") || aria.includes("bình luận") || aria.includes("comment")) continue;
      return el;
    }
  }
  return null;
}

// Tìm nút bấm theo danh sách nhãn văn bản
function findButtonByText(container, targetTexts) {
  if (!container) return null;
  const buttons = Array.from(container.querySelectorAll('button, div[role="button"], div[tabindex="0"], a[role="button"]'));
  for (const el of buttons) {
    if (!isElementVisible(el)) continue;
    const txt = (el.innerText || "").trim().toLowerCase();
    const aria = (el.getAttribute("aria-label") || "").trim().toLowerCase();
    if (targetTexts.some((t) => txt === t || aria === t || txt.startsWith(t) || aria.startsWith(t))) return el;
  }
  return null;
}

if (!window.__socialDeskIgScriptLoaded) {
  window.__socialDeskIgScriptLoaded = true;

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "PING") {
      sendResponse({ pong: true, url: window.location.href, platform: "instagram" });
      return false;
    }
    if (request.action === "DO_POST") {
      handleInstagramPost(request.payload)
        .then((res) => sendResponse(res || { success: true }))
        .catch((err) => sendResponse({ success: false, message: err?.message || "Lỗi không xác định khi đăng bài Instagram" }));
      return true;
    }
  });
}

async function handleInstagramPost(payload) {
  const { caption, images = [], targetName = "" } = payload;

  // 1. Kiểm tra trạng thái đăng nhập Instagram
  if (
    document.querySelector('input[name="username"]') ||
    document.body.innerText.includes("Log In") ||
    document.body.innerText.includes("Đăng nhập") ||
    window.location.pathname.startsWith("/accounts/login")
  ) {
    return { success: false, message: "Tài khoản Instagram chưa đăng nhập trong cửa sổ Chrome này. Vui lòng đăng nhập 1 lần rồi bấm Đăng Bài lại." };
  }

  // 2. Tìm nút "Tạo" (Create) ở thanh menu trái Instagram
  let createBtn = document.querySelector('svg[aria-label*="Bài viết mới"], svg[aria-label*="New post"], svg[aria-label*="Tạo"], svg[aria-label*="Create"]')?.closest('a, div[role="button"], div[tabindex="0"]');
  if (!createBtn) {
    for (const el of Array.from(document.querySelectorAll('a, div[role="button"], span'))) {
      const text = (el.innerText || el.getAttribute("aria-label") || "").trim().toLowerCase();
      if (text === "tạo" || text === "create" || text === "bài viết mới" || text === "new post") {
        createBtn = el.closest('a, div[role="button"]') || el;
        break;
      }
    }
  }
  if (!createBtn) return { success: false, message: "Không tìm thấy nút 'Tạo' (Create) trên menu Instagram." };

  triggerClick(createBtn);
  await sleep(1500);

  // 3. Nếu xuất hiện menu con (Bài viết / Tin), bấm chọn "Bài viết"
  for (let m = 0; m < 5; m++) {
    if (getInstagramDialog()?.querySelector('input[type="file"]')) break;
    const candidates = Array.from(document.querySelectorAll('svg[aria-label*="Bài viết"], svg[aria-label*="Post"], div[role="menu"] div[role="menuitem"], div[role="button"]'));
    let clicked = false;
    for (const item of candidates) {
      if (item.closest('div[role="tablist"], header, a[href]')) continue;
      const clickable = item.closest('div[role="button"], div[role="menuitem"]') || item;
      const txt = (clickable.innerText || clickable.getAttribute("aria-label") || "").trim().toLowerCase();
      if ((txt.includes("bài viết") || txt.includes("post")) && !txt.includes("lưu") && !txt.includes("thẻ") && isElementVisible(clickable)) {
        triggerClick(clickable);
        clicked = true;
        await sleep(1500);
        break;
      }
    }
    if (clicked) break;
    await sleep(600);
  }

  // Chờ hộp thoại tạo bài viết hiển thị (có input file)
  let fileInput = null;
  for (let w = 0; w < 15; w++) {
    const dialog = getInstagramDialog();
    if (dialog) fileInput = dialog.querySelector('input[type="file"]');
    if (fileInput) break;
    const inputs = Array.from(document.querySelectorAll('input[type="file"][accept*="image"]'));
    if (inputs.length > 0) { fileInput = inputs[inputs.length - 1]; break; }
    await sleep(800);
  }
  if (!fileInput) return { success: false, message: "Không tìm thấy ô chọn tải ảnh lên trong hộp thoại Instagram." };

  // 4. Chuyển đổi ảnh và nạp vào file input
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
      fileObjects.push(new File([u8arr], `ig_product_${i + 1}.jpg`, { type: mime }));
    } catch (e) {
      console.warn(`[Social Desk] Bỏ qua ảnh #${i + 1}:`, e.message);
    }
  }
  if (fileObjects.length === 0) return { success: false, message: "Không tải được file ảnh nào để đính kèm lên Instagram." };

  const dt = new DataTransfer();
  fileObjects.forEach((f) => dt.items.add(f));
  try {
    const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "files");
    if (desc?.set) desc.set.call(fileInput, dt.files);
    else fileInput.files = dt.files;
  } catch {
    fileInput.files = dt.files;
  }
  fileInput.dispatchEvent(new Event("change", { bubbles: true }));
  fileInput.dispatchEvent(new Event("input", { bubbles: true }));

  // Chờ Instagram hiển thị ảnh xem trước và nút Tiếp xuất hiện
  for (let w = 0; w < 15; w++) {
    await sleep(1000);
    const dialog = getInstagramDialog();
    const nextBtn = findButtonByText(dialog || document, ["tiếp", "next"]);
    if (nextBtn) break;
  }

  // 5. Bước Crop & Filter: Bấm "Tiếp" (Next) lặp cho đến khi đến màn hình Caption hoặc nút Chia sẻ
  for (let step = 0; step < 8; step++) {
    const dialog = getInstagramDialog() || document;
    const shareBtn = findButtonByText(dialog, ["chia sẻ", "share"]);
    const editor = getInstagramCaptionEditor(dialog);
    if (shareBtn || editor) break;

    const nextBtn = findButtonByText(dialog, ["tiếp", "next"]);
    if (nextBtn) {
      triggerClick(nextBtn);
      await sleep(2500);
    } else {
      await sleep(1000);
    }
  }

  // 6. Điền chú thích (caption)
  let captionEditor = null;
  for (let c = 0; c < 15; c++) {
    const dialog = getInstagramDialog() || document;
    captionEditor = getInstagramCaptionEditor(dialog);
    if (captionEditor) break;
    await sleep(800);
  }

  if (caption && caption.trim().length > 0) {
    if (!captionEditor) return { success: false, message: "Không tìm thấy ô nhập chú thích bài viết trên Instagram." };
    await fillFormattedCaption(captionEditor, caption);
    await sleep(1500);

    const dialog = getInstagramDialog() || document;
    const charCount = getInstagramCharCount(dialog);
    const filledText = (captionEditor.innerText || captionEditor.value || captionEditor.textContent || "").trim();
    console.log(`[Social Desk] Caption Instagram: charCount=${charCount}/2,200, domLen=${filledText.length}`);

    if (charCount === 0 || filledText.length < 10) {
      return {
        success: false,
        message: `Lỗi điền chú thích: Instagram chưa ghi nhận nội dung vào bài viết (Bộ đếm: ${charCount >= 0 ? charCount : 0}/2,200). Đã dừng lại để tránh đăng bài thiếu nội dung. Vui lòng bấm Đăng Bài lại.`,
      };
    }
    await sleep(800);
  }

  // 7. Bấm "Chia sẻ" (Share)
  let shared = false;
  for (let retry = 0; retry < 15; retry++) {
    const dialog = getInstagramDialog() || document;
    const shareBtn = findButtonByText(dialog, ["chia sẻ", "share"]) || findButtonByText(document, ["chia sẻ", "share"]);
    if (shareBtn) {
      shareBtn.scrollIntoView({ behavior: "smooth", block: "center" });
      await sleep(300);
      triggerClick(shareBtn);
      shared = true;
      console.log("[Social Desk] Đã bấm nút Chia sẻ bài viết trên Instagram.");
      break;
    }
    await sleep(1000);
  }
  if (!shared) return { success: false, message: "Không tìm thấy nút 'Chia sẻ' trên hộp thoại Instagram." };

  // 8. Chờ xác nhận chia sẻ hoàn tất (tối đa 40s) và lấy link bài viết
  let detectedPostUrl = payload.targetUrl || window.location.href;
  for (let t = 0; t < 40; t++) {
    await sleep(1000);
    const dialog = getInstagramDialog();
    const bodyTxt = document.body.innerText.toLowerCase();

    const permalinkEl = dialog?.querySelector('a[href^="/p/"], a[href*="instagram.com/p/"]');
    if (permalinkEl) {
      const href = permalinkEl.getAttribute("href") || "";
      detectedPostUrl = href.startsWith("http") ? href : `https://www.instagram.com${href}`;
    }

    if (
      bodyTxt.includes("đã chia sẻ bài viết của bạn") ||
      bodyTxt.includes("your post has been shared") ||
      !document.querySelector('div[role="dialog"]')
    ) {
      return {
        success: true,
        postUrl: detectedPostUrl,
        message: `Đã đăng bài thành công lên Instagram ${targetName ? `"${targetName}"` : ""}`,
      };
    }
  }

  return { success: true, postUrl: detectedPostUrl, message: `Đã gửi bài lên Instagram ${targetName ? `"${targetName}"` : ""}` };
}

function getInstagramCharCount(root) {
  const m = ((root || getInstagramDialog() || document).innerText || "").match(/([\d.,]+)\s*\/\s*2[,.]?200/);
  return m ? parseInt(m[1].replace(/[.,]/g, ""), 10) : -1;
}

// Điền nội dung bài viết giữ trọn vẹn định dạng xuống dòng và khoảng cách dòng
async function fillFormattedCaption(editor, caption) {
  if (!editor || !caption) return;
  const rawText = caption.trim();
  triggerClick(editor);
  editor.focus();
  await sleep(250);

  if (editor.tagName === "TEXTAREA") {
    const desc = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value");
    if (desc?.set) desc.set.call(editor, rawText); else editor.value = rawText;
    editor.dispatchEvent(new Event("input", { bubbles: true }));
    editor.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }

  try { await navigator.clipboard.writeText(rawText); } catch {}

  // 1. Tiêm qua MAIN world (Lexical Editor API dispatchCommand)
  try {
    const res = await new Promise((r) => chrome.runtime.sendMessage({ action: "INJECT_LEXICAL_CAPTION", caption: rawText }, r));
    if (res?.success) await sleep(400);
  } catch {}

  // 2. Dán qua clipboard hệ thống nếu bộ đếm vẫn 0
  const dialog = getInstagramDialog() || document;
  if (getInstagramCharCount(dialog) <= 0) {
    try {
      editor.focus();
      const p = editor.querySelector("p") || editor;
      const range = document.createRange();
      range.selectNodeContents(p);
      range.collapse(false);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
      document.execCommand("paste");
      await sleep(350);
    } catch {}
  }

  // 3. Fallback: chèn từng đoạn qua beforeinput / execCommand
  if (getInstagramCharCount(dialog) <= 0 && (editor.innerText || "").trim().length < 10) {
    editor.focus();
    const lines = rawText.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (i > 0) {
        editor.dispatchEvent(new InputEvent("beforeinput", { inputType: "insertParagraph", bubbles: true, cancelable: true }));
        if (!document.execCommand("insertParagraph", false, null)) document.execCommand("insertLineBreak", false, null);
      }
      const d = line.length > 0 ? line : "\u200B";
      editor.dispatchEvent(new InputEvent("beforeinput", { inputType: "insertText", data: d, bubbles: true, cancelable: true }));
      document.execCommand("insertText", false, d);
    }
  }

  editor.dispatchEvent(new Event("input", { bubbles: true }));
  editor.dispatchEvent(new Event("change", { bubbles: true }));
}
