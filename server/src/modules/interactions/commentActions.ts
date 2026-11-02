import { defineAction, z } from "@hatch/space-sdk";
import {
  getRecentPosts,
  getPostComments,
  replyToComment,
} from "../../services/publishing/metaInteractionApi";

export const commentActions = {
  /**
   * Lấy danh sách bài viết gần đây trên Fanpage / Instagram để chọn xem bình luận
   */
  getRecentPosts: defineAction({
    request: z.object({
      target_id: z.string().min(1),
      channel: z.enum(["page", "instagram"]),
      access_token: z.string().min(1),
    }),
    response: z.object({
      ok: z.boolean(),
      posts: z.array(
        z.object({
          id: z.string(),
          message: z.string(),
          created_time: z.string(),
          permalink: z.string(),
          comments_count: z.number(),
          likes_count: z.number(),
        }),
      ),
      message: z.string(),
    }),
    async handler(_ctx, args) {
      const res = await getRecentPosts(
        args.target_id,
        args.access_token,
        args.channel === "instagram",
      );
      if (!res.ok) {
        return { ok: false, posts: [], message: res.error || "Không thể tải danh sách bài viết." };
      }
      return {
        ok: true,
        posts: res.posts.map((p) => ({
          ...p,
          permalink: p.permalink || "",
        })),
        message: `Đã tải ${res.posts.length} bài viết gần đây.`,
      };
    },
  }),

  /**
   * Lấy danh sách bình luận trên bài viết Fanpage / Instagram
   */
  getPostComments: defineAction({
    request: z.object({
      post_id: z.string().min(1),
      channel: z.enum(["page", "instagram"]),
      access_token: z.string().min(1),
    }),
    response: z.object({
      ok: z.boolean(),
      comments: z.array(
        z.object({
          id: z.string(),
          user_name: z.string(),
          text: z.string(),
          created_time: z.string(),
          like_count: z.number(),
        }),
      ),
      message: z.string(),
    }),
    async handler(_ctx, args) {
      const res = await getPostComments(
        args.post_id,
        args.access_token,
        args.channel === "instagram",
      );
      if (!res.ok) {
        return { ok: false, comments: [], message: res.error || "Không thể đọc bình luận." };
      }
      return {
        ok: true,
        comments: res.comments.map((c) => ({
          id: c.id,
          user_name: c.from?.name || "Khách hàng",
          text: c.text,
          created_time: c.created_time,
          like_count: c.like_count || 0,
        })),
        message: `Đã tải ${res.comments.length} bình luận.`,
      };
    },
  }),

  /**
   * Trả lời bình luận của khách
   */
  replyComment: defineAction({
    request: z.object({
      comment_id: z.string().min(1),
      channel: z.enum(["page", "instagram"]),
      access_token: z.string().min(1),
      message: z.string().min(1, "Nội dung phản hồi không được để trống"),
    }),
    response: z.object({ ok: z.boolean(), message: z.string() }),
    async handler(ctx, args) {
      const res = await replyToComment(
        args.comment_id,
        args.access_token,
        args.message,
        args.channel === "instagram",
      );
      if (!res.ok) {
        return { ok: false, message: res.error || "Gửi phản hồi thất bại." };
      }
      ctx.invalidateQueries();
      return { ok: true, message: "Đã gửi phản hồi bình luận thành công!" };
    },
  }),
};

