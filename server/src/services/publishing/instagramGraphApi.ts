const FB_GRAPH_API_VERSION = "v22.0";
const FB_GRAPH_BASE_URL = `https://graph.facebook.com/${FB_GRAPH_API_VERSION}`;

export interface InstagramPostOptions {
  igBusinessAccountId: string;
  accessToken: string;
  caption: string;
  imageUrls: string[];
}

export interface InstagramPostResult {
  ok: boolean;
  mediaId?: string;
  postUrl?: string;
  error?: string;
}

/**
 * Chờ Instagram xử lý xong Media Container trước khi publish
 */
async function waitForMediaContainerReady(
  containerId: string,
  accessToken: string,
  maxWaitMs: number = 30000,
): Promise<{ ok: boolean; error?: string }> {
  const startTime = Date.now();
  const pollUrl = `${FB_GRAPH_BASE_URL}/${encodeURIComponent(containerId)}?fields=status_code&access_token=${encodeURIComponent(accessToken)}`;

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const res = await fetch(pollUrl);
      const data: any = await res.json();
      const status = data?.status_code;

      if (status === "FINISHED") {
        return { ok: true };
      }
      if (status === "ERROR" || status === "EXPIRED") {
        return {
          ok: false,
          error: `Instagram xử lý media thất bại (trạng thái: ${status})`,
        };
      }
    } catch {
      // Tiếp tục polling
    }
    await new Promise((r) => setTimeout(r, 2000));
  }

  // Nếu quá thời gian nhưng chưa error, vẫn thử publish
  return { ok: true };
}

/**
 * Đăng bài viết (1 ảnh hoặc Carousel nhiều ảnh) lên Instagram bằng Instagram Graph API
 */
export async function publishToInstagramGraph(
  opts: InstagramPostOptions,
): Promise<InstagramPostResult> {
  const { igBusinessAccountId, accessToken, caption, imageUrls } = opts;

  if (!igBusinessAccountId || !igBusinessAccountId.trim()) {
    return {
      ok: false,
      error: "Tài khoản Instagram chưa có Instagram Business Account ID.",
    };
  }
  if (!accessToken || !accessToken.trim()) {
    return {
      ok: false,
      error: "Tài khoản Instagram chưa có Access Token.",
    };
  }

  const cleanIgId = igBusinessAccountId.trim();
  const cleanToken = accessToken.trim();

  // Lọc lấy danh sách URL ảnh công khai
  const validImageUrls = (imageUrls || []).filter(
    (u) => typeof u === "string" && /^https?:\/\//i.test(u.trim()),
  );

  if (validImageUrls.length === 0) {
    return {
      ok: false,
      error:
        "Instagram Graph API bắt buộc phải có ít nhất 1 đường link ảnh công khai (http/https).",
    };
  }

  try {
    // TRƯỜNG HỢP 1: Đăng 1 ảnh duy nhất
    if (validImageUrls.length === 1 && validImageUrls[0]) {
      const createContainerUrl = `${FB_GRAPH_BASE_URL}/${encodeURIComponent(cleanIgId)}/media`;
      const createParams = new URLSearchParams();
      createParams.set("image_url", validImageUrls[0]);
      createParams.set("caption", caption || "");
      createParams.set("access_token", cleanToken);

      const createRes = await fetch(createContainerUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: createParams.toString(),
      });
      const createData: any = await createRes.json();

      if (!createRes.ok || createData.error || !createData.id) {
        return {
          ok: false,
          error:
            createData?.error?.message ||
            `Lỗi tạo Instagram media container (${createRes.status})`,
        };
      }

      const containerId = createData.id;

      // Chờ container xử lý
      const readyCheck = await waitForMediaContainerReady(containerId, cleanToken);
      if (!readyCheck.ok) {
        return { ok: false, error: readyCheck.error };
      }

      // Publish container
      const publishUrl = `${FB_GRAPH_BASE_URL}/${encodeURIComponent(cleanIgId)}/media_publish`;
      const pubParams = new URLSearchParams();
      pubParams.set("creation_id", containerId);
      pubParams.set("access_token", cleanToken);

      const pubRes = await fetch(publishUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: pubParams.toString(),
      });
      const pubData: any = await pubRes.json();

      if (!pubRes.ok || pubData.error || !pubData.id) {
        return {
          ok: false,
          error:
            pubData?.error?.message ||
            `Lỗi công bố bài viết lên Instagram (${pubRes.status})`,
        };
      }

      const mediaId = pubData.id;
      // Lấy link permalink của bài viết
      const permalink = await fetchInstagramPermalink(mediaId, cleanToken);
      return { ok: true, mediaId, postUrl: permalink };
    }

    // TRƯỜNG HỢP 2: Đăng Carousel (nhiều ảnh, tối đa 10 ảnh theo quy định của IG)
    const carouselItems = validImageUrls.slice(0, 10);
    const childContainerIds: string[] = [];

    for (let i = 0; i < carouselItems.length; i++) {
      const imgUrl = carouselItems[i];
      if (!imgUrl) continue;
      const createChildUrl = `${FB_GRAPH_BASE_URL}/${encodeURIComponent(cleanIgId)}/media`;
      const childParams = new URLSearchParams();
      childParams.set("image_url", imgUrl);
      childParams.set("is_carousel_item", "true");
      childParams.set("access_token", cleanToken);

      const childRes = await fetch(createChildUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: childParams.toString(),
      });
      const childData: any = await childRes.json();

      if (childRes.ok && childData.id) {
        childContainerIds.push(childData.id);
      } else {
        console.warn(`[Instagram Graph API] Bỏ qua ảnh #${i + 1}:`, childData?.error?.message);
      }
    }

    if (childContainerIds.length === 0) {
      return {
        ok: false,
        error: "Không thể tạo container cho bất kỳ ảnh nào trong Carousel Instagram.",
      };
    }

    // Tạo Carousel container tổng
    const createCarouselUrl = `${FB_GRAPH_BASE_URL}/${encodeURIComponent(cleanIgId)}/media`;
    const carouselParams = new URLSearchParams();
    carouselParams.set("media_type", "CAROUSEL");
    carouselParams.set("children", childContainerIds.join(","));
    carouselParams.set("caption", caption || "");
    carouselParams.set("access_token", cleanToken);

    const carouselRes = await fetch(createCarouselUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: carouselParams.toString(),
    });
    const carouselData: any = await carouselRes.json();

    if (!carouselRes.ok || carouselData.error || !carouselData.id) {
      return {
        ok: false,
        error:
          carouselData?.error?.message ||
          `Lỗi tạo Carousel Instagram container (${carouselRes.status})`,
      };
    }

    const carouselContainerId = carouselData.id;
    await waitForMediaContainerReady(carouselContainerId, cleanToken, 25000);

    // Công bố Carousel
    const pubUrl = `${FB_GRAPH_BASE_URL}/${encodeURIComponent(cleanIgId)}/media_publish`;
    const pubParams = new URLSearchParams();
    pubParams.set("creation_id", carouselContainerId);
    pubParams.set("access_token", cleanToken);

    const pubRes = await fetch(pubUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: pubParams.toString(),
    });
    const pubData: any = await pubRes.json();

    if (!pubRes.ok || pubData.error || !pubData.id) {
      return {
        ok: false,
        error:
          pubData?.error?.message ||
          `Lỗi công bố bài viết Carousel lên Instagram (${pubRes.status})`,
      };
    }

    const mediaId = pubData.id;
    const permalink = await fetchInstagramPermalink(mediaId, cleanToken);
    return { ok: true, mediaId, postUrl: permalink };
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || "Lỗi ngoại lệ khi gọi Instagram Graph API.",
    };
  }
}

/**
 * Lấy link xem bài viết (permalink) từ mediaId
 */
export async function fetchInstagramPermalink(
  mediaId: string,
  accessToken: string,
): Promise<string> {
  try {
    const url = `${FB_GRAPH_BASE_URL}/${encodeURIComponent(mediaId)}?fields=permalink&access_token=${encodeURIComponent(accessToken)}`;
    const res = await fetch(url);
    const data: any = await res.json();
    return data?.permalink || `https://www.instagram.com/p/${mediaId}`;
  } catch {
    return `https://www.instagram.com/`;
  }
}
