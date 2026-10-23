// Social Desk Connector - Facebook Automation Content Script

console.log("[Social Desk] Content script đã được tải trên Facebook");

// Lắng nghe lệnh từ background worker
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "DO_POST") {
    handlePost(request.payload)
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ success: false, message: err.message || "Lỗi tự động hóa" }));
    return true; // Bắt buộc cho async response
  }
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function handlePost(payload) {
  const { caption, images = [] } = payload;

  // 1. Kiểm tra trạng thái đăng nhập
  if (document.body.innerText.includes("Log into Facebook") || 
      document.body.innerText.includes("Đăng nhập Facebook") ||
      window.location.pathname.startsWith("/login")) {
    return {
      success: false,
      message: "Tài khoản Facebook chưa đăng nhập trong cửa sổ Chrome này. Vui lòng đăng nhập 1 lần.",
    };
  }

  // 2. Tìm ô mở hộp thoại đăng bài
  console.log("[Social Desk] Đang tìm ô đăng bài...");
  const triggerSelectors = [
    'div[role="button"][tabindex="0"]',
    'div[aria-label*="Bạn đang nghĩ gì"]',
    'div[aria-label*="Viết gì đó"]',
    'div[aria-label*="Tạo bài viết"]',
    'div[aria-label*="Create a post"]',
    'div[aria-label*="What\'s on your mind"]',
    'div[aria-label*="Write something"]',
  ];

  let postTrigger = null;
  // Tìm trigger có text liên quan
  const allButtons = Array.from(document.querySelectorAll(triggerSelectors.join(",")));
  for (const btn of allButtons) {
    const text = (btn.innerText || btn.getAttribute("aria-label") || "").toLowerCase();
    if (
      text.includes("nghĩ gì") ||
      text.includes("viết gì") ||
      text.includes("tạo bài viết") ||
      text.includes("bán gì") ||
      text.includes("write something") ||
      text.includes("what's on your mind") ||
      text.includes("create a post")
    ) {
      postTrigger = btn;
      break;
    }
  }

  if (!postTrigger && allButtons.length > 0) {
    // Fallback lấy nút đầu tiên khớp selector
    postTrigger = allButtons[0];
  }

  if (postTrigger) {
    postTrigger.scrollIntoView({ behavior: "smooth", block: "center" });
    await sleep(600);
    postTrigger.click();
    console.log("[Social Desk] Đã bấm nút mở hộp thoại đăng bài");
  } else {
    console.warn("[Social Desk] Không tìm thấy nút trigger, thử tìm modal đã mở sẵn...");
  }

  // 3. Chờ modal soạn thảo xuất hiện
  let dialog = null;
  for (let i = 0; i < 15; i++) {
    dialog = document.querySelector('div[role="dialog"]');
    if (dialog) break;
    await sleep(500);
  }

  if (!dialog) {
    return {
      success: false,
      message: "Không mở được hộp thoại soạn bài trên Facebook. Hãy đảm bảo bạn có quyền đăng bài.",
    };
  }

  await sleep(1000);

  // 4. Tìm ô nhập văn bản (contenteditable)
  const editorSelectors = [
    'div[role="dialog"] div[role="textbox"][contenteditable="true"]',
    'div[role="dialog"] div[data-lexical-editor="true"]',
    'div[role="dialog"] div[data-editor="true"]',
    'div[role="dialog"] div[contenteditable="true"]',
  ];

  let editor = null;
  for (const sel of editorSelectors) {
    editor = document.querySelector(sel);
    if (editor) break;
  }

  if (!editor) {
    return {
      success: false,
      message: "Không tìm thấy ô nhập nội dung bài viết trong hộp thoại Facebook.",
    };
  }

  // Focus và điền caption
  editor.focus();
  await sleep(400);

  // Xóa nội dung mặc định nếu có
  document.execCommand("selectAll", false, null);

  // Sử dụng insertText để kích hoạt React state của Facebook
  const successInsert = document.execCommand("insertText", false, caption);
  if (!successInsert) {
    // Fallback: mô phỏng sự kiện input
    editor.innerText = caption;
    editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: caption }));
  }
  console.log("[Social Desk] Đã điền nội dung caption bài viết");
  await sleep(1000);

  // 5. Đính kèm ảnh (nếu có)
  if (images && images.length > 0) {
    console.log(`[Social Desk] Đang tải ${images.length} ảnh để đính kèm...`);

    // Tìm input file trong dialog hoặc bấm nút "Ảnh/video"
    let fileInput = dialog.querySelector('input[type="file"][accept*="image"]');
    if (!fileInput) {
      // Tìm nút "Ảnh/video" để mở input file
      const mediaButtons = Array.from(dialog.querySelectorAll('div[role="button"], div[aria-label]'));
      for (const btn of mediaButtons) {
        const label = (btn.getAttribute("aria-label") || btn.innerText || "").toLowerCase();
        if (label.includes("ảnh/video") || label.includes("photo/video") || label.includes("ảnh")) {
          btn.click();
          await sleep(1200);
          break;
        }
      }
      fileInput = dialog.querySelector('input[type="file"][accept*="image"]') || document.querySelector('input[type="file"][accept*="image"]');
    }

    if (fileInput) {
      try {
        const fileObjects = [];
        for (let i = 0; i < images.length; i++) {
          const imgUrl = images[i];
          try {
            const res = await fetch(imgUrl);
            const blob = await res.blob();
            const mime = blob.type || "image/jpeg";
            const ext = mime.includes("png") ? "png" : "jpg";
            const file = new File([blob], `image_${i + 1}.${ext}`, { type: mime });
            fileObjects.push(file);
          } catch (fetchErr) {
            console.warn("[Social Desk] Lỗi tải ảnh:", imgUrl, fetchErr);
          }
        }

        if (fileObjects.length > 0) {
          const dt = new DataTransfer();
          fileObjects.forEach((f) => dt.items.add(f));
          fileInput.files = dt.files;
          fileInput.dispatchEvent(new Event("change", { bubbles: true }));
          console.log(`[Social Desk] Đã đính kèm ${fileObjects.length} ảnh thành công`);
          // Chờ Facebook render preview ảnh
          await sleep(4000);
        }
      } catch (uploadErr) {
        console.warn("[Social Desk] Lỗi khi đính kèm ảnh:", uploadErr);
      }
    } else {
      console.warn("[Social Desk] Không tìm thấy phần đính kèm ảnh của Facebook.");
    }
  }

  // 6. Tìm và bấm nút "Đăng" (Post)
  console.log("[Social Desk] Đang tìm nút Đăng...");
  await sleep(1500);

  const postBtnSelectors = [
    'div[role="dialog"] div[aria-label="Đăng"]',
    'div[role="dialog"] div[aria-label="Post"]',
    'div[role="dialog"] div[aria-label="Chia sẻ"]',
    'div[role="dialog"] div[aria-label="Share"]',
  ];

  let postButton = null;
  for (const sel of postBtnSelectors) {
    postButton = document.querySelector(sel);
    if (postButton) break;
  }

  if (!postButton) {
    // Tìm qua text content trong dialog
    const candidateButtons = Array.from(dialog.querySelectorAll('div[role="button"]'));
    for (const b of candidateButtons) {
      const text = (b.innerText || "").trim().toLowerCase();
      if (text === "đăng" || text === "post" || text === "tiếp" || text === "next") {
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

  // Kiểm tra xem nút Đăng có bị vô hiệu hóa không (aria-disabled)
  if (postButton.getAttribute("aria-disabled") === "true") {
    return {
      success: false,
      message: "Nút Đăng đang bị khóa (có thể Facebook yêu cầu thêm thông tin hoặc chờ tải ảnh xong).",
    };
  }

  postButton.click();
  console.log("[Social Desk] Đã bấm nút ĐĂNG!");

  // Chờ Facebook submit (modal đóng lại)
  await sleep(4000);

  return {
    success: true,
    message: "Đã gửi bài đăng thành công lên Facebook!",
    postUrl: window.location.href,
  };
}
