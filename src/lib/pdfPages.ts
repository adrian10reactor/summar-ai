"use client";

// Client-side PDF rasterizer. Uses pdf.js in the browser to render each page of a
// PDF as a PNG blob URL. The blob URLs are session-scoped — they die on reload,
// same UX as the existing "re-upload needed" state for PDFs.

const WORKER_SRC = "https://cdn.jsdelivr.net/npm/pdfjs-dist@6.1.200/build/pdf.worker.min.mjs";

let workerConfigured = false;

async function loadPdfJs() {
  const pdfjs = await import("pdfjs-dist");
  if (!workerConfigured) {
    pdfjs.GlobalWorkerOptions.workerSrc = WORKER_SRC;
    workerConfigured = true;
  }
  return pdfjs;
}

export interface PageRasterResult {
  pageNum: number;
  blobUrl: string;
  width: number;
  height: number;
}

// Rasterize each page of `file` at ~1200px longest edge (a decent readable size
// without ballooning memory), calling `onPage` as each page finishes. Returns
// once all pages are rendered.
export async function rasterizePdf(
  file: File,
  onPage: (page: PageRasterResult) => void,
  opts: { maxPages?: number; targetLongEdgePx?: number } = {}
): Promise<{ pageCount: number }> {
  const { maxPages = 300, targetLongEdgePx = 1400 } = opts;
  const pdfjs = await loadPdfJs();

  const arrayBuf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: arrayBuf }).promise;
  const pageCount = Math.min(doc.numPages, maxPages);

  for (let i = 1; i <= pageCount; i++) {
    const page = await doc.getPage(i);
    const baseViewport = page.getViewport({ scale: 1 });
    const longEdge = Math.max(baseViewport.width, baseViewport.height);
    const scale = Math.min(targetLongEdgePx / longEdge, 2.5);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D unavailable");

    await page.render({ canvas, canvasContext: ctx, viewport }).promise;

    const blob: Blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png", 0.92);
    });
    const blobUrl = URL.createObjectURL(blob);

    onPage({ pageNum: i, blobUrl, width: canvas.width, height: canvas.height });
    canvas.width = 0;
    canvas.height = 0;
  }

  try {
    await doc.cleanup();
  } catch {}

  return { pageCount };
}
