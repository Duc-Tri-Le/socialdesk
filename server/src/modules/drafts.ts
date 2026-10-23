import { defineAction, z } from "@hatch/space-sdk";
import { desc, eq } from "drizzle-orm";
import * as schema from "../schema";
import { privileged } from "../privileged";
import {
  buildSku,
  parseDriveImages,
  extractDriveFolderId,
  driveImageSchema,
  type DriveImage,
} from "../services/drive";
import {
  writeProfessionalCopy,
  findPlaceholders,
  hasColorPlaceholder,
  stripColorPlaceholders,
  vnStamp,
  type DraftFields,
} from "../services/copywriting";
import {
  loadJoinContext,
  postingJoinedIdentities,
} from "../services/groups";
import {
  draftOut,
  toDraftOut,
  parsePackTargets,
  serializePackTargets,
  pruneSupersededPublishRecords,
  pruneAllSupersededPublishRecords,
  buildPackTextForDraft,
  defaultPackTargets,
  parseFbPages,
  parseIgAccounts,
  igUsernameOf,
  cliErrorText,
  parseCliJson,
  extractPostRef,
  isPublishTimeoutMessage,
  normalizeNameKey,
  FB_PAGE_CAPTION_LIMIT,
  IG_CAPTION_LIMIT,
  type FbPageRef,
  type IgAccountRef,
  type PublishRecordRow,
  type DraftRow,
  type PackTargetsInput,
} from "../services/postingPack";

export const draftActions = {

  // ---------------------------------------------------------------- drafts
  listDrafts: defineAction({
    request: z.object({}),
    response: z.object({ drafts: z.array(draftOut) }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      // Lịch sử đăng Bài chỉ hiện thông tin MỚI NHẤT theo từng
      // đích: dọn các bản ghi cũ đã bị bản ghi mới của cùng đích
      // thay thế (chỉ nhóm trạng thái chưa thành công — xem
      // pruneAllSupersededPublishRecords) trước khi đọc, để dữ
      // liệu tích lũy từ trước bản sửa này cũng được dọn ngay.
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

  // Đối soát sau lỗi timeout: client hỏi lại theo mã chống trùng xem
  // lượt soạn đó đã kịp lưu bản nháp chưa. Có → client báo "đã vào
  // Hàng đợi duyệt" thay vì báo lỗi kèm nút Thử lại mù (bấm thử lại
  // mù từng sinh bản nháp trùng). Không có mã / chưa có bản nháp nào
  // mang mã đó → found = false.
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
      return {
        found: true,
        id: row.id,
        code: row.code,
        writer,
        drive_status: row.driveStatus,
        drive_image_count: parseDriveImages(row.driveImages).length,
      };
    },
  }),

  createDraft: defineAction({
    request: z.object({
      // Mã chống trùng của lượt soạn này (client sinh, giữ nguyên khi
      // thử lại). Để trống = không chống trùng (tương thích cũ).
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
      // Tập ảnh đang gắn trong form soạn bài: mặc định là tập ảnh
      // Drive ĐÃ LƯU trong sản phẩm từ lần đồng bộ gần nhất (soạn
      // bài không quét lại Drive nữa); khi images_customized = true
      // thì đây là tập NGƯỜI DÙNG đã tự chốt (thêm ảnh tải lên / xóa
      // bớt ảnh Drive) — dùng ĐÚNG tập này, ảnh đã xóa không được
      // gắn lại, kể cả khi xuất gói đăng.
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
      // CHỐNG TRÙNG: lượt soạn này đã có bản nháp (lượt gửi trước bị
      // cổng kết nối báo timeout trong lúc máy chủ vẫn chạy tiếp và
      // đã lưu xong, hoặc người dùng bấm "Thử lại" sau timeout) thì
      // trả về ĐÚNG bản nháp đó — không viết lại, không tạo bản thứ
      // hai giống hệt.
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
      // ẢNH CỦA BẢN NHÁP — KHÔNG quét lại Drive khi soạn bài: khi
      // đồng bộ Sheet, app đã mở thư mục Drive và lưu tập ảnh thật
      // vào chính sản phẩm; form soạn bài mang theo đúng tập đó
      // (args.images). Quét lại Drive ở khâu này từng là một trong
      // hai việc nặng khiến lượt soạn vượt thời gian chờ của cổng
      // kết nối (báo timeout dù bài vẫn được lưu). Drive chỉ còn
      // được quét ở hai thời điểm: khi đồng bộ Sheet và khi bấm
      // "Quét lại ảnh Drive" trên thẻ sản phẩm — xuất gói đăng
      // (buildPack) dùng đúng tập ảnh đã chốt trong bản nháp, cũng
      // không quét lại. Nếu client không mang theo tập ảnh nào,
      // lấy tập đã lưu trong sản phẩm khớp link thư mục này.
      const folderId = extractDriveFolderId(args.image_url);
      let stored: {
        status: string;
        error: string;
        images: DriveImage[];
      } | null = null;
      if (!args.images_customized && args.images.length === 0 && folderId) {
        const prods = await db.select().from(schema.products);
        const match = prods.find(
          (p) => extractDriveFolderId(p.imageUrl) === folderId,
        );
        if (match)
          stored = {
            status: match.driveStatus,
            error: match.driveError,
            images: parseDriveImages(match.driveImages),
          };
      }
      // Tập ảnh CUỐI CÙNG của bản nháp: người dùng đã tự thêm/xóa
      // ảnh trong form thì chỉnh tay thắng — dùng đúng tập người
      // dùng chốt (kể cả khi tập rỗng vì đã xóa hết); chưa chỉnh tay
      // thì dùng tập ảnh đã lưu từ lần đồng bộ (client mang theo
      // hoặc đọc từ sản phẩm khớp thư mục).
      const finalImages: DriveImage[] = args.images_customized
        ? args.images
        : args.images.length > 0
          ? args.images
          : (stored?.images ?? []);
      const finalStatus = args.images_customized
        ? finalImages.length > 0
          ? "ok"
          : "empty"
        : finalImages.length > 0
          ? "ok"
          : stored
            ? stored.status || "no_link"
            : "no_link";
      const finalError = args.images_customized
        ? finalImages.length > 0
          ? ""
          : "Bạn đã bỏ hết ảnh khỏi bài này trong form soạn bài."
        : finalImages.length > 0
          ? ""
          : stored?.error
            ? stored.error
            : folderId
              ? "Chưa có ảnh thật đã lưu cho thư mục Drive này — đồng bộ Sheet hoặc bấm “Quét lại ảnh Drive” trên thẻ sản phẩm để lấy ảnh."
              : "Sản phẩm chưa có link thư mục Drive — bài soạn chưa có ảnh thật.";
      const fields: DraftFields = {
        stt: args.stt.trim(),
        productName: args.product_name.trim(),
        scale: args.scale.trim(),
        maker: args.maker.trim(),
        color: args.color.trim(),
        price: args.price.trim(),
        stock: args.stock.trim() || "1",
        // Vận chuyển mặc định COD khi không ghi gì khác.
        ship: args.ship.trim() || "COD",
        // Với AI writer, "có ảnh" chỉ đúng khi có ảnh trong tập
        // cuối cùng (ảnh Drive thật hoặc ảnh người dùng tự gắn).
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
          // Cột angle cũ giữ giá trị mặc định cho tương thích dữ
          // liệu — cột angle giữ mặc định, bài viết theo phong cách ĐỨC GARAGE.
          angle: "chot_don",
          sizeCm: fields.sizeCm,
          // Đợt "chỉ mở bán" đã bỏ — thay bằng thời gian khuyến mãi tự
          // tính trong caption (ngày đăng + 7 ngày); cột cũ giữ rỗng.
          saleDays: "",
          caption,
          captionSource: writer,
          // Cột reels cũ giữ rỗng: bài soạn chỉ còn bài đăng chính
          // Facebook, không còn bản ngắn TikTok/Reels.
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
        drive_message: args.images_customized
          ? finalImages.length > 0
            ? `Đã dùng đúng ${finalImages.length} ảnh bạn đã chốt trong form soạn bài (ảnh Drive còn giữ + ảnh bạn tự thêm) — tập ảnh này được giữ nguyên khi xuất gói đăng, không quét lại Drive để gắn thêm/bớt.`
            : "Bạn đã bỏ hết ảnh khỏi bài này trong form soạn bài — bài đăng sẽ không kèm ảnh nào."
          : finalImages.length > 0
            ? `Đã dùng ${finalImages.length} ảnh thật đã lưu sẵn trong sản phẩm từ lần đồng bộ gần nhất — soạn bài không quét lại Drive; tập ảnh này được giữ nguyên khi xuất gói đăng, gói đăng cũng không quét lại Drive. Bản dùng để đăng là JPEG do Drive kết xuất${finalImages.some((i) => i.is_heic) ? " (file gốc có HEIC — không đăng trực tiếp file HEIC)" : ""}.`
            : finalStatus === "empty"
              ? "Thư mục Drive của sản phẩm đang RỖNG (theo lần quét gần nhất) — bài soạn chưa có ảnh thật; bổ sung ảnh vào thư mục rồi đồng bộ lại hoặc bấm “Quét lại ảnh Drive” trên thẻ sản phẩm."
              : finalError,
      };
    },
  }),

  // Viết lại một bản nháp đang chờ duyệt theo phong cách ĐỨC
  // GARAGE, từ đúng các giá trị đã lưu của bản nháp đó.
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
        // Truyền bản hiện tại để AI viết khác đi; bài trùng hệt bản
        // cũ bị coi là chưa viết lại được (xem writeProfessionalCopy).
        { previousCaption: row.caption },
      );
      // Chống "viết lại mà như không": bài mới trùng hệt bài hiện
      // tại (thường vì bài AI bị loại và mẫu dự phòng cố định theo
      // dữ kiện + ngày sinh ra đúng một văn bản) thì KHÔNG ghi đè
      // và báo rõ là chưa có thay đổi, thay vì báo thành công giả.
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
        // reels: "" — viết lại cũng bỏ luôn bản ngắn cũ còn lưu.
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
      // Sửa tay cũng không được để lại placeholder màu: người bán
      // dán caption có "[màu]" vào thì gỡ ngay lúc lưu (dòng Màu
      // sắc điền đúng màu của bản nháp) — bài lưu xuống luôn sạch.
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

  approveDraft: defineAction({
    request: z.object({ id: z.number().int().positive() }),
    response: z.object({
      ok: z.boolean(),
      message: z.string(),
      missing: z.array(z.string()),
    }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const [row] = await db
        .select()
        .from(schema.drafts)
        .where(eq(schema.drafts.id, args.id));
      if (!row)
        return { ok: false, message: "Không tìm thấy bản nháp.", missing: [] };
      if (row.status !== "draft")
        return {
          ok: false,
          message: `Bản nháp đang ở trạng thái ${row.status}, không duyệt lại.`,
          missing: [],
        };
      // Chốt chặn duyệt: placeholder màu KHÔNG bao giờ là lý do
      // chặn duyệt — bản nháp cũ còn sót "[màu]" thì gỡ và lưu
      // bền ngay tại đây rồi mới kiểm các placeholder nghiệp vụ
      // thật ([GIÁ]/[TỈ LỆ]/Cần xác nhận).
      const caption = hasColorPlaceholder(row.caption)
        ? stripColorPlaceholders(row.caption, row.color)
        : row.caption;
      const missing = findPlaceholders(caption);
      if (missing.length > 0) {
        if (caption !== row.caption) {
          await db
            .update(schema.drafts)
            .set({ caption })
            .where(eq(schema.drafts.id, args.id));
          ctx.invalidateQueries();
        }
        return {
          ok: false,
          message: "Còn mục chưa điền: " + missing.join(", "),
          missing,
        };
      }
      // DUYỆT = XUẤT GÓI LUÔN (gộp hai bước theo yêu cầu người
      // dùng): không còn bước xuất gói riêng sau khi duyệt.
      // Gói được sinh ngay tại đây theo đích đăng ĐÃ CHỌN cho
      // bài này ngay từ trang "Chờ duyệt" (bộ chọn "Chọn đích
      // đăng" có ở cả trang chờ duyệt; lựa chọn được lưu bền qua
      // saveDraftTargets) — bài chưa từng chọn tay mới dùng đích
      // mặc định đang chọn (nhóm đích đã tham gia / Page đang
      // chọn / IG đang chọn). Gói lưu cùng lúc với trạng thái
      // packed — bài duyệt xong là sẵn sàng bấm "Đăng Bài" ngay
      // ở trang "Đã duyệt", gói đăng đã có sẵn trên thẻ bài. Đổi
      // đích đăng sau đó thì gói tự cập nhật theo (xem
      // saveDraftTargets), không cần bấm nút nào nữa.
      const savedTargets = parsePackTargets(row.packTargets);
      const targets = savedTargets.saved
        ? {
            group_ids: savedTargets.group_ids,
            page_ids: savedTargets.page_ids,
            instagram_account_ids: savedTargets.instagram_account_ids,
          }
        : await defaultPackTargets(db);
      const rowForPack: DraftRow = { ...row, caption };
      const built = await buildPackTextForDraft(db, rowForPack, targets, {
        explicit: true,
      });
      if (!built.ok) {
        // Sinh gói lỗi (ví dụ nhóm mặc định không còn danh tính
        // đã tham gia) thì vẫn duyệt bài nhưng CHƯA có gói — báo
        // rõ lý do để người dùng chọn lại đích ở trang sẵn sàng
        // đăng (đổi đích sẽ tự sinh gói), không chặn duyệt.
        await db
          .update(schema.drafts)
          .set(
            caption !== row.caption
              ? { status: "approved", caption }
              : { status: "approved" },
          )
          .where(eq(schema.drafts.id, args.id));
        ctx.invalidateQueries();
        return {
          ok: true,
          message: `Đã duyệt ${row.code}. Chưa sinh được gói đăng tự động: ${built.message} Chọn lại đích đăng ở trang “Đã duyệt” thì gói sẽ tự được tạo.`,
          missing: [],
        };
      }
      const now = new Date();
      await db
        .update(schema.drafts)
        .set({
          status: "packed",
          caption: built.cleanCaption,
          packText: built.packText,
          packedAt: now,
          packTargets: serializePackTargets(targets),
        })
        .where(eq(schema.drafts.id, args.id));
      ctx.invalidateQueries();
      return {
        ok: true,
        message: built.hasMedia
          ? `Đã duyệt bài viết ${row.code} — gói đăng đã có trên thẻ bài ở trang “Đã duyệt”, bấm “Đăng Bài” để đăng ngay lên các đích đã chọn.`
          : `Đã duyệt bài viết ${row.code} — gói đăng đã có trên thẻ bài ở trang “Đã duyệt” (bài chưa gắn ảnh/video nào), bấm “Đăng Bài” để đăng ngay lên các đích đã chọn.`,
        missing: [],
      };
    },
  }),

  // Lưu lựa chọn đích đăng của RIÊNG một bản nháp: bộ chọn "Chọn
  // đích đăng" có ở CẢ trang "Chờ duyệt" lẫn trang "Đã duyệt" —
  // chọn ở đâu thì lưu ngay ở đó, mở lại app vẫn giữ đúng lựa
  // chọn cũ — không còn cảnh chọn xong phải chọn lại từ mặc
  // định. Bài đang CHỜ DUYỆT thì chỉ lưu đích (chưa có gói đăng);
  // khi bấm "Duyệt bài viết", approveDraft sinh gói ngay theo
  // đúng bộ đích đã lưu này. Bài ĐÃ DUYỆT thì đổi đích cũng TỰ
  // CẬP NHẬT gói đăng theo bộ đích mới (duyệt đã xuất gói luôn,
  // đổi đích thì gói tự theo) — phần cập nhật theo đích này ĐƯỢC
  // GIỮ LẠI theo yêu cầu người dùng, và nút "Cập nhật gói đăng"
  // thủ công (buildPack) vẫn còn để bấm cập nhật khi cần.
  saveDraftTargets: defineAction({
    request: z.object({
      id: z.number().int().positive(),
      group_ids: z.array(z.number().int().positive()),
      page_ids: z.array(z.number().int().positive()).default([]),
      instagram_account_ids: z.array(z.number().int().positive()).default([]),
    }),
    response: z.object({ ok: z.boolean(), message: z.string() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const [row] = await db
        .select()
        .from(schema.drafts)
        .where(eq(schema.drafts.id, args.id));
      if (!row) return { ok: false, message: "Không tìm thấy bản nháp." };
      const targets: PackTargetsInput = {
        group_ids: args.group_ids,
        page_ids: args.page_ids,
        instagram_account_ids: args.instagram_account_ids,
      };
      // Bài đang chờ duyệt: chỉ LƯU đích đăng đã chọn — gói đăng
      // được sinh khi duyệt bài (approveDraft đọc đúng bộ đích đã
      // lưu này), không sinh gói cho bài chưa duyệt.
      if (row.status === "draft") {
        await db
          .update(schema.drafts)
          .set({ packTargets: serializePackTargets(targets) })
          .where(eq(schema.drafts.id, args.id));
        ctx.invalidateQueries();
        return {
          ok: true,
          message: "Đã lưu đích đăng cho bài chờ duyệt — gói đăng sẽ xuất theo đích này khi duyệt bài.",
        };
      }
      if (row.status !== "approved" && row.status !== "packed")
        return {
          ok: false,
          message: "Chỉ lưu đích đăng cho bài chờ duyệt hoặc đã duyệt.",
        };
      // Tự cập nhật gói đăng theo bộ đích mới: sinh lại text gói
      // bằng đúng bộ đích vừa chọn. Sinh lỗi (nhóm chưa có danh
      // tính đã tham gia) thì chỉ lưu đích và báo rõ — gói cũ giữ
      // nguyên để không mất nội dung đã có.
      const built = await buildPackTextForDraft(db, row, targets, {
        explicit: true,
      });
      if (!built.ok) {
        await db
          .update(schema.drafts)
          .set({ packTargets: serializePackTargets(targets) })
          .where(eq(schema.drafts.id, args.id));
        ctx.invalidateQueries();
        return {
          ok: false,
          message: `Đã lưu đích đăng nhưng chưa cập nhật được gói đăng: ${built.message}`,
        };
      }
      await db
        .update(schema.drafts)
        .set({
          status: "packed",
          caption: built.cleanCaption,
          packText: built.packText,
          packedAt: new Date(),
          packTargets: serializePackTargets(targets),
        })
        .where(eq(schema.drafts.id, args.id));
      ctx.invalidateQueries();
      return {
        ok: true,
        message: "Đã lưu đích đăng và tự cập nhật gói đăng theo đích mới.",
      };
    },
  }),

  buildPack: defineAction({
    request: z.object({
      id: z.number().int().positive(),
      group_ids: z.array(z.number().int().positive()),
      page_ids: z.array(z.number().int().positive()).default([]),
      instagram_account_ids: z.array(z.number().int().positive()).default([]),
    }),
    response: z.object({
      ok: z.boolean(),
      message: z.string(),
      pack_text: z.string(),
    }),
    // KHÔNG khai privileged nào: cập nhật gói KHÔNG quét lại
    // Drive. Gói đăng nay được sinh TỰ ĐỘNG ngay khi duyệt bài
    // (approveDraft) và tự cập nhật khi đổi đích đăng
    // (saveDraftTargets). Action này là đường bấm tay của nút
    // "Cập nhật gói đăng" ĐƯỢC GIỮ LẠI trên thẻ bài ở trang "Đã
    // duyệt" (nội dung gói thay đổi theo đích đăng nên người dùng
    // vẫn bấm cập nhật tay theo bộ đích đang chọn được — nút luôn
    // mang tên "Cập nhật gói đăng", không còn nhãn "Xuất gói
    // đăng"). Logic sinh gói dùng chung buildPackTextForDraft.
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const [row] = await db
        .select()
        .from(schema.drafts)
        .where(eq(schema.drafts.id, args.id));
      if (!row) return { ok: false, message: "Không tìm thấy bản nháp.", pack_text: "" };
      if (row.status !== "approved" && row.status !== "packed")
        return {
          ok: false,
          message: `Bản nháp chưa được duyệt (trạng thái: ${row.status}). Duyệt bài trước khi cập nhật gói đăng.`,
          pack_text: "",
        };
      const built = await buildPackTextForDraft(db, row, {
        group_ids: args.group_ids,
        page_ids: args.page_ids,
        instagram_account_ids: args.instagram_account_ids,
      });
      if (!built.ok) return { ok: false, message: built.message, pack_text: "" };
      await db
        .update(schema.drafts)
        .set({
          status: "packed",
          packText: built.packText,
          packedAt: new Date(),
          caption: built.cleanCaption,
          packTargets: serializePackTargets({
            group_ids: args.group_ids,
            page_ids: args.page_ids,
            instagram_account_ids: args.instagram_account_ids,
          }),
        })
        .where(eq(schema.drafts.id, args.id));
      ctx.invalidateQueries();
      return {
        ok: true,
        message: built.hasMedia
          ? `Đã cập nhật gói đăng — gói đăng ở ngay trên thẻ bài này; đăng đúng các đích đã chọn, dùng đúng media đã gắn trong bản nháp (${built.driveImageCount} ảnh${built.hasVideo ? ", có video" : ""}; không quét lại Drive, không thêm/bớt media).`
          : `Đã cập nhật gói đăng — gói đăng ở ngay trên thẻ bài này; đăng đúng các đích đã chọn; bài này chưa gắn ảnh/video nào.`,
        pack_text: built.packText,
      };
    },
  }),

  // ------------------------------------------------- ĐĂNG THẬT
  // Đăng trực tiếp bài đã duyệt/đã xuất gói lên các đích đã chọn
  // trong Hàng đợi — không qua khâu chép gói/gửi agent nữa:
  //  - Page đích → facebook-cli pages posts create (đúng caption
  //    đã duyệt + đúng ảnh đã chốt; caption > 1.024 ký tự thì
  //    chuyển sang xử lý bằng trình duyệt như đích nhóm).
  //  - Instagram đích → ghi yêu cầu "queued" và kích hoạt tác vụ
  //    agent chạy instagram-cli post-feed Ở NỀN (bắt buộc có ảnh;
  //    dùng đúng tập ảnh đã chốt trong bản nháp), kết quả được
  //    cập nhật qua reportInstagramPublish. KHÔNG đăng đồng bộ
  //    trong action này: tải nhiều ảnh + đăng Instagram thường
  //    tốn hơn ngân sách 30 giây của một lượt gọi action — chạy
  //    đồng bộ từng bị daemon cắt giữa chừng và ghi "đăng lỗi"
  //    dù chưa rõ bài đã lên hay chưa.
  //  - Nhóm đích → Meta không có API đăng bài nhóm: ghi yêu cầu
  //    "queued" và kích hoạt tác vụ agent xử lý như khi người
  //    dùng nhắn trực tiếp (đăng bằng trình duyệt), kết quả được
  //    cập nhật qua reportGroupPublish.
  // Đích đăng bằng trình duyệt (nhóm + Page caption dài) chạy
  // ĐÚNG NHƯ KHI NGƯỜI DÙNG NHẮN TRỰC TIẾP TRONG CHAT: tác vụ
  // agent mở cửa sổ trình duyệt Muse (cửa sổ người dùng nhìn
  // thấy được, hồ sơ phiên bền vững) và kiểm tra đăng nhập
  // Facebook TRƯỚC. Nếu trình duyệt đó chưa có phiên
  // facebook.com, tác vụ KHÔNG ghi "đăng lỗi" và KHÔNG bỏ cuộc:
  // nó để cửa sổ dừng ở trang đăng nhập Facebook rồi báo trạng
  // thái "needs_login" (chờ đăng nhập) qua reportBrowserPublish
  // — người dùng đăng nhập 1 lần ngay trong cửa sổ đó (phiên
  // được lưu trong hồ sơ trình duyệt cho mọi lần sau) rồi bấm
  // "Đăng Bài" lại là đăng tiếp bằng phiên đã lưu, không cần
  // nhắn lại trong chat.
  // Kết quả TỪNG đích được lưu vào publish_records và trả về ngay;
  // đích đã đăng thành công ở các lần trước bị bỏ qua (skipped)
  // để chống đăng trùng khi bấm lại.
  publishDraft: defineAction({
    request: z.object({
      id: z.number().int().positive(),
      group_ids: z.array(z.number().int().positive()).default([]),
      page_ids: z.array(z.number().int().positive()).default([]),
      instagram_account_ids: z.array(z.number().int().positive()).default([]),
    }),
    response: z.object({
      ok: z.boolean(),
      message: z.string(),
      results: z.array(
        z.object({
          kind: z.enum(["page", "instagram", "group", "account"]),
          name: z.string(),
          status: z.enum([
            "published",
            "failed",
            "unsupported",
            "skipped",
            "queued",
            "needs_login",
          ]),
          message: z.string(),
          post_url: z.string(),
        }),
      ),
    }),
    privileged: [
      privileged.listFbPages,
      privileged.publishFbPagePost,
      privileged.listIgAccounts,
      privileged.preparePublishMedia,
    ],
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      type ResultItem = {
        kind: "page" | "instagram" | "group" | "account";
        name: string;
        status:
          | "published"
          | "failed"
          | "unsupported"
          | "skipped"
          | "queued"
          | "needs_login";
        message: string;
        post_url: string;
      };
      const results: ResultItem[] = [];
      const [row] = await db
        .select()
        .from(schema.drafts)
        .where(eq(schema.drafts.id, args.id));
      if (!row)
        return { ok: false, message: "Không tìm thấy bản nháp.", results };
      if (row.status !== "approved" && row.status !== "packed")
        return {
          ok: false,
          message:
            "Bài chưa được duyệt — duyệt bài trước khi đăng Bài.",
          results,
        };
      const caption = hasColorPlaceholder(row.caption)
        ? stripColorPlaceholders(row.caption, row.color)
        : row.caption;
      const missing = findPlaceholders(caption);
      if (missing.length > 0)
        return {
          ok: false,
          message:
            "Chưa đăng được — bài còn mục chưa điền: " + missing.join(", "),
          results,
        };
      if (
        args.page_ids.length === 0 &&
        args.instagram_account_ids.length === 0 &&
        args.group_ids.length === 0
      )
        return {
          ok: false,
          message:
            "Chưa chọn đích đăng nào — mở “Chọn đích đăng” và chọn ít nhất một fanpage, tài khoản Instagram hoặc nhóm đích.",
          results,
        };
      // Bộ đích dùng cho lượt đăng này trở thành lựa chọn đã lưu
      // của bài — lần mở sau vẫn giữ đúng bộ đích này.
      await db
        .update(schema.drafts)
        .set({
          packTargets: serializePackTargets({
            group_ids: args.group_ids,
            page_ids: args.page_ids,
            instagram_account_ids: args.instagram_account_ids,
          }),
        })
        .where(eq(schema.drafts.id, args.id));

      const prior = await db
        .select()
        .from(schema.publishRecords)
        .where(eq(schema.publishRecords.draftId, row.id));
      const alreadyPublished = (kind: string, name: string): boolean =>
        prior.some(
          (p) =>
            p.targetKind === kind &&
            normalizeNameKey(p.targetName) === normalizeNameKey(name) &&
            p.status === "published",
        );
      const alreadyQueued = (kind: string, name: string): boolean =>
        prior.some(
          (p) =>
            p.targetKind === kind &&
            normalizeNameKey(p.targetName) === normalizeNameKey(name) &&
            p.status === "queued",
        );
      // Lượt đăng Instagram trước đó bị ngắt giữa chừng vì quá
      // thời gian chờ (trạng thái "uncertain", hoặc bản ghi cũ
      // "failed" kèm lỗi timeout của daemon): chưa rõ bài đã lên
      // hay chưa — lượt đăng lại phải kiểm tra trùng trên
      // Instagram trước khi đăng tiếp.
      const alreadyUncertain = (kind: string, name: string): boolean =>
        prior.some(
          (p) =>
            p.targetKind === kind &&
            normalizeNameKey(p.targetName) === normalizeNameKey(name) &&
            (p.status === "uncertain" ||
              (p.status === "failed" && isPublishTimeoutMessage(p.message))),
        );
      const record = async (r: ResultItem): Promise<number> => {
        results.push(r);
        const [ins] = await db
          .insert(schema.publishRecords)
          .values({
            draftId: row.id,
            targetKind: r.kind,
            targetName: r.name,
            status: r.status,
            postUrl: r.post_url,
            message: r.message,
          })
          .returning({ id: schema.publishRecords.id });
        const newId = ins?.id ?? 0;
        // Bản ghi mới THAY THẾ các bản ghi cũ chưa thành công của
        // cùng đích: xóa hẳn chúng để Lịch sử đăng Bài chỉ còn
        // thông tin mới nhất theo từng đích.
        await pruneSupersededPublishRecords(db, newId);
        return newId;
      };

      // Ảnh đã chốt trong bản nháp — tải về file local MỘT lần khi
      // có ít nhất một đích Page/Instagram cần đăng kèm ảnh.
      const driveImages = parseDriveImages(row.driveImages);
      const needsMedia =
        args.page_ids.length > 0 || args.instagram_account_ids.length > 0;
      let localFiles: string[] = [];
      let mediaNote = "";
      if (needsMedia && driveImages.length > 0) {
        try {
          const prep = await ctx.executePrivileged(
            privileged.preparePublishMedia,
            {
              code: row.code,
              urls: driveImages.map((im) => ({
                url: im.jpeg_url,
                name: im.name,
              })),
            },
          );
          const parsed = parseCliJson(prep.stdout) as {
            files?: Array<{ path?: string; ok?: boolean; error?: string }>;
          } | null;
          const files = parsed?.files ?? [];
          localFiles = files
            .filter((f) => f.ok && typeof f.path === "string" && f.path)
            .map((f) => f.path as string);
          const failedCount = files.length - localFiles.length;
          if (failedCount > 0)
            mediaNote = ` (${failedCount} ảnh tải về không thành công nên không đính kèm)`;
        } catch (e) {
          mediaNote = ` (không tải được ảnh đính kèm: ${e instanceof Error ? e.message.slice(0, 160) : "lỗi không rõ"})`;
        }
      }

      // Các đích phải xử lý bằng trình duyệt như khi người dùng
      // nhắn trực tiếp (nhóm — Meta không có API đăng bài nhóm;
      // Page có caption dài hơn giới hạn của API đăng Page): ghi
      // nhận "queued" ở từng đích rồi kích hoạt MỘT tác vụ agent
      // sau khi xử lý xong mọi đích API (ở cuối action này).
      const browserQueue: Array<{
        recordId: number;
        kind: "group" | "page";
        name: string;
        url: string;
        via: string[];
        note: string;
      }> = [];

      // Các đích Instagram chờ xử lý NỀN: ghi nhận "queued" ở
      // từng đích rồi kích hoạt MỘT tác vụ agent chạy instagram-cli
      // post-feed ngoài ngân sách 30 giây của action này, sau khi
      // xử lý xong mọi đích đồng bộ (ở cuối action).
      const igQueue: Array<{
        recordId: number;
        name: string;
        accountId: string;
        username: string;
        files: string[];
        hadUncertain: boolean;
      }> = [];

      // ---- Fanpage đích: đăng qua API Page chính thức.
      if (args.page_ids.length > 0) {
        const allPages = await db.select().from(schema.fbPages);
        const chosenPages = allPages.filter((p) =>
          args.page_ids.includes(p.id),
        );
        let fbPages: FbPageRef[] | null = null;
        let fbPagesError = "";
        if (chosenPages.length > 0) {
          try {
            const res = await ctx.executePrivileged(privileged.listFbPages, {});
            if (res.ok) fbPages = parseFbPages(res.stdout);
            else fbPagesError = cliErrorText(res);
          } catch (e) {
            fbPagesError = e instanceof Error ? e.message : String(e);
          }
        }
        for (const p of chosenPages) {
          const label = `Page “${p.name}”`;
          if (alreadyPublished("page", p.name)) {
            await record({
              kind: "page",
              name: p.name,
              status: "skipped",
              message: `${label} đã đăng thành công ở lần trước — bỏ qua để không đăng trùng.`,
              post_url: "",
            });
            continue;
          }
          if (alreadyQueued("page", p.name)) {
            await record({
              kind: "page",
              name: p.name,
              status: "skipped",
              message: `${label} đang được xử lý đăng bằng trình duyệt từ lần bấm trước — không tạo thêm yêu cầu trùng, chờ kết quả cập nhật ở Lịch sử đăng Bài.`,
              post_url: "",
            });
            continue;
          }
          if (caption.length > FB_PAGE_CAPTION_LIMIT) {
            // Caption dài hơn giới hạn của API đăng Page: KHÔNG
            // cắt bớt nội dung đã duyệt và KHÔNG bỏ cuộc — chuyển
            // sang xử lý bằng trình duyệt như khi người dùng nhắn
            // trực tiếp (cùng cơ chế với đích nhóm ở dưới).
            const recordId = await record({
              kind: "page",
              name: p.name,
              status: "queued",
              message: `${label}: caption dài ${caption.length} ký tự, vượt giới hạn ${FB_PAGE_CAPTION_LIMIT} ký tự của API đăng Page nên không đăng qua API được — đang xử lý đăng bằng trình duyệt Muse như khi bạn nhắn trực tiếp trong chat. Nếu cửa sổ trình duyệt đó chưa đăng nhập Facebook, bài sẽ chuyển sang trạng thái “Chờ đăng nhập”: bạn đăng nhập 1 lần ngay trong cửa sổ trình duyệt Muse đó (phiên được lưu cho lần sau) rồi bấm Đăng Bài lại. Kết quả và link bài sẽ cập nhật ngay tại đây.`,
              post_url: "",
            });
            browserQueue.push({
              recordId,
              kind: "page",
              name: p.name,
              url: p.url,
              via: [`Page “${p.name}”`],
              note: `caption dài ${caption.length} ký tự (vượt giới hạn API Page) — đăng bằng trình duyệt`,
            });
            continue;
          }
          if (!fbPages) {
            await record({
              kind: "page",
              name: p.name,
              status: "failed",
              message: `${label}: không đọc được danh sách Page từ Facebook${fbPagesError ? ` — ${fbPagesError}` : ""}. Kiểm tra kết nối Facebook rồi thử lại.`,
              post_url: "",
            });
            continue;
          }
          const match = fbPages.find(
            (fp) => normalizeNameKey(fp.name) === normalizeNameKey(p.name),
          );
          if (!match) {
            await record({
              kind: "page",
              name: p.name,
              status: "failed",
              message: `${label}: không thấy Page này trong các Page tài khoản Facebook đã liên kết đang quản trị — kiểm tra lại tên Page ở mục Tài khoản.`,
              post_url: "",
            });
            continue;
          }
          try {
            const res = await ctx.executePrivileged(
              privileged.publishFbPagePost,
              {
                pageId: match.page_id,
                text: caption,
                files: localFiles,
              },
            );
            const ref = extractPostRef(parseCliJson(res.stdout));
            if (res.ok && ref.state !== "scheduled") {
              await record({
                kind: "page",
                name: p.name,
                status: "published",
                message: `${label}: đã đăng thật${localFiles.length > 0 ? ` kèm ${localFiles.length} ảnh` : " (bài chữ, không đính ảnh)"}${mediaNote}.`,
                post_url: ref.url,
              });
            } else if (res.ok && ref.state === "scheduled") {
              await record({
                kind: "page",
                name: p.name,
                status: "published",
                message: `${label}: bài đã lên lịch đăng trên Page${mediaNote}.`,
                post_url: ref.url,
              });
            } else {
              await record({
                kind: "page",
                name: p.name,
                status: "failed",
                message: `${label}: đăng không thành công — ${cliErrorText(res) || "Facebook không trả lý do"}. Nếu chưa chắc bài đã lên hay chưa, kiểm tra Page trước khi bấm đăng lại.`,
                post_url: ref.url,
              });
            }
          } catch (e) {
            await record({
              kind: "page",
              name: p.name,
              status: "failed",
              message: `${label}: lỗi khi gọi đăng bài — ${e instanceof Error ? e.message.slice(0, 300) : "không rõ"}. Kiểm tra Page trước khi bấm đăng lại để tránh trùng.`,
              post_url: "",
            });
          }
        }
      }

      // ---- Instagram đích: kiểm tra nhanh tại đây, đăng thật
      // chạy Ở NỀN qua tác vụ agent + instagram-cli (xem igQueue).
      if (args.instagram_account_ids.length > 0) {
        const allAccounts = await db.select().from(schema.accounts);
        const chosenIg = allAccounts.filter(
          (a) =>
            a.platform === "Instagram" &&
            a.linked === 1 &&
            args.instagram_account_ids.includes(a.id),
        );
        let igRefs: IgAccountRef[] | null = null;
        let igError = "";
        if (chosenIg.length > 0) {
          try {
            const res = await ctx.executePrivileged(
              privileged.listIgAccounts,
              {},
            );
            if (res.ok) igRefs = parseIgAccounts(res.stdout);
            else igError = cliErrorText(res);
          } catch (e) {
            igError = e instanceof Error ? e.message : String(e);
          }
        }
        for (const a of chosenIg) {
          const label = `Instagram ${a.name}`;
          if (alreadyPublished("instagram", a.name)) {
            await record({
              kind: "instagram",
              name: a.name,
              status: "skipped",
              message: `${label} đã đăng thành công ở lần trước — bỏ qua để không đăng trùng.`,
              post_url: "",
            });
            continue;
          }
          if (alreadyQueued("instagram", a.name)) {
            await record({
              kind: "instagram",
              name: a.name,
              status: "skipped",
              message: `${label} đang được xử lý đăng ở chế độ nền từ lần bấm trước — không tạo thêm yêu cầu trùng, chờ kết quả cập nhật ở Lịch sử đăng Bài.`,
              post_url: "",
            });
            continue;
          }
          if (caption.length > IG_CAPTION_LIMIT) {
            await record({
              kind: "instagram",
              name: a.name,
              status: "failed",
              message: `${label}: caption dài ${caption.length} ký tự, vượt giới hạn ${IG_CAPTION_LIMIT} ký tự của Instagram — chưa đăng được.`,
              post_url: "",
            });
            continue;
          }
          if (localFiles.length === 0) {
            await record({
              kind: "instagram",
              name: a.name,
              status: "failed",
              message:
                driveImages.length === 0
                  ? `${label}: bài chưa có ảnh nào đã chốt — Instagram chỉ đăng được bài có ảnh/video. Gắn ảnh vào bài ở khâu soạn rồi đăng lại.`
                  : `${label}: không tải về được ảnh đã chốt để đăng${mediaNote}. Thử lại sau.`,
              post_url: "",
            });
            continue;
          }
          if (!igRefs) {
            await record({
              kind: "instagram",
              name: a.name,
              status: "failed",
              message: `${label}: không đọc được danh sách tài khoản Instagram đã liên kết${igError ? ` — ${igError}` : ""}. Kiểm tra kết nối Instagram rồi thử lại.`,
              post_url: "",
            });
            continue;
          }
          const username = igUsernameOf(a);
          const match =
            igRefs.find(
              (r) => username && r.username.toLowerCase() === username,
            ) ??
            (igRefs.length === 1 && chosenIg.length === 1
              ? igRefs[0]
              : undefined);
          if (!match) {
            await record({
              kind: "instagram",
              name: a.name,
              status: "failed",
              message: `${label}: không khớp được với tài khoản Instagram đã liên kết${username ? ` (@${username})` : ""} — kiểm tra lại handle/link ở mục Tài khoản.`,
              post_url: "",
            });
            continue;
          }
          // KHÔNG đăng đồng bộ ở đây: tải ảnh + đăng Instagram
          // thường tốn hơn ngân sách 30 giây của một lượt gọi
          // action — chạy đồng bộ từng bị hệ thống cắt giữa chừng
          // và ghi "đăng lỗi" trong khi chưa rõ bài đã lên hay
          // chưa. Ghi nhận "queued" rồi để tác vụ agent chạy
          // instagram-cli ở nền (kích hoạt ở cuối action này) và
          // cập nhật kết quả qua reportInstagramPublish.
          const hadUncertain = alreadyUncertain("instagram", a.name);
          const recordId = await record({
            kind: "instagram",
            name: a.name,
            status: "queued",
            message: hadUncertain
              ? `${label}: lượt đăng trước bị ngắt giữa chừng nên chưa rõ bài đã lên Instagram hay chưa — lượt này đang xử lý đăng ở chế độ nền và sẽ KIỂM TRA BÀI TRÙNG trên Instagram trước, thấy bài đã lên thì ghi nhận link bài đó thay vì đăng thêm bài mới. Kết quả cập nhật ngay tại đây.`
              : `${label}: đã tiếp nhận — đang xử lý đăng ở chế độ nền (đăng Instagram cần tải ảnh lên, lâu hơn một lượt bấm nên không chạy ngay trong lượt này). Kết quả và link bài sẽ cập nhật ngay tại đây.`,
            post_url: "",
          });
          igQueue.push({
            recordId,
            name: a.name,
            accountId: match.user_fbid,
            username: match.username,
            files: [...localFiles],
            hadUncertain,
          });
        }
      }

      // ---- Nhóm đích: Meta không có API đăng bài nhóm, nên bấm
      // "Đăng Bài" sẽ XỬ LÝ NHƯ KHI NGƯỜI DÙNG NHẮN TRỰC TIẾP nhờ
      // đăng nhóm: app ghi nhận yêu cầu (trạng thái "queued") rồi
      // kích hoạt một tác vụ agent đăng bằng trình duyệt — đúng
      // caption đã duyệt, đúng ảnh đã chốt, đăng bằng đúng danh
      // tính đã tham gia từng nhóm — và agent gọi lại action
      // reportBrowserPublish để cập nhật kết quả + link bài thật
      // vào đúng các dòng "queued" này (dùng chung với các Page
      // caption dài ở trên). Người dùng không phải chép gói hay
      // nhắn lại nữa.
      if (args.group_ids.length > 0) {
        const allGroups = await db.select().from(schema.fbGroups);
        const chosenGroups = allGroups.filter((g) =>
          args.group_ids.includes(g.id),
        );
        const joinCtx = await loadJoinContext(db);
        for (const g of chosenGroups) {
          if (alreadyPublished("group", g.name)) {
            await record({
              kind: "group",
              name: g.name,
              status: "skipped",
              message: `Nhóm ${g.name} đã ghi nhận đăng thành công ở lần trước — bỏ qua.`,
              post_url: "",
            });
            continue;
          }
          if (alreadyQueued("group", g.name)) {
            await record({
              kind: "group",
              name: g.name,
              status: "skipped",
              message: `Nhóm ${g.name} đang được xử lý đăng từ lần bấm trước — không tạo thêm yêu cầu trùng, chờ kết quả cập nhật ở Lịch sử đăng Bài.`,
              post_url: "",
            });
            continue;
          }
          const viaIdentities = postingJoinedIdentities(joinCtx, g);
          if (viaIdentities.length === 0) {
            await record({
              kind: "group",
              name: g.name,
              status: "failed",
              message: `Nhóm ${g.name}: chưa có danh tính sẽ đăng nào (tài khoản chính hoặc Page đang chọn đăng) được đánh dấu “Đã tham gia” nhóm này — đánh dấu ở mục Hội nhóm rồi bấm Đăng Bài lại.`,
              post_url: "",
            });
            continue;
          }
          const via = viaIdentities.map((i) =>
            i.kind === "page" ? `Page “${i.name}”` : `tài khoản ${i.name}`,
          );
          const recordId = await record({
            kind: "group",
            name: g.name,
            status: "queued",
            message: `Nhóm ${g.name}: đã tiếp nhận — đang xử lý đăng như khi bạn nhắn trực tiếp trong chat (đăng bằng trình duyệt Muse, bằng ${via.join(" / ")}). Nếu cửa sổ trình duyệt Muse chưa đăng nhập Facebook, bài sẽ chuyển sang trạng thái “Chờ đăng nhập”: bạn đăng nhập 1 lần ngay trong cửa sổ đó (phiên được lưu cho lần sau) rồi bấm Đăng Bài lại. Kết quả và link bài sẽ cập nhật ngay tại đây.`,
            post_url: "",
          });
          browserQueue.push({
            recordId,
            kind: "group",
            name: g.name,
            url: g.url,
            via,
            note: "",
          });
        }
      }
      if (browserQueue.length > 0) {
        const globalAny = globalThis as any;
        const isOnline = globalAny.__socialDeskIsExtensionOnline;
        const sendTask = globalAny.__socialDeskSendExtensionTask;

        const allFbAccounts = await db
          .select()
          .from(schema.accounts)
          .where(eq(schema.accounts.platform, "Facebook"));
        const defaultAcc = allFbAccounts.find((a) => a.selected === 1) || allFbAccounts[0];

        const imageUrls = driveImages.map((im) => im.jpeg_url);

        for (const t of browserQueue) {
          const kindLabel = t.kind === "group" ? "Nhóm" : "Fanpage";
          const extCode = defaultAcc?.extensionCode?.trim().toUpperCase() || "";

          if (!extCode) {
            const noCodeMsg = `${kindLabel} "${t.name}": Tài khoản "${defaultAcc?.name || "Facebook"}" chưa được gán Mã Extension Chrome. Vui lòng vào mục "Tài khoản" để gán mã từ Chrome tương ứng.`;
            await db
              .update(schema.publishRecords)
              .set({ status: "failed", message: noCodeMsg })
              .where(eq(schema.publishRecords.id, t.recordId));
            const item = results.find(
              (r) => r.kind === t.kind && r.name === t.name && r.status === "queued"
            );
            if (item) {
              item.status = "failed";
              item.message = noCodeMsg;
            }
            continue;
          }

          if (typeof isOnline === "function" && !isOnline(extCode)) {
            const offlineMsg = `${kindLabel} "${t.name}": Chrome mang mã [${extCode}] chưa được mở hoặc chưa kết nối Extension. Vui lòng mở cửa sổ Chrome đó lên và thử bấm Đăng Bài lại.`;
            await db
              .update(schema.publishRecords)
              .set({ status: "failed", message: offlineMsg })
              .where(eq(schema.publishRecords.id, t.recordId));
            const item = results.find(
              (r) => r.kind === t.kind && r.name === t.name && r.status === "queued"
            );
            if (item) {
              item.status = "failed";
              item.message = offlineMsg;
            }
            continue;
          }

          // Chrome Extension đang online! Bắn lệnh sang Chrome qua WebSocket
          if (typeof sendTask === "function") {
            try {
              await db
                .update(schema.publishRecords)
                .set({
                  message: `Đang gửi lệnh tới Chrome [${extCode}] để mở Facebook và tự động đăng bài vào ${kindLabel} "${t.name}"...`,
                })
                .where(eq(schema.publishRecords.id, t.recordId));

              const taskPayload = {
                action: "PUBLISH_POST",
                taskId: `task_${Date.now()}_${t.recordId}`,
                draftId: row.id,
                targetName: t.name,
                targetUrl: t.url || "https://www.facebook.com/",
                caption: caption,
                images: imageUrls,
              };

              sendTask(extCode, taskPayload, 90000)
                .then(async (res: any) => {
                  const finalStatus = res?.status === "published" ? "published" : "failed";
                  const finalMsg = res?.message || (finalStatus === "published" ? "Đã đăng thành công lên Facebook" : "Đăng bài thất bại");
                  await db
                    .update(schema.publishRecords)
                    .set({
                      status: finalStatus,
                      postUrl: res?.postUrl || t.url || "",
                      message: `${kindLabel} "${t.name}": ${finalMsg}`,
                    })
                    .where(eq(schema.publishRecords.id, t.recordId));
                })
                .catch(async (taskErr: any) => {
                  await db
                    .update(schema.publishRecords)
                    .set({
                      status: "failed",
                      message: `${kindLabel} "${t.name}": Lỗi Extension Chrome: ${taskErr?.message || "Không phản hồi"}`,
                    })
                    .where(eq(schema.publishRecords.id, t.recordId));
                });

              const item = results.find(
                (r) => r.kind === t.kind && r.name === t.name && r.status === "queued"
              );
              if (item) {
                item.message = `Đã kích hoạt Chrome [${extCode}] đăng bài tự động...`;
              }
            } catch (err: any) {
              await db
                .update(schema.publishRecords)
                .set({
                  status: "failed",
                  message: `${kindLabel} "${t.name}": Lỗi kết nối Chrome: ${err?.message || "Không rõ"}`,
                })
                .where(eq(schema.publishRecords.id, t.recordId));
            }
          }
        }
      }

      // Kích hoạt tác vụ agent đăng Instagram Ở NỀN: chạy
      // instagram-cli ngoài ngân sách 30 giây của action này —
      // trước khi đăng, kiểm tra bài trùng trên chính tài khoản
      // (đặc biệt bắt buộc khi lượt trước bị ngắt giữa chừng,
      // chưa rõ bài đã lên hay chưa); kết quả từng tài khoản được
      // cập nhật qua reportInstagramPublish.
      if (igQueue.length > 0) {
        const targetBlocks = igQueue
          .map((t, i) => {
            const fileLines = t.files.map((f) => `   - ${f}`).join("\n");
            return [
              `${i + 1}. Tài khoản “${t.name}” (@${t.username}) — account-id: ${t.accountId}`,
              `   File ảnh local theo đúng thứ tự đăng:\n${fileLines}`,
              t.hadUncertain
                ? "   ⚠ Lượt đăng trước của tài khoản này bị ngắt giữa chừng vì quá thời gian chờ — CHƯA RÕ bài đã lên hay chưa, nên bước kiểm tra trùng là BẮT BUỘC trước khi đăng."
                : "   Lượt đăng mới — vẫn kiểm tra trùng nhanh ở bước 1 để tránh đăng hai bài giống hệt.",
            ].join("\n");
          })
          .join("\n");
        const igTaskMessage = [
          `Người dùng vừa bấm nút “Đăng Bài” trong app Social Desk và ĐÃ XÁC NHẬN đăng công khai bài này lên Instagram — xử lý đúng như khi người dùng nhắn trực tiếp nhờ bạn đăng bằng công cụ Instagram đã liên kết, KHÔNG cần hỏi lại người dùng.`,
          `Bài: ${row.productName} (mã ${row.code}, draft_id = ${row.id}).`,
          `Các tài khoản Instagram cần đăng (xử lý lần lượt từng tài khoản):\n${targetBlocks}`,
          `Cách xử lý TỪNG tài khoản:\n1) KIỂM TRA TRÙNG TRƯỚC: chạy /opt/hatch/bin/instagram-cli posts --account-id <account-id> --limit 10 để đọc các bài gần nhất của chính tài khoản đó. Nếu thấy một bài có caption trùng với caption nguyên văn bên dưới (so khớp phần đầu caption, chấp nhận khác biệt khoảng trắng/xuống dòng) thì KHÔNG đăng thêm bài mới — ghi outcome "published" kèm post_url là link của bài đã có đó.\n2) Chưa có bài trùng: đăng bằng /opt/hatch/bin/instagram-cli post-feed --account-id <account-id>, tiếp theo là --file cho từng file ảnh theo đúng thứ tự đã liệt kê, và --caption là caption nguyên văn bên dưới (giữ nguyên văn, không sửa, không thêm bớt chữ; KHÔNG truyền --retries vì đăng lại có thể nhân đôi bài). Đọc output của lệnh để lấy link bài thật khi đăng thành công.\n3) Phân loại kết quả THẬT: lệnh báo lỗi rõ ràng TRƯỚC khi đăng (sai tài khoản, file lỗi, Instagram từ chối…) → "failed" kèm lý do thật. Lệnh bị ngắt/timeout/kết nối đứt GIỮA CHỪNG khiến không rõ bài đã lên hay chưa → "uncertain" kèm giải thích — tuyệt đối KHÔNG ghi "failed" cho trường hợp này và KHÔNG tự chạy lại lệnh đăng lần hai.`,
          `Sau khi xử lý xong TỪNG tài khoản — đăng thành công, lỗi hay chưa xác định — gọi action reportInstagramPublish của artifact social-desk với draft_id = ${row.id} và outcomes gồm name đúng tên tài khoản ở trên, status ("published" / "failed" / "uncertain"), post_url là LINK BÀI THẬT (chỉ ghi khi thật sự có link: lấy từ output của lệnh đăng hoặc từ bài trùng tìm được ở bước 1 — tuyệt đối không bịa link), message là tóm tắt kết quả thật bằng tiếng Việt. Phải gọi action này cho MỌI tài khoản trong danh sách, kể cả khi đăng lỗi, để app cập nhật Lịch sử đăng Bài cho người dùng.`,
          `Caption nguyên văn đã duyệt:\n"""\n${caption}\n"""`,
        ].join("\n\n");
        const markIgSpawnFailed = async (reason: string): Promise<void> => {
          for (const t of igQueue) {
            await db
              .update(schema.publishRecords)
              .set({
                status: "failed",
                message: `Instagram ${t.name}: không khởi động được khâu xử lý đăng ở chế độ nền (${reason}) — bấm Đăng Bài lại để thử lại.`,
              })
              .where(eq(schema.publishRecords.id, t.recordId));
            const item = results.find(
              (r) =>
                r.kind === "instagram" &&
                r.name === t.name &&
                r.status === "queued",
            );
            if (item) {
              item.status = "failed";
              item.message = `Instagram ${t.name}: không khởi động được khâu xử lý đăng ở chế độ nền — bấm Đăng Bài lại để thử lại.`;
            }
          }
        };
        try {
          const res = await ctx.agent.spawnTask(igTaskMessage, {
            expectsAction: "reportInstagramPublish",
            dedupeKey: `ig-publish-${row.id}-${igQueue.map((t) => t.recordId).join("-")}`,
          });
          if (!res.ok) await markIgSpawnFailed(res.error);
        } catch (e) {
          await markIgSpawnFailed(
            (e instanceof Error ? e.message : String(e)).slice(0, 200),
          );
        }
      }

      const publishedCount = results.filter(
        (r) => r.status === "published",
      ).length;
      const queuedCount = results.filter(
        (r) => r.status === "queued",
      ).length;
      ctx.invalidateQueries();
      return {
        ok: results.length > 0,
        message:
          publishedCount > 0 && queuedCount > 0
            ? `Đã đăng thành công ${publishedCount} đích; ${queuedCount} đích đang được xử lý đăng như khi bạn nhắn trực tiếp trong chat — kết quả cập nhật ở Lịch sử đăng Bài. Đích đăng bằng trình duyệt: nếu cửa sổ trình duyệt Muse chưa đăng nhập Facebook, đích đó sẽ hiện trạng thái “Chờ đăng nhập” — đăng nhập 1 lần trong cửa sổ đó rồi bấm Đăng Bài lại.`
            : publishedCount > 0
              ? `Đã đăng thành công ${publishedCount}/${results.length} đích. Chi tiết từng đích ở dưới.`
              : queuedCount > 0
                ? `${queuedCount} đích đang được xử lý đăng như khi bạn nhắn trực tiếp trong chat — kết quả và link bài sẽ cập nhật ở Lịch sử đăng Bài, không cần nhắn lại. Đích đăng bằng trình duyệt: nếu cửa sổ trình duyệt Muse chưa đăng nhập Facebook, đích đó sẽ hiện trạng thái “Chờ đăng nhập” — đăng nhập 1 lần trong cửa sổ đó rồi bấm Đăng Bài lại.`
                : "Chưa đăng thành công đích nào — xem lý do của từng đích ở dưới.",
        results,
      };
    },
  }),

  // Kết quả đăng NHÓM do tác vụ agent (được kích hoạt khi người
  // dùng bấm "Đăng Bài") gọi lại sau khi đăng bằng trình duyệt:
  // cập nhật đúng dòng publish_records đang "queued" của từng
  // nhóm thành published (kèm link bài thật), failed (kèm lý
  // do) hoặc needs_login (trình duyệt Muse đang dừng ở trang
  // đăng nhập Facebook, chờ người dùng đăng nhập 1 lần trong
  // cửa sổ đó — không phải đăng lỗi). Không có dòng queued
  // (agent báo muộn/lặp) thì ghi một dòng mới để kết quả không
  // bị mất.
  reportGroupPublish: defineAction({
    request: z.object({
      draft_id: z.number().int().positive(),
      outcomes: z
        .array(
          z.object({
            group_name: z.string().min(1),
            status: z.enum(["published", "failed", "needs_login"]),
            post_url: z.string().default(""),
            message: z.string().default(""),
          }),
        )
        .min(1)
        .max(20),
    }),
    response: z.object({ ok: z.boolean(), updated: z.number() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      let updated = 0;
      for (const o of args.outcomes) {
        const records = await db
          .select()
          .from(schema.publishRecords)
          .where(eq(schema.publishRecords.draftId, args.draft_id));
        const queued = records
          .filter(
            (p) =>
              p.targetKind === "group" &&
              normalizeNameKey(p.targetName) ===
                normalizeNameKey(o.group_name) &&
              p.status === "queued",
          )
          .sort((a, b) => b.id - a.id)[0];
        const message =
          o.message.trim() ||
          (o.status === "published"
            ? `Nhóm ${o.group_name}: đã đăng thành công vào nhóm.`
            : o.status === "needs_login"
              ? `Nhóm ${o.group_name}: đang chờ bạn đăng nhập Facebook trong cửa sổ trình duyệt Muse — đăng nhập 1 lần trong cửa sổ đó (phiên được lưu cho lần sau) rồi bấm Đăng Bài lại.`
              : `Nhóm ${o.group_name}: đăng không thành công.`);
        let affectedId = queued?.id ?? 0;
        if (queued) {
          await db
            .update(schema.publishRecords)
            .set({
              status: o.status,
              // Link bài chỉ nhận khi agent thật sự trả về — không
              // tự dựng link từ tên/ID nhóm.
              postUrl: o.status === "published" ? o.post_url.trim() : "",
              message,
            })
            .where(eq(schema.publishRecords.id, queued.id));
        } else {
          const [ins] = await db
            .insert(schema.publishRecords)
            .values({
              draftId: args.draft_id,
              targetKind: "group",
              targetName: o.group_name,
              status: o.status,
              postUrl: o.status === "published" ? o.post_url.trim() : "",
              message,
            })
            .returning({ id: schema.publishRecords.id });
          affectedId = ins?.id ?? 0;
        }
        // Kết quả mới thay thế các bản ghi cũ chưa thành công của
        // cùng nhóm — xóa hẳn để lịch sử chỉ còn thông tin mới.
        await pruneSupersededPublishRecords(db, affectedId);
        updated += 1;
      }
      ctx.invalidateQueries();
      return { ok: true, updated };
    },
  }),

  // Kết quả đăng BẰNG TRÌNH DUYỆT (nhóm + Page caption dài) do
  // tác vụ agent — được kích hoạt khi người dùng bấm "Đăng Bài"
  // — gọi lại sau khi xử lý: cập nhật đúng dòng publish_records
  // đang "queued" của từng đích (khớp theo kind + tên đích)
  // thành published (kèm link bài thật), failed (kèm lý do)
  // hoặc needs_login (tác vụ đã mở cửa sổ trình duyệt Muse ở
  // trang đăng nhập Facebook và đang chờ người dùng đăng nhập
  // 1 lần trong cửa sổ đó — phiên được lưu cho mọi lần sau;
  // người dùng đăng nhập xong bấm "Đăng Bài" lại là đăng tiếp,
  // nên trạng thái này KHÔNG phải đăng lỗi). Không có dòng
  // queued (agent báo muộn/lặp) thì ghi một dòng mới để kết quả
  // không bị mất.
  reportBrowserPublish: defineAction({
    request: z.object({
      draft_id: z.number().int().positive(),
      outcomes: z
        .array(
          z.object({
            kind: z.enum(["group", "page"]),
            name: z.string().min(1),
            status: z.enum(["published", "failed", "needs_login"]),
            post_url: z.string().default(""),
            message: z.string().default(""),
          }),
        )
        .min(1)
        .max(20),
    }),
    response: z.object({ ok: z.boolean(), updated: z.number() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      let updated = 0;
      for (const o of args.outcomes) {
        const records = await db
          .select()
          .from(schema.publishRecords)
          .where(eq(schema.publishRecords.draftId, args.draft_id));
        const queued = records
          .filter(
            (p) =>
              p.targetKind === o.kind &&
              normalizeNameKey(p.targetName) === normalizeNameKey(o.name) &&
              p.status === "queued",
          )
          .sort((a, b) => b.id - a.id)[0];
        const kindLabel = o.kind === "group" ? "Nhóm" : "Page";
        const message =
          o.message.trim() ||
          (o.status === "published"
            ? `${kindLabel} ${o.name}: đã đăng thành công.`
            : o.status === "needs_login"
              ? `${kindLabel} ${o.name}: đang chờ bạn đăng nhập Facebook trong cửa sổ trình duyệt Muse — cửa sổ đó đang mở ở trang đăng nhập; đăng nhập 1 lần bằng tài khoản quản trị Page (phiên được lưu cho mọi lần sau) rồi bấm Đăng Bài lại là đăng tiếp.`
              : `${kindLabel} ${o.name}: đăng không thành công.`);
        let affectedId = queued?.id ?? 0;
        if (queued) {
          await db
            .update(schema.publishRecords)
            .set({
              status: o.status,
              // Link bài chỉ nhận khi agent thật sự trả về — không
              // tự dựng link từ tên/ID đích.
              postUrl: o.status === "published" ? o.post_url.trim() : "",
              message,
            })
            .where(eq(schema.publishRecords.id, queued.id));
        } else {
          const [ins] = await db
            .insert(schema.publishRecords)
            .values({
              draftId: args.draft_id,
              targetKind: o.kind,
              targetName: o.name,
              status: o.status,
              postUrl: o.status === "published" ? o.post_url.trim() : "",
              message,
            })
            .returning({ id: schema.publishRecords.id });
          affectedId = ins?.id ?? 0;
        }
        // Kết quả mới thay thế các bản ghi cũ chưa thành công của
        // cùng đích — xóa hẳn để lịch sử chỉ còn thông tin mới.
        await pruneSupersededPublishRecords(db, affectedId);
        updated += 1;
      }
      ctx.invalidateQueries();
      return { ok: true, updated };
    },
  }),

  // Kết quả đăng INSTAGRAM Ở NỀN do tác vụ agent — được kích
  // hoạt khi người dùng bấm "Đăng Bài" — gọi lại sau khi chạy
  // instagram-cli: cập nhật đúng dòng publish_records đang
  // "queued" của từng tài khoản thành published (kèm link bài
  // thật), failed (kèm lý do thật) hoặc uncertain (lượt đăng bị
  // ngắt giữa chừng, chưa rõ bài đã lên hay chưa — KHÔNG coi là
  // lỗi chắc chắn để người dùng không bấm đăng lại mù). Không có
  // dòng queued (agent báo muộn/lặp) thì ghi một dòng mới để kết
  // quả không bị mất.
  reportInstagramPublish: defineAction({
    request: z.object({
      draft_id: z.number().int().positive(),
      outcomes: z
        .array(
          z.object({
            name: z.string().min(1),
            status: z.enum(["published", "failed", "uncertain"]),
            post_url: z.string().default(""),
            message: z.string().default(""),
          }),
        )
        .min(1)
        .max(20),
    }),
    response: z.object({ ok: z.boolean(), updated: z.number() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      let updated = 0;
      for (const o of args.outcomes) {
        const records = await db
          .select()
          .from(schema.publishRecords)
          .where(eq(schema.publishRecords.draftId, args.draft_id));
        const queued = records
          .filter(
            (p) =>
              p.targetKind === "instagram" &&
              normalizeNameKey(p.targetName) === normalizeNameKey(o.name) &&
              p.status === "queued",
          )
          .sort((a, b) => b.id - a.id)[0];
        const message =
          o.message.trim() ||
          (o.status === "published"
            ? `Instagram ${o.name}: đã đăng thành công.`
            : o.status === "uncertain"
              ? `Instagram ${o.name}: lượt đăng bị ngắt giữa chừng — chưa xác định được bài đã lên hay chưa, kiểm tra Instagram trước khi bấm đăng lại.`
              : `Instagram ${o.name}: đăng không thành công.`);
        let affectedId = queued?.id ?? 0;
        if (queued) {
          await db
            .update(schema.publishRecords)
            .set({
              status: o.status,
              // Link bài chỉ nhận khi agent thật sự trả về — không
              // tự dựng link từ tên tài khoản.
              postUrl: o.status === "published" ? o.post_url.trim() : "",
              message,
            })
            .where(eq(schema.publishRecords.id, queued.id));
        } else {
          const [ins] = await db
            .insert(schema.publishRecords)
            .values({
              draftId: args.draft_id,
              targetKind: "instagram",
              targetName: o.name,
              status: o.status,
              postUrl: o.status === "published" ? o.post_url.trim() : "",
              message,
            })
            .returning({ id: schema.publishRecords.id });
          affectedId = ins?.id ?? 0;
        }
        // Kết quả mới thay thế các bản ghi cũ chưa thành công của
        // cùng tài khoản — xóa hẳn để lịch sử chỉ còn thông tin
        // mới ("uncertain" cũ không bị xóa bởi cơ chế này vì nó
        // là căn cứ kiểm tra trùng; bản ghi vừa cập nhật chính
        // là bản mới nhất của đích).
        await pruneSupersededPublishRecords(db, affectedId);
        updated += 1;
      }
      ctx.invalidateQueries();
      return { ok: true, updated };
    },
  }),
};
