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

// Chuyển đổi chuỗi số tương tác kiểu Việt Nam / Quốc tế (vd: "1,2K", "350", "2.5M") sang số nguyên
function parseSocialCount(str) {
  if (!str) return 0;
  const cleaned = str.trim().toLowerCase().replace(/,/g, ".");
  const match = cleaned.match(/([\d.]+)\s*([km]?)/);
  if (!match) return 0;
  let val = parseFloat(match[1]) || 0;
  if (match[2] === "k") val *= 1000;
  if (match[2] === "m") val *= 1000000;
  return Math.round(val);
}

// Cào chỉ số tương tác (Like, Comment, Share) của bài viết đang mở trong tab
function scrapeFacebookPostEngagement() {
  let likes = 0;
  let comments = 0;
  let shares = 0;

  try {
    // 1. Quét lượt thích / cảm xúc từ các phần tử có aria-label cảm xúc
    const reactionEls = document.querySelectorAll(
      '[aria-label*="bày tỏ cảm xúc"], [aria-label*="reaction"], [aria-label*="thích"], [aria-label*="Like"], [role="toolbar"]'
    );
    for (const el of reactionEls) {
      const aria = el.getAttribute("aria-label") || "";
      const text = el.innerText || "";
      const countMatch = (aria + " " + text).match(/(\d+[\d.,kKmM]*)\s*(?:người|lượt|thích|reactions?|$)/);
      if (countMatch) {
        const parsed = parseSocialCount(countMatch[1]);
        if (parsed > likes) likes = parsed;
      }
    }

    // 2. Quét các nút và nhãn trong thanh điều khiển/chân bài viết
    const allSpans = Array.from(document.querySelectorAll('span, div[role="button"], a[role="link"]'));
    for (const el of allSpans) {
      const text = el.innerText?.trim();
      if (!text || text.length > 50) continue;

      // Bình luận
      const cMatch = text.match(/(\d+[\d.,kKmM]*)\s*(?:bình luận|comments?)/i);
      if (cMatch) {
        const parsed = parseSocialCount(cMatch[1]);
        if (parsed > comments) comments = parsed;
      }

      // Chia sẻ
      const sMatch = text.match(/(\d+[\d.,kKmM]*)\s*(?:lượt chia sẻ|chia sẻ|shares?)/i);
      if (sMatch) {
        const parsed = parseSocialCount(sMatch[1]);
        if (parsed > shares) shares = parsed;
      }

      // Like đơn lẻ ở thanh bar nếu chưa có
      if (likes === 0) {
        const lMatch = text.match(/^(\d+[\d.,kKmM]*)$/);
        if (lMatch && el.closest('[role="article"], div[data-ad-preview]')) {
          const parsed = parseSocialCount(lMatch[1]);
          if (parsed > 0 && parsed < 1000000) {
            likes = parsed;
          }
        }
      }
    }
  } catch (err) {
    console.warn("[Social Desk] Lỗi cào chỉ số bài viết:", err);
  }

  return { likes, comments, shares, reach: 0 };
}

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
