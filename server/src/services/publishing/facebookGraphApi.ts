import fs from "node:fs/promises";
import path from "node:path";

const FB_GRAPH_API_VERSION = "v22.0";
const FB_GRAPH_BASE_URL = `https://graph.facebook.com/${FB_GRAPH_API_VERSION}`;

export interface FacebookPagePostOptions {
  pageId: string;
  accessToken: string;
  message: string;
  imageUrls?: string[];
  localFiles?: string[];
}

export interface FacebookPostResult {
  ok: boolean;
  postId?: string;
  postUrl?: string;
  error?: string;
}

export interface FacebookPageInfo {
  id: string;
  name: string;
  access_token?: string;
  link?: string;
  instagram_business_account?: {
    id: string;
    username?: string;
  };
}

export interface DebugTokenInfo {
  is_valid: boolean;
  app_id?: string;
  user_id?: string;
  expires_at?: number;
  scopes?: string[];
  type?: string;
  error?: string;
}

/**
 * Upload một file ảnh lên Facebook Page ở chế độ published hoặc unpublished
 */
async function uploadPhotoToFacebookPage(
  pageId: string,
  accessToken: string,
  fileSource: { filePath?: string; url?: string },
  options: { caption?: string; published?: boolean } = {},
): Promise<{ ok: boolean; photoId?: string; error?: string }> {
  const endpoint = `${FB_GRAPH_BASE_URL}/${encodeURIComponent(pageId)}/photos`;
  const published = options.published !== false;

  try {
    if (fileSource.filePath) {
      const buffer = await fs.readFile(fileSource.filePath);
      const filename = path.basename(fileSource.filePath) || "image.jpg";
      const mimeType = filename.endsWith(".png") ? "image/png" : "image/jpeg";

      const formData = new FormData();
      formData.append("access_token", accessToken);
      formData.append("published", String(published));
      if (options.caption) {
        formData.append("caption", options.caption);
      }
      formData.append(
        "source",
        new Blob([buffer], { type: mimeType }),
        filename,
      );

      const res = await fetch(endpoint, {
        method: "POST",
        body: formData,
      });
      const data: any = await res.json();
      if (!res.ok || data.error) {
        return {
          ok: false,
          error: data?.error?.message || `Lỗi tải ảnh lên Facebook (${res.status})`,
        };
      }
      return { ok: true, photoId: data.id };
    }

    if (fileSource.url) {
      const bodyParams = new URLSearchParams();
      bodyParams.set("access_token", accessToken);
      bodyParams.set("url", fileSource.url);
      bodyParams.set("published", String(published));
      if (options.caption) {
        bodyParams.set("caption", options.caption);
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: bodyParams.toString(),
      });
      const data: any = await res.json();
      if (!res.ok || data.error) {
        return {
          ok: false,
          error: data?.error?.message || `Lỗi tải ảnh lên Facebook (${res.status})`,
        };
      }
      return { ok: true, photoId: data.id };
    }

    return { ok: false, error: "Không tìm thấy nguồn file ảnh để tải lên" };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

/**
 * Đăng bài viết lên Facebook Fanpage bằng Facebook Graph API chính thức
 */
export async function publishToFacebookPage(
  opts: FacebookPagePostOptions,
): Promise<FacebookPostResult> {
  const { pageId, accessToken, message, imageUrls = [], localFiles = [] } = opts;

  if (!pageId || !pageId.trim()) {
    return { ok: false, error: "Thiếu Page ID (fb_page_id) của Fanpage." };
  }
  if (!accessToken || !accessToken.trim()) {
    return {
      ok: false,
      error: "Fanpage chưa có Page Access Token. Vui lòng kết nối tài khoản hoặc nhập Access Token.",
    };
  }

  const cleanPageId = pageId.trim();
  const cleanToken = accessToken.trim();

  // Thu thập danh sách ảnh (ưu tiên file local, sau đó là URL công khai)
  const allImageItems: Array<{ filePath?: string; url?: string }> = [];
  for (const f of localFiles) {
    if (f && f.trim()) allImageItems.push({ filePath: f.trim() });
  }
  if (allImageItems.length === 0) {
    for (const u of imageUrls) {
      if (u && /^https?:\/\//i.test(u.trim())) {
        allImageItems.push({ url: u.trim() });
      }
    }
  }

  try {
    // TRƯỜNG HỢP 1: Bài viết thuần chữ (không kèm ảnh)
    if (allImageItems.length === 0) {
      const feedEndpoint = `${FB_GRAPH_BASE_URL}/${encodeURIComponent(cleanPageId)}/feed`;
      const body = new URLSearchParams();
      body.set("message", message);
      body.set("access_token", cleanToken);

      const res = await fetch(feedEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
      const data: any = await res.json();
      if (!res.ok || data.error) {
        return {
          ok: false,
          error: data?.error?.message || `Lỗi đăng bài viết (${res.status})`,
        };
      }

      const postId = data.id || "";
      const postUrl = formatFacebookPostUrl(cleanPageId, postId);
      return { ok: true, postId, postUrl };
    }

    // TRƯỜNG HỢP 2: Bài viết kèm 1 ảnh duy nhất
    if (allImageItems.length === 1 && allImageItems[0]) {
      const uploadRes = await uploadPhotoToFacebookPage(
        cleanPageId,
        cleanToken,
        allImageItems[0],
        { caption: message, published: true },
      );
      if (!uploadRes.ok) {
        return { ok: false, error: uploadRes.error };
      }
      const photoId = uploadRes.photoId || "";
      const postUrl = `https://www.facebook.com/${photoId}`;
      return { ok: true, postId: photoId, postUrl };
    }

    // TRƯỜNG HỢP 3: Bài viết kèm nhiều ảnh (Album / Multi-photo feed post)
    const uploadedPhotoIds: string[] = [];
    for (let i = 0; i < allImageItems.length; i++) {
      const item = allImageItems[i];
      if (!item) continue;
      const uploadRes = await uploadPhotoToFacebookPage(
        cleanPageId,
        cleanToken,
        item,
        { published: false }, // Upload tạm unpublished
      );
      if (uploadRes.ok && uploadRes.photoId) {
        uploadedPhotoIds.push(uploadRes.photoId);
      } else {
        console.warn(`[Facebook Graph API] Bỏ qua ảnh #${i + 1} do lỗi:`, uploadRes.error);
      }
    }

    if (uploadedPhotoIds.length === 0) {
      return {
        ok: false,
        error: "Không thể tải lên ảnh nào vào Facebook Page để tạo bài viết.",
      };
    }

    // Ghép các ảnh vào Feed post chính kèm caption
    const feedEndpoint = `${FB_GRAPH_BASE_URL}/${encodeURIComponent(cleanPageId)}/feed`;
    const body = new URLSearchParams();
    body.set("message", message);
    body.set("access_token", cleanToken);

    uploadedPhotoIds.forEach((photoId, idx) => {
      body.set(`attached_media[${idx}]`, JSON.stringify({ media_fbid: photoId }));
    });

    const res = await fetch(feedEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    const data: any = await res.json();
    if (!res.ok || data.error) {
      return {
        ok: false,
        error: data?.error?.message || `Lỗi tạo bài viết nhiều ảnh (${res.status})`,
      };
    }

    const postId = data.id || "";
    const postUrl = formatFacebookPostUrl(cleanPageId, postId);
    return { ok: true, postId, postUrl };
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || "Lỗi mạng hoặc ngoại lệ khi kết nối Facebook Graph API.",
    };
  }
}

/**
 * Định dạng link bài viết Facebook dựa vào pageId và postId
 */
export function formatFacebookPostUrl(pageId: string, postId: string): string {
  if (!postId) return `https://www.facebook.com/${pageId}`;
  if (postId.includes("_")) {
    const parts = postId.split("_");
    return `https://www.facebook.com/${parts[0]}/posts/${parts[1]}`;
  }
  return `https://www.facebook.com/${postId}`;
}

/**
 * Kiểm tra tính hợp lệ và thông tin chi tiết của một Access Token
 */
export async function debugFacebookToken(
  token: string,
  appTokenOrAccessToken: string,
): Promise<DebugTokenInfo> {
  const url = `${FB_GRAPH_BASE_URL}/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(appTokenOrAccessToken || token)}`;
  try {
    const res = await fetch(url);
    const data: any = await res.json();
    if (!res.ok || data.error) {
      return {
        is_valid: false,
        error: data?.error?.message || `Lỗi kiểm tra token (${res.status})`,
      };
    }
    const d = data.data || {};
    return {
      is_valid: Boolean(d.is_valid),
      app_id: d.app_id,
      user_id: d.user_id,
      expires_at: d.expires_at,
      scopes: d.scopes || [],
      type: d.type,
      error: d.error?.message,
    };
  } catch (err: any) {
    return { is_valid: false, error: err?.message || String(err) };
  }
}

/**
 * Lấy danh sách các Page người dùng quản lý cùng Page Access Token
 */
export async function getManagedFacebookPages(
  userAccessToken: string,
): Promise<{ ok: boolean; pages: FacebookPageInfo[]; error?: string }> {
  const url = `${FB_GRAPH_BASE_URL}/me/accounts?fields=id,name,access_token,link,category,tasks,instagram_business_account{id,username}&limit=100&access_token=${encodeURIComponent(userAccessToken)}`;
  try {
    const res = await fetch(url);
    const data: any = await res.json();
    if (!res.ok || data.error) {
      return {
        ok: false,
        pages: [],
        error: data?.error?.message || `Lỗi đọc danh sách Page (${res.status})`,
      };
    }
    const rawPages = Array.isArray(data.data) ? data.data : [];
    const pages: FacebookPageInfo[] = rawPages.map((p: any) => ({
      id: p.id,
      name: p.name,
      access_token: p.access_token,
      link: p.link,
      instagram_business_account: p.instagram_business_account
        ? {
            id: p.instagram_business_account.id,
            username: p.instagram_business_account.username,
          }
        : undefined,
    }));
    return { ok: true, pages };
  } catch (err: any) {
    return { ok: false, pages: [], error: err?.message || String(err) };
  }
}
