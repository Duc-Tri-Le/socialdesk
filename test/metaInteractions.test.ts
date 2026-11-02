import { describe, expect, test } from "bun:test";
import {
  getFacebookPostMetrics,
  getInstagramMediaMetrics,
  getRecentPosts,
  getPostComments,
  replyToComment,
  getConversationsList,
  sendDirectMessage,
} from "../server/src/services/publishing/metaInteractionApi";

describe("Meta Interactions API (Messages, Comments, Recent Posts)", () => {
  test("getFacebookPostMetrics từ chối an toàn khi thiếu tham số", async () => {
    const res = await getFacebookPostMetrics("", "");
    expect(res.ok).toBe(false);
    expect(res.error).toContain("Thiếu");
  });

  test("getInstagramMediaMetrics từ chối an toàn khi thiếu tham số", async () => {
    const res = await getInstagramMediaMetrics("", "");
    expect(res.ok).toBe(false);
    expect(res.error).toContain("Thiếu");
  });

  test("getRecentPosts từ chối an toàn khi thiếu targetId hoặc accessToken", async () => {
    const res = await getRecentPosts("", "");
    expect(res.ok).toBe(false);
    expect(res.posts).toHaveLength(0);
    expect(res.error).toContain("Thiếu");
  });

  test("getPostComments bóc tách an toàn post ID từ URL Facebook và URL Instagram", async () => {
    // Gọi với dummy token để test luồng bóc URL không gây crash
    const resFb = await getPostComments("https://www.facebook.com/ducgarage/posts/123456789012345", "dummy_token", false);
    expect(resFb.ok).toBe(false); // Do dummy token, trả về lỗi từ Graph API nhưng không văng Exception
    expect(resFb.comments).toHaveLength(0);

    const resIg = await getPostComments("https://www.instagram.com/p/Cxyz12345/", "dummy_token", true);
    expect(resIg.ok).toBe(false);
    expect(resIg.comments).toHaveLength(0);
  });

  test("sendDirectMessage từ chối hoặc xử lý an toàn khi thiếu token thật", async () => {
    const res = await sendDirectMessage("12345", "67890", "invalid_token", "Xin chào khách hàng");
    expect(res.ok).toBe(false);
    expect(res.error).toBeDefined();
  });
});

