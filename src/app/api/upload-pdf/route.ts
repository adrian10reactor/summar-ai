import { NextRequest, NextResponse } from "next/server";
import { GoogleAIFileManager } from "@google/generative-ai/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "your_key_here") {
    return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const mimeType = file.type || "application/pdf";
    const displayName = file.name || "document.pdf";

    const buffer = Buffer.from(await file.arrayBuffer());

    const fileManager = new GoogleAIFileManager(apiKey);
    const uploadResult = await fileManager.uploadFile(buffer, {
      mimeType,
      displayName,
    });

    return NextResponse.json({
      uri: uploadResult.file.uri,
      mimeType: uploadResult.file.mimeType,
      name: uploadResult.file.displayName || displayName,
    });
  } catch (e: unknown) {
    const raw = e instanceof Error ? e.message : "Upload failed";
    console.error("Upload error:", raw);
    let clean = "Upload failed.";
    if (/429|quota|RESOURCE_EXHAUSTED|503|UNAVAILABLE|overloaded/.test(raw)) {
      clean = "High usage — try again in a minute.";
    } else if (/PERMISSION_DENIED|API key not valid|API_KEY_INVALID/.test(raw)) {
      clean = "API key issue.";
    } else if (raw.length <= 120) {
      clean = raw;
    }
    return NextResponse.json({ error: clean }, { status: 500 });
  }
}
