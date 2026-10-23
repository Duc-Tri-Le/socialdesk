import type { Ctx } from "@hatch/space-sdk";
import { eq } from "drizzle-orm";
import * as schema from "../schema";
import { loadSheetSources, updateSourceSyncState, setSetting } from "./settings";
import { buildSku, normalizeSheetImageUrl } from "./drive";

export function parseSpreadsheetId(input: string): string {
  const trimmed = input.trim();
  const m = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (m && m[1]) return m[1];
  if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) return trimmed;
  return "";
}


export interface SheetProductInput {
  stt: string;
  sku: string;
  name: string;
  model: string;
  scale: string;
  maker: string;
  size: string;
  color: string;
  price: string;
  stock: number;
  ship: string;
  image_url: string;
  video_url: string;
  external_key: string;
}

export interface SheetImportResult {
  ok: boolean;
  inserted: number;
  updated: number;
  total: number;
  message: string;
  // Khóa ngoài (external_key) của các sản phẩm vừa nhập — bước quét
  // ảnh Drive sau đồng bộ dùng để xác định đúng các dòng vừa nhập
  // trong kho sản phẩm.
  keys: string[];
}

export async function applySheetImport(
  ctx: Ctx,
  input: {
    source_id: number;
    sheet_title: string;
    products: SheetProductInput[];
  },
): Promise<SheetImportResult> {
  const db = ctx.db<typeof schema>();
  // PHÂN LOẠI SẢN PHẨM (theo yêu cầu người dùng): khóa phân loại là
  // Hãng + Mẫu (tên sản phẩm) + Tỉ lệ + Kích thước + MÀU SẮC. Mỗi tổ
  // hợp 5 trường khác nhau là MỘT sản phẩm riêng — mỗi màu là một
  // biến thể riêng với tồn kho riêng. Chỉ các dòng trùng CẢ 5 trường
  // mới gộp vào nhau (cộng dồn tồn kho); giá / vận chuyển / link ảnh
  // / link video lấy giá trị đầu tiên có trong nhóm (dòng mẹ của STT
  // đứng đầu nhóm nên thường mang đủ các giá trị này).
  const normPart = (s: string): string =>
    s.trim().toLowerCase().replace(/\s+/g, " ");
  interface GroupedProduct {
    key: string;
    stt: string;
    name: string;
    scale: string;
    maker: string;
    size: string;
    color: string;
    price: string;
    stock: number;
    ship: string;
    imageUrl: string;
    videoUrl: string;
  }
  const groups = new Map<string, GroupedProduct>();
  const prefixes = new Set<string>();
  for (const p of input.products) {
    // Tên sản phẩm = "Hãng xe" + "Mẫu" (cắt khoảng trắng thừa) khi
    // Sheet không có cột tên riêng — đúng cấu trúc Sheet BUSINESS.
    const composedName = [p.maker.trim(), p.model.trim()]
      .filter((s) => s.length > 0)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    const finalName = p.name.trim() || composedName;
    if (!finalName) continue;
    const maker = p.maker.trim();
    const scale = p.scale.trim();
    const size = p.size.trim();
    // Tiền tố nguồn trong external_key của dòng (ID file Sheet) —
    // đưa vào khóa nhóm để sản phẩm của các nguồn Sheet khác nhau
    // không gộp nhầm vào nhau.
    const rawKey = p.external_key.trim();
    const colonIdx = rawKey.indexOf(":");
    const head = colonIdx > 0 ? rawKey.slice(0, colonIdx) : "";
    const prefix =
      head && head !== "stt" && head !== "name" && head !== "grp"
        ? head
        : "";
    prefixes.add(prefix);
    const color = p.color.trim();
    const groupId = [
      normPart(maker),
      normPart(finalName),
      normPart(scale),
      normPart(size),
      normPart(color),
    ].join("|");
    const key = `${prefix ? `${prefix}:` : ""}grp:${groupId}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        key,
        stt: "",
        name: finalName,
        scale,
        maker,
        size,
        color,
        price: "",
        stock: 0,
        ship: "",
        imageUrl: "",
        videoUrl: "",
      };
      groups.set(key, g);
    }
    if (!g.stt && p.stt.trim()) g.stt = p.stt.trim();
    g.stock += Number.isFinite(p.stock) ? Math.max(0, p.stock) : 0;
    if (!g.price && p.price.trim()) g.price = p.price.trim();
    if (!g.ship && p.ship.trim()) g.ship = p.ship.trim();
    if (!g.imageUrl) {
      const u = normalizeSheetImageUrl(p.image_url);
      if (u) g.imageUrl = u;
    }
    if (!g.videoUrl && p.video_url.trim()) g.videoUrl = p.video_url.trim();
  }

  let inserted = 0;
  let updated = 0;
  const groupKeys: string[] = [];
  for (const g of groups.values()) {
    const values = {
      stt: g.stt,
      // SKU của từng biến thể: "STT-Tên-Màu" — màu nằm trong khóa
      // phân loại nên mỗi màu có mã riêng.
      sku: buildSku(g.stt, g.name, g.color),
      name: g.name,
      scale: g.scale,
      maker: g.maker,
      size: g.size,
      // Mỗi sản phẩm chỉ có đúng một màu; colors giữ danh sách một
      // phần tử để giao diện/soạn bài đọc thống nhất.
      color: g.color,
      colors: JSON.stringify(g.color ? [g.color] : []),
      price: g.price,
      stock: g.stock,
      // Sheet mới không có cột vận chuyển — mặc định COD (chỉ khi
      // Sheet có ghi cách vận chuyển khác mới dùng giá trị đó).
      ship: g.ship || "COD",
      imageUrl: g.imageUrl,
      videoUrl: g.videoUrl,
    };
    groupKeys.push(g.key);
    const [existing] = await db
      .select()
      .from(schema.products)
      .where(eq(schema.products.externalKey, g.key));
    if (existing) {
      await db
        .update(schema.products)
        .set({ ...values, source: "sheet" })
        .where(eq(schema.products.id, existing.id));
      updated += 1;
    } else {
      await db.insert(schema.products).values({
        ...values,
        source: "sheet",
        externalKey: g.key,
      });
      inserted += 1;
    }
  }

  // Dọn các dòng sản phẩm Sheet CŨ của cùng nguồn không còn nằm
  // trong danh sách phân loại hiện tại (điển hình: các dòng gộp
  // không theo màu của các lần đồng bộ trước, khi khóa phân loại
  // chưa gồm màu sắc) — để lại thì danh sách sẽ vừa có dòng cũ vừa
  // có biến thể theo màu trùng nhau. Chỉ xóa dòng source = "sheet"
  // thuộc đúng nguồn này; sản phẩm nhập tay không đụng vào. Bản
  // nháp / gói đăng lưu bản sao dữ kiện riêng nên không bị ảnh hưởng.
  if (groupKeys.length > 0) {
    const keySet = new Set(groupKeys);
    const allRows = await db.select().from(schema.products);
    for (const row of allRows) {
      if (row.source !== "sheet") continue;
      if (keySet.has(row.externalKey)) continue;
      const belongs =
        row.externalKey.startsWith("stt:") ||
        row.externalKey.startsWith("name:") ||
        row.externalKey.startsWith("grp:") ||
        [...prefixes].some(
          (pr) => pr !== "" && row.externalKey.startsWith(`${pr}:`),
        );
      if (belongs)
        await db
          .delete(schema.products)
          .where(eq(schema.products.id, row.id));
    }
  }

  const importedTotal = inserted + updated;
  const groupList = [...groups.values()];
  const withImageLink = groupList.filter((g) => g.imageUrl).length;
  const withoutImage = groupList.length - withImageLink;
  // Thông điệp đồng bộ NGẮN GỌN theo yêu cầu người dùng: chỉ giữ số
  // nhập / thêm mới / cập nhật và số có / chưa có link ảnh. Tab và
  // thời gian đồng bộ do giao diện hiển thị riêng cạnh thông điệp này.
  // (Sau bước quét Drive, syncSheetNow ghi đè lại bằng số ảnh THẬT.)
  const syncMessage =
    `Nhập ${importedTotal} · Mới ${inserted} · Cập nhật ${updated}` +
    ` · Có link ảnh: ${withImageLink} · Chưa có link ảnh: ${withoutImage}`;
  const syncAt = new Date().toISOString();
  await setSetting(db, "sheet_last_sync_at", syncAt);
  await setSetting(db, "sheet_last_sync_status", "success");
  await setSetting(db, "sheet_last_sync_message", syncMessage);
  if (input.sheet_title.trim())
    await setSetting(db, "sheet_title", input.sheet_title.trim());
  // Ghi trạng thái đồng bộ vào đúng nguồn trong danh sách đã lưu:
  // theo source_id nếu biết, nếu không thì khớp theo ID file trong
  // external_key của sản phẩm đầu tiên.
  let targetSourceId = input.source_id;
  if (targetSourceId <= 0) {
    const firstKey = input.products
      .map((p) => p.external_key.trim())
      .find((k) => k.includes(":"));
    const sid = firstKey ? firstKey.split(":")[0] : "";
    if (sid) {
      const sources = await loadSheetSources(db);
      targetSourceId = sources.find((s) => s.spreadsheetId === sid)?.id ?? 0;
    }
  }
  await updateSourceSyncState(db, targetSourceId, {
    status: "success",
    message: syncMessage,
    at: syncAt,
    title: input.sheet_title.trim(),
  });
  ctx.invalidateQueries();
  return {
    ok: true,
    inserted,
    updated,
    total: inserted + updated,
    message: syncMessage,
    keys: groupKeys,
  };
}

export async function markSyncFailed(
  ctx: Ctx,
  sourceId: number,
  message: string,
): Promise<void> {
  const db = ctx.db<typeof schema>();
  await setSetting(db, "sheet_last_sync_status", "error");
  await setSetting(db, "sheet_last_sync_message", message);
  await updateSourceSyncState(db, sourceId, {
    status: "error",
    message,
  });
  ctx.invalidateQueries();
}

// ---- Phân tích lưới dữ liệu trả về từ spreadsheets.get (includeGridData)

export interface SheetCell {
  formattedValue?: string;
  hyperlink?: string;
  userEnteredValue?: {
    stringValue?: string;
    numberValue?: number;
    formulaValue?: string;
  };
}

export interface SheetMergeRange {
  startRowIndex?: number;
  endRowIndex?: number;
  startColumnIndex?: number;
  endColumnIndex?: number;
}

export interface SheetGridJson {
  properties?: { title?: string };
  error?: unknown;
  sheets?: Array<{
    properties?: { title?: string };
    merges?: SheetMergeRange[];
    data?: Array<{
      startRow?: number;
      startColumn?: number;
      rowData?: Array<{ values?: SheetCell[] }>;
    }>;
  }>;
}

export type SheetField =
  | "stt"
  | "name"
  | "model"
  | "scale"
  | "maker"
  | "size"
  | "color"
  | "price"
  | "stock"
  | "ship"
  | "image_url"
  | "video_url";

export function normalizeHeaderText(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ")
    .trim();
}

export function mapSheetHeader(raw: string): SheetField | "" {
  // "Mẫu" (dòng xe) và "Màu" (màu xe) sau khi bỏ dấu đều thành "mau"
  // nên phải phân biệt TRƯỚC bằng chữ gốc còn dấu: cột "Mẫu" là dòng
  // xe (tên sản phẩm = Hãng xe + Mẫu), cột "Màu" là màu xe.
  const rawLower = raw.toLowerCase();
  if (rawLower.includes("mẫu")) return "model";
  if (rawLower.includes("màu")) return "color";
  const h = normalizeHeaderText(raw);
  if (!h) return "";
  const table: Record<string, SheetField> = {
    stt: "stt",
    ma: "stt",
    code: "stt",
    "ma sp": "stt",
    "ma san pham": "stt",
    "ten san pham": "name",
    ten: "name",
    "ten sp": "name",
    "san pham": "name",
    product: "name",
    name: "name",
    // Cột "Mẫu" (dòng xe) khi người dùng gõ không dấu.
    model: "model",
    dong: "model",
    "dong xe": "model",
    "ti le": "scale",
    "kich co": "scale",
    "ty le": "scale",
    scale: "scale",
    // Cột hãng xe (Lamborghini, Mercedes-Benz…) — đọc lại theo yêu
    // cầu mới: bài viết được nhắc hãng, tên sản phẩm giữ nguyên văn.
    "hang xe": "maker",
    hang: "maker",
    "hang san xuat": "maker",
    "thuong hieu": "maker",
    maker: "maker",
    brand: "maker",
    make: "maker",
    // Cột kích thước THẬT của mẫu — cột riêng, khác tỉ lệ/kích cỡ.
    // Sheet BUSINESS ghi dạng "Kích thước (Dài x Rộng x Cao)" với giá
    // trị kiểu "21 x 8 x 8" (giữ nguyên dạng chữ như trong Sheet).
    "kich thuoc": "size",
    "kich thuoc (cm)": "size",
    "kich thuoc cm": "size",
    "kich thuoc (dai x rong x cao)": "size",
    "kich thuoc dai x rong x cao": "size",
    "chieu dai": "size",
    "chieu dai (cm)": "size",
    mau: "color",
    "mau xe": "color",
    "mau sac": "color",
    color: "color",
    gia: "price",
    "gia ban": "price",
    price: "price",
    "ton kho": "stock",
    stock: "stock",
    "so luong": "stock",
    ton: "stock",
    ship: "ship",
    "van chuyen": "ship",
    shipping: "ship",
    anh: "image_url",
    "hinh anh": "image_url",
    "anh san pham": "image_url",
    hinh: "image_url",
    image: "image_url",
    photo: "image_url",
    // Sheet BUSINESS dùng cột "Link ảnh" — link THƯ MỤC Google Drive.
    "link anh": "image_url",
    "link hinh anh": "image_url",
    "link hinh": "image_url",
    "thu muc anh": "image_url",
    video: "video_url",
    "link video": "video_url",
    "video url": "video_url",
  };
  return table[h] ?? "";
}

// URL của ô media, theo thứ tự ưu tiên: hyperlink của ô → URL trong công
// thức =IMAGE("…") / =HYPERLINK("…") → chính nội dung ô nếu là URL.
export function extractCellUrl(cell: SheetCell | undefined): string {
  if (!cell) return "";
  if (cell.hyperlink && cell.hyperlink.trim()) return cell.hyperlink.trim();
  const formula = cell.userEnteredValue?.formulaValue ?? "";
  const fromFormula = formula.match(/https?:\/\/[^"'\s)]+/);
  if (fromFormula && fromFormula[0]) return fromFormula[0];
  const str = (cell.userEnteredValue?.stringValue ?? "").trim();
  if (/^https?:\/\//i.test(str)) return str;
  const fv = (cell.formattedValue ?? "").trim();
  if (/^https?:\/\//i.test(fv)) return fv;
  return "";
}

// Ô GỘP (merged cells): Sheets API chỉ trả giá trị ở ô GÓC TRÊN-TRÁI
// của vùng gộp; mọi ô còn lại trong vùng gộp về trống. Trong Sheet
// BUSINESS, cột "Hãng xe" được gộp dọc XUYÊN NHIỀU STT (ô "LEXUS" gộp
// chung STT 1 + 2, ô "BMW" gộp chung STT 4 + 5) và nhiều cột khác cũng
// gộp trong nhóm — nếu không điền giá trị của ô góc xuống toàn bộ vùng
// gộp TRƯỚC khi phân tích, các STT nằm dưới vùng gộp (LX570, X5) sẽ bị
// đọc thiếu hãng xe dù Sheet có đủ. Hàm này nhận mảng merges (chỉ số
// tuyệt đối 0-based, end là exclusive) và trả về lưới đã điền: ô trống
// thuộc vùng gộp nhận nguyên ô góc (kể cả hyperlink/công thức).
export function expandMergedCells(
  rawRows: Array<{ values?: SheetCell[] }>,
  merges: SheetMergeRange[],
  startRow: number,
  startColumn: number,
): Array<{ values?: SheetCell[] }> {
  if (merges.length === 0) return rawRows;
  const rows = rawRows.map((r) => ({ values: [...(r.values ?? [])] }));
  const cellHasContent = (c: SheetCell | undefined): boolean =>
    !!c &&
    ((c.formattedValue ?? "").trim() !== "" ||
      !!c.hyperlink ||
      !!c.userEnteredValue);
  for (const m of merges) {
    const sr = m.startRowIndex ?? 0;
    const sc = m.startColumnIndex ?? 0;
    const er = m.endRowIndex ?? sr + 1;
    const ec = m.endColumnIndex ?? sc + 1;
    if (er - sr <= 1 && ec - sc <= 1) continue;
    const anchorRowIdx = sr - startRow;
    const anchorColIdx = sc - startColumn;
    if (anchorRowIdx < 0 || anchorColIdx < 0) continue;
    const anchor = rows[anchorRowIdx]?.values?.[anchorColIdx];
    if (!cellHasContent(anchor) || !anchor) continue;
    for (let ar = sr; ar < er; ar += 1) {
      const ri = ar - startRow;
      // Chỉ điền vào các dòng API đã trả về — không tự nới lưới quá
      // vùng dữ liệu, tránh sinh dòng ma từ vùng gộp kéo dài xuống
      // dưới bảng thật.
      if (ri < 0 || ri >= rows.length) continue;
      const rowObj = rows[ri];
      if (!rowObj) continue;
      for (let ac = sc; ac < ec; ac += 1) {
        const ci = ac - startColumn;
        if (ci < 0) continue;
        if (cellHasContent(rowObj.values?.[ci])) continue;
        rowObj.values[ci] = anchor;
      }
    }
  }
  return rows;
}

export function parseSheetGrid(
  json: SheetGridJson,
  spreadsheetId: string,
): { sheetTitle: string; products: SheetProductInput[] } {
  const sheetTitle = json.properties?.title ?? "";
  const sheet = json.sheets?.[0];
  const data = sheet?.data?.[0];
  const startRow = data?.startRow ?? 0;
  const startColumn = data?.startColumn ?? 0;
  const rows = expandMergedCells(
    data?.rowData ?? [],
    sheet?.merges ?? [],
    startRow,
    startColumn,
  );
  const headerCells = rows[0]?.values ?? [];
  const colIndex = new Map<SheetField, number>();
  headerCells.forEach((cell, i) => {
    const field = mapSheetHeader(cell.formattedValue ?? "");
    if (field && !colIndex.has(field)) colIndex.set(field, i);
  });
  const cellAt = (
    row: { values?: SheetCell[] } | undefined,
    field: SheetField,
  ): SheetCell | undefined => {
    const idx = colIndex.get(field);
    if (idx === undefined) return undefined;
    return row?.values?.[idx];
  };
  const text = (
    row: { values?: SheetCell[] } | undefined,
    field: SheetField,
  ): string => (cellAt(row, field)?.formattedValue ?? "").trim();
  // Cấu trúc Sheet BUSINESS: mỗi STT gồm NHIỀU dòng màu. Dòng đầu của
  // STT (dòng mẹ) có đủ các cột; các dòng con phía dưới chỉ điền Màu
  // và Tồn kho — mọi cột còn lại (Hãng xe, Mẫu, Tỉ lệ, Kích thước,
  // Giá bán, Link ảnh) KẾ THỪA từ dòng mẹ. Tên sản phẩm = "Hãng xe"
  // + "Mẫu", cắt khoảng trắng thừa. Mỗi dòng (mẹ và từng con) phát
  // ra một bản ghi riêng ở tầng này; applySheetImport phân loại các
  // bản ghi theo Hãng + Mẫu + Tỉ lệ + Kích thước + Màu sắc — mỗi
  // màu là một sản phẩm riêng. Sheet cũ một dòng một sản phẩm (có
  // cột tên riêng) vẫn đọc được: dòng nào có STT/Mẫu/Tên thì là dòng
  // mẹ của chính nó.
  interface ParentRow {
    stt: string;
    name: string;
    model: string;
    maker: string;
    scale: string;
    size: string;
    price: string;
    ship: string;
    image_url: string;
    video_url: string;
  }
  let parent: ParentRow | null = null;
  const seenKeys = new Set<string>();
  const products: SheetProductInput[] = [];
  for (let r = 1; r < rows.length && products.length < 500; r += 1) {
    const row = rows[r];
    const stt = text(row, "stt");
    const rowName = text(row, "name");
    const rowModel = text(row, "model");
    const isParentRow = stt !== "" || rowName !== "" || rowModel !== "";
    if (isParentRow) {
      parent = {
        stt,
        name: rowName,
        model: rowModel,
        maker: text(row, "maker"),
        scale: text(row, "scale"),
        size: text(row, "size"),
        price: text(row, "price"),
        ship: text(row, "ship"),
        image_url: extractCellUrl(cellAt(row, "image_url")),
        video_url: extractCellUrl(cellAt(row, "video_url")),
      };
    }
    if (!parent) continue; // dòng con mồ côi trước mọi dòng mẹ — bỏ qua.
    // Giá trị riêng của dòng (nếu có) thắng; trống thì kế thừa dòng mẹ.
    const pick = (own: string, inherited: string): string =>
      own !== "" ? own : inherited;
    const maker = pick(text(row, "maker"), parent.maker);
    const model = pick(rowModel, parent.model);
    const nameCol = pick(rowName, parent.name);
    const name = nameCol
      ? nameCol.replace(/\s+/g, " ").trim()
      : [maker, model]
          .filter((s) => s.trim().length > 0)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
    if (!name) continue;
    const effStt = pick(stt, parent.stt);
    const color = text(row, "color");
    const stockRaw = text(row, "stock");
    const stockParsed = Number.parseInt(stockRaw.replace(/[^\d-]/g, ""), 10);
    const sheetRowNumber = startRow + r + 1;
    // Ở tầng đọc lưới, mỗi dòng vẫn phát ra một bản ghi riêng (kèm
    // màu + tồn kho của dòng đó); việc PHÂN LOẠI thành sản phẩm
    // theo Hãng + Mẫu + Tỉ lệ + Kích thước + Màu sắc diễn ra ở
    // applySheetImport. Khóa dòng ở đây chỉ để khử trùng trong lưới
    // và mang tiền tố ID file cho khóa phân loại.
    const colorKey = color.toLowerCase().replace(/\s+/g, " ").trim();
    let key = effStt
      ? `${spreadsheetId}:stt:${effStt}:${colorKey || `row${sheetRowNumber}`}`
      : `${spreadsheetId}:${sheetRowNumber}`;
    if (seenKeys.has(key)) key = `${key}:r${sheetRowNumber}`;
    seenKeys.add(key);
    products.push({
      stt: effStt,
      sku: buildSku(effStt, name, color),
      name,
      model,
      scale: pick(text(row, "scale"), parent.scale),
      maker,
      size: pick(text(row, "size"), parent.size),
      color,
      price: pick(text(row, "price"), parent.price),
      stock: Number.isNaN(stockParsed) ? 1 : Math.max(0, stockParsed),
      ship: pick(text(row, "ship"), parent.ship),
      image_url: pick(
        extractCellUrl(cellAt(row, "image_url")),
        parent.image_url,
      ),
      video_url: pick(
        extractCellUrl(cellAt(row, "video_url")),
        parent.video_url,
      ),
      external_key: key,
    });
  }
  return { sheetTitle, products };
}

export function friendlySheetError(raw: string): string {
  const s = raw.toLowerCase();
  if (
    s.includes("403") ||
    s.includes("permission_denied") ||
    s.includes("permission denied") ||
    s.includes("forbidden")
  )
    return "Không đọc được file Sheet (lỗi quyền truy cập 403) — file chưa được chia sẻ cho tài khoản Google đã kết nối. Mở file Sheet → Chia sẻ → “Bất kỳ ai có đường link” → Người xem, rồi bấm đồng bộ lại.";
  if (
    s.includes("not_connected") ||
    s.includes("not connected") ||
    s.includes("chưa kết nối") ||
    s.includes("unauthenticated") ||
    s.includes("401")
  )
    return "Không thể kết nối đến Google Sheets (hoặc file chưa được chia sẻ công khai). Hãy mở file Sheet → Chia sẻ → chọn “Bất kỳ ai có đường link” (Quyền Người xem) rồi bấm đồng bộ lại.";
  if (s.includes("404") || s.includes("not_found") || s.includes("not found"))
    return "Không tìm thấy file Sheet — kiểm tra lại link của nguồn Sheet đã lưu.";
  const tail = raw.trim().slice(0, 300);
  return tail
    ? `Đọc Sheet thất bại: ${tail}`
    : "Đọc Sheet thất bại không rõ lý do — thử bấm đồng bộ lại.";
}
