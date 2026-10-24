// Trình đọc dữ liệu Google Sheet và Google Drive độc lập cho môi trường phát triển cục bộ

export async function fetchGoogleSheetGrid(
  spreadsheetId: string,
  rawRange?: string,
  includeGridData = false,
) {
  try {
    let sheetName = "";
    if (rawRange) {
      const match = rawRange.match(/^'?(.*?)'?!/);
      if (match && match[1]) {
        sheetName = match[1];
      } else {
        sheetName = rawRange.replace(/^'|'$/g, "").trim();
      }
    }

    const tabParam = sheetName ? `&sheet=${encodeURIComponent(sheetName)}` : "";
    const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:json${tabParam}`;

    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
    });

    if (!res.ok) {
      if (res.status === 403 || res.status === 401) {
        return {
          ok: false,
          stdout: "",
          stderr:
            "Lỗi quyền truy cập 403: File Sheet chưa được chia sẻ công khai. Hãy mở file Sheet → Chia sẻ → chọn 'Bất kỳ ai có đường link' (Quyền Người xem).",
          exitCode: 1,
        };
      }
      if (res.status === 404) {
        return {
          ok: false,
          stdout: "",
          stderr:
            "Lỗi 404: Không tìm thấy file Google Sheet. Hãy kiểm tra lại đường link nguồn Sheet đã lưu.",
          exitCode: 1,
        };
      }
      return {
        ok: false,
        stdout: "",
        stderr: `Lỗi kết nối Google Sheets (Mã HTTP ${res.status})`,
        exitCode: 1,
      };
    }

    const text = await res.text();
    const jsonStr = text.replace(/^[^{]*\(/, "").replace(/\);?$/, "");
    const gviz = JSON.parse(jsonStr);

    if (!includeGridData) {
      return {
        ok: true,
        stdout: JSON.stringify({
          properties: { title: "BUSINESS" },
          sheets: [{ properties: { title: sheetName || "Trang tính1" } }],
        }),
        stderr: "",
        exitCode: 0,
      };
    }

    // Trích xuất hàng tiêu đề
    const headerValues = gviz.table.cols.map((c: any) => ({
      formattedValue: c.label || "",
    }));

    // Trích xuất các hàng dữ liệu, tự động kế thừa Hãng xe khi bị gộp ô dọc (merged cells)
    let lastMaker = "";
    const dataRows = gviz.table.rows.map((r: any) => {
      const stt = r.c[0]?.v;
      const model = r.c[2]?.v;
      let maker = r.c[1]?.v;

      if (maker !== null && maker !== undefined && String(maker).trim() !== "") {
        lastMaker = String(maker).trim();
      } else if (
        (stt !== null && stt !== undefined) ||
        (model !== null && model !== undefined)
      ) {
        maker = lastMaker;
      }

      const values = r.c.map((cell: any, colIdx: number) => {
        let val =
          cell?.f ??
          (cell?.v !== null && cell?.v !== undefined ? String(cell?.v) : "");
        if (colIdx === 1 && maker) {
          val = maker;
        }
        return {
          formattedValue: val,
          hyperlink:
            typeof cell?.v === "string" && cell.v.startsWith("http")
              ? cell.v
              : undefined,
          userEnteredValue: { stringValue: val },
        };
      });

      return { values };
    });

    const gridJson = {
      properties: { title: "BUSINESS" },
      sheets: [
        {
          properties: { title: sheetName || "Trang tính1" },
          merges: [],
          data: [
            {
              startRow: 0,
              startColumn: 0,
              rowData: [{ values: headerValues }, ...dataRows],
            },
          ],
        },
      ],
    };

    return {
      ok: true,
      stdout: JSON.stringify(gridJson),
      stderr: "",
      exitCode: 0,
    };
  } catch (err: any) {
    return {
      ok: false,
      stdout: "",
      stderr: `Lỗi khi đọc file Google Sheet: ${err?.message || String(err)}`,
      exitCode: 1,
    };
  }
}

export async function fetchGoogleDriveFolder(folderId: string) {
  try {
    const url = `https://drive.google.com/drive/folders/${folderId}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    if (!res.ok) {
      if (res.status === 403 || res.status === 401) {
        return {
          ok: false,
          stdout: "",
          stderr:
            "Không có quyền mở thư mục Drive (403). Hãy chia sẻ thư mục ở chế độ 'Bất kỳ ai có đường link' (Quyền Người xem).",
          exitCode: 1,
        };
      }
      return {
        ok: false,
        stdout: "",
        stderr: `Lỗi mở thư mục Drive (HTTP ${res.status})`,
        exitCode: 1,
      };
    }

    const text = await res.text();
    const files: Array<{
      id: string;
      name: string;
      mimeType: string;
      size: string;
      webViewLink: string;
    }> = [];

    const regex =
      /aria-label="([^"]+?\.(?:jpe?g|png|heic|heif|webp|gif))[^"]*"[^>]*ssk=['"][^'"]*?([a-zA-Z0-9_-]{28,45})/gi;
    let match;
    const seen = new Set<string>();

    while ((match = regex.exec(text)) !== null) {
      const name = match[1] || "";
      const rawId = match[2];
      if (!rawId) continue;
      let id = rawId.replace(/-\d+-\d+$/, "");
      if (!seen.has(id)) {
        seen.add(id);
        const ext = name.split(".").pop()?.toLowerCase() || "";
        const mimeType =
          ext === "png"
            ? "image/png"
            : ext === "webp"
              ? "image/webp"
              : ext === "heic" || ext === "heif"
                ? "image/heic"
                : "image/jpeg";
        files.push({
          id,
          name,
          mimeType,
          size: "0",
          webViewLink: `https://drive.google.com/file/d/${id}/view`,
        });
      }
    }

    return {
      ok: true,
      stdout: JSON.stringify({ files }),
      stderr: "",
      exitCode: 0,
    };
  } catch (err: any) {
    return {
      ok: false,
      stdout: "",
      stderr: `Lỗi kết nối khi quét thư mục Drive: ${err?.message || String(err)}`,
      exitCode: 1,
    };
  }
}
