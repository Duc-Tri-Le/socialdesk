// Social Desk Connector - Instagram Automation Content Script
// Tự động hóa đăng bài viết (ảnh carousel + caption) lên Instagram Web qua Chrome Extension

console.log("[Social Desk] Instagram content script đã sẵn sàng trên:", window.location.href);

if (!window.__socialDeskIgScriptLoaded) {
  window.__socialDeskIgScriptLoaded = true;

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "PING") {
      sendResponse({ pong: true, url: window.location.href, platform: "instagram" });
      return false;
    }
    if (request.action === "SCRAPE_POST_METRICS") {
      scrapeInstagramPostEngagement()
        .then((metrics) => sendResponse(metrics))
        .catch((err) => sendResponse({ likes: 0, comments: 0, shares: 0, reach: 0, error: err?.message }));
      return true;
    }
    if (request.action === "DO_INSTAGRAM_POST" || request.action === "DO_POST") {
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

    let captionVerified = false;
    let lastCharCount = -1;

    for (let attempt = 1; attempt <= 3; attempt++) {
      console.log(`[Social Desk] Điền caption Instagram (lần thử ${attempt}/3)...`);
      await fillFormattedCaption(captionEditor, caption);
      await sleep(1500);

      const dialog = getInstagramDialog() || document;
      lastCharCount = getInstagramCharCount(dialog);

      // Nếu bộ đếm vẫn 0 ký tự, gọi background service worker tiêm native paste trong MAIN world
      if (lastCharCount <= 0) {
        console.log("[Social Desk] Bộ đếm Instagram đang 0 ký tự, yêu cầu MAIN world Lexical injection...");
        try {
          await new Promise((resolve) => {
            chrome.runtime.sendMessage(
              { action: "INJECT_LEXICAL_CAPTION", caption: cleanCaptionForInstagram(caption) },
              (res) => resolve(res)
            );
          });
          await sleep(1500);
          lastCharCount = getInstagramCharCount(dialog);
        } catch (e) {
          console.warn("[Social Desk] Lỗi gọi INJECT_LEXICAL_CAPTION:", e);
        }
      }

      console.log(`[Social Desk] Kiểm tra bộ đếm Instagram: charCount=${lastCharCount}/2,200 (yêu cầu > 0)`);

      // BẮT BUỘC lastCharCount > 0 để đảm bảo React state của Instagram đã nhận nội dung
      if (lastCharCount > 0) {
        captionVerified = true;
        console.log(`[Social Desk] ✓ Instagram đã ghi nhận đầy đủ nội dung bài viết (${lastCharCount} ký tự).`);
        break;
      }
      await sleep(1000);
    }

    if (!captionVerified || lastCharCount <= 0) {
      return {
        success: false,
        message: `Lỗi điền chú thích: Bộ đếm ký tự Instagram vẫn đang hiển thị 0/2.200 (Instagram chưa tiếp nhận nội dung vào React state). Hệ thống đã tự động dừng lại để bảo vệ bài viết không bị đăng trống nội dung. Vui lòng bấm Đăng Bài lại.`,
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

  // 8. Chờ xác nhận chia sẻ hoàn tất (tối đa 40s) và lấy link bài viết chi tiết (/p/...)
  let detectedPostUrl = "";
  for (let t = 0; t < 40; t++) {
    await sleep(1000);
    const dialog = getInstagramDialog();
    const bodyTxt = document.body.innerText.toLowerCase();

    const permalinkEl = dialog?.querySelector('a[href^="/p/"], a[href*="instagram.com/p/"], a[href*="/reel/"]');
    if (permalinkEl) {
      const href = permalinkEl.getAttribute("href") || "";
      detectedPostUrl = href.startsWith("http") ? href : `https://www.instagram.com${href}`;
    }

    if (
      bodyTxt.includes("đã chia sẻ bài viết của bạn") ||
      bodyTxt.includes("your post has been shared") ||
      !document.querySelector('div[role="dialog"]')
    ) {
      console.log("[Social Desk] Instagram đã chia sẻ bài viết thành công. Tiến hành dò link bài viết cụ thể...");

      if (detectedPostUrl && (detectedPostUrl.includes("/p/") || detectedPostUrl.includes("/reel/"))) {
        return {
          success: true,
          postUrl: detectedPostUrl,
          message: `Đã đăng bài thành công lên Instagram ${targetName ? `"${targetName}"` : ""}`,
        };
      }

      const viewPostBtn = findButtonByText(dialog || document, ["xem bài viết", "view post", "xem bài"]);
      if (viewPostBtn) {
        triggerClick(viewPostBtn);
        await sleep(1500);
        if (window.location.pathname.startsWith("/p/") || window.location.pathname.startsWith("/reel/")) {
          return {
            success: true,
            postUrl: window.location.href,
            message: `Đã đăng bài thành công lên Instagram ${targetName ? `"${targetName}"` : ""}`,
          };
        }
      }

      try {
        const closeBtn = dialog?.querySelector('svg[aria-label*="Đóng"], svg[aria-label*="Close"]')?.closest('button, div[role="button"]') ||
          dialog?.querySelector('button[aria-label*="Đóng"], button[aria-label*="Close"]');
        if (closeBtn) {
          triggerClick(closeBtn);
          await sleep(600);
        }

        let profileLinkEl = null;
        for (const a of Array.from(document.querySelectorAll('a[href^="/"]'))) {
          const txt = (a.innerText || a.getAttribute("aria-label") || "").toLowerCase().trim();
          if (txt === "trang cá nhân" || txt === "profile" || txt.includes("trang cá nhân") || txt.includes("profile")) {
            profileLinkEl = a;
            break;
          }
        }

        if (profileLinkEl) {
          triggerClick(profileLinkEl);
          await sleep(1200);
        } else if (payload.profileUrl && !payload.profileUrl.endsWith("instagram.com/")) {
          window.location.href = payload.profileUrl;
          await sleep(1800);
        }

        for (let pWait = 0; pWait < 10; pWait++) {
          const firstPost = document.querySelector('main a[href*="/p/"], article a[href*="/p/"], div[style*="flex-direction: column"] a[href*="/p/"]');
          if (firstPost) {
            const href = firstPost.getAttribute("href") || "";
            if (href.includes("/p/")) {
              detectedPostUrl = href.startsWith("http") ? href : `https://www.instagram.com${href}`;
              console.log("[Social Desk] Đã lấy được link bài viết vừa đăng trên Instagram:", detectedPostUrl);
              break;
            }
          }
          await sleep(600);
        }
      } catch (e) {
        console.warn("[Social Desk] Lỗi khi lấy link bài viết từ trang cá nhân Instagram:", e);
      }

      if (!detectedPostUrl || detectedPostUrl === "https://www.instagram.com/" || detectedPostUrl.endsWith("instagram.com/")) {
        const profileFallback = payload.profileUrl && !payload.profileUrl.endsWith("instagram.com/")
          ? payload.profileUrl
          : payload.targetName
            ? `https://www.instagram.com/${payload.targetName.toLowerCase().replace(/\s+/g, "")}/`
            : "https://www.instagram.com/";
        detectedPostUrl = profileFallback;
      }

      return {
        success: true,
        postUrl: detectedPostUrl,
        message: `Đã đăng bài thành công lên Instagram ${targetName ? `"${targetName}"` : ""}`,
      };
    }
  }

  const fallback = payload.profileUrl || payload.targetUrl || window.location.href;
  return { success: true, postUrl: detectedPostUrl || fallback, message: `Đã gửi bài lên Instagram ${targetName ? `"${targetName}"` : ""}` };
}
