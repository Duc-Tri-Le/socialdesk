// Social Desk Connector - Facebook Profile & Dialog Navigation Utilities

// Hàm tự động phát hiện tên nick Facebook thật từ trang
function getFacebookProfileInfo() {
  let name = "";
  let profileUrl = "";

  try {
    const isSystemWord = (str) =>
      /facebook|watch|gaming|video|bảng feed|bạn bè|chưa đọc|đoạn chat|tin nhắn|thông báo|messenger|công cụ|kế hoạch|planner|quản trị|quản lý|trung tâm|quảng cáo|cài đặt|kỷ niệm|đã lưu|chợ|marketplace|meta|business|suite/i.test(
        str,
      );

    const candidateLinks = Array.from(
      document.querySelectorAll('a[href*="/me/"], a[href*="/me?"], a[href*="profile.php"]'),
    );
    for (const a of candidateLinks) {
      const firstLine = (a.innerText || "").split("\n")[0]?.trim() || "";
      const text = firstLine.trim();
      const href = a.href || "";
      if (text && text.length >= 2 && text.length <= 40 && !isSystemWord(text)) {
        name = text;
        profileUrl = href;
        break;
      }
    }

    if (!name) {
      const profileButton = document.querySelector(
        'div[aria-label="Trang cá nhân của bạn"], div[aria-label="Your profile"], div[aria-label="Tài khoản của bạn"], div[aria-label="Account"], div[role="banner"] div[role="button"][aria-label*="cá nhân"], div[role="banner"] div[role="button"][aria-label*="khoản"]',
      );
      if (profileButton) {
        const aria = (profileButton.getAttribute("aria-label") || "").trim();
        const firstLine = (profileButton.innerText || "").split("\n")[0]?.trim() || "";
        const candidate = firstLine && !isSystemWord(firstLine) ? firstLine : aria;
        if (candidate && !isSystemWord(candidate)) {
          name = candidate;
        }
      }
    }
  } catch (e) {
    console.warn("[Social Desk] Lỗi đọc thông tin nick Facebook:", e);
  }

  return { name, profileUrl };
}

// Kiểm tra xem dialog có phải modal "Trang & trang cá nhân của bạn" không
function isInteractionSwitchModal(dialog) {
  if (!dialog) return false;
  const text = (dialog.innerText || "").toLowerCase();
  const aria = (dialog.getAttribute("aria-label") || "").toLowerCase();
  return (
    text.includes("trang & trang cá nhân của bạn") ||
    text.includes("chuyển để tương tác với bài viết này") ||
    text.includes("tìm kiếm trang cá nhân và trang") ||
    aria.includes("trang & trang cá nhân của bạn") ||
    aria.includes("chuyển để tương tác") ||
    text.includes("chuyển để tương tác")
  );
}

// Tìm hộp thoại soạn bài viết thật của Facebook
function getFacebookComposerDialog() {
  const dialogs = Array.from(document.querySelectorAll('div[role="dialog"]'))
    .filter(isElementVisible)
    .filter((d) => !isInteractionSwitchModal(d));

  for (let i = dialogs.length - 1; i >= 0; i--) {
    const d = dialogs[i];
    if (
      d.querySelector('div[role="textbox"], div[contenteditable="true"], div[data-lexical-editor="true"]') ||
      d.querySelector('div[aria-label*="Đăng"], div[aria-label*="Tiếp"]')
    ) {
      return d;
    }
  }
  return dialogs.pop() || null;
}

// Phân loại nút hành động trong hộp thoại Facebook: 'post' (Đăng/Chia sẻ), 'next' (Tiếp tục), hoặc null
function categorizeFacebookButton(btn) {
  if (!btn || !isElementVisible(btn)) return null;

  const aria = (btn.getAttribute("aria-label") || "").trim().toLowerCase();
  const text = (btn.innerText || "").trim().toLowerCase().replace(/\s+/g, " ");

  const ignorePhrases = [
    "đóng", "close", "chỉnh sửa", "edit", "gắn thẻ", "tag",
    "biểu tượng", "cảm xúc", "emoji", "ảnh/video", "photo", "vị trí", "location",
    "cài đặt", "settings", "đăng ẩn danh", "anonymous", "quyền riêng tư", "privacy"
  ];
  if (ignorePhrases.some((p) => aria === p || text === p || aria.startsWith(p + " "))) {
    return null;
  }

  const isDisabled =
    btn.getAttribute("aria-disabled") === "true" ||
    btn.disabled === true ||
    btn.getAttribute("disabled") !== null ||
    btn.classList.contains("disabled");

  const isPost = /^(đăng|post|chia sẻ|share|đăng bài|chia sẻ ngay)(\s.*)?$/i.test(aria) || /^(đăng|post|chia sẻ|share|đăng bài)$/i.test(text);
  const isNext = /^(tiếp|next|tiếp tục|tiếp theo)(\s.*)?$/i.test(aria) || /^(tiếp|next|tiếp tục|tiếp theo)$/i.test(text);

  if (isPost) return { type: "post", btn, isDisabled };
  if (isNext) return { type: "next", btn, isDisabled };
  return null;
}

// Kiểm tra xem Facebook có đang ở giao diện quản trị Fanpage không
function isFacebookAlreadyInPageMode(targetName = "") {
  const bodyText = (document.body.innerText || "").toLowerCase();
  if (
    bodyText.includes("bảng điều khiển dành cho người sáng tạo") ||
    bodyText.includes("professional dashboard") ||
    bodyText.includes("quản lý bài viết") ||
    bodyText.includes("manage posts") ||
    bodyText.includes("trung tâm quảng cáo")
  ) {
    return true;
  }
  return false;
}

// Xử lý đóng modal "Trang & trang cá nhân của bạn" nếu lỡ bị bật lên
function handleInteractionSwitchModal(targetName = "") {
  const dialogs = Array.from(document.querySelectorAll('div[role="dialog"]')).filter(isElementVisible);

  for (const d of dialogs) {
    if (isInteractionSwitchModal(d)) {
      console.log("[Social Desk] Phát hiện modal 'Trang & trang cá nhân của bạn', đang đóng dứt điểm...");

      const buttons = Array.from(d.querySelectorAll('div[role="button"], button, [role="button"]'));
      const closeBtn = buttons.find((b) => {
        const bAria = (b.getAttribute("aria-label") || "").toLowerCase().trim();
        const bText = (b.innerText || "").toLowerCase().trim();
        return bAria === "đóng" || bAria === "close" || bText === "đóng" || bText === "close";
      }) || d.querySelector('svg[aria-label="Đóng"], svg[aria-label="Close"]')?.closest('div[role="button"], button');

      if (closeBtn && isElementVisible(closeBtn)) {
        triggerClick(closeBtn);
      }

      const escEvent = new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true });
      d.dispatchEvent(escEvent);
      document.dispatchEvent(escEvent);
      window.dispatchEvent(escEvent);

      return true;
    }
  }
  return false;
}

// Tìm nút chuyển profile Facebook (trên banner / timeline)
function findFacebookSwitchButton(targetName = "") {
  if (isFacebookAlreadyInPageMode(targetName)) {
    return null;
  }

  const candidates = Array.from(
    document.querySelectorAll('div[role="button"], button, a[role="button"]')
  ).filter(isElementVisible);

  for (const b of candidates) {
    const aria = (b.getAttribute("aria-label") || "").toLowerCase().trim();
    const text = (b.innerText || "").toLowerCase().trim().replace(/\s+/g, " ");

    if (
      aria.includes("điều khoản") || text.includes("điều khoản") ||
      aria.includes("ngôn ngữ") || text.includes("ngôn ngữ") ||
      aria.includes("quyền riêng tư") || text.includes("quyền riêng tư") ||
      aria.includes("tương tác với bài viết này") || text.includes("tương tác với bài viết này") ||
      aria.includes("vai trò") || text.includes("vai trò") ||
      aria.includes("trang & trang cá nhân của bạn") || text.includes("trang & trang cá nhân của bạn") ||
      aria.includes("tìm kiếm trang cá nhân") || text.includes("tìm kiếm trang cá nhân") ||
      aria.includes("chuyển để tương tác") || text.includes("chuyển để tương tác")
    ) continue;

    const isExactSwitchNow =
      aria === "chuyển ngay" || text === "chuyển ngay" ||
      aria === "switch now" || text === "switch now";

    const isSwitchToPage =
      (aria.startsWith("chuyển sang trang") || text.startsWith("chuyển sang trang") ||
       aria.startsWith("chuyển sang ") || text.startsWith("chuyển sang ")) &&
      !aria.includes("tương tác") && !text.includes("tương tác");

    if (isExactSwitchNow || isSwitchToPage) {
      return b;
    }
  }

  return null;
}

// Chuyển profile qua menu góc phải Facebook
async function attemptMenuProfileSwitch(targetName = "") {
  const norm = (targetName || "").toLowerCase().trim();
  const trigger = document.querySelector(
    'div[aria-label="Trang cá nhân của bạn"], div[aria-label="Your profile"], div[aria-label="Tài khoản của bạn"], div[aria-label="Account"], div[role="banner"] div[role="button"][aria-label*="cá nhân"], div[role="banner"] div[role="button"][aria-label*="khoản"]'
  );
  if (!trigger || !isElementVisible(trigger)) return false;

  triggerClick(trigger);
  await sleep(1200);

  let items = Array.from(
    document.querySelectorAll('div[role="dialog"] div[role="button"], div[role="menu"] div[role="button"], div[role="dialog"] a, div[role="menuitem"]')
  ).filter(isElementVisible);

  let target = items.find((el) => {
    const t = (el.innerText || el.getAttribute("aria-label") || "").toLowerCase();
    return norm && t.includes(norm);
  });

  if (!target) {
    const seeAll = items.find((el) => {
      const t = (el.innerText || el.getAttribute("aria-label") || "").toLowerCase();
      return t.includes("xem tất cả") || t.includes("see all") || t.includes("chuyển tài khoản") || t.includes("chuyển sang");
    });
    if (seeAll) {
      triggerClick(seeAll);
      await sleep(1000);
      items = Array.from(
        document.querySelectorAll('div[role="dialog"] div[role="button"], div[role="menu"] div[role="button"], div[role="dialog"] a, div[role="menuitem"]')
      ).filter(isElementVisible);
      target = items.find((el) => {
        const t = (el.innerText || el.getAttribute("aria-label") || "").toLowerCase();
        return norm ? t.includes(norm) : (t.includes("chuyển sang") || t.includes("switch to"));
      });
    }
  }

  if (target) {
    console.log(`[Social Desk] Bấm chọn nick trong menu: "${target.innerText || target.getAttribute("aria-label")}"`);
    triggerClick(target);
    await sleep(3500);
    return true;
  }

  triggerClick(trigger);
  return false;
}

