import type { Ctx } from "@hatch/space-sdk";
import { eq } from "drizzle-orm";
import * as schema from "../../schema";
import { loadSheetSources, updateSourceSyncState, setSetting } from "../settings";
import { buildSku, normalizeSheetImageUrl } from "../drive";

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