import { defineAction, z } from "@hatch/space-sdk";
import { desc, eq } from "drizzle-orm";
import * as schema from "../schema";
import { buildSku, driveImageSchema, parseDriveImages } from "../services/drive";
import {
  writeProfessionalCopy,
  stripColorPlaceholders,
  vnStamp,
  type DraftFields,
} from "../services/copywriting";
import {
  draftOut,
  toDraftOut,
  pruneAllSupersededPublishRecords,
  type PublishRecordRow,
} from "../services/postingPack";
import {
  resolveDraftImages,
  buildDraftCreatedMessage,
} from "../services/draftHelpers";
import { draftPackActions } from "./drafts/draftPackActions";
import { draftPublishActions } from "./drafts/draftPublishActions";

export const draftCrudActions = {
  listDrafts: defineAction({
    request: z.object({}),
    response: z.object({ drafts: z.array(draftOut) }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      await pruneAllSupersededPublishRecords(db);
      const rows = await db
        .select()
        .from(schema.drafts)
        .orderBy(desc(schema.drafts.id));
      const records = await db
        .select()
        .from(schema.publishRecords)
        .orderBy(desc(schema.publishRecords.id));
      const byDraft = new Map<number, PublishRecordRow[]>();
      for (const rec of records) {
        const list = byDraft.get(rec.draftId) ?? [];
        list.push(rec);
        byDraft.set(rec.draftId, list);
      }
      return {
        drafts: rows.map((r) => toDraftOut(r, byDraft.get(r.id) ?? [])),
      };
    },
  }),

  findDraftByKey: defineAction({
    request: z.object({ idempotency_key: z.string().default("") }),
    response: z.object({
      found: z.boolean(),
      id: z.number(),
      code: z.string(),
      writer: z.enum(["ai", "template", ""]),
      drive_status: z.string(),
      drive_image_count: z.number(),
    }),
    async handler(ctx, args) {
      const key = args.idempotency_key.trim();
      const empty = {
        found: false,
        id: 0,
        code: "",
        writer: "" as const,
        drive_status: "",
        drive_image_count: 0,
      };
      if (!key) return empty;
      const db = ctx.db<typeof schema>();
      const [row] = await db
        .select()
        .from(schema.drafts)
        .where(eq(schema.drafts.idempotencyKey, key));
      if (!row) return empty;
      const writer: "ai" | "template" | "" =
        row.captionSource === "ai"
          ? "ai"
          : row.captionSource === "template"
            ? "template"
            : "";
      const imgs = parseDriveImages(row.driveImages);
      return {
        found: true,
        id: row.id,
        code: row.code,
        writer,
        drive_status: row.driveStatus,
        drive_image_count: imgs.length,
      };
    },
  }),

  createDraft: defineAction({
    request: z.object({
      idempotency_key: z.string().default(""),
      stt: z.string().default(""),
      sku: z.string().default(""),
      product_name: z.string().min(1),
      scale: z.string().default(""),
      maker: z.string().default(""),
      color: z.string().default(""),
      price: z.string().default(""),
      stock: z.string().default("1"),
      ship: z.string().default(""),
      image_url: z.string().default(""),
      video_url: z.string().default(""),
      selling_point: z.string().default(""),
      size_cm: z.string().default(""),
      images: z.array(driveImageSchema).default([]),
      images_customized: z.boolean().default(false),
    }),
    response: z.object({
      id: z.number(),
      code: z.string(),
      writer: z.enum(["ai", "template"]),
      drive_status: z.string(),
      drive_image_count: z.number(),
      drive_message: z.string(),
    }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const idemKey = args.idempotency_key.trim();

      if (idemKey) {
        const [existing] = await db
          .select()
          .from(schema.drafts)
          .where(eq(schema.drafts.idempotencyKey, idemKey));
        if (existing) {
          const imgs = parseDriveImages(existing.driveImages);
          return {
            id: existing.id,
            code: existing.code,
            writer:
              existing.captionSource === "template"
                ? ("template" as const)
                : ("ai" as const),
            drive_status: existing.driveStatus,
            drive_image_count: imgs.length,
            drive_message:
              "Bài của lượt soạn này đã có sẵn trong Hàng đợi duyệt — app dùng lại đúng bản đó, không tạo bản trùng.",
          };
        }
      }

      const { folderId, finalImages, finalStatus, finalError } =
        await resolveDraftImages(db, {
          imageUrl: args.image_url,
          images: args.images,
          imagesCustomized: args.images_customized,
        });

      const fields: DraftFields = {
        stt: args.stt.trim(),
        productName: args.product_name.trim(),
        scale: args.scale.trim(),
        maker: args.maker.trim(),
        color: args.color.trim(),
        price: args.price.trim(),
        stock: args.stock.trim() || "1",
        ship: args.ship.trim() || "COD",
        imageUrl: finalImages[0] ? finalImages[0].jpeg_url : "",
        videoUrl: args.video_url.trim(),
        sellingPoint: args.selling_point.trim(),
        sizeCm: args.size_cm.trim(),
      };

      const { caption, writer } = await writeProfessionalCopy(ctx, fields);
      const code = "d-" + vnStamp(new Date());

      const [row] = await db
        .insert(schema.drafts)
        .values({
          code,
          idempotencyKey: idemKey,
          stt: fields.stt,
          sku:
            args.sku.trim() ||
            buildSku(fields.stt, fields.productName, fields.color),
          productName: fields.productName,
          scale: fields.scale,
          maker: fields.maker,
          color: fields.color,
          price: fields.price,
          stock: fields.stock,
          ship: fields.ship,
          imageUrl: args.image_url.trim(),
          videoUrl: args.video_url.trim(),
          driveFolderId: folderId,
          driveStatus: finalStatus,
          driveError: finalError,
          driveImages: JSON.stringify(finalImages),
          imagesCustomized: args.images_customized ? 1 : 0,
          sellingPoint: fields.sellingPoint,
          angle: "chot_don",
          sizeCm: fields.sizeCm,
          saleDays: "",
          caption,
          captionSource: writer,
          reels: "",
          status: "draft",
        })
        .returning({ id: schema.drafts.id });

      if (!row) throw new Error("createDraft: insert returned no rows");
      ctx.invalidateQueries();

      return {
        id: row.id,
        code,
        writer,
        drive_status: finalStatus,
        drive_image_count: finalImages.length,
        drive_message: buildDraftCreatedMessage(
          args.images_customized,
          finalImages,
          finalStatus,
          finalError,
        ),
      };
    },
  }),

  rewriteDraft: defineAction({
    request: z.object({ id: z.number().int().positive() }),
    response: z.object({ ok: z.boolean(), message: z.string() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const [row] = await db
        .select()
        .from(schema.drafts)
        .where(eq(schema.drafts.id, args.id));
      if (!row) return { ok: false, message: "Không tìm thấy bản nháp." };
      if (row.status !== "draft")
        return {
          ok: false,
          message:
            "Bản nháp đã duyệt/xuất gói — không viết lại nội dung được nữa.",
        };

      const { caption, writer } = await writeProfessionalCopy(
        ctx,
        {
          stt: row.stt,
          productName: row.productName,
          scale: row.scale,
          maker: row.maker,
          color: row.color,
          price: row.price,
          stock: row.stock,
          ship: row.ship,
          imageUrl: row.imageUrl,
          videoUrl: row.videoUrl,
          sellingPoint: row.sellingPoint,
          sizeCm: row.sizeCm,
        },
        { previousCaption: row.caption },
      );

      if (caption.trim() === row.caption.trim()) {
        return {
          ok: false,
          message:
            writer === "template"
              ? "Chưa viết lại được bản mới: bài AI chưa đạt chuẩn nên hệ thống dùng mẫu dự phòng — mà mẫu này sinh ra đúng nội dung hiện tại nên không có gì thay đổi. Thử bấm viết lại lần nữa; nếu vẫn vậy, hãy bổ sung/sửa thông tin sản phẩm (màu, kích thước, chi tiết tự ghi) rồi viết lại."
              : "Bài viết lại trùng hệt bản hiện tại nên chưa có thay đổi — bấm viết lại lần nữa để lấy một bản diễn đạt khác.",
        };
      }

      await db
        .update(schema.drafts)
        .set({ caption, captionSource: writer, reels: "" })
        .where(eq(schema.drafts.id, args.id));
      ctx.invalidateQueries();

      return {
        ok: true,
        message:
          writer === "ai"
            ? "Đã viết lại bài theo phong cách ĐỨC GARAGE từ đúng giá trị của sản phẩm này."
            : "Đã viết lại bài theo mẫu ĐỨC GARAGE (người viết AI tạm thời không khả dụng).",
      };
    },
  }),

  updateDraft: defineAction({
    request: z.object({
      id: z.number().int().positive(),
      caption: z.string().min(1),
    }),
    response: z.object({ ok: z.boolean(), error: z.string() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const [row] = await db
        .select()
        .from(schema.drafts)
        .where(eq(schema.drafts.id, args.id));
      if (!row) return { ok: false, error: "Không tìm thấy bản nháp." };
      if (row.status !== "draft")
        return {
          ok: false,
          error: "Bản nháp đã duyệt/xuất gói — không sửa nội dung được nữa.",
        };

      const caption = stripColorPlaceholders(args.caption, row.color);
      await db
        .update(schema.drafts)
        .set({ caption, captionSource: "manual", reels: "" })
        .where(eq(schema.drafts.id, args.id));
      ctx.invalidateQueries();
      return { ok: true, error: "" };
    },
  }),

  deleteDraft: defineAction({
    request: z.object({ id: z.number().int().positive() }),
    response: z.object({ ok: z.boolean() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      await db.delete(schema.drafts).where(eq(schema.drafts.id, args.id));
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),
};

export const draftActions = {
  ...draftCrudActions,
  ...draftPackActions,
  ...draftPublishActions,
};
