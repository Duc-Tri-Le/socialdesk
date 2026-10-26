// Social Desk Connector - Facebook Content Automation Utilities
// Chứa các hàm tiện ích phân tích DOM, trích xuất profile và cào chỉ số bài viết Facebook

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Kiểm tra xem phần tử DOM có hiển thị trực quan không
function isElementVisible(el) {
  if (!el) return false;
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
    return false;
  }
  return el.offsetWidth > 0 && el.offsetHeight > 0;
}

// Bấm chuột đầy đủ các sự kiện Pointer/Mouse cho React
function triggerClick(el) {
  if (!el) return;
  try {
    el.focus();
    const opts = { bubbles: true, cancelable: true, view: window };
    el.dispatchEvent(new PointerEvent("pointerdown", opts));
    el.dispatchEvent(new MouseEvent("mousedown", opts));
    el.dispatchEvent(new PointerEvent("pointerup", opts));
    el.dispatchEvent(new MouseEvent("mouseup", opts));
    el.click();
  } catch {
    el.click();
  }
}

// Hàm làm sạch và chuẩn hóa đường link bài viết Facebook
function cleanFacebookPostUrl(rawUrl) {
  if (!rawUrl) return "";
  try {
    const fullUrl = rawUrl.startsWith("http")
      ? rawUrl
      : `https://www.facebook.com${rawUrl.startsWith("/") ? "" : "/"}${rawUrl}`;
    const parsed = new URL(fullUrl);
    if (!parsed.hostname.includes("facebook.com")) return "";

    // 1. Link bài trong Nhóm: /groups/<id>/posts/<post_id>/ hoặc /groups/<id>/permalink/<post_id>/
    const groupPostMatch = parsed.pathname.match(/\/groups\/([^/]+)\/(posts|permalink)\/(\d+)/);
    if (groupPostMatch) {
      return `https://www.facebook.com/groups/${groupPostMatch[1]}/posts/${groupPostMatch[3]}/`;
    }

    // 2. Link Story FBID: permalink.php?story_fbid=<id>&id=<page_id>
    if (parsed.searchParams.has("story_fbid")) {
      const storyFbid = parsed.searchParams.get("story_fbid");
      const pageId = parsed.searchParams.get("id");
      return `https://www.facebook.com/permalink.php?story_fbid=${storyFbid}${pageId ? `&id=${pageId}` : ""}`;
    }

    // 3. Link Fanpage / Trang cá nhân: /<name>/posts/<id> hoặc /<name>/photos/<id>
    const pagePostMatch = parsed.pathname.match(/\/([^/]+)\/(posts|photos)\/(\d+)/);
    if (pagePostMatch) {
      return `https://www.facebook.com/${pagePostMatch[1]}/posts/${pagePostMatch[3]}/`;
    }
  } catch {
    return "";
  }
  return "";
}

// Thử phát hiện đường link permalink bài viết vừa đăng trên Facebook
async function tryDetectPostPermalink(targetUrl) {
  try {
    // 1. Quét trong các Toast thông báo nổi của Facebook ("Xem bài viết" / "View post")
    const toastLinks = Array.from(
      document.querySelectorAll('div[role="alert"] a, div[role="status"] a, div[aria-live] a, a[role="link"]')
    );
    for (const a of toastLinks) {
      const text = (a.innerText || a.getAttribute("aria-label") || "").toLowerCase().trim();
      const href = a.href || a.getAttribute("href") || "";
      if (
        (text.includes("xem bài") || text.includes("view post") || text.includes("xem") || text.includes("view")) &&
        (href.includes("/posts/") || href.includes("/permalink/") || href.includes("story_fbid") || href.includes("multi_permalinks"))
      ) {
        const cleaned = cleanFacebookPostUrl(href);
        if (cleaned) return cleaned;
      }
    }

    // 2. Quét trong Feed xem có bài mới đăng ("Vừa xong", "Just now", v.v.)
    const feedLinks = Array.from(
      document.querySelectorAll('div[role="feed"] a, div[data-pagelet*="Feed"] a, div[role="main"] a')
    );
    for (const a of feedLinks) {
      const ariaLabel = (a.getAttribute("aria-label") || a.innerText || "").toLowerCase().trim();
      const href = a.href || a.getAttribute("href") || "";
      if (
        ariaLabel.includes("vừa xong") ||
        ariaLabel.includes("just now") ||
        ariaLabel.includes("vài giây") ||
        ariaLabel.includes("1 phút") ||
        ariaLabel.includes("1 min")
      ) {
        if (href.includes("/posts/") || href.includes("/permalink/") || href.includes("story_fbid")) {
          const cleaned = cleanFacebookPostUrl(href);
          if (cleaned) return cleaned;
        }
      }
    }

    // 3. Quét link permalink đầu tiên trong Feed khớp với nhóm / trang hiện tại
    for (const a of feedLinks) {
      const href = a.href || a.getAttribute("href") || "";
      if (href.includes("/posts/") || href.includes("/permalink/")) {
        const cleaned = cleanFacebookPostUrl(href);
        if (cleaned) {
          const groupMatch = targetUrl.match(/groups\/([^/?#]+)/);
          if (groupMatch && cleaned.includes(groupMatch[1])) {
            return cleaned;
          } else if (!groupMatch) {
            return cleaned;
          }
        }
      }
    }
  } catch (e) {
    console.warn("[Social Desk] Không phát hiện được permalink bài viết:", e);
  }
  return "";
}

// Chuyển đổi chuỗi số tương tác kiểu Việt Nam / Quốc tế (vd: "1,2K", "1.234", "350", "2.5M") sang số nguyên
function parseSocialCount(str) {
  if (!str) return 0;
  const cleaned = str.trim().toLowerCase();

  // Kiểm tra đuôi k hoặc m (vd: "1.5k", "1,2m", "10k")
  const kmMatch = cleaned.match(/([\d.,]+)\s*([km])/);
  if (kmMatch) {
    const numPart = parseFloat(kmMatch[1].replace(/,/g, ".")) || 0;
    const mult = kmMatch[2] === "m" ? 1000000 : 1000;
    return Math.round(numPart * mult);
  }

  // Nếu là số thông thường có phân cách hàng nghìn (vd: "1.234" hoặc "1,234") hoặc số trần (vd: "45")
  const plainDigits = cleaned.replace(/[^\d]/g, "");
  return parseInt(plainDigits, 10) || 0;
}

// Cào chỉ số tương tác (Like, Comment, Share) của bài viết đang mở trong tab
// Tự động nhận diện bài viết trên Feed (Fanpage, Nhóm Facebook, Trang cá nhân) hoặc trang bài viết đơn lẻ
function scrapeFacebookPostEngagement() {
  let likes = 0;
  let comments = 0;
  let shares = 0;

  try {
    // 1. Xác định phạm vi phần tử bài viết:
    // Nếu trang là Feed (Nhóm, Fanpage, Profile cá nhân), ưu tiên lấy article đầu tiên (bài mới nhất)
    const targetContainer =
      document.querySelector('div[role="feed"] div[role="article"]') ||
      document.querySelector('div[role="feed"] > div') ||
      document.querySelector('div[data-pagelet*="Feed"] div[role="article"]') ||
      document.querySelector('div[role="main"] div[role="article"]') ||
      document.querySelector('div[role="article"]') ||
      document;

    // 2. Quét lượt thích / cảm xúc từ các phần tử có aria-label cảm xúc
    const reactionSelectors = [
      '[aria-label*="bày tỏ cảm xúc"]',
      '[aria-label*="reaction"]',
      '[aria-label*="người bày tỏ"]',
      '[aria-label*="thích"]',
      '[aria-label*="Like"]',
      '[role="toolbar"]',
      'span[data-visualcompletion="ignore-dynamic"]',
    ];
    const reactionEls = targetContainer.querySelectorAll(reactionSelectors.join(", "));
    for (const el of reactionEls) {
      const aria = el.getAttribute("aria-label") || "";
      const text = el.innerText || "";
      const full = `${aria} ${text}`;
      const countMatch = full.match(/(\d+[\d.,kKmM]*)\s*(?:người|lượt|thích|reactions?|$)/i);
      if (countMatch) {
        const parsed = parseSocialCount(countMatch[1]);
        if (parsed > likes) likes = parsed;
      }
    }

    // 3. Quét các nút và nhãn trong thanh điều khiển/chân bài viết
    const allSpans = Array.from(targetContainer.querySelectorAll('span, div[role="button"], a[role="link"], a'));
    for (const el of allSpans) {
      const text = el.innerText?.trim();
      const aria = el.getAttribute("aria-label")?.trim() || "";
      const combined = `${text} ${aria}`;
      if (!combined || combined.length > 80) continue;

      // Bình luận (vd: "5 bình luận", "12 comments", "Xem 3 bình luận khác")
      const cMatch = combined.match(/(\d+[\d.,kKmM]*)\s*(?:bình luận|comments?)/i);
      if (cMatch) {
        const parsed = parseSocialCount(cMatch[1]);
        if (parsed > comments) comments = parsed;
      }

      // Chia sẻ (vd: "2 lượt chia sẻ", "2 chia sẻ", "10 shares")
      const sMatch = combined.match(/(\d+[\d.,kKmM]*)\s*(?:lượt chia sẻ|chia sẻ|shares?)/i);
      if (sMatch) {
        const parsed = parseSocialCount(sMatch[1]);
        if (parsed > shares) shares = parsed;
      }

      // Like đơn lẻ ở thanh bar nếu chưa có
      if (likes === 0 && text) {
        const lMatch = text.match(/^(\d+[\d.,kKmM]*)$/);
        if (lMatch && el.closest('[role="toolbar"], [role="article"], div[data-ad-preview]')) {
          const parsed = parseSocialCount(lMatch[1]);
          if (parsed > 0 && parsed < 10000000) {
            likes = parsed;
          }
        }
      }
    }
  } catch (err) {
    console.warn("[Social Desk] Lỗi cào chỉ số bài viết Facebook:", err);
  }

  return { likes, comments, shares, reach: 0 };
}

// Hàm tự động phát hiện tên nick Facebook thật từ trang
function getFacebookProfileInfo() {
  let name = "";
  let profileUrl = "";

  try {
    const isSystemWord = (str) =>
      /facebook|watch|gaming|video|bảng feed|bạn bè|chưa đọc|đoạn chat|tin nhắn|thông báo|messenger|công cụ|kế hoạch|planner|quản trị|quản lý|trung tâm|quảng cáo|cài đặt|kỷ niệm|đã lưu|chợ|marketplace|meta|business|suite/i.test(
        str,
      );

    // 1. Thử lấy từ các liên kết cá nhân /me/ hoặc profile.php
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

    // 2. Thử tìm qua avatar profile trong header
    if (!name) {
      const ariaProfile = document.querySelector('[aria-label="Trang cá nhân của bạn"], [aria-label="Your profile"]');
      if (ariaProfile) {
        const parent = ariaProfile.closest('div[role="button"], a');
        const txt = (parent?.innerText || "").trim();
        if (txt && !isSystemWord(txt)) {
          name = txt;
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

// Kiểm tra xem dialog có phải modal "Trang & trang cá nhân của bạn" (chuyển vai trò tương tác bài viết) không
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

// Tìm hộp thoại soạn bài viết thật của Facebook (tránh chọn nhầm tooltip/overlay/modal tương tác)
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
  const title = (btn.getAttribute("title") || "").trim().toLowerCase();

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

// Tự động nhận diện và đóng các popup gợi ý phát sinh của Facebook sau khi đăng bài
function dismissFacebookUpsellPopups() {
  const popups = Array.from(document.querySelectorAll('div[role="dialog"]')).filter(isElementVisible);
  for (const pop of popups) {
    const popText = (pop.innerText || "").toLowerCase();
    if (/thêm nút|không phải bây giờ|lúc khác|để sau|not now|tăng tốc bài viết|boost post/i.test(popText)) {
      const dismissButtons = Array.from(pop.querySelectorAll('div[role="button"], button')).filter(isElementVisible);
      for (const db of dismissButtons) {
        const dText = (db.innerText || db.getAttribute("aria-label") || "").toLowerCase().trim();
        if (/^(không phải bây giờ|lúc khác|để sau|not now|đóng|close)$/i.test(dText)) {
          console.log(`[Social Desk] Đóng popup gợi ý của Facebook: "${dText}"`);
          db.click();
          return true;
        }
      }
    }
  }
  return false;
}

// Kiểm tra xem Facebook có đang ở giao diện quản trị Fanpage không
function isFacebookAlreadyInPageMode(targetName = "") {
  const bodyText = (document.body.innerText || "").toLowerCase();
  // Chỉ tài khoản quản trị Page mới có các mục này trên giao diện Facebook
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

      // 1. Tìm chính xác nút Đóng (X)
      const buttons = Array.from(d.querySelectorAll('div[role="button"], button, [role="button"]'));
      const closeBtn = buttons.find((b) => {
        const bAria = (b.getAttribute("aria-label") || "").toLowerCase().trim();
        const bText = (b.innerText || "").toLowerCase().trim();
        return bAria === "đóng" || bAria === "close" || bText === "đóng" || bText === "close";
      }) || d.querySelector('svg[aria-label="Đóng"], svg[aria-label="Close"]')?.closest('div[role="button"], button');

      if (closeBtn && isElementVisible(closeBtn)) {
        triggerClick(closeBtn);
      }

      // 2. Dispatch phím Escape để Facebook đóng overlay dứt điểm
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
  // 1. Nếu đã ở giao diện Page Admin rồi thì KHÔNG tìm nút switch nữa
  if (isFacebookAlreadyInPageMode(targetName)) {
    return null;
  }

  const norm = (targetName || "").toLowerCase().trim();
  const candidates = Array.from(
    document.querySelectorAll('div[role="button"], button, a[role="button"]')
  ).filter(isElementVisible);

  for (const b of candidates) {
    const aria = (b.getAttribute("aria-label") || "").toLowerCase().trim();
    const text = (b.innerText || "").toLowerCase().trim().replace(/\s+/g, " ");

    // LOẠI TRỪ TUYỆT ĐỐI: các nút chuyển tương tác bài viết, chuyển vai trò, điều khoản...
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

    // Chỉ nhận nút "Chuyển ngay" hoặc "Switch now" chính xác của banner
    const isExactSwitchNow =
      aria === "chuyển ngay" || text === "chuyển ngay" ||
      aria === "switch now" || text === "switch now";

    // Hoặc nút "Chuyển sang [Tên Trang]" trên banner
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

