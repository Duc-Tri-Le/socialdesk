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

// Chuyển đổi chuỗi số tương tác Instagram (vd: "1,2K", "1.234", "350", "2.5M") sang số nguyên
function parseSocialCount(str) {
  if (!str) return 0;
  const cleaned = str.trim().toLowerCase();
  const kmMatch = cleaned.match(/([\d.,]+)\s*([km])/);
  if (kmMatch) {
    const numPart = parseFloat(kmMatch[1].replace(/,/g, ".")) || 0;
    const mult = kmMatch[2] === "m" ? 1000000 : 1000;
    return Math.round(numPart * mult);
  }
  const plainDigits = cleaned.replace(/[^\d]/g, "");
  return parseInt(plainDigits, 10) || 0;
}

// Cào chỉ số tương tác (Lượt thích, Bình luận) từ bài viết hoặc trang cá nhân Instagram
async function scrapeInstagramPostEngagement() {
  let likes = 0;
  let comments = 0;
  let detectedPostUrl = "";

  try {
    // 1. Nếu mở trang profile người dùng (vd: instagram.com/username/ mà không có /p/ hoặc /reel/)
    // Thử bấm bài đầu tiên trong lưới bài đăng để mở hộp thoại bài viết chi tiết
    const isProfile = !window.location.pathname.includes("/p/") && !window.location.pathname.includes("/reel/");
    if (isProfile) {
      const firstPostLink = document.querySelector(
        'article a[href*="/p/"], main a[href*="/p/"], a[href*="/p/"], a[href*="/reel/"]'
      );
      if (firstPostLink) {
        detectedPostUrl = firstPostLink.href || "";
        triggerClick(firstPostLink);
        await sleep(2000);
      }
    }

    // 2. Trích xuất qua Open Graph / Meta tags (Rất nhanh và chính xác trên Instagram SSR)
    const metaDesc =
      document.querySelector('meta[property="og:description"]')?.getAttribute("content") ||
      document.querySelector('meta[name="description"]')?.getAttribute("content") ||
      "";

    if (metaDesc) {
      const lMatch = metaDesc.match(/([\d.,kKmM]+)\s*(?:lượt thích|người thích|likes?|thích)/i);
      if (lMatch) likes = parseSocialCount(lMatch[1]);

      const cMatch = metaDesc.match(/([\d.,kKmM]+)\s*(?:bình luận|comments?)/i);
      if (cMatch) comments = parseSocialCount(cMatch[1]);
    }

    // 3. Quét các phần tử DOM trong bài viết hoặc dialog vừa mở
    const container =
      document.querySelector('div[role="dialog"] article') ||
      document.querySelector('div[role="dialog"]') ||
      document.querySelector('main article') ||
      document.querySelector('article') ||
      document;

    // Lượt thích từ DOM nếu chưa lấy được từ meta
    if (likes === 0) {
      const likeEls = container.querySelectorAll(
        'a[href*="/liked_by/"], section span, div[role="button"] span, span[data-bloks-name]'
      );
      for (const el of likeEls) {
        const txt = (el.innerText || "").trim();
        const aria = (el.getAttribute("aria-label") || "").trim();
        const combined = `${txt} ${aria}`;
        const match = combined.match(/([\d.,kKmM]+)\s*(?:lượt thích|người thích|likes?)/i);
        if (match) {
          const parsed = parseSocialCount(match[1]);
          if (parsed > likes) likes = parsed;
        }
      }
    }

    // Bình luận từ DOM nếu chưa lấy được từ meta
    if (comments === 0) {
      const commentBtns = container.querySelectorAll('div[role="button"], span, a');
      for (const el of commentBtns) {
        const txt = (el.innerText || "").trim();
        const match = txt.match(/(?:xem tất cả|view all)\s*([\d.,kKmM]+)\s*(?:bình luận|comments?)/i);
        if (match) {
          const parsed = parseSocialCount(match[1]);
          if (parsed > comments) comments = parsed;
        }
      }

      if (comments === 0) {
        const commentItems = container.querySelectorAll('ul li[role="menuitem"], ul > div > li');
        if (commentItems.length > 1) {
          comments = commentItems.length - 1;
        }
      }
    }
  } catch (err) {
    console.warn("[Social Desk] Lỗi cào chỉ số Instagram:", err);
  }

  return {
    likes,
    comments,
    shares: 0,
    reach: 0,
    postUrl: detectedPostUrl || window.location.href,
  };
}

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

      // 1. Nếu có link trực tiếp trong dialog
      if (detectedPostUrl && (detectedPostUrl.includes("/p/") || detectedPostUrl.includes("/reel/"))) {
        return {
          success: true,
          postUrl: detectedPostUrl,
          message: `Đã đăng bài thành công lên Instagram ${targetName ? `"${targetName}"` : ""}`,
        };
      }

      // 2. Thử tìm nút "Xem bài viết" / "View post"
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

      // 3. Đóng dialog và điều hướng sang Trang cá nhân để lấy bài mới nhất trên lưới
      try {
        const closeBtn = dialog?.querySelector('svg[aria-label*="Đóng"], svg[aria-label*="Close"]')?.closest('button, div[role="button"]') ||
          dialog?.querySelector('button[aria-label*="Đóng"], button[aria-label*="Close"]');
        if (closeBtn) {
          triggerClick(closeBtn);
          await sleep(600);
        }

        // Bấm nút Trang cá nhân ở menu trái Instagram
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

        // Đợi lưới bài viết hiển thị và lấy link bài viết đầu tiên (bài vừa đăng)
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

      // Fallback: nếu vẫn không lấy được link /p/, dùng profileUrl của tài khoản (ví dụ https://www.instagram.com/ducgarage01/)
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

function getInstagramCharCount(root) {
  const container = root || getInstagramDialog() || document;
  const text = container.innerText || "";
  // Khớp cả các dạng phân cách dấu chấm, phẩy hoặc khoảng trắng: 350/2.200, 350 / 2.200, 350/2,200, 350 / 2,200, 350/2200
  const m = text.match(/([\d.,\s]+)\s*\/\s*2[,.\s]?200/);
  if (m) {
    const numStr = m[1].replace(/[.,\s]/g, "");
    const n = parseInt(numStr, 10);
    return isNaN(n) ? -1 : n;
  }
  return -1;
}

// Chuẩn hóa và làm sạch nội dung bài viết cho Instagram:
// 1. Giới hạn hashtag tối đa 12 tags để chống bộ lọc tự động của Instagram quét phạt / xóa sạch caption
// 2. Cắt an toàn không vượt ngưỡng 2.050 ký tự (dưới giới hạn trần 2.200)
// 3. QUAN TRỌNG: Thêm khoảng trắng ở cuối cùng để Instagram KHÔNG kích hoạt dropdown gợi ý hashtag autocomplete
function cleanCaptionForInstagram(caption) {
  if (!caption) return "";
  let text = caption.trim();

  const hashtags = text.match(/#[^\s#]+/g);
  if (hashtags && hashtags.length > 12) {
    const keptTags = hashtags.slice(0, 12);
    const firstTagIndex = text.indexOf(hashtags[0]);
    if (firstTagIndex !== -1) {
      const body = text.substring(0, firstTagIndex).trim();
      text = `${body}\n\n${keptTags.join(" ")}`;
    }
  }

  if (text.length > 2050) {
    text = text.substring(0, 2040).trim() + "...";
  }

  // Thêm khoảng trắng ở cuối cùng: Hashtag autocomplete chỉ kích hoạt khi con trỏ ở sát sau ký tự của tag.
  // Khoảng trắng sau tag cuối cùng sẽ ngăn chặn 100% việc hiển thị popup gợi ý hashtag làm kẹt bộ đếm 0/2.200
  return text.trim() + " ";
}

// Điền nội dung bài viết giữ trọn vẹn định dạng xuống dòng và khoảng cách dòng
// Ưu tiên native paste (ClipboardEvent + DataTransfer) chuẩn Lexical PASTE_COMMAND
async function fillFormattedCaption(editor, caption) {
  if (!editor || !caption) return;
  const rawText = cleanCaptionForInstagram(caption);

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

  // 1. Xóa sạch khung soạn thảo trước khi nạp bài
  try {
    editor.focus();
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(editor);
    sel.removeAllRanges();
    sel.addRange(range);
    document.execCommand("selectAll", false, null);
    document.execCommand("delete", false, null);
  } catch {}
  await sleep(150);

  // 2. Phương pháp 1: Native DataTransfer Paste (Kích hoạt Lexical PASTE_COMMAND)
  let pasteSuccess = false;
  try {
    const dt = new DataTransfer();
    dt.setData("text/plain", rawText);
    dt.setData("text/html", rawText.replace(/\n/g, "<br>"));

    editor.dispatchEvent(new InputEvent("beforeinput", {
      inputType: "insertFromPaste",
      dataTransfer: dt,
      bubbles: true,
      cancelable: true,
      composed: true,
    }));

    editor.dispatchEvent(new ClipboardEvent("paste", {
      clipboardData: dt,
      bubbles: true,
      cancelable: true,
      composed: true,
    }));
    await sleep(400);

    const dialog = getInstagramDialog() || document;
    const count = getInstagramCharCount(dialog);
    if (count > 0) {
      pasteSuccess = true;
      console.log(`[Social Desk] Paste native qua DataTransfer thành công! Bộ đếm: ${count}/2.200`);
    }
  } catch (e) {
    console.warn("[Social Desk] Lỗi dispatch DataTransfer paste:", e);
  }

  // 3. Phương pháp 2: Clipboard API fallback
  if (!pasteSuccess) {
    try {
      await navigator.clipboard.writeText(rawText);
      editor.focus();
      document.execCommand("paste");
      await sleep(350);

      const dialog = getInstagramDialog() || document;
      const count = getInstagramCharCount(dialog);
      if (count > 0) {
        pasteSuccess = true;
        console.log(`[Social Desk] Paste qua navigator.clipboard thành công! Bộ đếm: ${count}/2.200`);
      }
    } catch {}
  }

  // 4. Phương pháp 3: Gõ chi tiết từng dòng qua insertText & insertParagraph
  if (!pasteSuccess) {
    editor.focus();
    document.execCommand("selectAll", false, null);
    document.execCommand("delete", false, null);
    await sleep(100);

    const lines = rawText.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (i > 0) {
        editor.dispatchEvent(new InputEvent("beforeinput", { inputType: "insertParagraph", bubbles: true, cancelable: true }));
        if (!document.execCommand("insertParagraph", false, null)) {
          document.execCommand("insertLineBreak", false, null);
        }
      }
      if (line.length > 0) {
        document.execCommand("insertText", false, line);
      } else {
        document.execCommand("insertText", false, "\u200B");
      }
    }
    await sleep(300);
  }

  // 5. Đóng triệt để menu gợi ý hashtag / autocomplete để Instagram commit state
  try {
    editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true }));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true }));
    await sleep(100);
    // Bấm nhẹ vào nhãn bộ đếm ký tự để unfocus dropdown hashtag
    const countEl = Array.from(document.querySelectorAll("span, div")).find((el) => {
      const t = el.innerText || "";
      return t.includes("/2,200") || t.includes("/2.200") || t.includes("/2200");
    });
    if (countEl) triggerClick(countEl);
  } catch {}

  editor.dispatchEvent(new Event("input", { bubbles: true }));
  editor.dispatchEvent(new Event("change", { bubbles: true }));
}
