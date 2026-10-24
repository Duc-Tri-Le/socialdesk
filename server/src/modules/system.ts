import { defineAction, z } from "@hatch/space-sdk";
import { asc, eq } from "drizzle-orm";
import * as schema from "../schema";
import {
  getSheetSettings,
  getSettingsByPrefix,
  MAX_POSTS_PER_DAY,
  MIN_INTERVAL_MINUTES,
} from "../services/settings";
import {
  accountOut,
  toAccountOut,
  pageOut,
  toPageOut,
} from "../types";
import {
  vnDateKey,
  cleanupLegacyDraftColorPlaceholders,
} from "../services/copywriting";
import {
  loadJoinContext,
  accountCountsAsJoined,
  joinedPostingPages,
} from "../services/groups";
import { parseDriveImages } from "../services/drive";

export const systemActions = {
  seedDesk: defineAction({
    request: z.object({}),
    response: z.object({ seeded: z.boolean() }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      let seededAny = false;

      const existingAccounts = await db
        .select()
        .from(schema.accounts)
        .limit(1);
      if (existingAccounts.length === 0) {
        await db.insert(schema.accounts).values([
          {
            platform: "Facebook",
            name: "Đức Trí",
            handle: "Tài khoản cá nhân đã liên kết",
            profileUrl: "",
            linked: 1,
            selected: 1,
          },
          {
            platform: "Instagram",
            name: "@alexsander01102000",
            handle: "Tài khoản đã liên kết",
            profileUrl: "https://www.instagram.com/alexsander01102000/",
            linked: 1,
            selected: 1,
          },
        ]);
        seededAny = true;
      }

      // Không gắn sẵn link Sheet nào: nguồn Sheet do người dùng tự lưu
      // vào danh sách nguồn (sheet_sources) kèm tên nguồn trong mục
      // Sản phẩm. Nguồn cũ gắn bằng cài đặt đơn lẻ đã được migration
      // 0007 chuyển thành một mục trong danh sách đó.

      // TUYỆT ĐỐI không tự chèn giá trị ví dụ (theo yêu cầu của người
      // dùng: chỉ có giá trị thật). Sản phẩm chỉ đến từ đồng bộ Google
      // Sheet hoặc người dùng tự thêm; lượt nghiên cứu chỉ đến từ kết
      // quả quét thật được ghi lại; hội nhóm chỉ do người dùng thêm.
      // Bản seed cũ từng tự thêm 1 sản phẩm và 2 lượt nghiên cứu mẫu
      // mỗi khi bảng sản phẩm trống — các dòng mẫu đó, nếu còn nguyên
      // vẹn chưa bị người dùng sửa, sẽ bị xóa tại đây để không bao
      // giờ hiện lại. Dòng nào đã bị sửa dù chỉ một trường cũng được
      // giữ nguyên (coi là dữ liệu của người dùng).
      let cleaned = false;
      const allProducts = await db.select().from(schema.products);
      for (const p of allProducts) {
        if (
          p.name === "Lexus LX 600 1:18" &&
          p.scale === "1:18" &&
          p.maker === "" &&
          p.color === "đen" &&
          p.price === "" &&
          p.stock === 1 &&
          p.ship === "" &&
          p.stt === "" &&
          p.imageUrl === "" &&
          p.videoUrl === "" &&
          p.source === "manual" &&
          p.externalKey === ""
        ) {
          await db
            .delete(schema.products)
            .where(eq(schema.products.id, p.id));
          cleaned = true;
        }
      }
      const legacyRun1At = new Date("2026-10-18T04:18:26+07:00").getTime();
      const legacyRun2At = new Date("2026-10-18T04:09:17+07:00").getTime();
      const allRuns = await db.select().from(schema.researchRuns);
      for (const r of allRuns) {
        const isLegacyRun1 =
          r.query === "mô hình xe" &&
          r.ranAt.getTime() === legacyRun1At &&
          r.marketplaceCount === 20 &&
          r.priceCount === 9 &&
          r.priceMin === 120000 &&
          r.priceMedian === 500000 &&
          r.priceMax === 7000000 &&
          r.groupsFound === 0;
        const isLegacyRun2 =
          r.query === "diecast 1:18" &&
          r.ranAt.getTime() === legacyRun2At &&
          r.marketplaceCount === 0 &&
          r.priceCount === 0 &&
          r.priceMin === null &&
          r.priceMedian === null &&
          r.priceMax === null &&
          r.groupsFound === 5;
        if (isLegacyRun1 || isLegacyRun2) {
          await db
            .delete(schema.researchRuns)
            .where(eq(schema.researchRuns.id, r.id));
          cleaned = true;
        }
      }

      // Dọn placeholder "[màu]" còn sót trong các bản nháp cũ:
      // bản nháp nào caption / gói đăng còn placeholder màu thì
      // viết lại sạch và lưu bền (xem
      // cleanupLegacyDraftColorPlaceholders) — người bán mở app
      // là các bản cũ tự sạch, hết dòng "Chưa điền: [màu]" và hết
      // bị chặn duyệt vì placeholder màu.
      const draftsCleaned =
        await cleanupLegacyDraftColorPlaceholders(ctx);
      if (draftsCleaned > 0) cleaned = true;

      if (seededAny || cleaned) ctx.invalidateQueries();
      return { seeded: seededAny || cleaned };
    },
  }),

  // -------------------------------------------------------------- overview
  getOverview: defineAction({
    request: z.object({}),
    response: z.object({
      accounts: z.array(accountOut),
      pages: z.array(pageOut),
      sheet: z.object({
        configured: z.boolean(),
        title: z.string(),
        sheet_name: z.string(),
        last_sync_at: z.string(),
        last_sync_status: z.string(),
        product_count: z.number(),
      }),
      limits: z.object({
        max_posts_per_day: z.number(),
        min_interval_minutes: z.number(),
        windows: z.array(z.string()),
      }),
      counts: z.object({
        accounts_total: z.number(),
        accounts_selected: z.number(),
        pages_total: z.number(),
        pages_selected: z.number(),
        products: z.number(),
        groups: z.number(),
        // Đếm TÁCH RIÊNG theo danh tính: số nhóm tài khoản chính
        // đã tham gia và số nhóm có ít nhất một Page con (đang
        // chọn đăng) đã tham gia — hai con số này có thể khác
        // nhau vì Page và tài khoản chính không cùng trạng thái.
        groups_joined_by_account: z.number(),
        groups_joined_by_page: z.number(),
        groups_target: z.number(),
        drafts_pending: z.number(),
        drafts_approved: z.number(),
        drafts_packed: z.number(),
        media: z.number(),
        packed_today: z.number(),
        metrics_posts: z.number(),
        products_with_image: z.number(),
        products_with_video: z.number(),
      }),
    }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const [prods, grps, drfts, media, packed, accs, pgs, mets, pubRecs, sessionMap, sheet, joinCtx] =
        await Promise.all([
          db.select().from(schema.products),
          db.select().from(schema.fbGroups),
          db.select().from(schema.drafts),
          db.select().from(schema.mediaItems),
          db
            .select()
            .from(schema.drafts)
            .where(eq(schema.drafts.status, "packed")),
          db
            .select()
            .from(schema.accounts)
            .orderBy(asc(schema.accounts.id)),
          db
            .select()
            .from(schema.fbPages)
            .orderBy(asc(schema.fbPages.id)),
          db.select().from(schema.postMetrics),
          db.select().from(schema.publishRecords),
          getSettingsByPrefix(db, "account_session_"),
          getSheetSettings(db),
          loadJoinContext(db),
        ]);
      const publishedDraftIds = new Set(
        pubRecs.filter((r) => r.status === "published").map((r) => r.draftId),
      );
      const accountNameById = new Map(accs.map((a) => [a.id, a.name]));
      const today = vnDateKey(new Date());
      const packedToday = packed.filter(
        (d) => d.packedAt && vnDateKey(d.packedAt) === today,
      ).length;
      const accountsOut = accs.map((a) => {
        const savedStatus = sessionMap.get(`account_session_${a.id}`) ?? "";
        return toAccountOut(a, savedStatus);
      });
      return {
        accounts: accountsOut,
        pages: pgs.map((p) =>
          toPageOut(p, accountNameById.get(p.accountId) ?? ""),
        ),
        sheet: {
          configured: sheet.configured,
          title: sheet.title,
          sheet_name: sheet.sheet_name,
          last_sync_at: sheet.last_sync_at,
          last_sync_status: sheet.last_sync_status,
          product_count: prods.filter((p) => p.source === "sheet").length,
        },
        limits: {
          max_posts_per_day: MAX_POSTS_PER_DAY,
          min_interval_minutes: MIN_INTERVAL_MINUTES,
          windows: ["12:00–13:00", "19:00–21:00"],
        },
        counts: {
          accounts_total: accs.length,
          accounts_selected: accs.filter((a) => a.selected === 1).length,
          pages_total: pgs.length,
          pages_selected: pgs.filter((p) => p.selected === 1).length,
          products: prods.length,
          groups: grps.length,
          groups_joined_by_account: grps.filter((g) =>
            accountCountsAsJoined(joinCtx, g),
          ).length,
          groups_joined_by_page: grps.filter(
            (g) => joinedPostingPages(joinCtx, g).length > 0,
          ).length,
          groups_target: grps.filter((g) => g.isTarget === 1).length,
          drafts_pending: drfts.filter((d) => d.status === "draft").length,
          drafts_approved: drfts.filter(
            (d) => d.status === "approved" && !publishedDraftIds.has(d.id),
          ).length,
          drafts_packed: drfts.filter(
            (d) => d.status === "packed" && !publishedDraftIds.has(d.id),
          ).length,
          media: media.length,
          packed_today: packedToday,
          metrics_posts: mets.length,
          // "Có ảnh" CHỈ tính khi đã liệt kê được ≥1 file ảnh thật
          // từ thư mục Drive (không đếm theo ô link không trống như
          // trước — link thư mục rỗng/lỗi vẫn bị tính nhầm là có ảnh).
          products_with_image: prods.filter(
            (p) =>
              p.driveStatus === "ok" &&
              parseDriveImages(p.driveImages).length > 0,
          ).length,
          products_with_video: prods.filter((p) => p.videoUrl.trim()).length,
        },
      };
    },
  }),
};
