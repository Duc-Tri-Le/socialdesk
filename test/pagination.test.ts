import { describe, it, expect } from "bun:test";
import { computePagination } from "../client/src/components/ui/Pagination";

describe("computePagination (Phân trang tối đa 7 slots)", () => {
  it("hiển thị toàn bộ trang khi total <= 7", () => {
    expect(computePagination(1, 1)).toEqual([1]);
    expect(computePagination(1, 3)).toEqual([1, 2, 3]);
    expect(computePagination(2, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(computePagination(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("ở trang 3 thì phải hiện trang 2 và 4 (TH1 gần đầu)", () => {
    const pages = computePagination(3, 10);
    // [1, 2, 3, 4, 5, "…", 10]
    expect(pages).toEqual([1, 2, 3, 4, 5, "…", 10]);
    expect(pages).toContain(2);
    expect(pages).toContain(3);
    expect(pages).toContain(4);
    expect(pages[0]).toBe(1);
    expect(pages[pages.length - 1]).toBe(10);
    expect(pages.length).toBe(7);
  });

  it("ở trang 4 thì phải hiện trang 3 và 5", () => {
    const pages = computePagination(4, 10);
    expect(pages).toEqual([1, 2, 3, 4, 5, "…", 10]);
    expect(pages).toContain(3);
    expect(pages).toContain(4);
    expect(pages).toContain(5);
    expect(pages[0]).toBe(1);
    expect(pages[pages.length - 1]).toBe(10);
    expect(pages.length).toBe(7);
  });

  it("ở trang 5 thì phải hiện trang 4 và 6 (TH3 ở giữa)", () => {
    const pages = computePagination(5, 10);
    // [1, "…", 4, 5, 6, "…", 10]
    expect(pages).toEqual([1, "…", 4, 5, 6, "…", 10]);
    expect(pages).toContain(4);
    expect(pages).toContain(5);
    expect(pages).toContain(6);
    expect(pages[0]).toBe(1);
    expect(pages[pages.length - 1]).toBe(10);
    expect(pages.length).toBe(7);
  });

  it("ở trang 6 thì phải hiện trang 5 và 7 (TH3 ở giữa)", () => {
    const pages = computePagination(6, 10);
    // [1, "…", 5, 6, 7, "…", 10]
    expect(pages).toEqual([1, "…", 5, 6, 7, "…", 10]);
    expect(pages).toContain(5);
    expect(pages).toContain(6);
    expect(pages).toContain(7);
    expect(pages[0]).toBe(1);
    expect(pages[pages.length - 1]).toBe(10);
    expect(pages.length).toBe(7);
  });

  it("ở trang gần cuối (trang 7, 8, 9, 10 với total=10) phải hiện trang trước và sau", () => {
    // total - 3 = 7
    const p7 = computePagination(7, 10);
    expect(p7).toEqual([1, "…", 6, 7, 8, 9, 10]);
    expect(p7).toContain(6);
    expect(p7).toContain(8);
    expect(p7.length).toBe(7);

    const p8 = computePagination(8, 10);
    expect(p8).toEqual([1, "…", 6, 7, 8, 9, 10]);
    expect(p8).toContain(7);
    expect(p8).toContain(9);

    const p9 = computePagination(9, 10);
    expect(p9).toEqual([1, "…", 6, 7, 8, 9, 10]);
    expect(p9).toContain(8);
    expect(p9).toContain(10);

    const p10 = computePagination(10, 10);
    expect(p10).toEqual([1, "…", 6, 7, 8, 9, 10]);
    expect(p10).toContain(9);
    expect(p10).toContain(10);
  });

  it("luôn bắt buộc hiển thị trang đầu (1) và trang cuối (total) cho mọi trường hợp", () => {
    for (let total = 8; total <= 25; total++) {
      for (let curr = 1; curr <= total; curr++) {
        const pages = computePagination(curr, total);
        expect(pages[0]).toBe(1);
        expect(pages[pages.length - 1]).toBe(total);
        expect(pages.length).toBe(7);

        // Trang hiện tại luôn có mặt
        expect(pages).toContain(curr);

        // Nếu current > 1 thì current - 1 luôn có mặt
        if (curr > 1) {
          expect(pages).toContain(curr - 1);
        }
        // Nếu current < total thì current + 1 luôn có mặt
        if (curr < total) {
          expect(pages).toContain(curr + 1);
        }
      }
    }
  });
});
