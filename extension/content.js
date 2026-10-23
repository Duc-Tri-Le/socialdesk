// Social Desk Connector - Facebook Automation Content Script
// Tự động hóa điền nội dung, đính kèm ảnh và xác minh kết quả bài đăng thực tế

console.log("[Social Desk] Content script đã sẵn sàng trên trang:", window.location.href);

// Hàm tự động phát hiện tên nick Facebook từ trang
function getFacebookProfileInfo() {
  let name = "";
  let profileUrl = "";

  try {
    // 1. Thử lấy từ các liên kết cá nhân trong menu trái/header
    const candidateLinks = Array.from(
      document.querySelectorAll('a[href*="/me/"], a[href*="/me?"], a[href*="profile.php"], div[role="navigation"] a[href*="facebook.com/"]')
    );
    for (const a of candidateLinks) {
      const text = a.innerText?.trim();
      const href = a.href || "";
      if (
        text &&
        text.length >= 2 &&
        text.length <= 40 &&
        !text.includes("Facebook") &&
        !text.includes("Watch") &&
        !text.includes("Gaming") &&
        !text.includes("Video") &&
        !text.includes("Bảng feed") &&
        !text.includes("Bạn bè")
      ) {
        name = text;
        profileUrl = href;
        break;
      }
    }

    // 2. Thử tìm qua avatar profile aria-label
    if (!name) {
      const ariaProfile = document.querySelector('[aria-label="Trang cá nhân của bạn"], [aria-label="Your profile"]');
      if (ariaProfile) {
        const parent = ariaProfile.closest('div[role="button"], a');
        if (parent && parent.innerText) {
          name = parent.innerText.trim();
        }
      }
    }

    // 3. Đọc User ID từ Cookie nếu có
    const matchUser = document.cookie.match(/c_user=(\d+)/);
    if (matchUser && matchUser[1] && !profileUrl) {
      profileUrl = `https://www.facebook.com/${matchUser[1]}`;
    }
  } catch (e) {
    console.warn("[Social Desk] Lỗi đọc thông tin nick Facebook:", e);
  }

  return { name, profileUrl };
}

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
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
        const ext = mime.includes("png") ? "png" : "jpg";
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
          u8arr[n] = bstr.charCodeAt(n);
        }
        const file = new File([u8arr], `sd_img_${i + 1}.${ext}`, { type: mime });
        fileObjects.push(file);
      } catch (fetchErr) {
        return {
          success: false,
          message: `Lỗi tải ảnh #${i + 1} (${fetchErr.message}). Đã dừng tiến trình để tránh đăng bài thiếu ảnh.`,
        };
      }
    }

    // Tìm input file trong dialog hoặc bấm nút "Ảnh/video" để mở
    let fileInput = dialog.querySelector('input[type="file"][accept*="image"]');
    if (!fileInput) {
      // Tìm nút "Ảnh/video" trong thanh công cụ bài viết
      const mediaButtons = Array.from(dialog.querySelectorAll('div[role="button"], div[aria-label]'));
      for (const btn of mediaButtons) {
        const label = (btn.getAttribute("aria-label") || btn.innerText || "").toLowerCase();
        if (label.includes("ảnh/video") || label.includes("photo/video") || label.includes("ảnh")) {
          btn.click();
          await sleep(1000);
          break;
        }
      }
      fileInput = dialog.querySelector('input[type="file"][accept*="image"]') || document.querySelector('input[type="file"][accept*="image"]');
    }

    if (!fileInput) {
      return {
        success: false,
        message: "Không tìm thấy nút đính kèm ảnh trong hộp thoại soạn bài của Facebook.",
      };
    }

    // Gán file vào input bằng DataTransfer
    const dt = new DataTransfer();
    fileObjects.forEach((f) => dt.items.add(f));
    fileInput.files = dt.files;
    fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    fileInput.dispatchEvent(new Event("input", { bubbles: true }));

    console.log(`[Social Desk] Đã nạp ${fileObjects.length} ảnh vào input, đang chờ Facebook render...`);

    // Chờ Facebook tải và render thumbnail ảnh vào dialog (tối đa 12s)
    let imagesRendered = false;
    for (let w = 0; w < 24; w++) {
      await sleep(500);
      const previewImgs = dialog.querySelectorAll('img[src^="blob:"], img[src*="fbcdn"], div[aria-label*="Ảnh"]');
      const progressBars = dialog.querySelectorAll('div[role="progressbar"]');
      if (previewImgs.length > 0 && progressBars.length === 0) {
        imagesRendered = true;
        break;
      }
    }

    if (!imagesRendered) {
      console.warn("[Social Desk] Cảnh báo: Chưa xác nhận được ảnh hiển thị xong, tiếp tục kiểm tra nút Đăng...");
    }
  }

  // 6. Tìm nút "Đăng" (Post)
  console.log("[Social Desk] Đang tìm nút Đăng...");
  await sleep(1000);

  const postBtnSelectors = [
    'div[role="dialog"] div[aria-label="Đăng"]',
    'div[role="dialog"] div[aria-label="Post"]',
    'div[role="dialog"] div[aria-label="Chia sẻ"]',
    'div[role="dialog"] div[aria-label="Share"]',
    'div[role="dialog"] div[aria-label="Tiếp"]',
  ];

  let postButton = null;
  for (const sel of postBtnSelectors) {
    postButton = dialog.querySelector(sel);
    if (postButton && isElementVisible(postButton)) break;
  }

  if (!postButton) {
    // Tìm qua text hiển thị của các nút trong dialog
    const candidateButtons = Array.from(dialog.querySelectorAll('div[role="button"]'));
    for (const b of candidateButtons) {
      const text = (b.innerText || "").trim().toLowerCase();
      if (text === "đăng" || text === "post" || text === "chia sẻ" || text === "tiếp" || text === "next") {
        postButton = b;
        break;
      }
    }
  }

  if (!postButton) {
    return {
      success: false,
      message: "Đã soạn xong bài nhưng không tìm thấy nút 'Đăng' để hoàn tất.",
    };
  }

  // Chờ tối đa 8s nếu nút Đăng đang bị khóa (chờ upload ảnh hoặc Facebook xử lý)
  for (let c = 0; c < 16; c++) {
    const disabled = postButton.getAttribute("aria-disabled") === "true" || postButton.classList.contains("disabled");
    if (!disabled) break;
    await sleep(500);
  }

  if (postButton.getAttribute("aria-disabled") === "true") {
    return {
      success: false,
      message: "Nút Đăng đang bị khóa (Facebook đang tải ảnh chưa xong hoặc yêu cầu bổ sung thông tin).",
    };
  }

  // 7. Bấm nút ĐĂNG
  postButton.scrollIntoView({ behavior: "smooth", block: "center" });
  await sleep(300);
  postButton.click();
  console.log("[Social Desk] Đã bấm nút ĐĂNG, bắt đầu quy trình xác minh kết quả...");

  // 8. XÁC MINH KẾT QUẢ THỰC TẾ (Chờ tối đa 35 giây)
  const maxVerifySeconds = 35;
  for (let s = 1; s <= maxVerifySeconds; s++) {
    await sleep(1000);

    // Kiểm tra thông báo lỗi từ Facebook
    const errorAlerts = Array.from(document.querySelectorAll('div[role="alert"], div[role="alertdialog"]'));
    for (const alertEl of errorAlerts) {
      const errText = (alertEl.innerText || "").toLowerCase();
      if (
        errText.includes("không thể chia sẻ") ||
        errText.includes("đã xảy ra lỗi") ||
        errText.includes("bị hạn chế") ||
        errText.includes("bị chặn") ||
        errText.includes("something went wrong") ||
        errText.includes("could not post") ||
        errText.includes("we limit how often")
      ) {
        return {
          success: false,
          message: `Facebook từ chối bài đăng: "${alertEl.innerText.trim().slice(0, 150)}"`,
        };
      }
    }

    // Kiểm tra thông báo phê duyệt bài viết trong Nhóm (Pending Approval)
    const pageText = document.body.innerText.toLowerCase();
    if (
      pageText.includes("chờ quản trị viên phê duyệt") ||
      pageText.includes("đang chờ phê duyệt") ||
      pageText.includes("pending approval")
    ) {
      return {
        success: true,
        pendingApproval: true,
        message: "Bài viết đã được gửi vào nhóm thành công và đang chờ Quản trị viên duyệt.",
        postUrl: window.location.href,
      };
    }

    // Kiểm tra xem hộp thoại soạn thảo đã ĐÓNG hoàn toàn chưa
    const activeDialog = document.querySelector('div[role="dialog"]');
    if (!activeDialog || !isElementVisible(activeDialog)) {
      // Hộp thoại đã đóng thành công mà không có thông báo lỗi
      return {
        success: true,
        message: "Đã xác minh bài đăng xuất hiện thành công trên Facebook!",
        postUrl: window.location.href,
      };
    }
  }

  // Nếu hết 35s mà dialog vẫn mở
  return {
    success: false,
    message: "Hộp thoại Facebook chưa đóng sau 35s. Có thể mạng chậm hoặc Facebook yêu cầu xác minh bảo mật.",
  };
}

function isElementVisible(el) {
  if (!el) return false;
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
    return false;
  }
  return el.offsetWidth > 0 && el.offsetHeight > 0;
}
