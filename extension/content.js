// Social Desk Connector - Facebook Automation Content Script
// Tự động hóa điền nội dung, đính kèm ảnh và xác minh kết quả bài đăng thực tế

console.log("[Social Desk] Content script đã sẵn sàng trên trang:", window.location.href);

// Báo cáo thông tin nick Facebook về Background Script khi trang sẵn sàng
setTimeout(() => {
  const info = getFacebookProfileInfo();
  if (info.name || info.profileUrl) {
    chrome.runtime.sendMessage({
      action: "FB_PROFILE_DETECTED",
      fbName: info.name,
      fbUrl: info.profileUrl,
    }).catch(() => {});
  }
}, 1500);

// Lắng nghe tín hiệu kiểm tra (Ping) và lệnh đăng bài (DO_POST)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "PING") {
    const info = getFacebookProfileInfo();
    sendResponse({
      pong: true,
      url: window.location.href,
      fbName: info.name,
      fbUrl: info.profileUrl,
    });
    return true;
  }

  if (request.action === "DO_POST") {
    handlePost(request.payload)
      .then((res) => sendResponse(res))
      .catch((err) => {
        sendResponse({
          success: false,
          message: err.message || "Lỗi không xác định trong quá trình tự động hóa",
        });
      });
    return true; // Bắt buộc cho phản hồi bất đồng bộ trong Chrome Extensions
  }

  if (request.action === "SCRAPE_POST_METRICS") {
    const metrics = scrapeFacebookPostEngagement();
    sendResponse(metrics);
    return true;
  }
});

async function handlePost(payload) {
  const { caption, images = [] } = payload;

  // 1. Kiểm tra trạng thái đăng nhập Facebook
  if (
    document.body.innerText.includes("Log into Facebook") ||
    document.body.innerText.includes("Đăng nhập Facebook") ||
    window.location.pathname.startsWith("/login") ||
    document.querySelector('form[action*="/login"]')
  ) {
    return {
      success: false,
      message: "Tài khoản Facebook chưa đăng nhập trong cửa sổ Chrome này. Vui lòng đăng nhập 1 lần rồi bấm Đăng Bài lại.",
    };
  }

  // 2. Tìm ô mở hộp thoại soạn thảo bài viết
  console.log("[Social Desk] Đang tìm ô mở hộp thoại đăng bài...");
  const triggerSelectors = [
    'div[data-pagelet*="Composer"] div[role="button"]',
    'div[aria-label*="Bạn đang nghĩ gì"]',
    'div[aria-label*="Viết gì đó"]',
    'div[aria-label*="Tạo bài viết"]',
    'div[aria-label*="Create a post"]',
    'div[aria-label*="What\'s on your mind"]',
    'div[aria-label*="Write something"]',
    'div[role="button"][tabindex="0"]',
  ];

  let postTrigger = null;
  const allButtons = Array.from(document.querySelectorAll(triggerSelectors.join(",")));

  for (const btn of allButtons) {
    const text = (btn.innerText || btn.getAttribute("aria-label") || "").toLowerCase().trim();
    if (
      text.includes("nghĩ gì") ||
      text.includes("viết gì") ||
      text.includes("tạo bài viết") ||
      text.includes("bán gì") ||
      text.includes("what's on your mind") ||
      text.includes("write something") ||
      text.includes("create a post") ||
      text.includes("create post")
    ) {
      postTrigger = btn;
      break;
    }
  }

  // Nếu đã có sẵn dialog mở từ trước, tận dụng luôn
  let existingDialog = document.querySelector('div[role="dialog"]');

  if (!existingDialog && postTrigger) {
    postTrigger.scrollIntoView({ behavior: "smooth", block: "center" });
    await sleep(400);
    postTrigger.click();
    console.log("[Social Desk] Đã bấm nút mở hộp thoại soạn bài.");
  } else if (!existingDialog) {
    console.warn("[Social Desk] Không thấy nút kích hoạt, chờ xem dialog có tự mở...");
  }

  // 3. Chờ modal soạn thảo (dialog) xuất hiện
  let dialog = null;
  for (let i = 0; i < 20; i++) {
    dialog = document.querySelector('div[role="dialog"]');
    if (dialog && isElementVisible(dialog)) break;
    await sleep(500);
  }

  if (!dialog) {
    return {
      success: false,
      message: "Không mở được hộp thoại soạn bài trên Facebook. Hãy đảm bảo bạn có quyền đăng bài trên trang / nhóm này.",
    };
  }

  await sleep(800);

  // 4. Tìm ô nhập văn bản (contenteditable / Lexical editor)
  const editorSelectors = [
    'div[role="dialog"] div[role="textbox"][contenteditable="true"]',
    'div[role="dialog"] div[data-lexical-editor="true"]',
    'div[role="dialog"] div[data-editor="true"]',
    'div[role="dialog"] div[contenteditable="true"]',
  ];

  let editor = null;
  for (const sel of editorSelectors) {
    editor = dialog.querySelector(sel);
    if (editor && isElementVisible(editor)) break;
  }

  if (!editor) {
    return {
      success: false,
      message: "Không tìm thấy ô nhập nội dung bài viết trong hộp thoại Facebook.",
    };
  }

  // Focus và điền caption an toàn
  editor.focus();
  await sleep(300);

  // Xóa nội dung mặc định cũ nếu có
  document.execCommand("selectAll", false, null);

  // Điền văn bản vào Lexical editor qua execCommand và InputEvent
  const successInsert = document.execCommand("insertText", false, caption || "");
  if (!successInsert) {
    editor.innerText = caption || "";
    editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: caption || "" }));
  }

  editor.dispatchEvent(new Event("change", { bubbles: true }));
  console.log("[Social Desk] Đã điền xong nội dung bài viết");
  await sleep(1000);

  // 5. Đính kèm ảnh (nếu có yêu cầu đính kèm ảnh)
  if (images && images.length > 0) {
    console.log(`[Social Desk] Bắt đầu tải và đính kèm ${images.length} ảnh...`);

    // Tải trước toàn bộ file ảnh bằng Base64 in-memory hoặc qua Background (tránh triệt để CORS & CSP của Facebook)
    const fileObjects = [];
    for (let i = 0; i < images.length; i++) {
      const imgUrl = images[i];
      try {
        let fileDataUrl = imgUrl;

        // Nếu là URL mạng thông thường, nhờ Background Script tải để không bị chặn bởi CSP trang Facebook
        if (!fileDataUrl.startsWith("data:")) {
          fileDataUrl = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ action: "FETCH_IMAGE", url: imgUrl }, (response) => {
              if (chrome.runtime.lastError || !response || !response.success) {
                reject(new Error(response?.error || chrome.runtime.lastError?.message || "Lỗi tải ảnh qua background"));
              } else {
                resolve(response.dataUrl);
              }
            });
          });
        }

        // Chuyển Data URL (base64) thành File Object trong bộ nhớ
        const arr = fileDataUrl.split(",");
        const mimeMatch = arr[0].match(/:(.*?);/);
        const mime = mimeMatch ? mimeMatch[1] : "image/jpeg";
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
          u8arr[n] = bstr.charCodeAt(n);
        }
        const fileObj = new File([u8arr], `product_img_${i + 1}.jpg`, { type: mime });
        fileObjects.push(fileObj);
      } catch (err) {
        console.warn(`[Social Desk] Bỏ qua ảnh #${i + 1} do lỗi tải:`, err.message);
      }
    }

    if (fileObjects.length > 0) {
      // Tìm input file ẩn của Facebook
      let fileInput = dialog.querySelector('input[type="file"][accept*="image"]');

      // Nếu chưa có input file, bấm nút mở phần đính kèm ảnh / video
      if (!fileInput) {
        const photoButtons = Array.from(dialog.querySelectorAll('div[aria-label*="Ảnh/video"], div[aria-label*="Photo/video"], div[aria-label*="Ảnh"]'));
        for (const pb of photoButtons) {
          if (isElementVisible(pb)) {
            pb.click();
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
          console.log(`[Social Desk] Đã đính kèm thành công ${fileObjects.length} ảnh vào bài`);
          // Đợi Facebook tải và hiển thị thumbnail ảnh (3-5 giây)
          await sleep(3500);
        } catch (inputErr) {
          console.warn("[Social Desk] Lỗi gán DataTransfer vào file input:", inputErr);
        }
      } else {
        console.warn("[Social Desk] Không tìm thấy input tải ảnh trong dialog Facebook");
      }
    }
  }

  // 6. Tìm nút "Đăng" / "Post"
  console.log("[Social Desk] Đang tìm nút Đăng bài...");
  const postButtons = Array.from(
    dialog.querySelectorAll('div[aria-label="Đăng"], div[aria-label="Post"], div[aria-label="Tiếp"], div[aria-label="Next"], div[role="button"]')
  );

  let submitBtn = null;
  for (const btn of postButtons) {
    const text = (btn.innerText || btn.getAttribute("aria-label") || "").trim().toLowerCase();
    const isAriaPost = btn.getAttribute("aria-label") === "Đăng" || btn.getAttribute("aria-label") === "Post";
    if (isAriaPost || text === "đăng" || text === "post") {
      if (isElementVisible(btn) && btn.getAttribute("aria-disabled") !== "true") {
        submitBtn = btn;
        break;
      }
    }
  }

  if (!submitBtn) {
    return {
      success: false,
      message: "Nút 'Đăng' chưa sẵn sàng hoặc bị vô hiệu hóa (Facebook có thể đang tải ảnh hoặc yêu cầu thêm thông tin).",
    };
  }

  // 7. Bấm Đăng bài
  submitBtn.scrollIntoView({ behavior: "smooth", block: "center" });
  await sleep(400);
  submitBtn.click();
  console.log("[Social Desk] Đã bấm nút Đăng bài trên Facebook.");

  // 8. Chờ bài đăng gửi xong (dialog đóng lại hoặc xuất hiện thông báo)
  let postFinished = false;
  let isPendingApproval = false;
  for (let t = 0; t < 25; t++) {
    await sleep(1000);

    // Kiểm tra xem bài có chuyển sang chế độ Chờ duyệt (Pending approval) của Nhóm không
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

    // Nếu dialog soạn bài đã biến mất → Bài đăng đã gửi thành công
    const currentDialog = document.querySelector('div[role="dialog"]');
    if (!currentDialog || !isElementVisible(currentDialog)) {
      postFinished = true;
      break;
    }
  }

  if (!postFinished) {
    return {
      success: false,
      message: "Facebook xử lý đăng bài quá lâu hoặc xuất hiện cảnh báo chặn tính năng.",
    };
  }

  // 9. Thử lấy permalink bài viết vừa đăng
  await sleep(2000);
  const detectedPostUrl = await tryDetectPostPermalink(payload.targetUrl || window.location.href);

  return {
    success: true,
    postUrl: detectedPostUrl || payload.targetUrl || window.location.href,
    pendingApproval: isPendingApproval,
    message: isPendingApproval
      ? "Đã gửi bài thành công (Bài đang chờ Quản trị viên nhóm phê duyệt)"
      : "Đã đăng bài thành công lên Facebook",
  };
}
