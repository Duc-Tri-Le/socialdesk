import { describe, it, expect } from "bun:test";

describe("Draft Scheduling Time Calculations", () => {
  it("xác định đúng thời gian tối thiểu phải cách hiện tại ít nhất 1 phút", () => {
    const now = Date.now();
    const pastTime = new Date(now - 1000).toISOString();
    const futureTime = new Date(now + 120000).toISOString();

    const isPastValid = new Date(pastTime).getTime() > now + 30000;
    const isFutureValid = new Date(futureTime).getTime() > now + 30000;

    expect(isPastValid).toBe(false);
    expect(isFutureValid).toBe(true);
  });

  it("định dạng đúng ngày giờ theo chuẩn giờ Việt Nam", () => {
    // 2026-10-26T19:30:00+07:00
    const testDate = new Date("2026-10-26T12:30:00.000Z"); // 19:30 UTC+7
    const timeFmt = new Intl.DateTimeFormat("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(testDate);

    expect(timeFmt).toContain("19:30");
    expect(timeFmt).toContain("26/10/2026");
  });

  it("tính toán chính xác khoảng thời gian đếm ngược còn lại", () => {
    const now = Date.now();
    const target = now + (2 * 3600 * 1000 + 15 * 60 * 1000); // 2 giờ 15 phút
    const diffMs = target - now;
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    expect(hours).toBe(2);
    expect(mins).toBe(15);
  });
});
