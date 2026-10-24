import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type ApiResponse } from "../../api";
import type { Product } from "../../types";
import { fileToBase64 } from "../../utils/format";
import {
  useComposeJobs,
  isGatewayTimeoutError,
  type ReconciledComposeResult,
} from "../../context/ComposeJobsContext";
import type { ComposeImage } from "./ComposeMediaPicker";

export interface DraftFormState {
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

export const EMPTY_DRAFT_FORM: DraftFormState = {
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

export function useComposeForm() {
  const queryClient = useQueryClient();
  const composeJobs = useComposeJobs();

  const [form, setForm] = useState<DraftFormState>(EMPTY_DRAFT_FORM);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isComposeFormOpen, setIsComposeFormOpen] = useState(true);
  const [composeMsg, setComposeMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [queuedMsg, setQueuedMsg] = useState("");

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

  const enqueueCreate = () => {
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
          // Lỗi đối soát, thử lại vòng sau
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

  const useProduct = (p: Product, chosenColor?: string) => {
    setIsComposeFormOpen(true);
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

  const availableDriveImages = (selectedProduct?.drive_images ?? []).filter(
    (im) => !images.some((x) => x.id === im.id),
  );

  return {
    form,
    setForm,
    selectedProduct,
    isComposeFormOpen,
    setIsComposeFormOpen,
    composeMsg,
    successMsg,
    queuedMsg,
    images,
    imagesCustomized,
    uploadBusy,
    imageMsg,
    resetComposeForm,
    submitDraft,
    useProduct,
    removeImage,
    addDriveImage,
    onUploadFiles,
    availableDriveImages,
  };
}
