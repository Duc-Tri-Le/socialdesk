import { defineAction, z } from "@hatch/space-sdk";
import { desc, eq } from "drizzle-orm";
import * as schema from "../schema";

export const mediaActions = {

  // ----------------------------------------------------------------- media
  listMedia: defineAction({
    request: z.object({}),
    response: z.object({
      media: z.array(
        z.object({
          id: z.number(),
          name: z.string(),
          mime: z.string(),
          size: z.number(),
          url: z.string(),
          created_at: z.string(),
        }),
      ),
    }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const rows = await db
        .select()
        .from(schema.mediaItems)
        .orderBy(desc(schema.mediaItems.id));
      const media = await Promise.all(
        rows.map(async (r) => ({
          id: r.id,
          name: r.name,
          mime: r.mime,
          size: r.size,
          url: (await ctx.blobs.getUrl(r.blobKey)) ?? "",
          created_at: r.createdAt.toISOString(),
        })),
      );
      return { media };
    },
  }),

  uploadMedia: defineAction({
    request: z.object({
      name: z.string().min(1),
      mime: z.string().min(1),
      data_base64: z.string().min(1),
    }),
    response: z.object({
      ok: z.boolean(),
      error: z.string(),
      // Thông tin file vừa tải lên — form soạn bài dùng id/url này
      // để gắn ảnh tải lên thẳng vào bản nháp đang soạn.
      id: z.number(),
      name: z.string(),
      mime: z.string(),
      size: z.number(),
      url: z.string(),
    }),
    async handler(ctx, args) {
      const empty = { id: 0, name: "", mime: "", size: 0, url: "" };
      const allowed =
        args.mime.startsWith("image/") || args.mime.startsWith("video/");
      if (!allowed)
        return { ok: false, error: "Chỉ nhận file ảnh hoặc video.", ...empty };
      const bytes = Buffer.from(args.data_base64, "base64");
      if (bytes.length > 25 * 1024 * 1024)
        return { ok: false, error: "File quá lớn (tối đa 25MB).", ...empty };
      const safeName = args.name.replace(/[^\w.\-]+/g, "_");
      const key = `media/${Date.now()}-${safeName}`;
      await ctx.blobs.put(key, bytes, { contentType: args.mime });
      const db = ctx.db<typeof schema>();
      const [row] = await db
        .insert(schema.mediaItems)
        .values({
          name: args.name,
          blobKey: key,
          mime: args.mime,
          size: bytes.length,
        })
        .returning({ id: schema.mediaItems.id });
      ctx.invalidateQueries();
      return {
        ok: true,
        error: "",
        id: row?.id ?? 0,
        name: args.name,
        mime: args.mime,
        size: bytes.length,
        url: (await ctx.blobs.getUrl(key)) ?? "",
      };
    },
  }),

  deleteMedia: defineAction({
    request: z.object({ id: z.number().int().positive() }),
    response: z.object({ ok: z.boolean() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const [row] = await db
        .select()
        .from(schema.mediaItems)
        .where(eq(schema.mediaItems.id, args.id));
      if (row) {
        await ctx.blobs.delete(row.blobKey).catch(() => undefined);
        await db
          .delete(schema.mediaItems)
          .where(eq(schema.mediaItems.id, args.id));
      }
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),
};
