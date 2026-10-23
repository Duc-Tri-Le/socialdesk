import { z, type Ctx } from "@hatch/space-sdk";
import { eq } from "drizzle-orm";
import * as schema from "../schema";

export function fmtVnd(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "₫";
}

// Giá in trong bài đăng luôn ở dạng CHE theo yêu cầu của shop: giữ chữ
// số đầu tiên, các chữ số còn lại thành x — 300 (nghìn) → "3xx.xxxđ",
// 280 → "2xx.xxxđ", 1.250.000 → "1.xxx.xxxđ". Giá trị ≤ 3 chữ số được
// hiểu là đơn vị nghìn đồng như cách shop ghi trong Sheet.
export function maskPrice(price: string): string {
  const raw = price.trim();
  if (!raw) return "";
  const digits = raw.replace(/[^\d]/g, "").replace(/^0+/, "");
  if (!digits) return raw;
  let n = digits;
  if (n.length <= 3) n = `${n}000`;
  const groups: string[] = [];
  let rest = n;
  while (rest.length > 3) {
    groups.unshift("xxx");
    rest = rest.slice(0, -3);
  }
  const first =
    rest.length > 1 ? rest.charAt(0) + "x".repeat(rest.length - 1) : rest;
  return [first, ...groups].join(".") + "đ";
}

// Thời gian khuyến mãi của bài đăng: tính từ ngày đăng (ngày soạn/viết
// lại bài) cộng thêm 7 ngày, hiển thị dd/mm/yyyy theo giờ VN.
export function vnDateLabel(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

export function promoLine(from: Date = new Date()): string {
  const end = new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000);
  return `Thời gian khuyến mãi: ${vnDateLabel(from)} – ${vnDateLabel(end)}`;
}

// Dòng ưu đãi trong khối thông tin sản phẩm: sau dòng giá luôn có
// một dòng Ưu đãi riêng (chỉ nằm trong khối thông tin).
export function promoOfferLine(): string {
  return "Ưu đãi: Giá ưu đãi trong đợt khuyến mãi, kèm hộp + đế mica trưng bày";
}

// Dòng "Chức năng" trong mục Thông tin sản phẩm: khả năng mở theo
// đúng quy tắc tỉ lệ shop đã xác nhận; tỉ lệ chưa có quy tắc hoặc
// chưa rõ tỉ lệ thì ghi "Cần xác nhận" (và chặn duyệt).
export function functionLine(f: DraftFields): string {
  if (opensFully(f.scale)) return "Mở được nắp capo, cửa và cốp";
  if (isConfirmedSealedScale(f.scale))
    return "Bản sealed, thân xe liền khối — không mở nắp capo, cửa, cốp";
  return "Cần xác nhận";
}

export function vnDateKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function vnStamp(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}${get("month")}${get("day")}-${get("hour")}${get("minute")}${get("second")}`;
}

export function findPlaceholders(text: string): string[] {
  const found: string[] = text.match(/\[[^\]]+\]/g) ?? [];
  // Thông tin sản phẩm nào chưa có thì ghi "Cần xác nhận" trong mục
  // Thông tin sản phẩm — và mục đó vẫn CHẶN duyệt như placeholder
  // cho tới khi người bán điền đủ.
  for (const line of text.split("\n")) {
    if (!line.includes("Cần xác nhận")) continue;
    // Dòng thông tin có thể bắt đầu bằng "- " hoặc emoji (📌/💰…)
    // — gỡ phần đầu đó rồi lấy nhãn trước dấu ":".
    const label = line.replace(/^[^\p{L}\p{N}]+/u, "");
    const m = label.match(/^([^:]+):\s*Cần xác nhận/);
    found.push(m && m[1] ? `[Cần xác nhận: ${m[1].trim()}]` : "Cần xác nhận");
  }
  return [...new Set(found)].sort();
}

export interface DraftFields {
  stt: string;
  productName: string;
  scale: string;
  maker: string;
  color: string;
  price: string;
  stock: string;
  ship: string;
  imageUrl: string;
  videoUrl: string;
  sellingPoint: string;
  sizeCm: string;
}

// Bỏ dấu tiếng Việt + bỏ ký tự không phải chữ/số để dựng slug cho
// hashtag (ví dụ "LEXUS LX600" → "lexuslx600", "Đen" → "den",
// "Mercedes-AMG" → "mercedesamg").
export function tagSlug(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "");
}

// Bộ hashtag của bài: các tag LIÊN QUAN tới chính bài viết, sinh
// riêng theo từng xe. #DucGarage luôn ĐỨNG ĐẦU (đúng bài mẫu của
// shop), rồi tới: (1) tag cộng đồng diecast/sưu tầm Việt + Anh,
// (2) tag đúng tỉ lệ của xe (xe 1:32 tuyệt đối không gắn tag 1:18),
// (3) tag từ tên sản phẩm giữ nguyên văn (slug gộp cả tên + từng từ
// khóa có chữ/số như lx600, 911, gtr), (4) tag hãng xe, (5) tag màu
// xe, (6) tag khuyến mãi vì bài đang trong đợt khuyến mãi. Thứ tự
// cố định, khử trùng, tối đa 25 tag.
export function hashtagsForFields(f: DraftFields): string {
  const tags: string[] = ["#DucGarage"];
  const push = (t: string) => {
    const slug = tagSlug(t);
    if (slug.length < 2 || slug === "ducgarage") return;
    const tag = `#${slug}`;
    if (!tags.includes(tag)) tags.push(tag);
  };
  // (1) Cộng đồng / chủ đề chung của bài bán mô hình.
  for (const t of [
    "mohinhxe",
    "diecast",
    "mohinh",
    "mohinhoto",
    "scalemodel",
    "diecastvietnam",
    "suutam",
    "diecastcollector",
    "mohinhdiecast",
    "xemohinh",
    "diecastmodel",
    "mohinhtrangtri",
  ])
    push(t);
  // (2) Tỉ lệ — chỉ đúng tỉ lệ của xe này.
  const digits = f.scale.replace(/[^\d]/g, "");
  if (digits) {
    push(`mohinh${digits}`);
    push(`xe${digits}`);
    push(`diecast${digits}`);
    push(`scale${digits}`);
  }
  // (3)+(4) Tên sản phẩm + hãng xe: slug gộp và từng từ khóa riêng.
  const nameSlug = tagSlug(f.productName);
  if (nameSlug) push(nameSlug);
  const makerSlug = tagSlug(f.maker);
  if (makerSlug && makerSlug !== nameSlug) push(makerSlug);
  const tokens = `${f.productName} ${f.maker}`
    .split(/[^A-Za-zÀ-ỹ0-9]+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 0);
  for (const w of tokens) {
    const slug = tagSlug(w);
    // Từ khóa riêng chỉ lấy từ đủ dài hoặc có chứa số (mã dòng xe
    // như LX600, 911, X5) — bỏ các từ nối ngắn vô nghĩa.
    if (slug.length >= 3 || /\d/.test(slug)) push(slug);
  }
  // (5) Màu xe.
  const colorSlug = tagSlug(f.color);
  if (colorSlug) push(`mau${colorSlug}`);
  // (6) Khuyến mãi — bài đang chạy ưu đãi thì tag cũng nói rõ.
  push("khuyenmai");
  push("uudai");
  push("giatot");
  return tags.slice(0, 25).join(" ");
}

export function stockText(stock: string): string {
  const n = Number.parseInt(stock, 10);
  if (Number.isNaN(n)) return `còn ${stock} chiếc`;
  if (n === 1) return "chỉ còn đúng 1 chiếc";
  if (n <= 0) return "đã hết hàng";
  return `còn ${n} chiếc`;
}

// Các hãng xe thật phổ biến: khi bài đã có hãng xe, validator dùng
// danh sách này để chặn bài AI nhắc sang một hãng xe KHÁC với hãng
// đã cho (viết sai hãng là sai dữ kiện, phải loại).
export const OTHER_CAR_BRANDS = [
  "Lamborghini",
  "Mercedes",
  "Ferrari",
  "Porsche",
  "BMW",
  "Audi",
  "Toyota",
  "Honda",
  "Ford",
  "Nissan",
  "Mazda",
  "Hyundai",
  "Kia",
  "VinFast",
  "Bentley",
  "Rolls-Royce",
  "McLaren",
  "Bugatti",
  "Maserati",
  "Lexus",
  "Volkswagen",
  "Chevrolet",
  "Land Rover",
  "Range Rover",
  "Mini",
  "Peugeot",
  "Volvo",
  "Subaru",
  "Mitsubishi",
];

// Các HỌ hãng cùng một nhà: tên gọi trong cùng họ KHÔNG tính là
// "hãng khác". Land Rover và Range Rover là cùng một nhà — tên sản
// phẩm "LAND ROVER Range Rover SV" buộc phải chứa cả hai tên, nên
// nếu coi "Range Rover" là hãng lạ thì MỌI bài AI cho xe này đều bị
// loại (điều kiện bắt buộc chứa tên sản phẩm và điều kiện cấm nhắc
// "Range Rover" triệt nhau) và bài luôn rơi về mẫu dự phòng cố
// định — bấm viết lại bao nhiêu lần cũng ra y hệt.
export const BRAND_FAMILIES: string[][] = [["Land Rover", "Range Rover"]];

// Một hãng được coi là hãng CỦA CHÍNH XE khi: nó nằm trong hãng đã
// khai báo, nó nằm ngay trong tên sản phẩm (tên sản phẩm bắt buộc
// xuất hiện nguyên văn nên mọi tên hãng trong đó đều hợp lệ), hoặc
// nó cùng họ với một tên hãng thỏa hai điều trên.
export function isOwnBrand(brand: string, f: DraftFields): boolean {
  const identity = `${f.maker} ${f.productName}`.toLowerCase();
  const family = BRAND_FAMILIES.find((fam) =>
    fam.some((m) => m.toLowerCase() === brand.toLowerCase()),
  );
  const names = family ?? [brand];
  return names.some((n) => identity.includes(n.toLowerCase()));
}

// Tách ô "điểm nhấn" thành từng chi tiết riêng cho mục ĐIỂM NỔI BẬT:
// mỗi dòng là một ý; một đoạn văn không xuống dòng thì tách theo
// dấu chấm phẩy. Gạch đầu dòng / ký hiệu người dùng lỡ gõ sẵn được
// gỡ để không trùng.
export function detailBullets(sellingPoint: string): string[] {
  const raw = sellingPoint
    .split(/\n|;/)
    .map((s) =>
      s
        .replace(/^\s*(?:✅|✔|[-*•·])\s*/u, "")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter((s) => s.length > 0);
  return [...new Set(raw)];
}

export function cleanDetailLine(s: string): string {
  return s
    .replace(/^\s*(?:✅|✔|[-*•·])\s*/u, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Quy tắc cấu tạo theo tỉ lệ do người bán XÁC NHẬN: xe tỉ lệ 1:18
// và 1:24 mở được cửa, cốp và nắp capo như nhau; xe tỉ lệ 1:32 là
// bản sealed — thân xe liền khối, KHÔNG mở cửa/cốp/capo. Đây là dữ
// kiện của shop, không phải suy đoán của AI: generator khẳng định mở
// được cho 1:18/1:24 và không bao giờ claim mở cho 1:32.
export function scaleDenominator(scale: string): number | null {
  const m = scale.replace(/\s/g, "").match(/^1[:/](\d+)$/);
  if (!m) return null;
  const n = Number.parseInt(m[1] ?? "", 10);
  return Number.isNaN(n) ? null : n;
}

export function opensFully(scale: string): boolean {
  const d = scaleDenominator(scale);
  return d === 18 || d === 24;
}

// Tỉ lệ đã được người bán XÁC NHẬN là bản sealed: chỉ 1:32. Các tỉ
// lệ chưa có quy tắc của shop (không phải 1:18/1:24/1:32) thì bài
// viết thận trọng: không claim mở bộ phận nào, cũng không khẳng
// định là sealed.
export function isConfirmedSealedScale(scale: string): boolean {
  return scaleDenominator(scale) === 32;
}

export function isCautiousScale(scale: string): boolean {
  const d = scaleDenominator(scale);
  return d !== null && !opensFully(scale) && d !== 32;
}

// Một dòng chi tiết có đang khẳng định một bộ phận mở được không
// (không tính câu phủ định kiểu "không mở ...").
export function claimsOpening(line: string): boolean {
  if (/không mở/i.test(line)) return false;
  return /(mở\s+(được|nắp|cửa|cốp|capo)|cửa.{0,12}mở|cốp.{0,12}mở|capo.{0,12}mở)/i.test(
    line,
  );
}

// ---- Phong cách ĐỨC GARAGE: các mảnh ghép của bài mẫu -------------

// Emoji chủ đề mở đầu tiêu đề, chọn theo tính chất dòng xe như các
// bài mẫu (👑 xe sang, 🔥/🏎️ siêu xe–thể thao, 🔴 Ferrari, 🏁 BMW M,
// 💪 SUV địa hình, 🖤 mặc định sang trọng).
export function titleEmojiFor(f: DraftFields): string {
  const n = `${f.productName} ${f.maker}`.toUpperCase();
  if (/MAYBACH|ROLLS|BENTLEY|S680|S-CLASS/.test(n)) return "👑";
  if (/FERRARI/.test(n)) return "🔴";
  if (/LAMBORGHINI/.test(n)) return "🔥";
  if (/PORSCHE/.test(n)) return "🏎️";
  if (/BMW/.test(n) && /\bM[2-8]\b|M PERFORMANCE/.test(n)) return "🏁";
  if (/LAND CRUISER|PRADO|OFF-?ROAD|PICKUP|RAPTOR/.test(n)) return "💪";
  return "🖤";
}

// Tagline IN HOA sau tên xe ở tiêu đề, theo đúng giọng các bài mẫu.
export function taglineFor(f: DraftFields): string {
  const n = `${f.productName} ${f.maker}`.toUpperCase();
  if (/MAYBACH|S680/.test(n)) return "ĐẲNG CẤP XE SANG THU NHỎ";
  if (/ROLLS|CULLINAN/.test(n))
    return "KHÍ CHẤT SUV SIÊU SANG TRONG TẦM TAY";
  if (/LAMBORGHINI/.test(n)) return "ĐAM MÊ TỐC ĐỘ, PHONG CÁCH KHÁC BIỆT";
  if (/FERRARI/.test(n)) return "SẮC MÀU CỦA ĐAM MÊ SIÊU XE";
  if (/BMW/.test(n)) return "CHẤT THỂ THAO ĐỨC, CÁ TÍNH RIÊNG CỦA ANH EM";
  if (/LAND CRUISER/.test(n)) return "BẢN LĨNH SUV, PHONG THÁI MẠNH MẼ";
  if (/PORSCHE/.test(n)) return "HUYỀN THOẠI THỂ THAO TRONG TẦM TAY";
  if (/RANGE ROVER/.test(n)) return "KHÍ CHẤT SUV SANG TRONG TẦM TAY";
  if (/LEXUS|LX600|LX570/.test(n)) return "KHÍ CHẤT SUV, ĐẲNG CẤP TRƯNG BÀY";
  if (/CADILLAC/.test(n)) return "PHONG THÁI SUV MỸ ĐẦY CUỐN HÚT";
  return "ĐIỂM NHẤN SƯU TẦM CHO ANH EM MÊ XE";
}

// Dòng xe = tên sản phẩm bỏ phần hãng xe ở đầu (tên sản phẩm vốn là
// "Hãng xe + Mẫu"). Không tách được thì dùng nguyên tên sản phẩm.
export function modelLineFor(f: DraftFields): string {
  const name = f.productName.trim();
  const maker = f.maker.trim();
  if (
    maker &&
    name.toLowerCase().startsWith(maker.toLowerCase() + " ")
  )
    return name.slice(maker.length).trim() || name;
  return name;
}

// Hai đoạn mở đầu gợi cảm xúc của mẫu dự phòng, theo giọng bài mẫu:
// mở bằng khí chất dòng xe + gọi "anh em", rồi giá trị trưng bày và
// quà tặng. Chỉ dùng dữ kiện đã có (tên, tỉ lệ, màu) — không bịa
// chi tiết riêng của từng xe.
export function introParagraphsFor(f: DraftFields): string[] {
  const model = modelLineFor(f);
  const scalePhrase = f.scale
    ? `Tỷ lệ ${f.scale}`
    : "Phiên bản thu nhỏ này";
  const color = f.color ? ` màu ${f.color}` : "";
  return [
    `Không cần sở hữu ${model} ngoài đời, anh em vẫn có thể mang khí chất của dòng xe này về ngay góc trưng bày của mình!`,
    `${f.productName}${color} gây ấn tượng với vóc dáng bề thế, những đường nét đặc trưng và phong thái riêng khó lẫn. ${scalePhrase} giúp mẫu xe trở nên nổi bật khi trưng bày trên bàn làm việc, trong tủ kính hoặc tại góc garage riêng — cũng là lựa chọn quà tặng ý nghĩa cho anh em đam mê xe.`,
  ];
}

// Các dòng ✅ của mục ĐIỂM NỔI BẬT ở mẫu dự phòng, suy ra từ quy tắc
// tỉ lệ đã xác nhận — mẫu tĩnh không bịa chi tiết riêng của từng xe,
// chỉ nêu đúng cấu tạo theo tỉ lệ và các nhóm thiết kế đặc trưng
// chung như bài mẫu (ngoại thất, lưới tản nhiệt, nội thất, mâm,
// chức năng mở theo tỉ lệ).
export function scaleDetailLines(f: DraftFields): string[] {
  const opening = opensFully(f.scale)
    ? "Mở được nắp capo, cửa và cốp — khám phá khoang máy và nội thất như xe thật."
    : isConfirmedSealedScale(f.scale)
      ? "Bản sealed thân xe liền khối, không mở capo/cửa/cốp — đường nét và màu sơn tái hiện sắc nét."
      : "Các chi tiết thân xe được tạo hình liền mạch, đúng phong cách của dòng xe.";
  return [
    "Thiết kế ngoại thất tái hiện đúng phong cách đặc trưng của dòng xe.",
    "Lưới tản nhiệt và cụm đèn tạo điểm nhấn cho phần đầu xe.",
    "Nội thất được mô phỏng tỉ mỉ, đúng chất của dòng xe.",
    "Bộ mâm và tỷ lệ thân xe cân đối, chân thực.",
    opening,
  ];
}

// Kích thước trong bài luôn ghi dạng ~ theo yêu cầu. Sheet BUSINESS
// ghi kích thước dạng "Dài x Rộng x Cao" (ví dụ "21 x 8 x 8") — giữ
// nguyên ba số, thêm đơn vị cm: "~21 x 8 x 8 cm". Một số đo đơn lẻ
// giữ dạng gọn "~25cm" như trước.
export function sizeLine(sizeCm: string): string {
  const s = sizeCm.trim().replace(/^~+\s*/, "").replace(/\s+/g, " ");
  if (!s) return "";
  if (/cm/i.test(s)) return `~${s}`;
  return /\s/.test(s) ? `~${s} cm` : `~${s}cm`;
}

// Mẫu dự phòng khi người viết AI không khả dụng: bài viết đúng
// cấu trúc ĐỨC GARAGE như bài mẫu — tiêu đề emoji + tên nguyên văn
// + tagline IN HOA, 2 đoạn mở đầu gợi cảm xúc, mục ĐIỂM NỔI BẬT với
// các dòng ✅, mục 📌 THÔNG TIN SẢN PHẨM đầy đủ rồi 💰🎁⏰📦🚚, CTA
// inbox ĐỨC GARAGE và hashtag (#DucGarage đứng đầu). Các dòng ✅ ở
// mẫu dự phòng đến từ ô chi tiết người bán tự ghi đè (nếu có);
// không có ghi đè thì mẫu tĩnh dùng các dòng thiết kế theo tỉ lệ do
// shop xác nhận (scaleDetailLines) — không tự nghĩ chi tiết riêng
// của từng xe. Trường hợp thường, chính AI writer tự soạn toàn bộ
// bài theo cùng cấu trúc này (xem writeProfessionalCopy) và người
// bán chỉ xem lại khi duyệt.
export function buildCaption(f: DraftFields): { caption: string } {
  const priceLine = f.price ? maskPrice(f.price) : "[GIÁ]";
  const scaleLine = f.scale || "[TỈ LỆ]";
  // Vận chuyển mặc định COD (Sheet mới không có cột vận chuyển —
  // người bán quy định mọi sản phẩm đều giao COD).
  const shipLine = f.ship || "COD";
  const tags = hashtagsForFields(f);
  // Dòng người bán tự ghi đè có nhắc kẹp phanh thì bỏ hẳn dòng đó —
  // bài không có chi tiết kẹp phanh. Không có ghi đè thì dùng các
  // dòng thiết kế theo tỉ lệ đã xác nhận (1:18 và 1:24 mở
  // cửa/cốp/capo, 1:32 sealed).
  const overrideBullets = detailBullets(f.sellingPoint).filter(
    (b) => !/kẹp phanh/i.test(b),
  );
  const bullets =
    overrideBullets.length > 0 ? overrideBullets : scaleDetailLines(f);

  // Tiêu đề: emoji chủ đề + tên sản phẩm giữ nguyên văn + tỉ lệ
  // (nếu tên chưa chứa tỉ lệ) + tagline IN HOA — đúng bài mẫu.
  const nameWithScale = f.productName
    .toLowerCase()
    .includes(scaleLine.toLowerCase())
    ? f.productName
    : `${f.productName} ${scaleLine}`;
  const title = `${titleEmojiFor(f)} ${nameWithScale} – ${taglineFor(f)}`;
  const size = sizeLine(f.sizeCm);
  const lines: string[] = [
    title,
    "",
    ...introParagraphsFor(f).flatMap((p) => [p, ""]).slice(0, -1),
    "",
    "✨ ĐIỂM NỔI BẬT",
    "",
    ...bullets.map((b) => `✅ ${b}`),
    "",
    "📌 THÔNG TIN SẢN PHẨM",
    `- Hãng xe: ${f.maker || "Cần xác nhận"}`,
    `- Dòng xe: ${modelLineFor(f)}`,
    `- Tỷ lệ: ${f.scale || "Cần xác nhận"}`,
    `- Màu sắc: ${f.color || "Cần xác nhận"}`,
    "- Chất liệu: Die-cast",
    `- Kích thước: ${size || "Cần xác nhận"}`,
    `- Chức năng: ${functionLine(f)}`,
    "- Phụ kiện đi kèm: Hộp + đế mica trưng bày",
    `💰 Giá bán: ${priceLine} (giá khuyến mãi)`,
    `🎁 ${promoOfferLine()}`,
    `⏰ ${promoLine()}`,
    `📦 Tình trạng: ${stockText(f.stock)}`,
    `🚚 Vận chuyển: ${shipLine}`,
    "",
    "📩 Inbox ĐỨC GARAGE để xem ảnh thực tế, video chi tiết và nhận báo giá nhé!",
    "",
    tags,
  ];
  // Chỉ một bài đăng chính cho Facebook (nhóm + fanpage) — không kèm
  // bản ngắn TikTok/Reels theo yêu cầu của người dùng. Mẫu dự phòng
  // tự nó không sinh "[màu]", nhưng dòng chi tiết người bán tự ghi
  // đè có thể chứa — quét gỡ để bài xuất ra luôn sạch placeholder màu.
  return { caption: stripColorPlaceholders(lines.join("\n"), f.color) };
}

export const professionalCopySchema = z.object({
  caption: z.string().min(40).max(3200),
});

// Các dòng chi tiết của bài: những dòng ✅ nằm trong mục "ĐIỂM
// NỔI BẬT" (từ dòng tiêu đề mục — có thể có emoji dẫn như ✨/🔥 —
// tới trước mục 📌 THÔNG TIN SẢN PHẨM). Validator dùng để kiểm số
// lượng chi tiết và quy tắc mở theo tỉ lệ.
export function detailLinesOf(caption: string): string[] {
  const lines = caption.split("\n");
  const start = lines.findIndex((l) => /ĐIỂM NỔI BẬT/i.test(l));
  if (start < 0) return [];
  const out: string[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const t = (lines[i] ?? "").trim();
    if (/THÔNG TIN SẢN PHẨM/i.test(t)) break;
    if (t === "") continue;
    if (!t.startsWith("✅") && !t.startsWith("-")) {
      if (out.length > 0) break;
      continue;
    }
    const cleaned = cleanDetailLine(t.replace(/^-\s*/u, ""));
    if (cleaned) out.push(cleaned);
  }
  return out;
}

// Gỡ placeholder màu khỏi caption: người bán yêu cầu bài xuất ra
// TUYỆT ĐỐI không còn chuỗi "[màu]" (hay biến thể [mau]/[color]/
// [màu sắc]...) ở bất cứ đâu. AI lỡ viết kiểu "tông [màu]" /
// "nội thất [màu]" thì gỡ cả cụm dẫn ("tông", "gam", "màu" đứng
// ngay trước placeholder) để câu không bị cụt nghĩa, rồi dọn
// khoảng trắng/dấu câu lơ lửng do việc gỡ để lại. Chỉ chạm vào
// placeholder LIÊN QUAN TỚI MÀU — [GIÁ]/[TỈ LỆ] là placeholder
// nghiệp vụ có chủ đích ở mục thông tin, giữ nguyên.
//
// Riêng dòng "- Màu sắc: [màu]" ở mục Thông tin sản phẩm: đó là
// màu NGOẠI THẤT của chính xe — đã biết màu của bản nháp thì điền
// đúng màu đó (knownColor), chưa biết thì ghi "Cần xác nhận" theo
// đúng quy ước mục thông tin (vẫn chặn duyệt cho tới khi điền đủ)
// thay vì để lại placeholder hay dòng cụt "- Màu sắc:".
export function stripColorPlaceholders(caption: string, knownColor = ""): string {
  if (!/\[[^\]]*(?:màu|mau|color)[^\]]*\]/i.test(caption)) return caption;
  const cleaned = caption
    // Dòng Màu sắc chỉ chứa placeholder màu → điền màu đã biết
    // của bản nháp, chưa biết thì "Cần xác nhận".
    .replace(
      /^(\s*-\s*Màu sắc\s*:\s*)\[[^\]]*(?:màu|mau|color)[^\]]*\]\s*$/gim,
      (_m, label: string) =>
        `${label}${knownColor.trim() || "Cần xác nhận"}`,
    )
    // Cụm dẫn + placeholder: "tông [màu]", "gam màu [màu]",
    // "màu [màu]"… — bỏ cả cụm để khỏi còn từ lơ lửng.
    .replace(
      /(?:tông màu|tông|gam màu|gam|màu sắc|màu)\s*\[[^\]]*(?:màu|mau|color)[^\]]*\]/gi,
      "",
    )
    // Placeholder màu đứng một mình ở bất kỳ vị trí nào còn lại.
    .replace(/\[[^\]]*(?:màu|mau|color)[^\]]*\]/gi, "");
  return cleaned
    .split("\n")
    .map((line) =>
      line
        .replace(/[ \t]{2,}/g, " ")
        .replace(/\s+([,.;:!?…])/g, "$1")
        .replace(/\(\s*\)/g, "")
        .replace(/\s+—\s*$/u, "")
        .trimEnd(),
    )
    // Dòng chi tiết bị gỡ rỗng hẳn (chỉ còn "✅" / "-") thì bỏ cả
    // dòng — để lại dòng trống trơ icon còn tệ hơn placeholder.
    // (Dòng trắng phân đoạn vẫn giữ nguyên.)
    .filter((line) => !/^\s*(?:✅|-)\s*$/.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

// Caption còn chứa placeholder màu không (kiểm tra nhanh dùng cho
// khâu dọn bản nháp cũ và các chốt chặn trước khi lưu/duyệt/xuất
// gói — khớp đúng họ placeholder mà stripColorPlaceholders gỡ).
export function hasColorPlaceholder(text: string): boolean {
  return /\[[^\]]*(?:màu|mau|color)[^\]]*\]/i.test(text);
}

// Kiểm tra bài AI viết có bám đúng dữ kiện mua bán không; sai là bỏ,
// dùng mẫu dự phòng. Dữ kiện mua bán nào chưa có thì phải giữ ở dạng
// [ngoặc] hoặc "Cần xác nhận" để bước duyệt chặn lại. Riêng các dòng
// chi tiết thiết kế trong mục ĐIỂM NỔI BẬT: AI writer TỰ soạn theo mẫu xe
// thật (người bán không phải gõ), nên validator chỉ kiểm số
// lượng/cấu trúc tối thiểu và QUY TẮC MỞ THEO TỈ LỆ người bán đã xác
// nhận (1:18 và 1:24 phải khẳng định mở cửa/cốp; 1:32 sealed không
// được claim mở), rồi để người bán đối chiếu với ảnh/video thật ở
// bước duyệt. Nếu người bán đã tự ghi đè ở ô chi tiết, các dòng đó là
// chuẩn bắt buộc: phải xuất hiện nguyên văn trong mục ĐIỂM NỔI BẬT và
// mục đó không được có dòng nào ngoài chúng.
export function validateAiCopy(
  raw: { caption: string },
  f: DraftFields,
): { caption: string } | null {
  let caption = raw.caption.trim();
  // Caption tuyệt đối không in mã STT.
  caption = caption.replace(/STT\s*\S+/gi, "").trim();
  // Bài xuất ra không được còn "[màu]": gỡ placeholder màu (kèm
  // cụm dẫn kiểu "tông [màu]") trước mọi bước kiểm tra khác.
  caption = stripColorPlaceholders(caption, f.color);
  if (caption.length < 40) return null;
  // Cấu trúc ĐỨC GARAGE bắt buộc: phải có mục ĐIỂM NỔI BẬT, mục
  // THÔNG TIN SẢN PHẨM và giọng gọi "anh em" trong phần mở đầu —
  // thiếu là loại, dùng mẫu dự phòng vốn luôn đúng cấu trúc.
  if (!/ĐIỂM NỔI BẬT/i.test(caption)) return null;
  if (!/THÔNG TIN SẢN PHẨM/i.test(caption)) return null;
  if (!/anh em/i.test(caption)) return null;
  // Giá chỉ in dạng che: nếu giá thật lọt vào bài thì thay bằng dạng che.
  const masked = maskPrice(f.price);
  if (f.price && masked && masked !== f.price && caption.includes(f.price))
    caption = caption.split(f.price).join(masked);
  // Bỏ hẳn mọi dòng chi tiết về kẹp phanh và mọi dòng điểm nhấn riêng
  // về tông màu ("Tông … nổi bật") — cả hai đều không có trong bài.
  caption = caption
    .split("\n")
    .filter((l) => !/kẹp phanh/i.test(l))
    .filter((l) => !/^\s*(?:-\s*)?Tông\s.+nổi bật/i.test(l))
    .join("\n")
    .trim();
  // Tên sản phẩm phải xuất hiện nguyên văn trong bài (so khớp không
  // phân biệt hoa/thường) — AI viết tắt, đổi thứ tự từ hay thay bằng
  // tên gọi khác là loại, dùng mẫu dự phòng vốn luôn in đúng tên.
  if (!caption.toLowerCase().includes(f.productName.toLowerCase()))
    return null;
  // Đã có hãng xe thì bài không được nhắc sang hãng xe khác —
  // trừ tên hãng nằm ngay trong tên sản phẩm và tên cùng họ hãng
  // (xem isOwnBrand: Land Rover / Range Rover là một nhà).
  if (f.maker) {
    const otherBrand = OTHER_CAR_BRANDS.find(
      (b) =>
        !isOwnBrand(b, f) && caption.toLowerCase().includes(b.toLowerCase()),
    );
    if (otherBrand) return null;
  }
  const overrideBullets = detailBullets(f.sellingPoint).filter(
    (b) => !/kẹp phanh/i.test(b),
  );
  const aiBullets = detailLinesOf(caption);
  if (overrideBullets.length > 0) {
    // Chế độ ghi đè thủ công: dùng đúng dòng người bán tự ghi.
    for (const b of overrideBullets) {
      if (!caption.includes(b)) return null;
    }
    if (aiBullets.some((b) => !overrideBullets.includes(b))) return null;
  } else {
    // Chế độ mặc định AI tự viết chi tiết: mục ĐIỂM NỔI BẬT phải có ít
    // nhất 3 dòng chi tiết và không phình quá 7 dòng.
    if (aiBullets.length < 3 || aiBullets.length > 7) return null;
    // Quy tắc tỉ lệ do người bán xác nhận: 1:18 và 1:24 PHẢI có
    // dòng khẳng định mở được cửa/cốp (thiếu là loại bài); mọi tỉ
    // lệ đã biết khác (1:32 sealed, tỉ lệ chưa có quy tắc) TUYỆT
    // ĐỐI không được claim mở bộ phận nào (có là loại bài). Cả hai
    // trường hợp đều rơi về mẫu dự phòng vốn viết đúng cấu tạo
    // theo tỉ lệ.
    if (opensFully(f.scale) && !aiBullets.some((b) => claimsOpening(b)))
      return null;
    if (
      scaleDenominator(f.scale) !== null &&
      !opensFully(f.scale) &&
      aiBullets.some((b) => claimsOpening(b))
    )
      return null;
  }
  if (f.price) {
    // Bài phải in giá ở dạng che (3xx.xxxđ) — giá thật nguyên văn là sai.
    if (!masked || !caption.includes(masked)) return null;
  } else if (!caption.includes("[GIÁ]")) {
    caption = caption.replace(
      /Giá[^:\n]*:[^\n]*/i,
      "Giá bán: [GIÁ] (giá khuyến mãi)",
    );
    if (!caption.includes("[GIÁ]"))
      caption = `${caption}\n- Giá bán: [GIÁ] (giá khuyến mãi)`;
  }
  // Vận chuyển mặc định COD — không còn placeholder [SHIP]: AI lỡ
  // để dạng chờ điền thì thay bằng giá trị thật (f.ship hoặc COD).
  if (caption.includes("[SHIP"))
    caption = caption.replace(/\[[^\]]*SHIP[^\]]*\]/gi, f.ship || "COD");
  // Kích thước: có giá trị thì giá trị dạng ~ phải có mặt trong bài
  // (nằm ở mục Kích thước của Thông tin sản phẩm).
  const size = sizeLine(f.sizeCm);
  if (size && !caption.includes(size))
    caption = `${caption}\n- Kích thước: ${size}`;
  // Phụ kiện: mọi xe đều kèm hộp + đế mica — thiếu thì bổ sung đúng
  // mục "Phụ kiện đi kèm" của Thông tin sản phẩm.
  if (!/đế mica/i.test(caption))
    caption = `${caption}\n- Phụ kiện đi kèm: Hộp + đế mica trưng bày`;
  // Khuyến mãi: bỏ mọi dòng Ưu đãi / Thời gian khuyến mãi AI tự viết
  // (có thể có emoji 🎁/⏰ hoặc gạch đầu dòng ở đầu), rồi chèn dòng
  // chuẩn — thời gian từ ngày đăng cộng thêm 7 ngày — vào khối
  // thông tin, ngay sau dòng giá. Khuyến mãi chỉ nằm trong khối
  // thông tin, không chèn ở nơi nào khác trong bài (không banner ở
  // dòng 2).
  caption = caption
    .split("\n")
    .filter((l) => !/^[^\p{L}]*(Ưu đãi|Thời gian khuyến mãi)\s*:/u.test(l))
    .join("\n")
    .trim();
  const capLines = caption.split("\n");
  const priceLineIdx = capLines.findIndex((l) => /Giá bán\s*:/.test(l));
  if (priceLineIdx >= 0) {
    capLines.splice(
      priceLineIdx + 1,
      0,
      `🎁 ${promoOfferLine()}`,
      `⏰ ${promoLine()}`,
    );
    caption = capLines.join("\n");
  } else {
    caption = `${caption}\n🎁 ${promoOfferLine()}\n⏰ ${promoLine()}`;
  }
  // CTA cuối bài: bắt buộc là lời kêu gọi inbox ĐỨC GARAGE như bài
  // mẫu — thiếu thì bổ sung trước phần hashtag.
  if (!/Inbox ĐỨC GARAGE/i.test(caption))
    caption = `${caption}\n\n📩 Inbox ĐỨC GARAGE để xem ảnh thực tế, video chi tiết và nhận báo giá nhé!`;
  // Hashtag: gỡ mọi dòng chỉ gồm hashtag mà AI tự viết (thường ít
  // và chung chung), rồi gắn bộ tag sinh riêng theo xe này ở cuối
  // bài (gồm tag theo đúng tỉ lệ của xe).
  caption = caption
    .split("\n")
    .filter((l) => !/^(\s*#\S+\s*)+$/.test(l.trim()) || l.trim() === "")
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  caption = `${caption}\n\n${hashtagsForFields(f)}`;
  // Bảo hiểm cuối trước khi bài được lưu: (1) chuỗi "[màu]" không
  // được tồn tại ở bất cứ đâu trong caption; (2) vùng nội dung
  // (mọi dòng trước mục 📌 THÔNG TIN SẢN PHẨM) không được còn
  // placeholder [ngoặc vuông] nào ngoài [TỈ LỆ] ở tiêu đề khi tỉ
  // lệ chưa có. Dính một trong hai là loại bài AI này — bước gọi
  // sẽ thử viết lại hoặc rơi về mẫu dự phòng vốn không sinh
  // placeholder màu.
  if (/\[màu\]/i.test(caption)) return null;
  const infoIdx = caption.search(/THÔNG TIN SẢN PHẨM/i);
  const contentRegion = infoIdx >= 0 ? caption.slice(0, infoIdx) : caption;
  const strayPlaceholders = (
    contentRegion.match(/\[[^\]]+\]/g) ?? []
  ).filter((p) => p !== "[TỈ LỆ]");
  if (strayPlaceholders.length > 0) return null;
  return { caption };
}

// Người viết bài: viết bài bán mô hình từ các giá trị người dùng đã
// cho (tên, hãng xe, tỉ lệ, màu, giá, tồn kho, vận chuyển, kích
// thước) theo phong cách ĐỨC GARAGE — Emotional Sales Copywriting
// pha Luxury Product Marketing: tiêu đề emoji + tagline IN HOA,
// đoạn mở đầu gợi cảm xúc gọi "anh em", mục ĐIỂM NỔI BẬT, mục 📌
// THÔNG TIN SẢN PHẨM, CTA inbox ĐỨC GARAGE, hashtag #DucGarage
// đứng đầu. Tên sản phẩm giữ nguyên văn trong bài và hãng xe được
// nhắc nguyên văn khi có. PHẦN CHI TIẾT
// THIẾT KẾ (các dòng ✅ trong mục ĐIỂM NỔI BẬT) do chính AI writer TỰ SOẠN
// — dựa trên kiến thức về mẫu xe thật ở tỉ lệ đó — người bán không
// phải gõ; họ chỉ đối chiếu với ảnh/video của chiếc xe khi duyệt.
// Riêng việc bộ phận nào mở được thì theo QUY TẮC TỈ LỆ người bán
// đã xác nhận: 1:18 và 1:24 mở được cửa, cốp và nắp capo; 1:32 là
// bản sealed không mở — generator khẳng định theo quy tắc này và
// validateAiCopy chặn bài viết sai quy tắc. Chỉ khi người bán đã tự
// ghi ở ô chi tiết (ghi đè thủ công) thì dùng đúng các dòng đó.
export async function writeProfessionalCopy(
  ctx: Ctx,
  f: DraftFields,
  opts?: { previousCaption?: string },
): Promise<{ caption: string; writer: "ai" | "template" }> {
  const hasOverride = detailBullets(f.sellingPoint).length > 0;
  const given = [
    `- Tên sản phẩm (GIỮ NGUYÊN VĂN từng chữ trong bài — đúng hoa/thường, đúng thứ tự từ, không viết tắt, không đổi thành tên gọi khác): ${f.productName}`,
    `- Tên hãng xe (ĐƯỢC nhắc trong bài, dùng lại nguyên văn giá trị này, không tự suy ra hãng khác): ${f.maker || "(chưa cung cấp — ở mục Hãng xe ghi đúng 'Cần xác nhận')"}`,
    `- Tỉ lệ: ${f.scale || "(chưa cung cấp — ở dòng đầu giữ nguyên văn thành [TỈ LỆ], ở mục Tỷ lệ ghi đúng 'Cần xác nhận')"}`,
    `- Cấu tạo theo tỉ lệ (người bán ĐÃ XÁC NHẬN — áp dụng đúng, không cần đắn đo): ${
      opensFully(f.scale)
        ? `tỉ lệ ${f.scale} của shop MỞ ĐƯỢC cửa, cốp và nắp capo (1:18 và 1:24 cùng quy tắc) — hãy viết khẳng định mở được ở các dòng chi tiết tương ứng`
        : isConfirmedSealedScale(f.scale)
          ? `tỉ lệ ${f.scale} của shop là bản SEALED — thân xe liền khối, KHÔNG mở cửa/cốp/capo; tuyệt đối không khẳng định mở được bất kỳ bộ phận nào`
          : isCautiousScale(f.scale)
            ? `tỉ lệ ${f.scale} chưa có quy tắc cấu tạo của shop — viết thận trọng: không khẳng định mở được bộ phận nào, cũng không khẳng định là bản sealed; chỉ mô tả thiết kế`
            : "chưa rõ cấu tạo theo tỉ lệ — không khẳng định mở được bộ phận nào"
    }`,
    `- Màu xe: ${f.color || "(chưa cung cấp — ở mục Màu sắc ghi đúng 'Cần xác nhận')"}`,
    `- Giá bán (CHỈ in đúng dạng che này trong bài, không in giá thật): ${f.price ? maskPrice(f.price) : "(chưa cung cấp — giữ nguyên văn thành [GIÁ] trong dòng Giá bán)"}`,
    `- Tồn kho: ${f.stock || "1"} chiếc`,
    `- Vận chuyển: ${f.ship || "COD"} (mặc định COD — in đúng giá trị này ở dòng Vận chuyển, không để placeholder)`,
    `- Kích thước: ${f.sizeCm.trim() ? sizeLine(f.sizeCm) : "(chưa cung cấp — trong mục Kích thước ghi đúng 'Cần xác nhận')"}`,
    `- Chức năng (ghi vào mục Chức năng của Thông tin sản phẩm): ${functionLine(f)}`,
    `- Thời gian khuyến mãi (in nguyên văn dòng này vào mục Thông tin sản phẩm, ngay sau dòng Ưu đãi): ${promoLine()}`,
    `- Ưu đãi (in nguyên văn dòng này ngay sau dòng Giá bán): ${promoOfferLine()}`,
    `- Hashtag cuối bài (in nguyên văn cả dòng này, không rút gọn, không thay tag khác): ${hashtagsForFields(f)}`,
    `- Ảnh sản phẩm: ${f.imageUrl ? "có ảnh của chính chiếc xe này (người bán sẽ đối chiếu bài với ảnh này khi duyệt)" : "(chưa có ảnh)"}`,
    `- Video sản phẩm: ${f.videoUrl ? "có video của chính chiếc xe này (người bán sẽ đối chiếu bài với video này khi duyệt)" : "(chưa có video)"}`,
    hasOverride
      ? `- Chi tiết người bán TỰ GHI ĐÈ (dùng đúng các dòng này trong mục ĐIỂM NỔI BẬT, nguyên văn, mỗi dòng bắt đầu bằng '✅ ', không thêm dòng nào khác): ${f.sellingPoint}`
      : "- Chi tiết thiết kế: (người bán không ghi — bạn TỰ SOẠN toàn bộ các dòng ✅ trong mục ĐIỂM NỔI BẬT theo hướng dẫn ở dưới)",
  ].join("\n");
  const fullyOpening = opensFully(f.scale);
  const sealed = isConfirmedSealedScale(f.scale);
  const detailGuide = hasOverride
    ? [
        "Mục ĐIỂM NỔI BẬT: dùng ĐÚNG các dòng chi tiết người bán tự ghi đè ở trên, mỗi dòng bắt đầu bằng '✅ ' nguyên văn, không thêm, không bớt, không diễn giải lại.",
      ]
    : [
        "Mục '✨ ĐIỂM NỔI BẬT' — BẠN TỰ SOẠN khoảng 5 dòng, mỗi dòng mở đầu bằng '✅ ', viết ngắn gọn, giàu cảm xúc như bài mẫu (mô tả thiết kế đặc trưng và cấu tạo: dáng xe, lưới tản nhiệt, cụm đèn, nội thất, bộ mâm), theo đúng thứ tự sau (chỉ gồm các nhóm này — TUYỆT ĐỐI không viết dòng nào về kẹp phanh, và không viết dòng điểm nhấn riêng về tông màu kiểu 'Tông … nổi bật'):",
        fullyOpening
          ? "  - Dòng 1 — Capo & động cơ: mẫu tỉ lệ này (1:18/1:24) MỞ ĐƯỢC nắp capo — viết khẳng định việc mở nắp capo và khoang động cơ của mẫu mô hình, kèm loại động cơ ĐÚNG của xe thật (chỉ nêu loại động cơ khi bạn chắc chắn đúng với mẫu xe thật này; không chắc thì chỉ viết về khoang động cơ chi tiết, không nêu loại động cơ)."
          : sealed
            ? "  - Dòng 1 — Thân xe & động cơ: mẫu này là bản SEALED (thân xe liền khối, không mở nắp capo) — viết về đường nét thân xe và khoang máy tạo hình dưới nắp capo liền khối; TUYỆT ĐỐI không khẳng định mở được nắp capo hay bất kỳ bộ phận nào. Có thể nêu loại động cơ ĐÚNG của xe thật như một nét thiết kế được tái hiện (chỉ khi chắc chắn đúng với mẫu xe thật này)."
            : "  - Dòng 1 — Capo & động cơ: khoang động cơ của mẫu mô hình được tái hiện chi tiết, kèm loại động cơ ĐÚNG của xe thật (chỉ nêu khi chắc chắn đúng với mẫu xe thật này). Không khẳng định mở được nắp capo.",
        fullyOpening
          ? "  - Dòng 2 — Cửa & cốp: mẫu tỉ lệ này (1:18/1:24) MỞ ĐƯỢC cửa và cốp — viết khẳng định số cửa mở được và cốp mở được, kèm chi tiết ngoại thất đi kèm nếu có (cánh gió, ống xả...). Dòng này BẮT BUỘC có trong bài, không được bỏ qua hay viết lảng sang mô tả thiết kế."
          : sealed
            ? "  - Dòng 2 — Thân xe liền khối: nêu rõ bản sealed thân xe liền khối, không mở cửa/cốp — tập trung vào đường nét thân xe, các khe cửa/cốp tạo hình và chi tiết ngoại thất đi kèm nếu có (cánh gió, ống xả...). TUYỆT ĐỐI không viết cửa/cốp mở được."
            : "  - Dòng 2 — Cửa & cốp: mô tả đường nét cửa và cốp được tái hiện trên thân xe, kèm chi tiết ngoại thất đi kèm nếu có (cánh gió, ống xả...). Không khẳng định mở được.",
        "  - Dòng 3 — Nội thất: đặc điểm nội thất của dòng xe thật (ghế, vô lăng, bảng điều khiển...). Màu nội thất: CHỈ nêu khi bạn chắc chắn đúng với phiên bản xe thật này; nếu không chắc màu nội thất thì viết mô tả nội thất mà KHÔNG nhắc tới màu sắc (bỏ hẳn ý màu trong dòng này) — TUYỆT ĐỐI không để placeholder dạng [màu] hay bất kỳ chuỗi trong ngoặc vuông nào trong dòng này.",
        "  - Dòng 4 — Mâm & lốp: kiểu/màu mâm đặc trưng của mẫu xe thật và lốp cao su. Chỉ mâm và lốp — không nhắc tới phanh/kẹp phanh trong dòng này hay bất kỳ dòng nào khác.",
        "  - Dòng 5 — Đèn & mặt trước: chi tiết đèn pha và lưới tản nhiệt/mặt ca-lăng đặc trưng của mẫu xe thật — chỉ nêu chi tiết đặc trưng có thật của dòng xe này.",
        "  - Dòng 6 (chỉ khi còn thông tin đáng nói) — Tổng thể: nhận xét gợi cảm xúc về dáng xe và giá trị trưng bày/sưu tầm. KHÔNG viết phụ kiện thành dòng chi tiết — hộp + đế mica nằm ở mục 'Phụ kiện đi kèm' trong Thông tin sản phẩm.",
        "Căn cứ soạn chi tiết (không bịa): dùng kiến thức của bạn về mẫu xe thật — động cơ, thiết kế đèn/lưới tản nhiệt, phong cách nội thất, mâm đặc trưng. Riêng việc BỘ PHẬN NÀO MỞ ĐƯỢC thì theo đúng quy tắc tỉ lệ người bán đã xác nhận ở trên (1:18 và 1:24 mở cửa/cốp/capo; 1:32 sealed không mở) — đó là dữ kiện của shop, cứ áp dụng, không tự đắn đo hay hạ xuống mức mô tả chung. Người bán sẽ đối chiếu từng dòng với ảnh/video của chiếc xe thật ở bước duyệt, nên chi tiết riêng của xe (loại động cơ, chi tiết đặc trưng) nào không chắc thì viết mô tả chung đúng sự thật thay vì khẳng định cụ thể.",
      ];
  const prompt = [
    "Bạn viết bài bán mô hình xe (diecast) cho shop ĐỨC GARAGE. Hãy viết MỘT bài đăng chính (dùng cho cả hội nhóm, fanpage và Instagram) bằng tiếng Việt, theo phong cách của shop: Content bán hàng kết hợp cảm xúc và thúc đẩy chuyển đổi (Emotional Sales Copywriting) pha Luxury Product Marketing dành cho sản phẩm sưu tầm — văn phong văn vở, giàu cảm xúc, giọng gọi khách là 'anh em', đúng cấu trúc bài mẫu ĐỨC GARAGE dưới đây. Chỉ viết bài chính, không viết thêm bản ngắn TikTok/Reels nào:",
    "",
    given,
    "",
    "Bố cục bắt buộc (đúng thứ tự này):",
    "1. Tiêu đề: MỘT emoji chủ đề hợp với dòng xe (xe sang 👑, siêu xe 🔥/🏎️, Ferrari 🔴, BMW M 🏁, SUV địa hình 💪, mặc định 🖤) + TÊN SẢN PHẨM giữ nguyên văn (đúng hoa/thường như đã cho, không thêm/bớt từ) + tỉ lệ + ' – ' + một TAGLINE IN HOA do bạn sáng tác hợp khí chất dòng xe (kiểu 'ĐẲNG CẤP XE SANG THU NHỎ', 'ĐAM MÊ TỐC ĐỘ, PHONG CÁCH KHÁC BIỆT', 'BẢN LĨNH SUV, PHONG THÁI MẠNH MẼ'). Không thêm năm hay thông tin nào ngoài tên, tỉ lệ và tagline (năm CHỈ xuất hiện khi đã nằm sẵn trong tên sản phẩm). TUYỆT ĐỐI không chèn dòng banner khuyến mãi ngay dưới tiêu đề — khuyến mãi chỉ nằm trong khối thông tin sản phẩm.",
    "2. Đoạn mở đầu: 1–2 đoạn văn gợi cảm xúc ngay sau tiêu đề — mở bằng khí chất/phong thái của dòng xe, gọi khách là 'anh em', gợi giá trị trưng bày (bàn làm việc, tủ kính, góc garage) và giá trị quà tặng cho người mê xe. Văn vở, cuốn hút như bài mẫu, nhưng không bịa dữ kiện mua bán.",
    "3. Mục '✨ ĐIỂM NỔI BẬT' (dòng tiêu đề mục đúng như vậy), rồi các dòng chi tiết bắt đầu bằng '✅ ' theo hướng dẫn chi tiết ở dưới.",
    "4. Mục '📌 THÔNG TIN SẢN PHẨM' (dòng tiêu đề mục đúng như vậy) liệt kê theo đúng thứ tự: '- Hãng xe: ...', '- Dòng xe: <tên dòng xe — tên sản phẩm bỏ phần hãng xe ở đầu; không tách được thì dùng nguyên tên sản phẩm>', '- Tỷ lệ: ...', '- Màu sắc: ...', '- Chất liệu: Die-cast', '- Kích thước: <dạng ~ như đã cho>', '- Chức năng: <theo đúng quy tắc tỉ lệ đã cho ở trên>', '- Phụ kiện đi kèm: Hộp + đế mica trưng bày', rồi các dòng emoji: '💰 Giá bán: <giá dạng che> (giá khuyến mãi)', '🎁 Ưu đãi: ...' (in nguyên văn như đã cho), '⏰ Thời gian khuyến mãi: ...' (in nguyên văn như đã cho), '📦 Tình trạng: <tình trạng tồn kho>', '🚚 Vận chuyển: <giá trị đã cho, mặc định COD>'. Thông tin nào ghi (chưa cung cấp) thì ở mục đó ghi đúng 'Cần xác nhận' — không bỏ mục, không bịa giá trị (riêng giá và tỉ lệ chưa có thì giữ placeholder [GIÁ] / [TỈ LỆ] như đã hướng dẫn ở phần giá trị). Khuyến mãi chỉ xuất hiện trong mục này, không nhắc ở bất kỳ đâu khác trong bài.",
    ...detailGuide.map((l, i) => `${i + 5}. ${l}`),
    "Cuối bài: dòng CTA '📩 Inbox ĐỨC GARAGE để xem ảnh thực tế, video chi tiết và nhận báo giá nhé!' (có thể biến tấu nhẹ câu chữ nhưng phải giữ đúng mẫu '📩 Inbox ĐỨC GARAGE…' và lời mời xem ảnh thực tế/video), rồi dòng hashtag cuối bài.",
    "",
    "Yêu cầu bắt buộc:",
    "0. TUYỆT ĐỐI không xuất hiện placeholder dạng [ngoặc vuông] trong các dòng nội dung của bài (đoạn mở đầu, các dòng ✅ ở mục ĐIỂM NỔI BẬT, CTA) — đặc biệt chuỗi '[màu]' không được xuất hiện ở BẤT CỨ ĐÂU trong bài. Chưa biết một chi tiết nội dung nào (như màu nội thất) thì viết câu mô tả bỏ hẳn chi tiết đó, không để chỗ trống chờ điền. Hai placeholder duy nhất được phép là [GIÁ] và [TỈ LỆ], và chỉ ở đúng vị trí đã hướng dẫn (dòng Giá bán / dòng đầu và mục Tỷ lệ) khi giá/tỉ lệ chưa được cung cấp; thông tin còn thiếu khác thể hiện bằng 'Cần xác nhận' ở mục Thông tin sản phẩm.",
    "1. Dữ kiện mua bán (giá ở dạng che, tồn kho, vận chuyển, màu xe, tỉ lệ) chỉ dùng đúng giá trị đã cho ở trên — không đổi, không tự điền, không in giá thật. Dữ kiện nào ghi (chưa cung cấp) thì xử lý đúng như hướng dẫn ở từng mục. Không bịa năm sản xuất, số lượng sản xuất giới hạn hay giá trị sưu tầm. Tên sản phẩm phải xuất hiện nguyên văn ít nhất ở dòng đầu (trong tiêu đề) và trong phần mở đầu/mục thông tin — không viết tắt, không đổi thứ tự từ, không thay bằng tên gọi khác. Tên hãng xe (nếu có) chỉ dùng đúng nguyên văn giá trị đã cho, không tự nghĩ ra hãng khác.",
    "2. Emoji chỉ dùng đúng các vị trí trong bố cục trên (emoji chủ đề ở tiêu đề, ✨ ở mục ĐIỂM NỔI BẬT, ✅ ở các dòng chi tiết, 📌 ở mục thông tin, 💰🎁⏰📦🚚 ở các dòng giá/ưu đãi/khuyến mãi/tình trạng/vận chuyển, 📩 ở CTA) — không rải emoji ở nơi khác. Không in mã STT/SKU của xe vào bài.",
    `3. Bài dài khoảng 180–300 từ, xuống dòng hợp lý giữa các phần, kết thúc bằng dòng hashtag ĐẦY ĐỦ đã cho ở trên (#DucGarage đứng đầu, rồi các tag liên quan tới chính chiếc xe này — tên xe, hãng xe, dòng xe, màu, tỉ lệ, cộng đồng diecast và khuyến mãi; in nguyên văn, không rút gọn): ${hashtagsForFields(f)}.`,
  ].join("\n");
  // Viết lại (có bản cũ): dặn AI viết KHÁC bản cũ và thử tối đa 2
  // lượt — bài bị validator loại hoặc trùng hệt bản cũ ở lượt đầu
  // thì viết lại lần nữa với yêu cầu nhấn mạnh hơn, thay vì rơi
  // ngay về mẫu dự phòng cố định (vốn luôn cho ra đúng một văn bản
  // nên người bán bấm viết lại mà "không thấy thay đổi gì").
  const previous = (opts?.previousCaption ?? "").trim();
  const fullPrompt = previous
    ? [
        prompt,
        "",
        "LƯU Ý VIẾT LẠI: người bán đang bấm VIẾT LẠI bản nháp này. Bản hiện tại là:",
        "---",
        previous,
        "---",
        "Hãy viết một bài MỚI khác hẳn bản trên về cách diễn đạt (cách trình bày đoạn mở đầu và các dòng ✅ trong mục ĐIỂM NỔI BẬT, thứ tự câu chữ) nhưng giữ nguyên mọi dữ kiện mua bán và đúng bố cục bắt buộc. TUYỆT ĐỐI không chép lại nguyên văn các dòng chi tiết của bản trên.",
      ].join("\n")
    : prompt;
  const attempts = previous ? 2 : 1;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const out = await ctx.inference.complete(
        attempt === 0
          ? fullPrompt
          : `${fullPrompt}\n\nQUAN TRỌNG: bài lần trước hoặc không đạt chuẩn dữ kiện hoặc trùng với bản cũ — viết lại từ đầu, đổi hẳn cách diễn đạt, vẫn bám đúng mọi dữ kiện đã cho.`,
        { schema: professionalCopySchema },
      );
      const valid = validateAiCopy(out, f);
      if (!valid) continue;
      // Bài AI trùng hệt bản cũ thì coi như chưa viết lại được —
      // thử lượt nữa (hoặc rơi về mẫu và để bước gọi báo rõ).
      if (previous && valid.caption.trim() === previous) continue;
      return { ...valid, writer: "ai" as const };
    } catch {
      // Người viết AI không khả dụng — thử thêm cũng vô ích.
      break;
    }
  }
  return { ...buildCaption(f), writer: "template" as const };
}
// Khung giờ chuẩn để phân tích: mọi bài đăng được xếp vào 1 trong 7 khung
// này theo giờ VN, và điểm tương tác được tính riêng cho từng kênh.

export async function cleanupLegacyDraftColorPlaceholders(
  ctx: Ctx,
): Promise<number> {
  const db = ctx.db<typeof schema>();
  const rows = await db.select().from(schema.drafts);
  let cleanedCount = 0;
  for (const r of rows) {
    const caption = hasColorPlaceholder(r.caption)
      ? stripColorPlaceholders(r.caption, r.color)
      : r.caption;
    const packText = hasColorPlaceholder(r.packText)
      ? stripColorPlaceholders(r.packText, r.color)
      : r.packText;
    if (caption !== r.caption || packText !== r.packText) {
      await db
        .update(schema.drafts)
        .set({ caption, packText })
        .where(eq(schema.drafts.id, r.id));
      cleanedCount += 1;
    }
  }
  return cleanedCount;
}
