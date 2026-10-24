import { buildSku } from "../drive";
import type { SheetProductInput } from "./sheetImporter";

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
