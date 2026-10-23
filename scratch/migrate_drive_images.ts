import Database from "bun:sqlite";
import fs from "node:fs";
import path from "node:path";

const UPLOADS_DRIVE_DIR = path.resolve("./uploads/drive");
if (!fs.existsSync(UPLOADS_DRIVE_DIR)) {
  fs.mkdirSync(UPLOADS_DRIVE_DIR, { recursive: true });
}

const db = new Database("social-desk-database.db");

async function downloadImage(folderId: string, fileId: string): Promise<string | null> {
  const fileName = `${folderId}_${fileId}.jpg`;
  const filePath = path.join(UPLOADS_DRIVE_DIR, fileName);

  if (fs.existsSync(filePath) && fs.statSync(filePath).size > 1024) {
    return `/uploads/drive/${fileName}`;
  }

  const urlsToTry = [
    `https://drive.google.com/thumbnail?id=${fileId}&sz=w1600`,
    `https://drive.google.com/thumbnail?id=${fileId}&sz=w1200`,
    `https://lh3.googleusercontent.com/d/${fileId}=w1600`,
  ];

  for (const url of urlsToTry) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      });
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > 1024) {
          fs.writeFileSync(filePath, buf);
          console.log(`[Downloaded] ${fileName} (${buf.length} bytes)`);
          return `/uploads/drive/${fileName}`;
        }
      }
    } catch {}
  }
  return null;
}

async function run() {
  console.log("=== Bắt đầu di chuyển ảnh Drive sang lưu trữ cục bộ uploads/drive ===");

  const prods = db.query("SELECT id, name, drive_folder_id, drive_images FROM products WHERE drive_status = 'ok'").all() as any[];
  console.log(`Tìm thấy ${prods.length} sản phẩm có ảnh Drive.`);

  for (const p of prods) {
    const fid = p.drive_folder_id || "folder";
    let images: any[] = [];
    try {
      images = JSON.parse(p.drive_images || "[]");
    } catch {
      continue;
    }

    let modified = false;
    for (const im of images) {
      if (!im.id) continue;
      const localUrl = await downloadImage(fid, im.id);
      if (localUrl && im.jpeg_url !== localUrl) {
        im.jpeg_url = localUrl;
        modified = true;
      }
    }

    if (modified) {
      db.query("UPDATE products SET drive_images = ? WHERE id = ?").run(JSON.stringify(images), p.id);
      console.log(`Đã cập nhật ảnh local cho sản phẩm [${p.id}] ${p.name}`);
    }
  }

  // Cập nhật các bản nháp (drafts)
  const drafts = db.query("SELECT id, product_name, drive_folder_id, drive_images FROM drafts").all() as any[];
  console.log(`Tìm thấy ${drafts.length} bản nháp.`);

  for (const d of drafts) {
    const fid = d.drive_folder_id || "folder";
    let images: any[] = [];
    try {
      images = JSON.parse(d.drive_images || "[]");
    } catch {
      continue;
    }

    let modified = false;
    for (const im of images) {
      if (!im.id) continue;
      const localUrl = await downloadImage(fid, im.id);
      if (localUrl && im.jpeg_url !== localUrl) {
        im.jpeg_url = localUrl;
        modified = true;
      }
    }

    if (modified) {
      const firstImg = images[0]?.jpeg_url || "";
      db.query("UPDATE drafts SET drive_images = ?, image_url = ? WHERE id = ?").run(
        JSON.stringify(images),
        firstImg,
        d.id
      );
      console.log(`Đã cập nhật ảnh local cho bản nháp [${d.id}] ${d.product_name}`);
    }
  }

  console.log("=== Hoàn tất di chuyển ảnh! ===");
}

await run();
