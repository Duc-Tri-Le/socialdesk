import { defineAction, z } from "@hatch/space-sdk";
import {
  getConversationsList,
  getConversationMessages,
  sendDirectMessage,
} from "../../services/publishing/metaInteractionApi";

export const messagingActions = {
  /**
   * Lấy danh sách hội thoại Messenger / Instagram Direct
   */
  getConversations: defineAction({
    request: z.object({
      target_id: z.string().min(1),
      channel: z.enum(["page", "instagram"]),
      access_token: z.string().min(1),
    }),
    response: z.object({
      ok: z.boolean(),
      conversations: z.array(
        z.object({
          id: z.string(),
          snippet: z.string(),
          updated_time: z.string(),
          unread_count: z.number(),
          participant_name: z.string(),
          participant_id: z.string(),
        }),
      ),
      message: z.string(),
    }),
    async handler(_ctx, args) {
      const res = await getConversationsList(
        args.target_id,
        args.access_token,
        args.channel === "instagram",
      );
      if (!res.ok) {
        return { ok: false, conversations: [], message: res.error || "Không thể tải hội thoại." };
      }
      return {
        ok: true,
        conversations: res.conversations.map((c) => {
          const participant = c.participants[0] || { id: "", name: "Khách hàng" };
          return {
            id: c.id,
            snippet: c.snippet,
            updated_time: c.updated_time,
            unread_count: c.unread_count,
            participant_name: participant.name,
            participant_id: participant.id,
          };
        }),
        message: `Đã tải ${res.conversations.length} cuộc hội thoại.`,
      };
    },
  }),

  /**
   * Lấy danh sách tin nhắn bên trong 1 cuộc hội thoại
   */
  getMessages: defineAction({
    request: z.object({
      conversation_id: z.string().min(1),
      access_token: z.string().min(1),
    }),
    response: z.object({
      ok: z.boolean(),
      messages: z.array(
        z.object({
          id: z.string(),
          text: z.string(),
          created_time: z.string(),
          sender_name: z.string(),
        }),
      ),
      message: z.string(),
    }),
    async handler(_ctx, args) {
      const res = await getConversationMessages(
        args.conversation_id,
        args.access_token,
      );
      if (!res.ok) {
        return { ok: false, messages: [], message: res.error || "Không thể tải tin nhắn." };
      }
      return {
        ok: true,
        messages: res.messages.map((m) => ({
          id: m.id,
          text: m.text,
          created_time: m.created_time,
          sender_name: m.from.name,
        })),
        message: `Đã tải ${res.messages.length} tin nhắn.`,
      };
    },
  }),

  /**
   * Gửi tin nhắn trả lời khách hàng qua Messenger / Direct
   */
  sendMessage: defineAction({
    request: z.object({
      target_id: z.string().min(1), // Page ID hoặc IG ID
      recipient_id: z.string().min(1), // Khách hàng ID
      access_token: z.string().min(1),
      text: z.string().min(1, "Tin nhắn không được để trống"),
    }),
    response: z.object({ ok: z.boolean(), message: z.string() }),
    async handler(ctx, args) {
      const res = await sendDirectMessage(
        args.target_id,
        args.recipient_id,
        args.access_token,
        args.text,
      );
      if (!res.ok) {
        return { ok: false, message: res.error || "Gửi tin nhắn thất bại." };
      }
      ctx.invalidateQueries();
      return { ok: true, message: "Đã gửi tin nhắn cho khách hàng thành công!" };
    },
  }),
};

