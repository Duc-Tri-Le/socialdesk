// Social Desk Connector - Instagram Automation Utilities

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

// Tìm ô nhập chú thích bài viết Instagram
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

// Chuyển đổi chuỗi số tương tác Instagram sang số nguyên
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
    const isProfile = !window.location.pathname.includes("/p/") && !window.location.pathname.includes("/reel/");
    if (isProfile) {
      const firstPostLink = document.querySelector('article a[href*="/p/"], main a[href*="/p/"]');
      if (firstPostLink) {
        detectedPostUrl = firstPostLink.href;
        triggerClick(firstPostLink);
        await sleep(2500);
      }
    } else {
      detectedPostUrl = window.location.href;
    }

    const container =
      document.querySelector('div[role="dialog"] article') ||
      document.querySelector('div[role="dialog"]') ||
      document.querySelector("article") ||
      document.querySelector("main") ||
      document;

    const metaDesc = document.querySelector('meta[name="description"]')?.getAttribute("content") || "";
    if (metaDesc) {
      const match = metaDesc.match(/([\d.,kKmM]+)\s*(?:likes?|lượt thích)[,\s]+([\d.,kKmM]+)\s*(?:comments?|bình luận)/i);
      if (match) {
        likes = parseSocialCount(match[1]);
        comments = parseSocialCount(match[2]);
      }
    }

    if (likes === 0) {
      const likeEls = container.querySelectorAll(
        'section a[href*="liked_by"], section button, span[role="button"], a[role="link"]'
      );
      for (const el of likeEls) {
        const txt = (el.innerText || el.getAttribute("aria-label") || "").trim();
        const match = txt.match(/(\d+[\d.,kKmM]*)\s*(?:lượt thích|likes?|người khác)/i);
        if (match) {
          const parsed = parseSocialCount(match[1]);
          if (parsed > likes) likes = parsed;
        }
      }

      if (likes === 0) {
        for (const el of likeEls) {
          const txt = (el.innerText || "").trim();
          if (/^\d+[\d.,kKmM]*$/.test(txt)) {
            const parsed = parseSocialCount(txt);
            if (parsed > 0 && parsed < 10000000) {
              likes = parsed;
              break;
            }
          }
        }
      }
    }

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

function getInstagramCharCount(root) {
  const container = root || getInstagramDialog() || document;
  const text = container.innerText || "";
  const m = text.match(/([\d.,\s]+)\s*\/\s*2[,.\s]?200/);
  if (m) {
    const numStr = m[1].replace(/[.,\s]/g, "");
    const n = parseInt(numStr, 10);
    return isNaN(n) ? -1 : n;
  }
  return -1;
}

// Chuẩn hóa và làm sạch nội dung bài viết cho Instagram
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

  return text.trim() + " ";
}

// Điền nội dung bài viết giữ trọn vẹn định dạng xuống dòng và khoảng cách dòng
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

  try {
    editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true }));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true }));
    await sleep(100);
    const countEl = Array.from(document.querySelectorAll("span, div")).find((el) => {
      const t = el.innerText || "";
      return t.includes("/2,200") || t.includes("/2.200") || t.includes("/2200");
    });
    if (countEl) triggerClick(countEl);
  } catch {}

  editor.dispatchEvent(new Event("input", { bubbles: true }));
  editor.dispatchEvent(new Event("change", { bubbles: true }));
}
