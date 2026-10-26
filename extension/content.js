// Social Desk Connector - Facebook Automation Content Script
// Tự động hóa điền nội dung, đính kèm ảnh và xác minh kết quả bài đăng thực tế

if (!window.__socialDeskFbScriptLoaded) {
  window.__socialDeskFbScriptLoaded = true;
  console.log("[Social Desk] Content script sẵn sàng trên:", window.location.href);

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
  });
}

async function handlePost(payload) {
  const { caption, images = [], targetKind = "", targetName = "" } = payload;

  // 1. Kiểm tra trạng thái đăng nhập Facebook
  if (
    document.body.innerText.includes("Log into Facebook") ||
    document.body.innerText.includes("Đăng nhập Facebook") ||
    window.location.pathname.startsWith("/login") ||
    document.querySelector('form[action*="/login"]')
  ) {
    return { success: false, message: "Tài khoản Facebook chưa đăng nhập trong Chrome này. Vui lòng đăng nhập 1 lần rồi bấm Đăng Bài lại." };
  }

  // 2. Tìm ô mở hộp thoại soạn bài theo đích (Fanpage / Nhóm / Cá nhân)
  const isGroup = targetKind === "group" || window.location.pathname.includes("/groups/");
  const isPage = targetKind === "page";
  console.log(`[Social Desk] Tìm ô đăng bài cho đích: ${targetKind || (isGroup ? "nhóm" : isPage ? "fanpage" : "cá nhân")}...`);

  let existingComposer = Array.from(document.querySelectorAll('div[role="dialog"]')).find((d) =>
    isElementVisible(d) && d.querySelector('div[role="textbox"], div[data-lexical-editor="true"], div[contenteditable="true"]')
  );

  if (!existingComposer) {
    const triggerSelectors = [
      'div[role="main"] div[role="button"]',
      'div[data-pagelet*="Composer"] div[role="button"]',
      'div[role="feed"] div[role="button"]',
      'div[aria-label*="Bạn đang nghĩ gì"]',
      'div[aria-label*="Tạo bài viết"]',
      'div[aria-label*="Viết gì đó"]',
      'div[role="button"][tabindex="0"]',
    ];
    if (isGroup) {
      triggerSelectors.unshift('div[aria-label*="thảo luận"]', 'div[aria-label*="Tạo bài viết bán hàng"]');
    }

    let postTrigger = null;
    const allButtons = Array.from(document.querySelectorAll(triggerSelectors.join(",")));
    for (const btn of allButtons) {
      if (!isElementVisible(btn)) continue;
      const href = btn.closest('a[href]')?.getAttribute("href") || "";
      if (href && !href.startsWith("#") && !href.startsWith("javascript:")) continue;

      const aria = (btn.getAttribute("aria-label") || "").toLowerCase().trim();
      const text = (btn.innerText || "").toLowerCase().trim();
      const combined = `${aria} ${text}`;
      if (combined.includes("chuyển") || combined.includes("switch") || combined.includes("quản lý") || combined.includes("manage") || combined.length > 40) {
        continue;
      }
      const isMatch =
        aria.includes("bạn đang nghĩ gì") || text.includes("bạn đang nghĩ gì") ||
        aria.includes("what's on your mind") || text.includes("what's on your mind") ||
        aria === "tạo bài viết" || text === "tạo bài viết" ||
        aria.includes("viết gì đó") || text.includes("viết gì đó") ||
        (isGroup && (aria.includes("thảo luận") || text.includes("thảo luận") || aria.includes("bán gì") || text.includes("bán gì")));
      if (isMatch) { postTrigger = btn; break; }
    }

    if (postTrigger) {
      postTrigger.scrollIntoView({ behavior: "smooth", block: "center" });
      await sleep(500);
      triggerClick(postTrigger);
      console.log("[Social Desk] Đã bấm nút mở hộp thoại soạn bài Facebook.");
    } else {
      const targetLabel = isGroup ? "Nhóm" : isPage ? "Fanpage" : "Trang cá nhân";
      return { success: false, message: `Không tìm thấy ô bắt đầu tạo bài viết trên ${targetLabel} Facebook (Bạn đang nghĩ gì? / Tạo bài viết).` };
    }
  }

  // 3. Chờ modal soạn thảo xuất hiện
  let dialog = null;
  for (let i = 0; i < 20; i++) {
    const dialogs = Array.from(document.querySelectorAll('div[role="dialog"]')).filter(isElementVisible);
    dialog = dialogs.find((d) => d.querySelector('div[role="textbox"], div[data-lexical-editor="true"], div[contenteditable="true"]')) || dialogs[dialogs.length - 1];
    if (dialog && isElementVisible(dialog)) break;
    await sleep(500);
  }

  if (!dialog) {
    return { success: false, message: "Không mở được hộp thoại soạn bài trên Facebook. Hãy đảm bảo bạn có quyền đăng bài trên trang / nhóm này." };
  }
  await sleep(800);

  // 4. Tìm ô nhập văn bản và điền caption (chờ Lexical / React editor khởi tạo)
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
  if (!editor) {
    return { success: false, message: "Không tìm thấy ô nhập nội dung bài viết trong hộp thoại Facebook." };
  }

  await fillFormattedCaption(editor, caption || "");
  console.log("[Social Desk] Đã điền xong nội dung bài viết với đầy đủ ngắt dòng và khoảng cách");
  await sleep(1000);

  // 5. Đính kèm ảnh (nếu có)
  if (images && images.length > 0) {
    console.log(`[Social Desk] Bắt đầu tải và đính kèm ${images.length} ảnh...`);
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
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) u8arr[n] = bstr.charCodeAt(n);
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
  let nextStepClicks = 0;
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

    // TH1: Tìm thấy nút Đăng đã kích hoạt
    if (foundPost) {
      console.log(`[Social Desk] Nút Đăng đã sẵn sàng sau ${second}s.`);
      foundPost.scrollIntoView({ behavior: "smooth", block: "center" });
      await sleep(400);
      triggerClick(foundPost);
      console.log("[Social Desk] Đã bấm nút Đăng bài Facebook.");
      postSuccessClicked = true;
      break;
    }

    // TH2: Nút Tiếp trên Fanpage (chuyển bước sang Đăng)
    if (foundNext) {
      console.log(`[Social Desk] Nút Tiếp trên Fanpage đã sẵn sàng sau ${second}s, bấm chuyển bước...`);
      foundNext.scrollIntoView({ behavior: "smooth", block: "center" });
      await sleep(400);
      triggerClick(foundNext);
      nextStepClicks++;
      await sleep(2500);
      continue;
    }

    if (hasDisabledAction) {
      console.log(`[Social Desk] [${second + 1}/${maxWaitSeconds}s] Facebook đang tải ảnh, tiếp tục chờ...`);
    }
    await sleep(1000);
  }

  if (!postSuccessClicked) {
    const btnNames = lastDetectedButtons.slice(0, 4).map((b) => `"${b.text}"(${b.type}, disabled=${b.disabled})`).join(", ");
    return { success: false, message: `Nút 'Đăng' chưa sẵn sàng sau 60s. Các nút phát hiện: [${btnNames || "không tìm thấy"}]. Hãy thử lại.` };
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

  if (!postFinished) {
    return { success: false, message: "Facebook xử lý đăng bài quá lâu hoặc xuất hiện cảnh báo chặn tính năng." };
  }

  // 8. Trích xuất permalink bài viết
  await sleep(2000);
  const detectedPostUrl = await tryDetectPostPermalink(payload.targetUrl || window.location.href);

  let successMsg = "Đã đăng bài thành công lên Facebook";
  if (isGroup) {
    successMsg = isPendingApproval
      ? `Đã gửi bài vào nhóm "${targetName || "Facebook"}" (đang chờ Quản trị viên duyệt)`
      : `Đã đăng bài thành công vào nhóm "${targetName || "Facebook"}"`;
  } else if (isPage) {
    successMsg = `Đã đăng bài thành công lên Fanpage "${targetName || "Facebook"}"`;
  } else {
    successMsg = `Đã đăng bài thành công lên trang cá nhân "${targetName || "Facebook"}"`;
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

  // 1. Tạo Range Selection hợp lệ để Lexical's $getSelection() không bị null
  try {
    const sel = window.getSelection();
    const range = document.createRange();
    if (editor.childNodes.length > 0) {
      range.selectNodeContents(editor);
      range.collapse(false);
    } else {
      range.setStart(editor, 0);
      range.setEnd(editor, 0);
    }
    sel.removeAllRanges();
    sel.addRange(range);
  } catch {}

  // 2. Chèn qua synthetic paste với cả text/plain và text/html
  let pasteOk = false;
  try {
    const dt = new DataTransfer();
    dt.setData("text/plain", rawText);
    const html = rawText
      .split(/\r?\n/)
      .map((l) => (l.length > 0 ? `<p>${l.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>` : "<p><br></p>"))
      .join("");
    dt.setData("text/html", html);
    editor.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    await sleep(400);

    const now = (editor.innerText || editor.textContent || "").trim();
    if (now.length >= Math.min(rawText.length * 0.4, 30) && (!rawText.includes("\n") || now.includes("\n"))) {
      pasteOk = true;
    }
  } catch {}

  // 3. Fallback: Nếu paste bị chặn, thử writeText + clipboard hoặc chèn từng đoạn
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
        if (!document.execCommand("insertParagraph", false, null)) {
          document.execCommand("insertLineBreak", false, null);
        }
      }
      if (line.length > 0) {
        document.execCommand("insertText", false, line);
      }
    }
  }

  editor.dispatchEvent(new Event("input", { bubbles: true }));
  editor.dispatchEvent(new Event("change", { bubbles: true }));
}


