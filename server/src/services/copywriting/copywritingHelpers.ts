import type { DraftFields } from "./copywritingTypes";
import { BRAND_FAMILIES } from "./copywritingTypes";

export function fmtVnd(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "₫";
}

// Giá in trong bài đăng luôn ở dạng CHE theo yêu cầu của shop
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

// Thời gian khuyến mãi của bài đăng
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

export function promoOfferLine(): string {
  return "Ưu đãi: Giá ưu đãi trong đợt khuyến mãi, kèm hộp + đế mica trưng bày";
}

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
  for (const line of text.split("\n")) {
    if (!line.includes("Cần xác nhận")) continue;
    const label = line.replace(/^[^\p{L}\p{N}]+/u, "");
    const m = label.match(/^([^:]+):\s*Cần xác nhận/);
    found.push(m && m[1] ? `[Cần xác nhận: ${m[1].trim()}]` : "Cần xác nhận");
  }
  return [...new Set(found)].sort();
}

export function tagSlug(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "");
}

export function hashtagsForFields(f: DraftFields): string {
  const tags: string[] = ["#DucGarage"];
  const push = (t: string) => {
    const slug = tagSlug(t);
    if (slug.length < 2 || slug === "ducgarage") return;
    const tag = `#${slug}`;
    if (!tags.includes(tag)) tags.push(tag);
  };
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

  const digits = f.scale.replace(/[^\d]/g, "");
  if (digits) {
    push(`mohinh${digits}`);
    push(`xe${digits}`);
    push(`diecast${digits}`);
    push(`scale${digits}`);
  }

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
    if (slug.length >= 3 || /\d/.test(slug)) push(slug);
  }

  const colorSlug = tagSlug(f.color);
  if (colorSlug) push(`mau${colorSlug}`);
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

export function isOwnBrand(brand: string, f: DraftFields): boolean {
  const identity = `${f.maker} ${f.productName}`.toLowerCase();
  const family = BRAND_FAMILIES.find((fam) =>
    fam.some((m) => m.toLowerCase() === brand.toLowerCase()),
  );
  const names = family ?? [brand];
  return names.some((n) => identity.includes(n.toLowerCase()));
}

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

export function isConfirmedSealedScale(scale: string): boolean {
  return scaleDenominator(scale) === 32;
}

export function isCautiousScale(scale: string): boolean {
  const d = scaleDenominator(scale);
  return d !== null && !opensFully(scale) && d !== 32;
}

export function claimsOpening(line: string): boolean {
  if (/không mở/i.test(line)) return false;
  return /(mở\s+(được|nắp|cửa|cốp|capo)|cửa.{0,12}mở|cốp.{0,12}mở|capo.{0,12}mở)/i.test(
    line,
  );
}

export function sizeLine(sizeCm: string): string {
  const s = sizeCm.trim().replace(/^~+\s*/, "").replace(/\s+/g, " ");
  if (!s) return "";
  if (/cm/i.test(s)) return `~${s}`;
  return /\s/.test(s) ? `~${s} cm` : `~${s}cm`;
}

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

export function stripColorPlaceholders(
  caption: string,
  knownColor = "",
): string {
  if (!/\[[^\]]*(?:màu|mau|color)[^\]]*\]/i.test(caption)) return caption;
  const cleaned = caption
    .replace(
      /^(\s*-\s*Màu sắc\s*:\s*)\[[^\]]*(?:màu|mau|color)[^\]]*\]\s*$/gim,
      (_m, label: string) => `${label}${knownColor.trim() || "Cần xác nhận"}`,
    )
    .replace(
      /(?:tông màu|tông|gam màu|gam|màu sắc|màu)\s*\[[^\]]*(?:màu|mau|color)[^\]]*\]/gi,
      "",
    )
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
    .filter((line) => !/^\s*(?:✅|-)\s*$/.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

export function hasColorPlaceholder(text: string): boolean {
  return /\[[^\]]*(?:màu|mau|color)[^\]]*\]/i.test(text);
}
