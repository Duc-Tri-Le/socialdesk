import { defineAction, z } from "@hatch/space-sdk";
import * as schema from "../../schema";
import { privileged } from "../../privileged";
import {
  getSheetSettings,
  loadSheetSources,
  getActiveSourceId,
  mirrorSourceToSettings,
  updateSourceSyncState,
  setSetting,
} from "../../services/settings";
import {
  applySheetImport,
  markSyncFailed,
  parseSheetGrid,
  friendlySheetError,
  type SheetGridJson,
} from "../../services/sheet";
import {
  fetchDriveImages,
  storeProductDriveImages,
  extractDriveFolderId,
  parseDriveImages,
} from "../../services/drive";

export const sheetSyncActions = {
  requestSheetSync: defineAction({
    request: z.object({
      source_id: z.number().int().min(0).default(0),
    }),
    response: z.object({ ok: z.boolean(), message: z.string() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const sources = await loadSheetSources(db);
      const activeId = await getActiveSourceId(db, sources);
      const source =
        args.source_id > 0
          ? sources.find((s) => s.id === args.source_id)
          : sources.find((s) => s.id === activeId);
      const legacy = source ? null : await getSheetSettings(db);
      const s = source
        ? {
            configured: true,
            spreadsheet_id: source.spreadsheetId,
            sheet_name: source.sheetName,
            range: source.range,
            title: source.title,
            last_sync_at: source.lastSyncAt,
            last_sync_status: source.lastSyncStatus,
            last_sync_message: source.lastSyncMessage,
          }
        : legacy;
      if (!s || !s.configured)
        return {
          ok: false,
          message:
            "Chưa có nguồn Google Sheet nào trong danh sách đã lưu — lưu một nguồn Sheet trước.",
        };
      const sourceId = source?.id ?? 0;
      if (source) await mirrorSourceToSettings(db, source);
      await setSetting(db, "sheet_last_sync_status", "syncing");
      await setSetting(
        db,
        "sheet_last_sync_message",
        "Đang đọc file Google Sheet…",
      );
      await updateSourceSyncState(db, sourceId, {
        status: "syncing",
        message: "Đang đọc file Google Sheet…",
      });
      const rangeDesc = s.range
        ? `phạm vi ${s.range}`
        : s.sheet_name
          ? `tab "${s.sheet_name}", toàn bộ dữ liệu`
          : "tab đầu tiên, toàn bộ dữ liệu";
      const message = [
        `Đọc danh sách sản phẩm bán mô hình xe từ Google Sheet của người dùng và nhập vào artifact Social Desk.`,
        `Spreadsheet ID: ${s.spreadsheet_id}. Đọc ${rangeDesc}.`,
        `Dùng connector Google Sheets (lệnh /opt/hatch/bin/hatch_gws_cli sheets spreadsheets get) với params gồm spreadsheetId ở trên, ranges là phạm vi cần đọc, includeGridData=true và fields để lấy cả giá trị hiển thị, hyperlink và công thức của từng ô — fields phải bao gồm sheets.data.rowData.values(formattedValue,hyperlink,userEnteredValue) VÀ sheets.merges — đọc tối đa 500 dòng đầu. Nếu Google Sheets chưa được kết nối, hoặc file chưa được chia sẻ cho tài khoản đã kết nối (lỗi 403), hãy báo rõ lỗi đó trong kết quả và tuyệt đối không bịa dữ liệu sản phẩm.`,
        `LƯU Ý Ô GỘP (merged cells) — RẤT QUAN TRỌNG: trong Sheet, nhiều cột được GỘP DỌC xuyên nhiều dòng, kể cả XUYÊN NHIỀU STT: ô "Hãng xe" giá trị "LEXUS" gộp chung cho cả STT 1 (LX600) và STT 2 (LX570); "BMW" gộp chung STT 4 (M3) và STT 5 (X5); nhiều cột khác (Tỉ lệ, Kích thước, Giá bán, Link ảnh…) cũng gộp tương tự trong nhóm. API chỉ trả giá trị ở ô GÓC TRÊN-TRÁI của vùng gộp, các ô còn lại trong vùng gộp trả về TRỐNG — TUYỆT ĐỐI không kết luận dòng đó thiếu thông tin chỉ vì ô trống. Hãy đọc mảng sheets[].merges (mỗi merge có startRowIndex/endRowIndex/startColumnIndex/endColumnIndex, chỉ số 0-based, end là exclusive) và ĐIỀN giá trị của ô góc trên-trái xuống MỌI ô thuộc vùng gộp trước khi phân tích dòng mẹ/dòng con. Ví dụ: LX570 phải có maker "LEXUS" và X5 phải có maker "BMW" nhờ vùng gộp, không được để trống.`,
        `Hàng đầu tiên là tiêu đề cột. Cấu trúc Sheet hiện tại (file "BUSINESS"): STT / Hãng xe / Mẫu / Tỉ lệ / Kích thước (Dài x Rộng x Cao) / Màu / Giá bán / Tồn kho / Link ảnh — KHÔNG có cột vận chuyển (vận chuyển mặc định COD, cứ để ship rỗng, app tự ghi COD) và không có cột tên sản phẩm riêng: name = "Hãng xe" + " " + "Mẫu", cắt khoảng trắng thừa (ví dụ hãng "LEXUS" + mẫu "LX600" → name "LEXUS LX600"). Mỗi STT gồm NHIỀU dòng màu: dòng đầu của STT (dòng mẹ) có đủ các cột, các dòng con phía dưới chỉ điền Màu và Tồn kho — mọi cột còn lại (Hãng xe, Mẫu, Tỉ lệ, Kích thước, Giá bán, Link ảnh) KẾ THỪA từ dòng mẹ của STT đó. Cứ gửi MỖI DÒNG (mẹ và từng con) thành một bản ghi riêng kèm đúng màu và tồn kho của dòng đó — phía app sẽ tự PHÂN LOẠI sản phẩm theo Hãng + Mẫu + Tỉ lệ + Kích thước + Màu sắc: mỗi màu là MỘT sản phẩm (biến thể) riêng với tồn kho riêng của chính dòng màu đó, SKU nội bộ dạng "STT-Tên-Màu"; vì vậy đừng tự gộp các dòng khác màu vào nhau và đừng tự chế SKU. Ánh xạ cột theo tên (không phân biệt hoa thường, chấp nhận cả tiếng Việt và tiếng Anh): stt = "STT"/"Mã"/"Code" (giữ nguyên dạng chữ); maker = "Hãng xe"/"Hãng"/"Hãng sản xuất"/"Thương hiệu"/"Maker"/"Brand" (giữ nguyên dạng chữ như trong Sheet); model = "Mẫu"/"Dòng xe"/"Model"; scale = "Tỉ lệ"/"Kích cỡ"/"Scale" (ví dụ 1:18, 1:24, 1:32); size = "Kích thước"/"Kích thước (Dài x Rộng x Cao)"/"Chiều dài" — giữ nguyên dạng chữ như trong Sheet (ví dụ "21 x 8 x 8"); color = "Màu"/"Màu xe"/"Color" (chú ý phân biệt với cột "Mẫu"); price = "Giá"/"Giá bán"/"Price" (giữ nguyên dạng chữ như trong sheet); stock = "Tồn kho"/"Stock"/"Số lượng" (số nguyên, mặc định 1); image_url = cột "Link ảnh"/"Ảnh"/"Hình ảnh"/"Ảnh sản phẩm"/"Image"/"Photo" — trong Sheet hiện tại đây là link THƯ MỤC Google Drive (…/drive/folders/…), cứ gửi nguyên link thư mục đó làm image_url (app sẽ tự mở thư mục qua Drive đã kết nối để liệt kê từng file ảnh thật khi đồng bộ); video_url = cột "Video"/"Link video"/"Video URL" (Sheet hiện tại không có — để rỗng). Cách lấy URL cho image_url và video_url, theo thứ tự ưu tiên: (1) hyperlink của ô nếu có; (2) URL trong công thức của ô ở userEnteredValue — công thức =IMAGE("...") hoặc =HYPERLINK("...";...) thì lấy URL trong cặp ngoặc kép đầu tiên; (3) nếu formattedValue tự nó là một URL http(s) thì dùng URL đó; ô chứa nhiều URL thì lấy URL đầu tiên. Nếu ô chỉ chứa ảnh/video CHÈN TRỰC TIẾP vào Sheet (không có hyperlink, không có công thức, formattedValue rỗng) thì để URL rỗng — ảnh chèn trực tiếp không có URL nên app không hiển thị được. Bỏ qua dòng không dựng được tên sản phẩm.`,
        `Với mỗi DÒNG, đặt external_key = "${s.spreadsheet_id}:<số thứ tự dòng trong sheet, tính cả dòng tiêu đề>". Nếu cột STT có giá trị, ưu tiên external_key = "${s.spreadsheet_id}:stt:<STT>:<Màu>" để mỗi dòng có một khóa riêng, không bị khử trùng nhầm trước khi app phân loại (app phân loại theo Hãng + Mẫu + Tỉ lệ + Kích thước + Màu sắc ở phía máy chủ, khóa dòng chỉ cần bắt đầu bằng đúng ID file Sheet này). Đồng thời gửi sheet_title là tiêu đề file Sheet nếu đọc được. Khi gọi importProductsFromSheet, BẮT BUỘC truyền source_id = ${sourceId} để app ghi trạng thái đồng bộ vào đúng nguồn Sheet này trong danh sách đã lưu.`,
      ].join("\n");
      try {
        const res = await ctx.agent.spawnTask(message, {
          expectsAction: "importProductsFromSheet",
          dedupeKey: `sheet-sync-${sourceId}-${s.spreadsheet_id}-${s.sheet_name}-${s.range}`,
        });
        if (!res.ok) {
          await setSetting(db, "sheet_last_sync_status", "error");
          await setSetting(db, "sheet_last_sync_message", res.error);
          await updateSourceSyncState(db, sourceId, {
            status: "error",
            message: res.error,
          });
          ctx.invalidateQueries();
          return {
            ok: false,
            message: `Không khởi động được đồng bộ: ${res.error}`,
          };
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await setSetting(db, "sheet_last_sync_status", "error");
        await setSetting(db, "sheet_last_sync_message", msg);
        await updateSourceSyncState(db, sourceId, {
          status: "error",
          message: msg,
        });
        ctx.invalidateQueries();
        return {
          ok: false,
          message: `Không khởi động được đồng bộ: ${msg}`,
        };
      }
      ctx.invalidateQueries();
      return {
        ok: true,
        message: source
          ? `Đã bắt đầu đồng bộ từ nguồn Sheet “${source.name}” — danh sách sản phẩm sẽ tự cập nhật sau ít phút, tải lại trang để xem.`
          : "Đã bắt đầu đồng bộ từ Google Sheet — danh sách sản phẩm sẽ tự cập nhật sau ít phút, tải lại trang để xem.",
      };
    },
  }),

  importProductsFromSheet: defineAction({
    request: z.object({
      source_id: z.number().int().min(0).default(0),
      sheet_title: z.string().default(""),
      products: z.array(
        z.object({
          stt: z.string().default(""),
          sku: z.string().default(""),
          name: z.string().default(""),
          model: z.string().default(""),
          scale: z.string().default(""),
          maker: z.string().default(""),
          size: z.string().default(""),
          color: z.string().default(""),
          price: z.string().default(""),
          stock: z.number().int().min(0).default(1),
          ship: z.string().default(""),
          image_url: z.string().default(""),
          video_url: z.string().default(""),
          external_key: z.string().default(""),
        }),
      ),
    }),
    response: z.object({
      ok: z.boolean(),
      inserted: z.number(),
      updated: z.number(),
      total: z.number(),
    }),
    async handler(ctx, args) {
      const r = await applySheetImport(ctx, args);
      return {
        ok: r.ok,
        inserted: r.inserted,
        updated: r.updated,
        total: r.total,
      };
    },
  }),

  // Đồng bộ NGAY trong lần bấm: app tự đọc file Google Sheet qua CLI của
  // connector (privileged) rồi nhập sản phẩm luôn, trả kết quả/lỗi thật
  // cho người dùng.
  syncSheetNow: defineAction({
    request: z.object({
      source_id: z.number().int().min(0).default(0),
    }),
    response: z.object({
      ok: z.boolean(),
      message: z.string(),
      inserted: z.number(),
      updated: z.number(),
      total: z.number(),
    }),
    privileged: [privileged.fetchSheetGrid, privileged.listDriveFolder],
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const zero = { inserted: 0, updated: 0, total: 0 };
      const sources = await loadSheetSources(db);
      const activeId = await getActiveSourceId(db, sources);
      const source =
        args.source_id > 0
          ? sources.find((s) => s.id === args.source_id)
          : sources.find((s) => s.id === activeId);
      const legacy = source ? null : await getSheetSettings(db);
      const cfg = source
        ? {
            spreadsheetId: source.spreadsheetId,
            sheetName: source.sheetName,
            range: source.range,
            title: source.title,
          }
        : legacy && legacy.configured
          ? {
              spreadsheetId: legacy.spreadsheet_id,
              sheetName: legacy.sheet_name,
              range: legacy.range,
              title: legacy.title,
            }
          : null;
      if (!cfg)
        return {
          ok: false,
          message:
            "Chưa có nguồn Google Sheet nào trong danh sách đã lưu — lưu một nguồn Sheet trước.",
          ...zero,
        };
      const sourceId = source?.id ?? 0;
      if (source) await mirrorSourceToSettings(db, source);
      await setSetting(db, "sheet_last_sync_status", "syncing");
      await setSetting(
        db,
        "sheet_last_sync_message",
        "Đang đọc file Google Sheet…",
      );
      await updateSourceSyncState(db, sourceId, {
        status: "syncing",
        message: "Đang đọc file Google Sheet…",
      });

      let fileTitle = cfg.title;
      let tabTitles: string[] = [];
      try {
        const meta = await ctx.executePrivileged(privileged.fetchSheetGrid, {
          spreadsheetId: cfg.spreadsheetId,
          ranges: [],
          includeGridData: false,
          fields: "properties(title),sheets(properties(title))",
        });
        if (meta.ok) {
          const j = JSON.parse(meta.stdout) as SheetGridJson;
          if (typeof j.properties?.title === "string" && j.properties.title)
            fileTitle = j.properties.title;
          tabTitles = (j.sheets ?? [])
            .map((s) => s.properties?.title ?? "")
            .filter((t) => t.length > 0);
        }
      } catch {
        // Tiếp tục bước dưới
      }
      const wantedTab = cfg.sheetName.trim();
      const tab = wantedTab || tabTitles[0] || "";
      const rawRange = cfg.range.trim();
      let rangeArg = "";
      if (rawRange && rawRange.includes("!")) rangeArg = rawRange;
      else if (rawRange && tab)
        rangeArg = `'${tab.replace(/'/g, "''")}'!${rawRange}`;
      else if (tab) rangeArg = `'${tab.replace(/'/g, "''")}'`;

      let grid: { ok: boolean; stdout: string; stderr: string };
      try {
        grid = await ctx.executePrivileged(privileged.fetchSheetGrid, {
          spreadsheetId: cfg.spreadsheetId,
          ranges: rangeArg ? [rangeArg] : [],
          includeGridData: true,
          fields:
            "properties(title),sheets(properties(title),merges,data(startRow,startColumn,rowData(values(formattedValue,hyperlink,userEnteredValue))))",
        });
      } catch (e) {
        const msg = friendlySheetError(
          e instanceof Error ? e.message : String(e),
        );
        await markSyncFailed(ctx, sourceId, msg);
        return { ok: false, message: msg, ...zero };
      }
      if (!grid.ok) {
        const msg = friendlySheetError(grid.stderr || grid.stdout);
        await markSyncFailed(ctx, sourceId, msg);
        return { ok: false, message: msg, ...zero };
      }
      let parsed: SheetGridJson;
      try {
        parsed = JSON.parse(grid.stdout) as SheetGridJson;
      } catch {
        const msg =
          "Đọc Sheet thất bại: dữ liệu trả về không hợp lệ — thử bấm đồng bộ lại.";
        await markSyncFailed(ctx, sourceId, msg);
        return { ok: false, message: msg, ...zero };
      }
      if (parsed.error !== undefined) {
        const msg = friendlySheetError(JSON.stringify(parsed.error));
        await markSyncFailed(ctx, sourceId, msg);
        return { ok: false, message: msg, ...zero };
      }
      const { sheetTitle, products } = parseSheetGrid(
        parsed,
        cfg.spreadsheetId,
      );
      if (products.length === 0) {
        const msg =
          "Đã đọc được file Sheet nhưng không thấy dòng sản phẩm nào dựng được tên — kiểm tra hàng tiêu đề (dòng đầu cần có các cột STT / Hãng xe / Mẫu / Màu như Sheet BUSINESS, hoặc cột “Tên sản phẩm”) và tab/phạm vi của nguồn đã lưu.";
        await markSyncFailed(ctx, sourceId, msg);
        return { ok: false, message: msg, ...zero };
      }
      const r = await applySheetImport(ctx, {
        source_id: sourceId,
        sheet_title: sheetTitle || fileTitle,
        products,
      });

      let finalMessage = r.message;
      try {
        const allProds = await db.select().from(schema.products);
        const byFolder = new Map<string, typeof allProds>();
        for (const p of allProds) {
          const fid = extractDriveFolderId(p.imageUrl);
          if (!fid) {
            if (p.driveStatus !== "no_link") {
              await storeProductDriveImages(db, p.id, {
                status: "no_link",
                folderId: "",
                images: [],
                error: p.imageUrl.trim()
                  ? "Link ảnh không phải link thư mục Google Drive nên app chưa liệt kê được file ảnh thật bên trong."
                  : "Sản phẩm chưa có link thư mục ảnh trong Sheet.",
              });
            }
            continue;
          }
          const arr = byFolder.get(fid) ?? [];
          arr.push(p);
          byFolder.set(fid, arr);
        }
        for (const [fid, prods] of byFolder) {
          const fr = await fetchDriveImages(
            ctx,
            `https://drive.google.com/drive/folders/${fid}`,
          );
          for (const p of prods)
            await storeProductDriveImages(db, p.id, fr);
        }

        const importedKeys = new Set(r.keys);
        const after = await db.select().from(schema.products);
        const importedRows =
          importedKeys.size > 0
            ? after.filter((p) => importedKeys.has(p.externalKey))
            : after.filter((p) =>
                p.externalKey.startsWith(`${cfg.spreadsheetId}:`),
              );
        if (importedRows.length > 0) {
          const withRealImage = importedRows.filter(
            (p) =>
              p.driveStatus === "ok" &&
              parseDriveImages(p.driveImages).length > 0,
          ).length;
          const withoutRealImage = importedRows.length - withRealImage;
          finalMessage =
            `Nhập ${r.total} · Mới ${r.inserted} · Cập nhật ${r.updated}` +
            ` · Có ảnh: ${withRealImage} · Chưa có ảnh: ${withoutRealImage}`;
          await setSetting(db, "sheet_last_sync_message", finalMessage);
          await updateSourceSyncState(db, sourceId, {
            status: "success",
            message: finalMessage,
          });
        }
        ctx.invalidateQueries();
      } catch {
        finalMessage = `${r.message} · Chưa quét được ảnh Drive`;
      }
      return {
        ok: r.ok,
        message: finalMessage,
        inserted: r.inserted,
        updated: r.updated,
        total: r.total,
      };
    },
  }),
};
