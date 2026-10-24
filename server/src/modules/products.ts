import { defineAction, z } from "@hatch/space-sdk";
import { desc, eq, and } from "drizzle-orm";
import * as schema from "../schema";
import { privileged } from "../privileged";
import { productOut } from "../types";
import {
  fetchDriveImages,
  storeProductDriveImages,
  buildSku,
  parseColors,
  normalizeSheetImageUrl,
  parseDriveImages,
} from "../services/drive";

export type ProductRow = typeof schema.products.$inferSelect;

export function toProductOut(r: ProductRow): z.infer<typeof productOut> {
  const driveImages = parseDriveImages(r.driveImages);
  return {
    id: r.id,
    stt: r.stt,
    sku: r.sku || buildSku(r.stt, r.name, r.color),
    name: r.name,
    scale: r.scale,
    maker: r.maker,
    size: r.size,
    color: r.color,
    colors: parseColors(r.colors, r.color),
    price: r.price,
    stock: r.stock,
    ship: r.ship,
    image_url: normalizeSheetImageUrl(r.imageUrl),
    video_url: r.videoUrl,
    drive_folder_id: r.driveFolderId,
    drive_status: r.driveStatus,
    drive_error: r.driveError,
    drive_checked_at: r.driveCheckedAt,
    drive_images: driveImages,
    has_real_image: r.driveStatus === "ok" && driveImages.length > 0,
    source: r.source,
    created_at: r.createdAt.toISOString(),
  };
}

export const productActions = {

  // -------------------------------------------------------------- products
  listProducts: defineAction({
    request: z.object({}),
    response: z.object({ products: z.array(productOut) }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const rows = await db
        .select()
        .from(schema.products)
        .orderBy(desc(schema.products.id));
      return { products: rows.map(toProductOut) };
    },
  }),

  // Liệt kê lại ảnh thật từ thư mục Drive của MỘT sản phẩm (nút
  // "Quét lại ảnh Drive" / dùng khi thư mục vừa được bổ sung ảnh).
  // Tự động: xóa file cũ, tải file mới về máy chủ (uploads/drive/) và cập nhật bản nháp liên quan.
  refreshProductImages: defineAction({
    request: z.object({ id: z.number().int().positive() }),
    response: z.object({
      ok: z.boolean(),
      message: z.string(),
      drive_status: z.string(),
      image_count: z.number(),
    }),
    privileged: [privileged.listDriveFolder],
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const [row] = await db
        .select()
        .from(schema.products)
        .where(eq(schema.products.id, args.id));
      if (!row)
        return {
          ok: false,
          message: "Không tìm thấy sản phẩm.",
          drive_status: "",
          image_count: 0,
        };
      const r = await fetchDriveImages(ctx, row.imageUrl);
      await storeProductDriveImages(db, row.id, r);

      // Đồng bộ ảnh mới sang các bản nháp đang dùng cùng thư mục Drive và chưa sửa ảnh tay
      if (r.folderId) {
        await db
          .update(schema.drafts)
          .set({
            driveStatus: r.status,
            driveError: "error" in r ? r.error : "",
            driveImages: JSON.stringify(r.images),
          })
          .where(
            and(
              eq(schema.drafts.driveFolderId, r.folderId),
              eq(schema.drafts.imagesCustomized, 0),
            ),
          );
      }

      ctx.invalidateQueries();
      const n = r.images.length;
      return {
        ok: r.status === "ok",
        message:
          r.status === "ok"
            ? `Đã quét và tải ${n} ảnh mới về máy chủ từ Drive của ${row.name}. Đã cập nhật cho sản phẩm và các bản nháp liên quan.`
            : r.status === "empty"
              ? `Thư mục Drive của ${row.name} đang RỖNG — chưa có file ảnh nào.`
              : "error" in r
                ? r.error
                : "Sản phẩm chưa có link thư mục Drive.",
        drive_status: r.status,
        image_count: n,
      };
    },
  }),

  saveProduct: defineAction({
    request: z.object({
      id: z.number().int().positive().optional(),
      stt: z.string().default(""),
      name: z.string().min(1),
      scale: z.string().default(""),
      maker: z.string().default(""),
      size: z.string().default(""),
      color: z.string().default(""),
      price: z.string().default(""),
      stock: z.number().int().min(0).default(1),
      ship: z.string().default(""),
      image_url: z.string().default(""),
      video_url: z.string().default(""),
    }),
    response: z.object({ id: z.number() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const values = {
        stt: args.stt.trim(),
        // SKU nội bộ dựng lại mỗi lần lưu theo "STT-Tên-Màu".
        sku: buildSku(args.stt, args.name, args.color),
        name: args.name.trim(),
        scale: args.scale.trim(),
        maker: args.maker.trim(),
        size: args.size.trim(),
        color: args.color.trim(),
        // Sản phẩm nhập tay có một màu duy nhất — danh sách màu là
        // đúng màu đó (đồng bộ với cách sản phẩm Sheet được phân
        // loại theo từng màu).
        colors: JSON.stringify(
          args.color.trim() ? [args.color.trim()] : [],
        ),
        price: args.price.trim(),
        stock: args.stock,
        // Vận chuyển để trống = mặc định COD.
        ship: args.ship.trim() || "COD",
        imageUrl: args.image_url.trim(),
        videoUrl: args.video_url.trim(),
      };
      if (args.id) {
        await db
          .update(schema.products)
          .set(values)
          .where(eq(schema.products.id, args.id));
        ctx.invalidateQueries();
        return { id: args.id };
      }
      const [row] = await db
        .insert(schema.products)
        .values(values)
        .returning({ id: schema.products.id });
      if (!row) throw new Error("saveProduct: insert returned no rows");
      ctx.invalidateQueries();
      return { id: row.id };
    },
  }),

  deleteProduct: defineAction({
    request: z.object({ id: z.number().int().positive() }),
    response: z.object({ ok: z.boolean() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      await db.delete(schema.products).where(eq(schema.products.id, args.id));
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),
};
