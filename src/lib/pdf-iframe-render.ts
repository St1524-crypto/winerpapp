// 共用：於獨立 iframe 隔離站台 CSS，將 HTML 節點以 html2canvas 轉為 canvas
// 用意：避免 :root/body 繼承的 oklch()/lab() 等色彩函式污染 computed style
import html2canvas from "html2canvas-pro";

export async function renderHtmlToCanvas(
  html: string,
  opts: { width?: number; scale?: number } = {},
): Promise<HTMLCanvasElement> {
  const width = opts.width ?? 830;
  const scale = opts.scale ?? 2;

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = `position:fixed;left:-10000px;top:0;width:${width}px;height:10px;border:0;background:#fff`;
  document.body.appendChild(iframe);

  try {
    const doc = iframe.contentDocument;
    if (!doc) throw new Error("無法建立列印框架");
    doc.open();
    doc.write(
      `<!doctype html><html><head><meta charset="utf-8"><style>
        html,body{margin:0;padding:0;background:#fff;color:#0f172a;font-family:'Noto Sans TC','PingFang TC','Microsoft JhengHei',system-ui,sans-serif}
        *{box-sizing:border-box}
      </style></head><body>${html}</body></html>`,
    );
    doc.close();

    const imgs = Array.from(doc.images);
    await Promise.all(
      imgs.map((img) =>
        img.complete && img.naturalWidth > 0
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              img.onload = () => resolve();
              img.onerror = () => resolve();
            }),
      ),
    );

    const node = doc.body.firstElementChild as HTMLElement;
    if (!node) throw new Error("列印內容為空");
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    iframe.style.height = `${node.scrollHeight + 40}px`;

    return await html2canvas(node, {
      scale,
      backgroundColor: "#ffffff",
      useCORS: true,
      windowWidth: width,
      logging: false,
    });
  } finally {
    document.body.removeChild(iframe);
  }
}
