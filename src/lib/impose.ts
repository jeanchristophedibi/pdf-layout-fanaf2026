import { PDFDocument } from "pdf-lib";

export interface ImpositionOptions {
  paper: "A4" | "A3";
  orientation: "landscape" | "portrait";
  layout: "4x2" | "2x4";
  margin_mm: number;
  gap_mm: number;
}

export interface BadFile {
  path: string;
  error: string;
}

export interface ImpositionResult {
  success: boolean;
  pdfBytes?: Uint8Array;
  total_pages?: number;
  sheets?: number;
  bad_files: BadFile[];
  total_bad: number;
  error?: string;
}

const PAPER_SIZES: Record<string, [number, number]> = {
  A4: [595, 842],
  A3: [842, 1191],
};

const MM_TO_PT = 72 / 25.4;

function isProbablyPdf(buffer: Uint8Array): boolean {
  if (buffer.byteLength < 1024) return false;
  // Check %PDF- magic header
  return (
    buffer[0] === 0x25 && // %
    buffer[1] === 0x50 && // P
    buffer[2] === 0x44 && // D
    buffer[3] === 0x46 && // F
    buffer[4] === 0x2d    // -
  );
}

export async function impose8up(
  inputFiles: { name: string; data: Uint8Array }[],
  options: ImpositionOptions
): Promise<ImpositionResult> {
  const bad: BadFile[] = [];

  let [w, h] = PAPER_SIZES[options.paper.toUpperCase()];
  if (options.orientation === "landscape") {
    [w, h] = [h, w];
  }

  const [cols, rows] = options.layout === "4x2" ? [4, 2] : [2, 4];
  const margin = options.margin_mm * MM_TO_PT;
  const gap = options.gap_mm * MM_TO_PT;
  const cellW = (w - 2 * margin - (cols - 1) * gap) / cols;
  const cellH = (h - 2 * margin - (rows - 1) * gap) / rows;

  // Load and validate all PDFs, collect individual pages
  const allPages: { doc: PDFDocument; pageIndex: number }[] = [];

  for (const file of inputFiles) {
    if (!isProbablyPdf(file.data)) {
      bad.push({ path: file.name, error: "Not a valid PDF (bad header or too small)" });
      continue;
    }
    try {
      const doc = await PDFDocument.load(file.data, { ignoreEncryption: true });
      const count = doc.getPageCount();
      if (count === 0) {
        bad.push({ path: file.name, error: "0 pages" });
        continue;
      }
      for (let i = 0; i < count; i++) {
        allPages.push({ doc, pageIndex: i });
      }
    } catch (e) {
      bad.push({ path: file.name, error: e instanceof Error ? e.message : String(e) });
    }
  }

  if (allPages.length === 0) {
    return {
      success: false,
      error: "Aucun PDF valide n'a pu être ouvert.",
      bad_files: bad.slice(0, 50),
      total_bad: bad.length,
    };
  }

  // Create output document
  const out = await PDFDocument.create();
  const perSheet = cols * rows;

  for (let i = 0; i < allPages.length; i += perSheet) {
    const chunk = allPages.slice(i, i + perSheet);
    const sheet = out.addPage([w, h]);

    // Embed all pages in this chunk (grouped by source doc for efficiency)
    const embeddedMap = new Map<PDFDocument, Awaited<ReturnType<typeof out.embedPages>>>();

    // Collect which pages we need from each source doc
    const neededByDoc = new Map<PDFDocument, number[]>();
    for (const { doc, pageIndex } of chunk) {
      if (!neededByDoc.has(doc)) neededByDoc.set(doc, []);
      neededByDoc.get(doc)!.push(pageIndex);
    }

    // Embed pages from each source doc
    for (const [doc, indices] of neededByDoc) {
      const embedded = await out.embedPages(
        indices.map((idx) => doc.getPage(idx))
      );
      embeddedMap.set(doc, embedded);
    }

    // Track how many pages we've consumed from each doc in this chunk
    const consumedByDoc = new Map<PDFDocument, number>();

    for (let j = 0; j < chunk.length; j++) {
      const { doc } = chunk[j];
      const row = Math.floor(j / cols);
      const col = j % cols;

      const x = margin + col * (cellW + gap);
      // pdf-lib Y origin is bottom-left, so invert row order
      const y = h - margin - (row + 1) * cellH - row * gap;

      const consumed = consumedByDoc.get(doc) || 0;
      const embeddedPage = embeddedMap.get(doc)![consumed];
      consumedByDoc.set(doc, consumed + 1);

      // Scale to fit cell while keeping proportion
      const srcW = embeddedPage.width;
      const srcH = embeddedPage.height;
      const scale = Math.min(cellW / srcW, cellH / srcH);
      const scaledW = srcW * scale;
      const scaledH = srcH * scale;

      // Center within cell
      const offsetX = x + (cellW - scaledW) / 2;
      const offsetY = y + (cellH - scaledH) / 2;

      sheet.drawPage(embeddedPage, {
        x: offsetX,
        y: offsetY,
        width: scaledW,
        height: scaledH,
      });
    }
  }

  const pdfBytes = await out.save();

  return {
    success: true,
    pdfBytes,
    total_pages: allPages.length,
    sheets: out.getPageCount(),
    bad_files: bad.slice(0, 50),
    total_bad: bad.length,
  };
}
