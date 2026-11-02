import { describe, expect, it } from "bun:test";
import {
  formatFacebookPostUrl,
  publishToFacebookPage,
} from "../server/src/services/publishing/facebookGraphApi";
import {
  publishToInstagramGraph,
} from "../server/src/services/publishing/instagramGraphApi";
import {
  buildFacebookOAuthUrl,
  FB_OAUTH_SCOPES,
} from "../server/src/services/publishing/facebookOAuth";
import { FB_PAGE_CAPTION_LIMIT } from "../server/src/services/posting/postingTypes";

describe("Facebook & Instagram Graph API Publishing", () => {
  it("formatFacebookPostUrl định dạng chính xác link bài viết từ pageId và postId", () => {
    // Trường hợp 1: postId dạng pageId_postNum
    expect(formatFacebookPostUrl("100012345678", "100012345678_9876543210")).toBe(
      "https://www.facebook.com/100012345678/posts/9876543210",
    );

    // Trường hợp 2: postId đơn
    expect(formatFacebookPostUrl("100012345678", "9876543210")).toBe(
      "https://www.facebook.com/9876543210",
    );

    // Trường hợp 3: không có postId
    expect(formatFacebookPostUrl("100012345678", "")).toBe(
      "https://www.facebook.com/100012345678",
    );
  });

  it("buildFacebookOAuthUrl sinh chính xác đường link OAuth với đầy đủ quyền", () => {
    const url = buildFacebookOAuthUrl(
      "1234567890",
      "http://localhost:3000/accounts",
      "test_state",
    );
    expect(url).toContain("client_id=1234567890");
    expect(url).toContain("redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Faccounts");
    expect(url).toContain("state=test_state");
    expect(url).toContain("response_type=code");
    expect(url).toContain("pages_manage_posts");
    expect(url).toContain("instagram_content_publish");
  });

  it("FB_PAGE_CAPTION_LIMIT đã được nâng lên giới hạn lớn của Graph API", () => {
    expect(FB_PAGE_CAPTION_LIMIT).toBeGreaterThanOrEqual(60000);
  });

  it("publishToFacebookPage từ chối an toàn khi thiếu Page ID hoặc Access Token", async () => {
    // Thiếu Page ID
    const resNoId = await publishToFacebookPage({
      pageId: "",
      accessToken: "token_123",
      message: "Test caption",
    });
    expect(resNoId.ok).toBe(false);
    expect(resNoId.error).toContain("Page ID");

    // Thiếu Access Token
    const resNoToken = await publishToFacebookPage({
      pageId: "1029384",
      accessToken: "",
      message: "Test caption",
    });
    expect(resNoToken.ok).toBe(false);
    expect(resNoToken.error).toContain("Access Token");
  });

  it("publishToInstagramGraph từ chối an toàn khi thiếu Business ID, Token hoặc link ảnh", async () => {
    // Thiếu Business ID
    const resNoId = await publishToInstagramGraph({
      igBusinessAccountId: "",
      accessToken: "token_123",
      caption: "Test caption",
      imageUrls: ["https://example.com/image.jpg"],
    });
    expect(resNoId.ok).toBe(false);
    expect(resNoId.error).toContain("Instagram Business Account ID");

    // Thiếu ảnh công khai
    const resNoImg = await publishToInstagramGraph({
      igBusinessAccountId: "1784140000",
      accessToken: "token_123",
      caption: "Test caption",
      imageUrls: [],
    });
    expect(resNoImg.ok).toBe(false);
    expect(resNoImg.error).toContain("ít nhất 1 đường link ảnh công khai");
  });
});

