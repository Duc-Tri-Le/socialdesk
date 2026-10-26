import fs from "node:fs";
import path from "node:path";
import type { DraftFields } from "../services/copywriting/copywritingTypes";
import { buildCaption } from "../services/copywriting/templateWriter";

function getGeminiApiKey(): string {
  let key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
  if (!key) {
    try {
      const envPath = path.join(process.cwd(), ".env");
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, "utf-8");
        for (const line of content.split("\n")) {
          const match = line.match(/^\s*(?:GEMINI_API_KEY|GOOGLE_API_KEY)\s*=\s*(["']?)(.*?)\1\s*$/);
          if (match && match[2]) {
            key = match[2].trim();
            process.env.GEMINI_API_KEY = key;
            break;
          }
        }
      }
    } catch {}
  }
  return key;
}

export async function localAiInferenceComplete(
  prompt: string,
  _opts?: any,
): Promise<{ caption: string }> {
  // 1. Kiểm tra biến môi trường Gemini API nếu người dùng cấu hình
  const geminiKey = getGeminiApiKey();
  if (geminiKey) {
    console.log("[Local AI] 🚀 Đang kết nối Google Gemini API để viết bài sáng tạo...");
    const candidateModels = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-pro"];
    for (const model of candidateModels) {
      try {
        const resp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                responseMimeType: "application/json",
                responseSchema: {
                  type: "object",
                  properties: { caption: { type: "string" } },
                  required: ["caption"],
                },
              },
            }),
          },
        );
        if (resp.ok) {
          const data = (await resp.json()) as any;
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            const parsed = JSON.parse(text);
            if (parsed.caption) {
              console.log(`[Local AI] ✓ Google Gemini (${model}) đã viết xong bài viết thành công!`);
              return parsed;
            }
          }
        } else {
          const errData = (await resp.json().catch(() => null)) as any;
          console.warn(`[Local AI] Thử model ${model} trả về status ${resp.status}:`, errData?.error?.message || resp.statusText);
        }
      } catch (e: any) {
        console.warn(`[Local AI] Lỗi gọi Gemini API (${model}):`, e?.message || e);
      }
    }
  }

  // 2. Trích xuất thông tin sản phẩm từ prompt để sinh bản viết lại thông minh (Smart Local Copy Generator)
  const fields = parseDraftFieldsFromPrompt(prompt);
  const previousCaption = extractPreviousCaptionFromPrompt(prompt);

  let variant = 1;
  if (previousCaption) {
    if (previousCaption.includes("cập bến") || previousCaption.includes("tuyệt phẩm")) {
      variant = 2;
    }
  }

  return buildCaption(fields, { previousCaption, variant });
}

function parseDraftFieldsFromPrompt(prompt: string): DraftFields {
  const productName = (prompt.match(/Tên sản phẩm[^\n:]*:\s*([^\n]+)/)?.[1] || "").trim();
  const rawMaker = (prompt.match(/Tên hãng xe[^\n:]*:\s*([^\n]+)/)?.[1] || "").trim();
  const maker = rawMaker.startsWith("(") ? "" : rawMaker;
  const rawScale = (prompt.match(/Tỉ lệ:\s*([^\n]+)/)?.[1] || "").trim();
  const scale = rawScale.startsWith("(") ? "" : rawScale;
  const rawColor = (prompt.match(/Màu xe:\s*([^\n]+)/)?.[1] || "").trim();
  const color = rawColor.startsWith("(") ? "" : rawColor;
  const rawPrice = (prompt.match(/Giá bán[^\n:]*:\s*([^\n]+)/)?.[1] || "").trim();
  const price = rawPrice.startsWith("(") ? "" : rawPrice;
  const rawStock = (prompt.match(/Tồn kho:\s*([^\n]+)/)?.[1] || "").replace(/[^\d]/g, "").trim();
  const stock = rawStock || "1";
  const rawShip = (prompt.match(/Vận chuyển:\s*([^\n(]+)/)?.[1] || "").trim();
  const ship = rawShip || "COD";
  const rawSize = (prompt.match(/Kích thước:\s*([^\n]+)/)?.[1] || "").trim();
  const sizeCm = rawSize.startsWith("(") ? "" : rawSize;
  const rawOverride = (prompt.match(/Chi tiết người bán TỰ GHI ĐÈ[^\n:]*:\s*([^\n]+)/)?.[1] || "").trim();
  const sellingPoint = rawOverride;

  return {
    stt: "",
    productName,
    maker,
    scale,
    color,
    price,
    stock,
    ship,
    sizeCm,
    sellingPoint,
    imageUrl: "",
    videoUrl: "",
  };
}

function extractPreviousCaptionFromPrompt(prompt: string): string {
  const match = prompt.match(/Bản hiện tại là:\s*---\s*([\s\S]+?)\s*---/);
  return match && match[1] ? match[1].trim() : "";
}
