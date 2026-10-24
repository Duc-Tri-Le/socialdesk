import { definePrivilegedContracts, z } from "@hatch/space-sdk";

export const privileged = definePrivilegedContracts({
  fetchSheetGrid: {
    request: z.object({
      spreadsheetId: z.string().min(1),
      ranges: z.array(z.string()).default([]),
      includeGridData: z.boolean().default(false),
      fields: z.string().min(1),
    }),
    response: z.object({
      ok: z.boolean(),
      stdout: z.string(),
      stderr: z.string(),
      exitCode: z.number(),
    }),
    capabilities: ["google_sheets.spreadsheets.get"],
    timeoutMs: 90000,
  },
  // Tìm hội nhóm Facebook theo điều kiện chọn (từ khóa, phạm vi, sắp xếp,
  // trạng thái, số kết quả) bằng facebook-cli của connector đã liên kết —
  // cùng lệnh mà lệnh `groups-find` của tool Social Desk trên máy chạy.
  searchFbGroups: {
    request: z.object({
      keywords: z.string().default(""),
      role: z.enum(["any", "connected", "admin", "admod"]),
      sortBy: z.enum([
        "MOST_RELEVANT",
        "LARGEST",
        "RECENT_ACTIVITY",
        "LAST_VISITED",
        "ALPHABETICAL",
      ]),
      status: z.enum(["any", "weekly_active", "non_archived", "archived"]),
      // Trần 25 theo đúng lệnh `groups search` gốc của Facebook/CLI.
      limit: z.number().int().min(1).max(25),
    }),
    response: z.object({
      ok: z.boolean(),
      stdout: z.string(),
      stderr: z.string(),
      exitCode: z.number(),
    }),
    capabilities: ["facebook.groups.search"],
    timeoutMs: 90000,
  },
  // Đọc chi tiết MỘT nhóm theo mã/tên vanity lấy từ link nhóm trên
  // trang kết quả tìm kiếm Facebook web mà người dùng tự mở trong
  // trình duyệt của mình và dán vào app.
  getFbGroupDetails: {
    request: z.object({
      groupId: z.string().min(1).max(200),
    }),
    response: z.object({
      ok: z.boolean(),
      stdout: z.string(),
      stderr: z.string(),
      exitCode: z.number(),
    }),
    capabilities: ["facebook.groups.details"],
    timeoutMs: 45000,
  },
  // Đọc vài bài đăng trong MỘT nhóm: với nhóm KÍN (không công khai),
  // chỉ thành viên mới đọc được bài bên trong — nên đọc được bài là
  // bằng chứng tài khoản Facebook đã liên kết ĐÃ tham gia nhóm đó.
  getFbGroupPosts: {
    request: z.object({
      groupId: z.string().min(1).max(200),
    }),
    response: z.object({
      ok: z.boolean(),
      stdout: z.string(),
      stderr: z.string(),
      exitCode: z.number(),
    }),
    capabilities: ["facebook.groups.posts"],
    timeoutMs: 45000,
  },
  // Liệt kê file THẬT bên trong một thư mục Google Drive (cột "Link
  // ảnh" trong Sheet BUSINESS là link thư mục …/drive/folders/<ID>).
  listDriveFolder: {
    request: z.object({
      folderId: z.string().min(1).max(200),
    }),
    response: z.object({
      ok: z.boolean(),
      stdout: z.string(),
      stderr: z.string(),
      exitCode: z.number(),
    }),
    capabilities: ["google_drive.files.list"],
    timeoutMs: 60000,
  },
  // Kiểm tra phiên đăng nhập Facebook (lệnh `me`) TRƯỚC khi tìm nhóm.
  checkFbSession: {
    request: z.object({}),
    response: z.object({
      ok: z.boolean(),
      stdout: z.string(),
      stderr: z.string(),
      exitCode: z.number(),
    }),
    capabilities: ["facebook.me"],
    timeoutMs: 45000,
  },
  // ---- ĐĂNG THẬT (nút "Đăng thật" trong Hàng đợi duyệt) -----------
  // Liệt kê các Page mà tài khoản Facebook đã liên kết quản trị
  listFbPages: {
    request: z.object({}),
    response: z.object({
      ok: z.boolean(),
      stdout: z.string(),
      stderr: z.string(),
      exitCode: z.number(),
    }),
    capabilities: ["facebook.pages.list"],
    timeoutMs: 45000,
  },
  // Đăng THẬT một bài lên một Facebook Page
  publishFbPagePost: {
    request: z.object({
      pageId: z.string().min(1).max(64),
      text: z.string().min(1).max(8000),
      files: z.array(z.string().min(1).max(500)).max(12).default([]),
    }),
    response: z.object({
      ok: z.boolean(),
      stdout: z.string(),
      stderr: z.string(),
      exitCode: z.number(),
    }),
    capabilities: ["facebook.pages.posts.create"],
    timeoutMs: 240000,
  },
  // Liệt kê các tài khoản Instagram đã liên kết
  listIgAccounts: {
    request: z.object({}),
    response: z.object({
      ok: z.boolean(),
      stdout: z.string(),
      stderr: z.string(),
      exitCode: z.number(),
    }),
    capabilities: ["instagram.accounts"],
    timeoutMs: 45000,
  },
  // Đăng THẬT một bài lên Instagram
  publishIgPost: {
    request: z.object({
      accountId: z.string().min(1).max(64),
      caption: z.string().max(2200).default(""),
      files: z.array(z.string().min(1).max(500)).min(1).max(12),
    }),
    response: z.object({
      ok: z.boolean(),
      stdout: z.string(),
      stderr: z.string(),
      exitCode: z.number(),
    }),
    capabilities: ["instagram.post-feed"],
    timeoutMs: 240000,
  },
  // Tải các ảnh ĐÃ CHỐT của bản nháp về thư mục làm việc
  preparePublishMedia: {
    request: z.object({
      code: z.string().min(1).max(80),
      urls: z
        .array(
          z.object({
            url: z.string().min(1).max(2000),
            name: z.string().max(300).default(""),
          }),
        )
        .min(1)
        .max(12),
    }),
    response: z.object({
      ok: z.boolean(),
      stdout: z.string(),
      stderr: z.string(),
      exitCode: z.number(),
    }),
    capabilities: ["google_drive.files.list"],
    timeoutMs: 120000,
  },
});
