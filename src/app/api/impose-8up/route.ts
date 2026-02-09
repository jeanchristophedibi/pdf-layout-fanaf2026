import { NextRequest, NextResponse } from "next/server";
import { impose8up, type ImpositionOptions } from "@/lib/impose";

const MAX_FILES = 800;
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB per file

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    const paper = ((formData.get("paper") as string) || "A4").toUpperCase();
    const orientation = (formData.get("orientation") as string) || "landscape";
    const layout = (formData.get("layout") as string) || "4x2";
    const marginMm = parseFloat((formData.get("margin_mm") as string) || "6.0");
    const gapMm = parseFloat((formData.get("gap_mm") as string) || "3.0");

    // Validate options
    if (!["A4", "A3"].includes(paper)) {
      return NextResponse.json({ error: "Paper must be A4 or A3" }, { status: 400 });
    }
    if (!["landscape", "portrait"].includes(orientation)) {
      return NextResponse.json({ error: "Orientation must be landscape or portrait" }, { status: 400 });
    }
    if (!["4x2", "2x4"].includes(layout)) {
      return NextResponse.json({ error: "Layout must be 4x2 or 2x4" }, { status: 400 });
    }
    if (isNaN(marginMm) || marginMm < 0 || marginMm > 50) {
      return NextResponse.json({ error: "margin_mm must be between 0 and 50" }, { status: 400 });
    }
    if (isNaN(gapMm) || gapMm < 0 || gapMm > 50) {
      return NextResponse.json({ error: "gap_mm must be between 0 and 50" }, { status: 400 });
    }

    // Collect uploaded files
    const files = formData.getAll("files") as File[];
    if (!files || files.length === 0) {
      return NextResponse.json({ error: "No files uploaded" }, { status: 400 });
    }
    if (files.length > MAX_FILES) {
      return NextResponse.json(
        { error: `Too many files (${files.length}). Maximum is ${MAX_FILES}.` },
        { status: 400 }
      );
    }

    // Read files into memory
    const inputFiles: { name: string; data: Uint8Array }[] = [];
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: `File "${file.name}" exceeds 100 MB limit.` },
          { status: 400 }
        );
      }
      const buffer = await file.arrayBuffer();
      inputFiles.push({ name: file.name, data: new Uint8Array(buffer) });
    }

    // Run imposition in pure TS
    const options: ImpositionOptions = {
      paper: paper as "A4" | "A3",
      orientation: orientation as "landscape" | "portrait",
      layout: layout as "4x2" | "2x4",
      margin_mm: marginMm,
      gap_mm: gapMm,
    };

    const result = await impose8up(inputFiles, options);

    if (!result.success || !result.pdfBytes) {
      return NextResponse.json(
        {
          error: result.error || "Imposition failed",
          bad_files: result.bad_files,
          total_bad: result.total_bad,
        },
        { status: 422 }
      );
    }

    // Build output filename
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const outputName = `LOT_${ts}.pdf`;

    return new NextResponse(Buffer.from(result.pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${outputName}"`,
        "X-Total-Pages": String(result.total_pages || 0),
        "X-Sheets": String(result.sheets || 0),
        "X-Bad-Files": JSON.stringify(result.bad_files || []),
        "X-Total-Bad": String(result.total_bad || 0),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Imposition error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
