import type { DraftFields } from "./copywritingTypes";
import {
  maskPrice,
  functionLine,
  promoLine,
  promoOfferLine,
  hashtagsForFields,
  stockText,
  detailBullets,
  opensFully,
  isConfirmedSealedScale,
  sizeLine,
  stripColorPlaceholders,
} from "./copywritingHelpers";

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

export function buildCaption(f: DraftFields): { caption: string } {
  const priceLine = f.price ? maskPrice(f.price) : "[GIÁ]";
  const scaleLine = f.scale || "[TỈ LỆ]";
  const shipLine = f.ship || "COD";
  const tags = hashtagsForFields(f);
  const overrideBullets = detailBullets(f.sellingPoint).filter(
    (b) => !/kẹp phanh/i.test(b),
  );
  const bullets =
    overrideBullets.length > 0 ? overrideBullets : scaleDetailLines(f);

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
  return { caption: stripColorPlaceholders(lines.join("\n"), f.color) };
}
