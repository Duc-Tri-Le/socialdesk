import { describe, it, expect } from "bun:test";
import {
  diagnosePost,
  computeChannelSummaries,
  filterAndSortMetrics,
  generateActionDirectives,
} from "../client/src/components/analytics/helpers/analyticsCalculations";
import type { Metric } from "../client/src/components/analytics/analyticsTypes";

function createMockMetric(overrides: Partial<Metric> = {}): Metric {
  return {
    id: 1,
    draft_id: 101,
    product_name: "BMW M3 G80",
    channel_type: "group",
    channel_id: 1,
    channel_name: "Hội Xe Mô Hình",
    post_url: "https://facebook.com/groups/123/posts/456",
    posted_at: new Date().toISOString(),
    hour_slot: "13:00–17:00",
    reactions: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    reach: 0,
    inquiries: 0,
    score: 0,
    post_status: "active",
    scanned_at: null,
    source: "extension_dom",
    data_quality: "full",
    ...overrides,
  };
}

describe("diagnosePost", () => {
  it("trả về 'Chưa quét' khi bài chưa có số liệu quét DOM và tương tác bằng 0", () => {
    const post = createMockMetric({ scanned_at: null, likes: 0, comments: 0 });
    const res = diagnosePost(post, 10, 100);
    expect(res.tag).toBe("Chưa quét");
    expect(res.tagType).toBe("unscanned");
  });

  it("trả về 'Tốt — Inbox cao nhất' khi bài dẫn đầu về lượt khách nhắn tin", () => {
    const post = createMockMetric({ scanned_at: new Date().toISOString(), inquiries: 15, likes: 20 });
    const res = diagnosePost(post, 15, 100);
    expect(res.tag).toBe("Tốt — Inbox cao nhất");
    expect(res.tagType).toBe("good");
  });

  it("chẩn đoán đúng bệnh CTA khi tiếp cận cao nhưng 0 inbox", () => {
    const post = createMockMetric({
      scanned_at: new Date().toISOString(),
      reach: 500,
      likes: 25,
      inquiries: 0,
    });
    const res = diagnosePost(post, 10, 100);
    expect(res.tag).toBe("Cần đổi lời kêu gọi (CTA)");
    expect(res.tagType).toBe("cta_issue");
  });
});

describe("computeChannelSummaries", () => {
  it("trả về đúng 3 kênh cốt lõi: Hội nhóm, Fanpage, Instagram", () => {
    const res = computeChannelSummaries([]);
    expect(res.length).toBe(3);
    expect(res.map((c) => c.type)).toEqual(["group", "page", "instagram"]);
  });

  it("không bịa khung giờ vàng khi chưa đủ tối thiểu 3 bài đăng đã quét", () => {
    const singlePost = createMockMetric({
      channel_type: "group",
      hour_slot: "13:00–17:00",
      score: 0,
      scanned_at: null,
    });
    const res = computeChannelSummaries([singlePost]);
    const groupCh = res.find((c) => c.type === "group");
    expect(groupCh).toBeDefined();
    expect(groupCh?.totalPosts).toBe(1);
    expect(groupCh?.bestSlot).toBe("Chưa đủ dữ liệu");
  });

  it("tính toán chính xác khung giờ vàng khi có đủ từ 3 bài đã quét có điểm", () => {
    const posts: Metric[] = [
      createMockMetric({ id: 1, channel_type: "group", hour_slot: "19:00–21:00", score: 80, scanned_at: "2026-01-01" }),
      createMockMetric({ id: 2, channel_type: "group", hour_slot: "19:00–21:00", score: 90, scanned_at: "2026-01-02" }),
      createMockMetric({ id: 3, channel_type: "group", hour_slot: "13:00–17:00", score: 40, scanned_at: "2026-01-03" }),
    ];
    const res = computeChannelSummaries(posts);
    const groupCh = res.find((c) => c.type === "group");
    expect(groupCh?.bestSlot).toBe("19:00–21:00");
  });
});

describe("filterAndSortMetrics", () => {
  it("lọc chính xác theo từ khóa tìm kiếm sản phẩm", () => {
    const posts: Metric[] = [
      createMockMetric({ id: 1, product_name: "Ferrari F40", channel_name: "Group A" }),
      createMockMetric({ id: 2, product_name: "Porsche 911 GT3", channel_name: "Group B" }),
    ];
    const result = filterAndSortMetrics(posts, "Ferrari", "all", "all", "score");
    expect(result.length).toBe(1);
    expect(result[0]?.product_name).toBe("Ferrari F40");
  });

  it("lọc chính xác theo trạng thái đã quét / chưa quét", () => {
    const posts: Metric[] = [
      createMockMetric({ id: 1, scanned_at: "2026-01-01", likes: 10 }),
      createMockMetric({ id: 2, scanned_at: null, likes: 0, comments: 0 }),
    ];
    const scanned = filterAndSortMetrics(posts, "", "all", "scanned", "score");
    expect(scanned.length).toBe(1);
    expect(scanned[0]?.id).toBe(1);

    const unscanned = filterAndSortMetrics(posts, "", "all", "unscanned", "score");
    expect(unscanned.length).toBe(1);
    expect(unscanned[0]?.id).toBe(2);
  });
});

describe("generateActionDirectives", () => {
  it("cảnh báo trung thực khi chưa có bài đăng nào được quét tương tác", () => {
    const post = createMockMetric({ scanned_at: null, likes: 0, comments: 0 });
    const directives = generateActionDirectives([post]);
    expect(directives.length).toBeGreaterThan(0);
    expect(directives[0]?.badge).toBe("Chưa có dữ liệu quét");
    expect(directives[0]?.directive).toContain("chưa có dữ liệu tương tác thực tế từ Facebook");
  });

  it("thông báo cần thêm dữ liệu khi mẫu quét < 3 bài", () => {
    const post = createMockMetric({ scanned_at: "2026-01-01", likes: 15, comments: 2 });
    const directives = generateActionDirectives([post]);
    const lowSampleDir = directives.find((d) => d.id === "dir_low_sample");
    expect(lowSampleDir).toBeDefined();
    expect(lowSampleDir?.directive).toContain("Cần tối thiểu 3 bài");
  });
});
