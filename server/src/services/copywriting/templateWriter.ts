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

export function taglineFor(f: DraftFields, variant = 0): string {
  if (variant === 1) return "ĐỈNH CAO THIẾT KẾ, ĐẲNG CẤP TRƯNG BÀY";
  if (variant === 2) return "PHONG THÁI UY LỰC, SỨC HÚT KHÓ CƯỠNG";

  const n = `${f.productName} ${f.maker}`.toUpperCase();
  if (/MAYBACH|S680/.test(n)) return "ĐẲNG CẤP XE SANG THU NHỎ";
  if (/ROLLS|CULLINAN/.test(n)) return "KHÍ CHẤT SUV SIÊU SANG TRONG TẦM TAY";
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
  if (maker && name.toLowerCase().startsWith(maker.toLowerCase() + " ")) {
    return name.slice(maker.length).trim() || name;
  }
  return name;
}

export function introParagraphsFor(f: DraftFields, variant = 0): string[] {
  const model = modelLineFor(f);
  const scalePhrase = f.scale ? `Tỷ lệ ${f.scale}` : "Phiên bản thu nhỏ này";
  const color = f.color ? ` màu ${f.color}` : "";

  if (variant === 1) {
    return [
      `Thêm một tuyệt phẩm mô hình cập bến ĐỨC GARAGE dành riêng cho anh em đam mê sưu tầm ${model}!`,
      `${f.productName}${color} nổi bật với từng đường nét dập nổi cơ bắp và tỉ lệ chuẩn xác. Dù đặt trên bàn làm việc hay trong tủ kính, mẫu xe ${scalePhrase.toLowerCase()} này đều toát lên thần thái bản lĩnh, là món quà xứng tầm cho anh em mê xe.`,
    ];
  }

  if (variant === 2) {
    return [
      `Dành cho những anh em trót say mê vẻ đẹp cơ khí và thiết kế uy lực của dòng xe ${model}!`,
      `Phiên bản ${scalePhrase.toLowerCase()} của ${f.productName}${color} gây ấn tượng mạnh nhờ độ hoàn thiện sắc sảo đến từng chi tiết. Trưng bày ở góc làm việc hay garage riêng, đây chắc chắn là điểm nhấn khẳng định cá tính cho anh em đam mê xe.`,
    ];
  }

  return [
    `Không cần sở hữu ${model} ngoài đời, anh em vẫn có thể mang khí chất của dòng xe này về ngay góc trưng bày của mình!`,
    `${f.productName}${color} gây ấn tượng với vóc dáng bề thế, những đường nét đặc trưng và phong thái riêng khó lẫn. ${scalePhrase} giúp mẫu xe trở nên nổi bật khi trưng bày trên bàn làm việc, trong tủ kính hoặc tại góc garage riêng — cũng là lựa chọn quà tặng ý nghĩa cho anh em đam mê xe.`,
  ];
}

export function scaleDetailLines(f: DraftFields, variant = 0): string[] {
  if (variant === 1) {
    const opening = opensFully(f.scale)
      ? "Mở được nắp capo, các cánh cửa và cốp — chiêm ngưỡng khoang động cơ cơ khí chân thực."
      : isConfirmedSealedScale(f.scale)
        ? "Bản sealed thân xe liền khối, đường nét dập nổi và nước sơn bóng mịn đỉnh cao."
        : "Các chi tiết thân xe đúc liền mạch, giữ trọn nét tinh tế của nguyên mẫu.";
    return [
      "Ngoại thất mô phỏng sắc sảo với các đường gân thân xe dập nổi khỏe khoắn.",
      "Mặt ca-lăng và cụm đèn chiếu sáng sắc nét, giữ trọn thần thái của nguyên mẫu.",
      "Khoang nội thất tinh tế với vô lăng, taplo và ghế lái được mô phỏng sống động.",
      "Bộ la-zăng chuẩn tỉ lệ kết hợp lốp cao su vân bám thật tạo thế đứng vững chãi.",
      opening,
    ];
  }

  if (variant === 2) {
    const opening = opensFully(f.scale)
      ? "Mở được nắp capo, cửa và cốp xe linh hoạt — trải nghiệm tương tác trực quan như xe thật."
      : isConfirmedSealedScale(f.scale)
        ? "Bản sealed thân xe liền khối, đường gân dập nổi và màu sơn sắc sảo."
        : "Từng đường gân thân xe được gia công chuẩn xác, chuẩn tỉ lệ nguyên mẫu.";
    return [
      "Vóc dáng xe bệ vệ, các góc cạnh được trau chuốt tỉ mỉ và sắc nét.",
      "Lưới tản nhiệt đặc trưng kết hợp cụm đèn phía trước tạo diện mạo uy lực.",
      "Nội thất bên trong bài trí chân thực, chi tiết từng cụm đồng hồ và bảng điều khiển.",
      "Dàn chân đầm chắc cùng bộ mâm tỉ lệ chuẩn tôn dáng xe cân đối.",
      opening,
    ];
  }

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

export function buildCaption(
  f: DraftFields,
  opts?: { previousCaption?: string; variant?: number },
): { caption: string } {
  let v = opts?.variant ?? 0;
  if (opts?.previousCaption && v === 0) {
    v = opts.previousCaption.includes("tuyệt phẩm") || opts.previousCaption.includes("cập bến") ? 2 : 1;
  }

  const priceLine = f.price ? (f.price.includes("x") ? f.price : maskPrice(f.price)) : "[GIÁ]";
  const scaleLine = f.scale || "[TỈ LỆ]";
  const shipLine = f.ship || "COD";
  const tags = hashtagsForFields(f);
  const overrideBullets = detailBullets(f.sellingPoint).filter(
    (b) => !/kẹp phanh/i.test(b),
  );
  const bullets =
    overrideBullets.length > 0 ? overrideBullets : scaleDetailLines(f, v);

  const nameWithScale = f.productName
    .toLowerCase()
    .includes(scaleLine.toLowerCase())
    ? f.productName
    : `${f.productName} ${scaleLine}`;
  const title = `${titleEmojiFor(f)} ${nameWithScale} – ${taglineFor(f, v)}`;
  const size = sizeLine(f.sizeCm);
  const lines: string[] = [
    title,
    "",
    ...introParagraphsFor(f, v).flatMap((p) => [p, ""]).slice(0, -1),
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

  let result = stripColorPlaceholders(lines.join("\n"), f.color);
  if (opts?.previousCaption && result.trim() === opts.previousCaption.trim()) {
    const nextV = v === 1 ? 2 : 1;
    return buildCaption(f, { variant: nextV });
  }
  return { caption: result };
}
