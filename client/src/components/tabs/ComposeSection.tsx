import { useState, useEffect, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type ApiResponse } from "../../api";
import type { Product } from "../../types";
import { btnPrimary, btnGhost, inputCls, labelCls } from "../../utils/styles";
import { driveStatusLabel, fileToBase64 } from "../../utils/format";
import { Hint } from "../ui/Hint";
import { SheetImagePreview } from "../ui/SheetImagePreview";
import {
  PRODUCT_PAGE_SIZE,
  type ProductSort,
  filterProductsBySearch,
  sortProducts,
  ProductListCard,
  ProductListControls,
  ProductListPagination,
} from "../products/ProductListHelpers";
import {
  useComposeJobs,
  isGatewayTimeoutError,
  type ReconciledComposeResult,
} from "../../context/ComposeJobsContext";

/* --------------------------------------------------------------- Soạn bài */

interface DraftFormState {
  stt: string;
  sku: string;
  product_name: string;
  scale: string;
  maker: string;
  color: string;
  price: string;
  stock: string;
  ship: string;
  image_url: string;
  video_url: string;
  selling_point: string;
  size_cm: string;
}

const EMPTY_DRAFT_FORM: DraftFormState = {
  stt: "",
  sku: "",
  product_name: "",
  scale: "",
  maker: "",
  color: "",
  price: "",
  stock: "1",
  ship: "",
  image_url: "",
  video_url: "",
  selling_point: "",
  size_cm: "",
};

type ComposeImage = Product["drive_images"][number];

export function ComposeSection({
  onGoQueue,
  onGoProducts,
}: {
  onGoQueue: () => void;
  onGoProducts: () => void;
}) {
  const queryClient = useQueryClient();
  const products = useQuery({
    queryKey: ["products"],
    queryFn: () => api.listProducts({}),
  });
  // Danh sách chọn sản phẩm bên dưới: tìm kiếm + phân trang 10 sản
  // phẩm/trang như mục Sản phẩm. Đổi từ khóa tìm kiếm thì quay về
  // trang 1; chuyển trang giữ nguyên từ khóa đang tìm.
  const [listSearch, setListSearch] = useState("");
  const [listSort, setListSort] = useState<ProductSort>("default");
  const [listPage, setListPage] = useState(1);
  const allComposeProducts: Product[] = products.data?.products ?? [];
  const searchNeedle = listSearch.trim().toLowerCase();
  const filteredComposeProducts = sortProducts(
    filterProductsBySearch(allComposeProducts, searchNeedle),
    listSort,
  );
  const composeTotal = filteredComposeProducts.length;
  const composeTotalPages = Math.max(
    1,
    Math.ceil(composeTotal / PRODUCT_PAGE_SIZE),
  );
  const safeListPage = Math.min(listPage, composeTotalPages);
  const composeRangeStart =
    composeTotal === 0 ? 0 : (safeListPage - 1) * PRODUCT_PAGE_SIZE + 1;
  const composeRangeEnd = Math.min(
    composeTotal,
    safeListPage * PRODUCT_PAGE_SIZE,
  );
  const pagedComposeProducts = filteredComposeProducts.slice(
    (safeListPage - 1) * PRODUCT_PAGE_SIZE,
    safeListPage * PRODUCT_PAGE_SIZE,
  );
  useEffect(() => {
    if (listPage > composeTotalPages) setListPage(composeTotalPages);
  }, [listPage, composeTotalPages]);
  const composePageNumbers: number[] = (() => {
    if (composeTotalPages <= 7)
      return Array.from({ length: composeTotalPages }, (_, i) => i + 1);
    const wanted = new Set<number>([
      1,
      composeTotalPages,
      safeListPage - 1,
      safeListPage,
      safeListPage + 1,
    ]);
    return [...wanted]
      .filter((n) => n >= 1 && n <= composeTotalPages)
      .sort((a, b) => a - b);
  })();
  const [form, setForm] = useState<DraftFormState>(EMPTY_DRAFT_FORM);

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [composeMsg, setComposeMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [queuedMsg, setQueuedMsg] = useState("");
  const composeJobs = useComposeJobs();
  // Tập ảnh ĐANG gắn vào bài trong form: mặc định là ảnh Drive của
  // sản phẩm đã chọn; người dùng tự xóa bớt / thêm lại từ Drive /
  // tải ảnh từ thiết bị lên. Khi gửi, tập này được chốt vào bản
  // nháp và gói đăng dùng đúng tập đó — không quét lại Drive.
  const [images, setImages] = useState<ComposeImage[]>([]);
  const [imagesCustomized, setImagesCustomized] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [imageMsg, setImageMsg] = useState("");

  const resetComposeForm = () => {
    setForm(EMPTY_DRAFT_FORM);
    setSelectedProduct(null);
    setImages([]);
    setImagesCustomized(false);
    setImageMsg("");
    setComposeMsg("");
  };

  // Gửi bài vào HÀNG ĐỢI SOẠN BÀI toàn cục thay vì chờ ngay tại
  // form: chụp lại toàn bộ dữ kiện + tập ảnh đã chốt tại thời điểm
  // bấm, đưa vào hàng đợi (chạy nền lần lượt từng bài, theo dõi ở
  // vòng tròn tiến trình kéo đi được trên màn hình), rồi làm trống
  // form NGAY để chọn sản phẩm khác soạn tiếp. Bài chạy xong tự vào
  // Hàng đợi duyệt và tự biến mất khỏi danh sách tiến trình; bài lỗi
  // ở lại trong danh sách tiến trình với nút Thử lại (dữ kiện đã
  // chụp nên thử lại không cần soạn lại form).
  const enqueueCreate = () => {
    // MÃ CHỐNG TRÙNG của riêng lượt soạn này: sinh MỘT lần tại đây
    // và giữ nguyên trong cả hàm chạy lẫn các lần "Thử lại" của
    // việc này. Máy chủ thấy cùng mã thì trả về bản nháp đã tạo
    // thay vì tạo bản thứ hai — thử lại sau timeout thành an toàn.
    const idempotencyKey =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `compose-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const snapshot = {
      ...form,
      idempotency_key: idempotencyKey,
      images: images.map((im) => ({ ...im })),
      images_customized: imagesCustomized,
    };
    const name = snapshot.product_name.trim();
    // ĐỐI SOÁT SAU TIMEOUT: hỏi máy chủ theo mã chống trùng xem
    // lượt soạn này đã kịp lưu bản nháp chưa; dò vài lần cách nhau
    // ít giây vì máy chủ có thể vẫn đang viết bài khi cổng kết nối
    // đã cắt phản hồi. Thấy bản nháp → coi như XONG kèm drive
    // message nói rõ là bài đối soát được, không phải bài mới.
    const reconcileByKey = async (
      message: string,
    ): Promise<ReconciledComposeResult | null> => {
      if (!isGatewayTimeoutError(message)) return null;
      for (let attempt = 0; attempt < 4; attempt += 1) {
        if (attempt > 0)
          await new Promise((r) => window.setTimeout(r, 2500));
        try {
          const found = await api.findDraftByKey({
            idempotency_key: idempotencyKey,
          });
          if (found.found) {
            return {
              reconciled: true,
              note: "phản hồi bị timeout nhưng bài đã kịp vào Hàng đợi duyệt (đã đối soát)",
              result: {
                id: found.id,
                code: found.code,
                writer: found.writer === "template" ? "template" : "ai",
                drive_status: found.drive_status,
                drive_image_count: found.drive_image_count,
                drive_message:
                  "Phản hồi soạn bài bị timeout ở cổng kết nối, nhưng máy chủ đã lưu xong — app đã đối soát theo mã chống trùng và xác nhận bài đã vào Hàng đợi duyệt. Không cần soạn lại; bấm Thử lại (nếu còn hiện) cũng không tạo bản trùng.",
              },
            };
          }
        } catch {
          // Hỏi đối soát cũng lỗi — thử tiếp vòng sau; hết vòng thì
          // trả null để việc giữ trạng thái lỗi như cũ.
        }
      }
      return null;
    };
    composeJobs.enqueue({
      kind: "create",
      label: name,
      run: () => api.createDraft(snapshot),
      reconcileOnError: reconcileByKey,
      onDone: (result) => {
        const res = result as ApiResponse<typeof api, "createDraft">;
        setQueuedMsg("");
        setSuccessMsg(
          `Đã soạn xong bài “${name}” — bài đã vào Hàng đợi duyệt. ${res.drive_message}`,
        );
        queryClient.invalidateQueries({ queryKey: ["drafts"] });
        queryClient.invalidateQueries({ queryKey: ["overview"] });
        queryClient.invalidateQueries({ queryKey: ["products"] });
      },
      onError: (message) => {
        setSuccessMsg("");
        setComposeMsg(
          isGatewayTimeoutError(message)
            ? `Soạn bài “${name}” bị timeout ở cổng kết nối: ${message} — app đã tự đối soát nhưng chưa thấy bài trong Hàng đợi duyệt. Mở vòng tròn tiến trình trên màn hình để bấm Thử lại: lượt soạn này có mã chống trùng nên thử lại không tạo bản trùng, dữ kiện của bài vẫn được giữ trong hàng đợi.`
            : `Soạn bài “${name}” thất bại: ${message} — mở vòng tròn tiến trình trên màn hình để bấm Thử lại, dữ kiện của bài vẫn được giữ trong hàng đợi.`,
        );
      },
    });
    resetComposeForm();
    setQueuedMsg(
      `Đã đưa bài “${name}” vào hàng đợi soạn bài — vòng tròn tiến trình trên màn hình cho biết bài nào đang chạy, bài nào đang chờ; soạn xong bài tự vào Hàng đợi duyệt. Form đã làm trống, chọn sản phẩm khác bên dưới để soạn tiếp ngay.`,
    );
  };

  const submitDraft = (e: FormEvent) => {
    e.preventDefault();
    if (form.product_name.trim()) enqueueCreate();
  };
  // Sản phẩm được phân loại theo Hãng + Mẫu + Tỉ lệ + Kích thước +
  // Màu sắc: mỗi thẻ là đúng MỘT màu, nên đổ vào form là màu và SKU
  // (đã gồm màu, dạng "STT-Tên-Màu") của chính biến thể đó được điền
  // sẵn. Các nút chọn màu dưới thẻ chỉ còn xuất hiện với dữ liệu gộp
  // cũ (nhiều màu trong một thẻ) còn sót trước lần đồng bộ kế tiếp.
  const useProduct = (p: Product, chosenColor?: string) => {
    setSelectedProduct(p);
    setComposeMsg("");
    setSuccessMsg("");
    setQueuedMsg("");
    setImageMsg("");
    setImages(p.drive_images);
    setImagesCustomized(false);
    const colorList =
      p.colors.length > 0 ? p.colors : p.color ? [p.color] : [];
    const color =
      chosenColor ??
      (colorList.length === 1 ? (colorList[0] ?? "") : "");
    const sku =
      chosenColor && colorList.length > 1 && p.sku
        ? `${p.sku}-${chosenColor}`
        : p.sku;
    setForm((prev) => ({
      stt: p.stt,
      sku,
      product_name: p.name,
      scale: p.scale,
      maker: p.maker,
      color,
      price: p.price,
      stock: String(p.stock),
      ship: p.ship,
      image_url: p.image_url,
      video_url: p.video_url,
      selling_point: prev.selling_point,
      size_cm: p.size || prev.size_cm,
    }));
    if (colorList.length > 1 && !chosenColor) {
      setComposeMsg(
        `Sản phẩm “${p.name}” có ${colorList.length} màu (${colorList.join(", ")}) — bấm nút màu dưới thẻ sản phẩm để đổ đúng màu vào form, hoặc tự điền ô Màu trong form trước khi viết bài.`,
      );
    }
  };

  const removeImage = (im: ComposeImage) => {
    setImages((list) => list.filter((x) => x.id !== im.id));
    setImagesCustomized(true);
    setSuccessMsg("");
    setImageMsg(
      `Đã bỏ ảnh “${im.name}” khỏi bài này (chỉ bỏ khỏi bản nháp — file gốc trên Drive/thiết bị không bị xóa).`,
    );
  };
  const addDriveImage = (im: ComposeImage) => {
    setImages((list) =>
      list.some((x) => x.id === im.id) ? list : [...list, im],
    );
    setImagesCustomized(true);
    setSuccessMsg("");
    setImageMsg(`Đã thêm lại ảnh “${im.name}” từ thư mục Drive của sản phẩm.`);
  };
  const upload = useMutation({
    mutationFn: (args: { name: string; mime: string; data_base64: string }) =>
      api.uploadMedia(args),
  });
  const onUploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadBusy(true);
    setImageMsg("");
    setSuccessMsg("");
    let added = 0;
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) {
        setImageMsg(`File “${file.name}” không phải ảnh — chỉ gắn được file ảnh vào bài.`);
        continue;
      }
      try {
        const b64 = await fileToBase64(file);
        const res = await upload.mutateAsync({
          name: file.name,
          mime: file.type || "image/jpeg",
          data_base64: b64,
        });
        if (res.ok && res.url) {
          setImages((list) => [
            ...list,
            {
              id: `upload-${res.id}`,
              name: res.name || file.name,
              mime: res.mime || file.type,
              size: res.size || file.size,
              jpeg_url: res.url,
              view_url: res.url,
              is_heic: false,
            },
          ]);
          added += 1;
        } else {
          setImageMsg(res.error || `Không tải lên được ảnh “${file.name}”.`);
        }
      } catch {
        setImageMsg(`Không tải lên được ảnh “${file.name}”.`);
      }
    }
    setUploadBusy(false);
    if (added > 0) {
      setImagesCustomized(true);
      setImageMsg(`Đã tải lên và gắn ${added} ảnh từ thiết bị vào bài này.`);
      queryClient.invalidateQueries({ queryKey: ["media"] });
    }
  };
  // Ảnh Drive của sản phẩm đã chọn nhưng CHƯA gắn vào bài (đã bị
  // xóa trước đó) — bấm để thêm lại.
  const availableDriveImages = (selectedProduct?.drive_images ?? []).filter(
    (im) => !images.some((x) => x.id === im.id),
  );

  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <section aria-label="Soạn bản nháp bài đăng" className="min-w-0 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto lg:overscroll-contain lg:pb-1 lg:pr-1">
        <h2 className="text-lg font-bold">Soạn bản nháp</h2>
        {successMsg && (
          <div
            className="mt-2 rounded-[var(--radius)] border-2 border-[var(--ok)] bg-[var(--surface)] p-3"
            role="status"
          >
            <p className="text-sm font-semibold text-[var(--ok)]">
              ✓ {successMsg}
            </p>
            <button
              type="button"
              className={`${btnGhost} mt-2`}
              onClick={onGoQueue}
            >
              Xem Hàng đợi duyệt
            </button>
          </div>
        )}
        {queuedMsg && (
          <div
            className="mt-2 rounded-[var(--radius)] border-2 border-[var(--accent)] bg-[var(--surface)] p-3"
            role="status"
          >
            <p className="text-sm font-semibold">{queuedMsg}</p>
          </div>
        )}
        {composeMsg && (
          <p className="mt-2 text-sm font-medium" role="status">
            {composeMsg}
          </p>
        )}
        <form onSubmit={submitDraft} className="mt-3 space-y-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls} htmlFor="df-stt">Mã STT</label>
              <input id="df-stt" aria-label="Mã STT" className={inputCls} value={form.stt} onChange={(e) => setForm({ ...form, stt: e.target.value })} placeholder="Như trong Sheet" />
            </div>
            <div>
              <label className={labelCls} htmlFor="df-img-state">Media đi kèm</label>
              <p id="df-img-state" className="rounded-[var(--radius)] border border-[var(--border)] px-3 py-2 text-xs leading-5">
                Ảnh:{" "}
                {images.length > 0
                  ? `đang gắn ${images.length} ảnh vào bài${imagesCustomized ? " (bạn đã tự thêm/xóa — tập này được chốt khi xuất gói)" : " (đã lưu từ lần đồng bộ — tập này được chốt khi xuất gói)"}`
                  : selectedProduct
                    ? driveStatusLabel(selectedProduct)
                    : form.image_url
                      ? "chưa gắn ảnh nào — thêm ảnh ở mục Ảnh của bài bên dưới"
                      : "chưa có ảnh"}{" "}
                · Video:{" "}
                {form.video_url ? "đã có video" : "chưa có video"}
                {form.sku ? ` · SKU: ${form.sku}` : ""}
              </p>
            </div>
          </div>
          <div>
            <div className="mb-1 flex items-center gap-1.5">
              <label className="text-xs font-semibold text-[var(--dim)]" htmlFor="df-name">Tên sản phẩm *</label>
              <Hint
                label="Chú thích ô Tên sản phẩm"
                text={
                  <>
                    Tên sản phẩm được <strong>giữ nguyên văn</strong> trong
                    bài viết — nhập đúng như tên trong Sheet.
                  </>
                }
              />
            </div>
            <input id="df-name" aria-label="Tên sản phẩm" className={inputCls} value={form.product_name} onChange={(e) => setForm({ ...form, product_name: e.target.value })} required placeholder="Nhập tên sản phẩm" />
          </div>
          <div>
            <div className="mb-1 flex items-center gap-1.5">
              <label className="text-xs font-semibold text-[var(--dim)]" htmlFor="df-maker">Hãng xe</label>
              <Hint
                label="Chú thích ô Hãng xe"
                text="Có hãng xe thì bài viết sẽ nhắc hãng (khối thông tin và nội dung) — dùng đúng nguyên văn giá trị này."
              />
            </div>
            <input id="df-maker" aria-label="Hãng xe" className={inputCls} value={form.maker} onChange={(e) => setForm({ ...form, maker: e.target.value })} placeholder="Nhập hãng xe như trong Sheet" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className={labelCls} htmlFor="df-img">Link ảnh trong Sheet — thư mục Drive</label>
              <input id="df-img" aria-label="Link ảnh trong Sheet" className={inputCls} value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} placeholder="https://…" />
              {form.image_url.trim() && (
                <div className="mt-2">
                  <SheetImagePreview url={form.image_url} label={form.product_name || "sản phẩm"} />
                </div>
              )}
              <div className="mt-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-alt)] p-3">
                <p className="flex items-center gap-1.5 text-xs font-semibold">
                  <span>
                    Ảnh của bài ({images.length})
                  </span>
                  <Hint
                    label="Chú thích mục Ảnh của bài"
                    align="right"
                    text="Chưa có ảnh nào đang gắn vào bài khi danh sách này trống — chọn sản phẩm có ảnh Drive ở danh sách bên cạnh, thêm lại ảnh Drive, hoặc tải ảnh từ thiết bị lên. Tối đa 25MB mỗi ảnh. Xóa ảnh chỉ bỏ khỏi bài — không xóa file gốc trên Drive."
                  />
                </p>
                {images.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {images.map((im) => (
                      <li key={im.id} className="relative w-20">
                        <div className="h-16 w-20 overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)]">
                          <img
                            src={im.jpeg_url}
                            alt={`Ảnh ${im.name}`}
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeImage(im)}
                          aria-label={`Xóa ảnh ${im.name} khỏi bài`}
                          className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--danger)] text-sm font-bold leading-none text-white"
                        >
                          ×
                        </button>
                        <p className="mt-0.5 truncate text-[10px] text-[var(--dim)]" title={im.name}>
                          {im.name}
                        </p>
                        <p className="text-[10px] font-medium text-[var(--dim)]">
                          {im.id.startsWith("upload-")
                            ? "Ảnh tải lên từ thiết bị"
                            : im.is_heic
                              ? "Gốc HEIC → đăng bản JPEG"
                              : "Ảnh từ Drive"}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
                {imagesCustomized && (
                  <p className="mt-1 text-xs font-medium text-[var(--ok)]">
                    Bạn đã tự chỉnh tập ảnh — bản nháp và gói đăng sẽ
                    dùng đúng tập này, không quét lại Drive để gắn lại
                    ảnh đã xóa.
                  </p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <label className={btnPrimary}>
                    {uploadBusy ? "Đang tải ảnh lên…" : "Thêm ảnh từ thiết bị"}
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="sr-only"
                      aria-label="Thêm ảnh từ thiết bị"
                      disabled={uploadBusy}
                      onChange={(e) => {
                        void onUploadFiles(e.target.files);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
                {availableDriveImages.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs font-semibold">
                      Thêm ảnh từ thư mục Drive của sản phẩm này (
                      {availableDriveImages.length} ảnh chưa gắn):
                    </p>
                    <ul className="mt-1.5 flex flex-wrap gap-2">
                      {availableDriveImages.map((im) => (
                        <li key={im.id} className="w-20">
                          <div className="h-16 w-20 overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)]">
                            <img
                              src={im.jpeg_url}
                              alt={`Ảnh ${im.name}`}
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          </div>
                          <p className="mt-0.5 truncate text-[10px] text-[var(--dim)]" title={im.name}>
                            {im.name}
                          </p>
                          <button
                            type="button"
                            className="mt-0.5 w-full rounded-full border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[11px] font-semibold"
                            onClick={() => addDriveImage(im)}
                            aria-label={`Thêm ảnh ${im.name} từ Drive vào bài`}
                          >
                            + Thêm vào bài
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {imageMsg && (
                  <p className="mt-2 text-xs font-medium" role="status">
                    {imageMsg}
                  </p>
                )}
              </div>
            </div>
            <div className="col-span-2">
              <label className={labelCls} htmlFor="df-vid">Link video</label>
              <input id="df-vid" aria-label="Link video" className={inputCls} value={form.video_url} onChange={(e) => setForm({ ...form, video_url: e.target.value })} placeholder="https://… (để trống nếu chưa có)" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls} htmlFor="df-scale">Tỉ lệ</label>
              <input id="df-scale" aria-label="Tỉ lệ" className={inputCls} value={form.scale} onChange={(e) => setForm({ ...form, scale: e.target.value })} />
            </div>
            <div>
              <label className={labelCls} htmlFor="df-color">Màu</label>
              <input id="df-color" aria-label="Màu" className={inputCls} value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} placeholder="Nhập màu xe" />
            </div>
            <div>
              <label className={labelCls} htmlFor="df-price">Giá bán</label>
              <input id="df-price" aria-label="Giá bán" className={inputCls} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="Nhập giá bán" />
            </div>
            <div>
              <label className={labelCls} htmlFor="df-stock">Tồn kho (chiếc)</label>
              <input id="df-stock" aria-label="Tồn kho (chiếc)" className={inputCls} value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} />
            </div>
            <div>
              <label className={labelCls} htmlFor="df-ship">Vận chuyển</label>
              <input id="df-ship" aria-label="Vận chuyển" className={inputCls} value={form.ship} onChange={(e) => setForm({ ...form, ship: e.target.value })} placeholder="Để trống = mặc định COD" />
            </div>
          </div>
          <div>
            <label className={labelCls} htmlFor="df-selling">Chi tiết tự ghi — tùy chọn ghi đè (để trống AI tự viết)</label>
            <textarea id="df-selling" aria-label="Chi tiết tự ghi, tùy chọn ghi đè, để trống AI tự viết" rows={4} className={inputCls} value={form.selling_point} onChange={(e) => setForm({ ...form, selling_point: e.target.value })} placeholder="Để trống: AI tự viết toàn bộ dòng chi tiết. Chỉ điền khi bạn muốn tự ghi đè." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls} htmlFor="df-size">Kích thước — không bắt buộc</label>
              <input id="df-size" aria-label="Kích thước" className={inputCls} value={form.size_cm} onChange={(e) => setForm({ ...form, size_cm: e.target.value })} placeholder="Để trống nếu chưa đo" />
            </div>
          </div>
          <button type="submit" className={btnPrimary}>
            Viết bài &amp; đưa vào hàng đợi soạn bài
          </button>
        </form>
      </section>

      <section aria-label="Chọn sản phẩm để soạn bài" className="min-w-0">
        <h2 className="text-lg font-bold">Chọn từ danh sách sản phẩm</h2>
        <ProductListControls
          searchId="compose-product-search"
          sortId="compose-product-sort"
          searchAriaLabel="Tìm sản phẩm trong danh sách soạn bài"
          sortAriaLabel="Sắp xếp danh sách sản phẩm trong soạn bài"
          search={listSearch}
          onSearchChange={(value) => {
            setListSearch(value);
            setListPage(1);
          }}
          sort={listSort}
          onSortChange={(value) => {
            setListSort(value);
            setListPage(1);
          }}
          total={composeTotal}
          rangeStart={composeRangeStart}
          rangeEnd={composeRangeEnd}
          page={safeListPage}
          totalPages={composeTotalPages}
          needleText={listSearch}
          allTotal={allComposeProducts.length}
        />
        <ul className="mt-3 space-y-3">
          {pagedComposeProducts.map((p: Product) => (
            <ProductListCard
              key={p.id}
              product={p}
              selected={selectedProduct?.id === p.id}
            >
              <div className="mt-3">
                <button className={btnGhost} onClick={() => useProduct(p)}>Đổ vào form soạn bài</button>
                {p.colors.length > 1 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-semibold text-[var(--dim)]">
                      Đổ vào form theo màu:
                    </span>
                    {p.colors.map((c) => (
                      <button
                        key={c}
                        type="button"
                        className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-xs font-semibold"
                        aria-label={`Đổ ${p.name} màu ${c} vào form soạn bài`}
                        onClick={() => useProduct(p, c)}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </ProductListCard>
          ))}
        </ul>
        {products.data && allComposeProducts.length === 0 && (
          <p className="mt-2 text-sm text-[var(--dim)]">
            Chưa có sản phẩm nào.{" "}
            <button className="underline" onClick={onGoProducts}>Sang mục Sản phẩm để đồng bộ từ Google Sheet</button>
          </p>
        )}
        {products.data && allComposeProducts.length > 0 && composeTotal === 0 && (
          <p className="mt-2 text-sm text-[var(--dim)]">
            Không có sản phẩm nào khớp với “{listSearch.trim()}”.{" "}
            <button
              className="underline"
              onClick={() => {
                setListSearch("");
                setListPage(1);
              }}
            >
              Xóa từ khóa tìm
            </button>
          </p>
        )}
        <ProductListPagination
          navLabel="Phân trang danh sách sản phẩm để soạn bài"
          prevLabel="Trang trước của danh sách soạn bài"
          nextLabel="Trang sau của danh sách soạn bài"
          pageLabel={(n) => `Đi tới trang ${n} của danh sách soạn bài`}
          pageNumbers={composePageNumbers}
          page={safeListPage}
          totalPages={composeTotalPages}
          rangeStart={composeRangeStart}
          rangeEnd={composeRangeEnd}
          total={composeTotal}
          onPage={setListPage}
        />
      </section>
    </div>
  );
}

/* -------------------------------------------------------------- Hàng đợi */

