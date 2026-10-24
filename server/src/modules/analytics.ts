import { analyticsCrudActions } from "./analytics/analyticsCrudActions";
import { analyticsScanActions } from "./analytics/analyticsScanActions";
import { analyticsReportActions } from "./analytics/analyticsReportActions";

/**
 * Analytics Module Facade
 * Tách biệt rõ ràng theo nguyên tắc Single Responsibility:
 * - analyticsCrudActions: phân trang phía máy chủ, tìm kiếm, lọc ngày/trạng thái, sửa số liệu bán hàng
 * - analyticsScanActions: đồng bộ bài từ Hàng đợi, quét đơn lẻ & quét hàng loạt qua Chrome Extension
 * - analyticsReportActions: phân tích khung giờ tối ưu, KPI tổng quan, hiệu quả nhóm, cây nội dung sản phẩm
 */
export const analyticsActions = {
  ...analyticsCrudActions,
  ...analyticsScanActions,
  ...analyticsReportActions,
};
