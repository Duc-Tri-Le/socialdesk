import path from "node:path";
import fs from "node:fs";
import { fetchGoogleSheetGrid, fetchGoogleDriveFolder } from "./localConnectors";
import { localAiInferenceComplete } from "./localInference";

export function createLocalContext(db: any, uploadsDir: string) {
  return {
    db() {
      return db;
    },
    invalidateQueries() {},
    async executePrivileged(contract: any, args: any) {
      if (args && args.spreadsheetId) {
        const range =
          Array.isArray(args.ranges) && args.ranges.length > 0
            ? args.ranges[0]
            : "";
        return await fetchGoogleSheetGrid(
          args.spreadsheetId,
          range,
          args.includeGridData,
        );
      }
      if (args && args.folderId) {
        return await fetchGoogleDriveFolder(args.folderId);
      }
      console.log("[Privileged Call]", contract, args);
      return {
        ok: false,
        stdout: "",
        stderr:
          "Tính năng dòng lệnh hệ thống chưa kết nối trực tiếp. Vui lòng cấu hình API hoặc thực hiện thủ công.",
        exitCode: 1,
      };
    },
    inference: {
      async complete(prompt: string, opts?: any) {
        return await localAiInferenceComplete(prompt, opts);
      },
    },
    agent: {
      async spawnTask(msg: string, opts?: any) {
        console.log("[Agent Task Spawned]", msg, opts);
        return {
          ok: false,
          error:
            "Tác vụ tự động hóa trình duyệt chỉ hoạt động trên môi trường có browser runner.",
        };
      },
    },
    blobs: {
      async getUrl(key: string) {
        return `/uploads/${key}`;
      },
      async put(key: string, data: any, _opts?: any) {
        const targetPath = path.join(uploadsDir, key);
        fs.writeFileSync(targetPath, Buffer.from(data));
        return { key };
      },
      async delete(key: string) {
        const targetPath = path.join(uploadsDir, key);
        if (fs.existsSync(targetPath)) {
          fs.unlinkSync(targetPath);
        }
      },
    },
  };
}
