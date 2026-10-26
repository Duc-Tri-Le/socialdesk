import type { Ctx } from "@hatch/space-sdk";
import { eq } from "drizzle-orm";
import * as schema from "../../schema";
import type { DraftFields } from "./copywritingTypes";
import {
  OTHER_CAR_BRANDS,
  professionalCopySchema,
} from "./copywritingTypes";
import {
  maskPrice,
  promoLine,
  promoOfferLine,
  functionLine,
  hashtagsForFields,
  isOwnBrand,
  detailBullets,
  scaleDenominator,
  opensFully,
  isConfirmedSealedScale,
  isCautiousScale,
  claimsOpening,
  sizeLine,
  detailLinesOf,
  stripColorPlaceholders,
  hasColorPlaceholder,
} from "./copywritingHelpers";
import { buildCaption } from "./templateWriter";

export function validateAiCopy(
  raw: { caption: string },
  f: DraftFields,
): { caption: string } | null {
  let caption = raw.caption.trim();
  caption = caption.replace(/STT\s*\S+/gi, "").trim();
  caption = stripColorPlaceholders(caption, f.color);
  if (caption.length < 40) return null;

  if (!/ĐIỂM NỔI BẬT/i.test(caption)) return null;
  if (!/THÔNG TIN SẢN PHẨM/i.test(caption)) return null;
  if (!/anh em/i.test(caption)) return null;

  const masked = maskPrice(f.price);
  if (f.price && masked && masked !== f.price && caption.includes(f.price))
    caption = caption.split(f.price).join(masked);

  caption = caption
    .split("\n")
    .filter((l) => !/kẹp phanh/i.test(l))
    .filter((l) => !/^\s*(?:-\s*)?Tông\s.+nổi bật/i.test(l))
    .join("\n")
    .trim();

  if (!caption.toLowerCase().includes(f.productName.toLowerCase()))
    return null;

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
    for (const b of overrideBullets) {
      if (!caption.includes(b)) return null;
    }
    if (aiBullets.some((b) => !overrideBullets.includes(b))) return null;
  } else {
    if (aiBullets.length < 3 || aiBullets.length > 7) return null;
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
    if (!masked || !caption.includes(masked)) return null;
  } else if (!caption.includes("[GIÁ]")) {
    caption = caption.replace(
      /Giá[^:\n]*:[^\n]*/i,
      "Giá bán: [GIÁ] (giá khuyến mãi)",
    );
    if (!caption.includes("[GIÁ]"))
      caption = `${caption}\n- Giá bán: [GIÁ] (giá khuyến mãi)`;
  }

  if (caption.includes("[SHIP"))
    caption = caption.replace(/\[[^\]]*SHIP[^\]]*\]/gi, f.ship || "COD");

  const size = sizeLine(f.sizeCm);
  if (size && !caption.includes(size))
    caption = `${caption}\n- Kích thước: ${size}`;

  if (!/đế mica/i.test(caption))
    caption = `${caption}\n- Phụ kiện đi kèm: Hộp + đế mica trưng bày`;

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

  if (!/Inbox ĐỨC GARAGE/i.test(caption))
    caption = `${caption}\n\n📩 Inbox ĐỨC GARAGE để xem ảnh thực tế, video chi tiết và nhận báo giá nhé!`;

  caption = caption
    .split("\n")
    .filter((l) => !/^(\s*#\S+\s*)+$/.test(l.trim()) || l.trim() === "")
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  caption = `${caption}\n\n${hashtagsForFields(f)}`;

  if (/\[màu\]/i.test(caption)) return null;
  const infoIdx = caption.search(/THÔNG TIN SẢN PHẨM/i);
  const contentRegion = infoIdx >= 0 ? caption.slice(0, infoIdx) : caption;
  const strayPlaceholders = (
    contentRegion.match(/\[[^\]]+\]/g) ?? []
  ).filter((p) => p !== "[TỈ LỆ]");
  if (strayPlaceholders.length > 0) return null;
  return { caption };
}

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
      if (previous && valid.caption.trim() === previous) continue;
      return { ...valid, writer: "ai" as const };
    } catch {
      break;
    }
  }
  return { ...buildCaption(f, { previousCaption: previous }), writer: "template" as const };
}

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
