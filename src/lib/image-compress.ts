// 客戶端圖片壓縮工具：處理手機直拍照片常常超過 5MB 導致上傳失敗的問題。
// 會將過大的圖片以 Canvas 縮圖並以 JPEG 重新編碼；SVG / GIF 等特殊格式維持原檔。

export interface CompressOptions {
  /** 觸發壓縮的檔案大小門檻（bytes）。小於此值不做處理。預設 1.5MB */
  thresholdBytes?: number;
  /** 目標最長邊像素數。預設 2000 */
  maxDimension?: number;
  /** JPEG 壓縮品質，0~1。預設 0.85 */
  quality?: number;
  /** 目標最大檔案大小（bytes），會在超出時多輪降品質。預設 4.5MB */
  targetMaxBytes?: number;
}

const DEFAULTS: Required<CompressOptions> = {
  thresholdBytes: 1.5 * 1024 * 1024,
  maxDimension: 2000,
  quality: 0.85,
  targetMaxBytes: 4.5 * 1024 * 1024,
};

/** 若瀏覽器支援且檔案為可壓縮的點陣圖，回傳壓縮後 File；否則原檔回傳。 */
export async function compressImageIfNeeded(file: File, opts: CompressOptions = {}): Promise<File> {
  if (typeof window === "undefined") return file;
  const cfg = { ...DEFAULTS, ...opts };
  if (!file.type.startsWith("image/")) return file;
  // SVG / GIF / ICO 不做 canvas 重繪（會失去動畫或向量）
  if (/svg|gif|x-icon/.test(file.type)) return file;
  if (file.size <= cfg.thresholdBytes) return file;

  try {
    const bitmap = await loadBitmap(file);
    const { width, height } = fitInside(bitmap.width, bitmap.height, cfg.maxDimension);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap as CanvasImageSource, 0, 0, width, height);
    // HEIC / 透明 PNG 也一律轉 JPEG 以縮小體積並確保跨瀏覽器可預覽
    let quality = cfg.quality;
    let blob = await toBlob(canvas, "image/jpeg", quality);
    while (blob && blob.size > cfg.targetMaxBytes && quality > 0.5) {
      quality -= 0.1;
      blob = await toBlob(canvas, "image/jpeg", quality);
    }
    if (!blob) return file;
    const newName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], newName, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return file;
  }
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(file);
    } catch {
      // fallthrough
    }
  }
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

function fitInside(w: number, h: number, max: number) {
  if (w <= max && h <= max) return { width: w, height: h };
  const ratio = w / h;
  return ratio >= 1
    ? { width: max, height: Math.round(max / ratio) }
    : { width: Math.round(max * ratio), height: max };
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), type, quality));
}
