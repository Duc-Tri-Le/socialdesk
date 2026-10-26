import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "../server/src/schema";
import {
  buildPackTextForDraft,
  parsePackTargets,
  serializePackTargets,
} from "../server/src/services/posting/packBuilder";
import { eq } from "drizzle-orm";

describe("Draft Pack Builder & Targets", () => {
  it("serializePackTargets và parsePackTargets hoạt động chính xác hai chiều", () => {
    const input = {
      group_ids: [27],
      page_ids: [3],
      instagram_account_ids: [3],
    };
    const serialized = serializePackTargets(input);
    const parsed = parsePackTargets(serialized);

    expect(parsed.saved).toBe(true);
    expect(parsed.group_ids).toEqual([27]);
    expect(parsed.page_ids).toEqual([3]);
    expect(parsed.instagram_account_ids).toEqual([3]);
  });

  it("parsePackTargets xử lý an toàn chuỗi rỗng và chuỗi hỏng", () => {
    expect(parsePackTargets("").saved).toBe(false);
    expect(parsePackTargets("invalid json").saved).toBe(false);
    expect(parsePackTargets("{}").group_ids).toEqual([]);
  });

  it("buildPackTextForDraft an toàn với tham số rỗng hoặc thiếu (không throw undefined)", async () => {
    const sqlite = new Database("social-desk-database.db");
    const db = drizzle(sqlite, { schema });
    const [row] = await db
      .select()
      .from(schema.drafts)
      .where(eq(schema.drafts.id, 27));

    if (!row) return;

    // Gọi không truyền group_ids, page_ids hay instagram_account_ids
    const result = await buildPackTextForDraft(
      db,
      row,
      // @ts-expect-error intentionally missing optional properties
      {},
      { explicit: true },
    );

    expect(result.ok).toBe(true);
    expect(typeof result.packText).toBe("string");
    expect(result.packText.length).toBeGreaterThan(0);
    expect(result.packText).toContain(row.productName);
  });

  it("buildPackTextForDraft từ chối nhóm chưa tham gia và báo lỗi rõ ràng", async () => {
    const sqlite = new Database("social-desk-database.db");
    const db = drizzle(sqlite, { schema });
    const [row] = await db
      .select()
      .from(schema.drafts)
      .where(eq(schema.drafts.id, 27));

    if (!row) return;

    // Nhóm 21 là nhóm chưa tham gia
    const result = await buildPackTextForDraft(
      db,
      row,
      { group_ids: [21], page_ids: [], instagram_account_ids: [] },
      { explicit: true },
    );

    expect(result.ok).toBe(false);
    expect(result.message).toContain("Chỉ đăng vào nhóm bằng danh tính đã tham gia nhóm đó");
  });

  it("buildPackTextForDraft chấp nhận nhóm đã tham gia (nhóm 27) và sinh gói thành công", async () => {
    const sqlite = new Database("social-desk-database.db");
    const db = drizzle(sqlite, { schema });
    const [row] = await db
      .select()
      .from(schema.drafts)
      .where(eq(schema.drafts.id, 27));

    if (!row) return;

    // Nhóm 27 có Page 3 đã tham gia
    const result = await buildPackTextForDraft(
      db,
      row,
      { group_ids: [27], page_ids: [3], instagram_account_ids: [] },
      { explicit: true },
    );

    expect(result.ok).toBe(true);
    expect(result.packText).toContain("CHỢ MÔ HÌNH - Figure Market");
    expect(result.packText).toContain("Page “Duc Homnayxemgi”");
    const destSection = result.packText.split("## Media của bài")[0];
    expect(destSection).not.toContain("Instagram");
    expect(destSection).not.toContain("Tài khoản đăng:");
  });

  it("buildPackTextForDraft chỉ xuất đúng fanpage khi người dùng chỉ chọn fanpage (không tự chèn Instagram)", async () => {
    const sqlite = new Database("social-desk-database.db");
    const db = drizzle(sqlite, { schema });
    const [row] = await db
      .select()
      .from(schema.drafts)
      .where(eq(schema.drafts.id, 29));

    if (!row) return;

    // Chỉ chọn fanpage 3, không chọn nhóm, không chọn Instagram
    const result = await buildPackTextForDraft(
      db,
      row,
      { group_ids: [], page_ids: [3], instagram_account_ids: [] },
      { explicit: true },
    );

    expect(result.ok).toBe(true);
    expect(result.packText).toContain("Fanpage:\n- Page “Duc Homnayxemgi”");
    const destSection = result.packText.split("## Media của bài")[0];
    expect(destSection).not.toContain("Instagram");
    expect(destSection).not.toContain("Tài khoản đăng:");
    expect(destSection).not.toContain("Nhóm:");
  });

  it("buildPackTextForDraft xuất đúng Instagram khi được chọn trong đích", async () => {
    const sqlite = new Database("social-desk-database.db");
    const db = drizzle(sqlite, { schema });
    const [row] = await db
      .select()
      .from(schema.drafts)
      .where(eq(schema.drafts.id, 29));

    if (!row) return;

    // Chọn cả fanpage 3 và Instagram 3
    const result = await buildPackTextForDraft(
      db,
      row,
      { group_ids: [], page_ids: [3], instagram_account_ids: [3] },
      { explicit: true },
    );

    expect(result.ok).toBe(true);
    expect(result.packText).toContain("Fanpage:\n- Page “Duc Homnayxemgi”");
    expect(result.packText).toContain("Instagram:\n- Instagram DucGarage");
    expect(result.packText).not.toContain("Tài khoản đăng:");
  });
});
