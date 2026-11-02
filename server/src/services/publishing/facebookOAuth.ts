import type { Db } from "../settings";
import * as schema from "../../schema";
import { eq, and } from "drizzle-orm";
import { getManagedFacebookPages } from "./facebookGraphApi";

const FB_GRAPH_API_VERSION = "v22.0";
const FB_GRAPH_BASE_URL = `https://graph.facebook.com/${FB_GRAPH_API_VERSION}`;

// Danh sách quyền Facebook & Instagram tối ưu cho OAuth (tránh các quyền bị Meta hạn chế/cấm)
// Lưu ý: `pages_manage_engagement` bị Meta hạn chế nghiêm ngặt (Restricted/Advanced Access)
// và sẽ gây lỗi "Invalid Scopes: pages_manage_engagement" nếu App chưa xác minh doanh nghiệp.
// Việc đọc bình luận và lượt thích chỉ cần `pages_read_engagement`.
export const FB_OAUTH_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "pages_messaging",
  "pages_manage_metadata",
  "instagram_basic",
  "instagram_content_publish",
  "instagram_manage_comments",
  "instagram_manage_contents",
  "instagram_manage_messages",
  "business_management",
].join(",");

/**
 * Sinh URL chuyển hướng người dùng đến trang đăng nhập/ủy quyền của Facebook
 */
export function buildFacebookOAuthUrl(
  appId: string,
  redirectUri: string,
  state: string = "socialdesk_oauth",
  customScopes?: string,
): string {
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    state,
    scope: customScopes || FB_OAUTH_SCOPES,
    response_type: "code",
  });
  return `https://www.facebook.com/${FB_GRAPH_API_VERSION}/dialog/oauth?${params.toString()}`;
}

/**
 * Đổi authorization code lấy short-lived access token
 */
export async function exchangeCodeForUserToken(
  appId: string,
  appSecret: string,
  redirectUri: string,
  code: string,
): Promise<{ ok: boolean; accessToken?: string; expiresIn?: number; error?: string }> {
  const url = `${FB_GRAPH_BASE_URL}/oauth/access_token`;
  const params = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    redirect_uri: redirectUri,
    code,
  });

  try {
    const res = await fetch(`${url}?${params.toString()}`);
    const data: any = await res.json();
    if (!res.ok || data.error) {
      return {
        ok: false,
        error: data?.error?.message || `Lỗi đổi code lấy token (${res.status})`,
      };
    }
    return {
      ok: true,
      accessToken: data.access_token,
      expiresIn: data.expires_in,
    };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

/**
 * Đổi short-lived token sang long-lived token (60 ngày)
 */
export async function exchangeForLongLivedUserToken(
  appId: string,
  appSecret: string,
  shortLivedToken: string,
): Promise<{ ok: boolean; accessToken?: string; error?: string }> {
  const url = `${FB_GRAPH_BASE_URL}/oauth/access_token`;
  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: shortLivedToken,
  });

  try {
    const res = await fetch(`${url}?${params.toString()}`);
    const data: any = await res.json();
    if (!res.ok || data.error) {
      return {
        ok: false,
        error: data?.error?.message || `Lỗi đổi long-lived token (${res.status})`,
      };
    }
    return { ok: true, accessToken: data.access_token };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

/**
 * Đồng bộ toàn bộ Fanpage và Instagram Business Accounts thuộc quyền quản trị của User vào Database
 */
export async function syncFacebookAssets(
  db: Db,
  explicitAccountId: number | undefined,
  userAccessToken: string,
): Promise<{
  ok: boolean;
  pagesSynced: number;
  instagramSynced: number;
  message: string;
}> {
  // Lấy thông tin user Facebook hiện tại từ Graph API
  let fbUserId = "";
  let fbUserName = "";
  try {
    const meRes = await fetch(
      `${FB_GRAPH_BASE_URL}/me?fields=id,name&access_token=${encodeURIComponent(userAccessToken)}`,
    );
    const meData: any = await meRes.json();
    fbUserId = meData?.id || "";
    fbUserName = meData?.name || "";
  } catch {}

  // Xác định tài khoản Facebook mục tiêu (tự động nhận diện nick mới hay nick cũ)
  let accountId: number;
  if (explicitAccountId) {
    accountId = explicitAccountId;
  } else {
    // Tìm nick Facebook đã có trong DB khớp với Facebook User ID hoặc Tên
    const allFb = await db
      .select()
      .from(schema.accounts)
      .where(eq(schema.accounts.platform, "Facebook"));

    const matched = allFb.find(
      (a) =>
        (fbUserId && (a.handle === fbUserId || (a.profileUrl && a.profileUrl.includes(fbUserId)))) ||
        (fbUserName && a.name.trim().toLowerCase() === fbUserName.trim().toLowerCase())
    );

    if (matched) {
      accountId = matched.id;
    } else {
      // ĐÂY LÀ NICK MỚI HOÀN TOÀN: Tạo riêng một tài khoản Facebook mới, KHÔNG gắn đè vào nick cũ!
      const [newAcc] = await db
        .insert(schema.accounts)
        .values({
          platform: "Facebook",
          name: fbUserName || (fbUserId ? `Facebook (${fbUserId})` : "Nick Facebook Mới"),
          handle: fbUserId || "",
          profileUrl: fbUserId ? `https://www.facebook.com/${fbUserId}` : "https://www.facebook.com/",
          accessToken: userAccessToken,
          linked: 1,
          selected: allFb.length === 0 ? 1 : 0,
        })
        .returning();
      accountId = newAcc?.id ?? 0;
    }
  }

  if (!accountId) {
    return {
      ok: false,
      pagesSynced: 0,
      instagramSynced: 0,
      message: "Không thể tạo hoặc xác định tài khoản Facebook mục tiêu.",
    };
  }

  // Lấy danh sách Pages mà user này quản trị kèm Page Token
  const pagesRes = await getManagedFacebookPages(userAccessToken);
  if (!pagesRes.ok) {
    return {
      ok: false,
      pagesSynced: 0,
      instagramSynced: 0,
      message: pagesRes.error || "Không thể lấy danh sách Fanpage từ Facebook.",
    };
  }

  let pagesCount = 0;
  let instagramCount = 0;

  for (const page of pagesRes.pages) {
    // 1. Lưu hoặc cập nhật Page vào bảng fbPages
    const existingPages = await db
      .select()
      .from(schema.fbPages)
      .where(
        and(
          eq(schema.fbPages.accountId, accountId),
          eq(schema.fbPages.fbPageId, page.id),
        ),
      );

    const firstPage = existingPages[0];
    if (firstPage) {
      await db
        .update(schema.fbPages)
        .set({
          name: page.name,
          url: page.link || `https://www.facebook.com/${page.id}`,
          accessToken: page.access_token || "",
          selected: 1,
        })
        .where(eq(schema.fbPages.id, firstPage.id));
      pagesCount++;
    } else {
      // Tìm xem có page trùng tên chưa gán fbPageId không
      const sameName = await db
        .select()
        .from(schema.fbPages)
        .where(
          and(
            eq(schema.fbPages.accountId, accountId),
            eq(schema.fbPages.name, page.name),
          ),
        );

      const firstSame = sameName[0];
      if (firstSame) {
        await db
          .update(schema.fbPages)
          .set({
            fbPageId: page.id,
            url: page.link || firstSame.url || `https://www.facebook.com/${page.id}`,
            accessToken: page.access_token || "",
            selected: 1,
          })
          .where(eq(schema.fbPages.id, firstSame.id));
        pagesCount++;
      } else {
        await db.insert(schema.fbPages).values({
          accountId,
          name: page.name,
          url: page.link || `https://www.facebook.com/${page.id}`,
          fbPageId: page.id,
          accessToken: page.access_token || "",
          selected: 1,
          role: "ADMINISTER",
        });
        pagesCount++;
      }
    }

    // 2. Nếu Page có Instagram Business Account liên kết
    if (page.instagram_business_account?.id) {
      const igId = page.instagram_business_account.id;
      const igUsername = page.instagram_business_account.username || "";
      const igName = igUsername ? `@${igUsername}` : `Instagram (${page.name})`;

      const existingIg = await db
        .select()
        .from(schema.accounts)
        .where(
          and(
            eq(schema.accounts.platform, "Instagram"),
            eq(schema.accounts.igBusinessAccountId, igId),
          ),
        );

      const firstExistingIg = existingIg[0];
      if (firstExistingIg) {
        await db
          .update(schema.accounts)
          .set({
            name: igName,
            handle: igUsername ? `@${igUsername}` : firstExistingIg.handle,
            profileUrl: igUsername
              ? `https://www.instagram.com/${igUsername}/`
              : firstExistingIg.profileUrl,
            accessToken: page.access_token || userAccessToken,
            linked: 1,
            selected: 1,
          })
          .where(eq(schema.accounts.id, firstExistingIg.id));
        instagramCount++;
      } else {
        // Kiểm tra xem có tài khoản Instagram cùng handle chưa gán igBusinessAccountId không
        const sameHandle = igUsername
          ? await db
              .select()
              .from(schema.accounts)
              .where(
                and(
                  eq(schema.accounts.platform, "Instagram"),
                  eq(schema.accounts.handle, `@${igUsername}`),
                ),
              )
          : [];

        const firstSameHandle = sameHandle[0];
        if (firstSameHandle) {
          await db
            .update(schema.accounts)
            .set({
              igBusinessAccountId: igId,
              accessToken: page.access_token || userAccessToken,
              linked: 1,
              selected: 1,
            })
            .where(eq(schema.accounts.id, firstSameHandle.id));
          instagramCount++;
        } else {
          await db.insert(schema.accounts).values({
            platform: "Instagram",
            name: igName,
            handle: igUsername ? `@${igUsername}` : "",
            profileUrl: igUsername ? `https://www.instagram.com/${igUsername}/` : "",
            igBusinessAccountId: igId,
            accessToken: page.access_token || userAccessToken,
            linked: 1,
            selected: 1,
          });
          instagramCount++;
        }
      }
    }
  }

  // Cập nhật token cho tài khoản Facebook chính
  await db
    .update(schema.accounts)
    .set({
      accessToken: userAccessToken,
      linked: 1,
      selected: 1,
      name: fbUserName || undefined,
    })
    .where(eq(schema.accounts.id, accountId));

  return {
    ok: true,
    pagesSynced: pagesCount,
    instagramSynced: instagramCount,
    message: `Đã kết nối API thành công: đồng bộ ${pagesCount} Fanpage và ${instagramCount} tài khoản Instagram!`,
  };
}
