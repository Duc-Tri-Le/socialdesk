// Social Desk Connector - Facebook Content Automation Utilities
// Chứa các hàm tiện ích phân tích DOM, trích xuất URL và cào chỉ số bài viết Facebook

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

// Chuyển đổi chuỗi số tương tác kiểu Việt Nam / Quốc tế sang số nguyên
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

// Cào chỉ số tương tác (Like, Comment, Share) của bài viết đang mở trong tab
function scrapeFacebookPostEngagement() {
  let likes = 0;
  let comments = 0;
  let shares = 0;

  try {
    const targetContainer =
      document.querySelector('div[role="feed"] div[role="article"]') ||
      document.querySelector('div[role="feed"] > div') ||
      document.querySelector('div[data-pagelet*="Feed"] div[role="article"]') ||
      document.querySelector('div[role="main"] div[role="article"]') ||
      document.querySelector('div[role="article"]') ||
      document;

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

    const allSpans = Array.from(targetContainer.querySelectorAll('span, div[role="button"], a[role="link"], a'));
    for (const el of allSpans) {
      const text = el.innerText?.trim();
      const aria = el.getAttribute("aria-label")?.trim() || "";
      const combined = `${text} ${aria}`;
      if (!combined || combined.length > 80) continue;

      const cMatch = combined.match(/(\d+[\d.,kKmM]*)\s*(?:bình luận|comments?)/i);
      if (cMatch) {
        const parsed = parseSocialCount(cMatch[1]);
        if (parsed > comments) comments = parsed;
      }

      const sMatch = combined.match(/(\d+[\d.,kKmM]*)\s*(?:lượt chia sẻ|chia sẻ|shares?)/i);
      if (sMatch) {
        const parsed = parseSocialCount(sMatch[1]);
        if (parsed > shares) shares = parsed;
      }

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
