import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI, Part, Content } from "@google/generative-ai";

const MODELS = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash-lite",
  "gemini-2.5-pro",
  "gemini-1.5-flash",
  "gemini-1.5-flash-8b",
  "gemini-1.5-pro",
];

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "your_key_here") {
    return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });
  }

  try {
    const body = await req.json();
    const {
      message,
      history = [],
      materials = [],
      attachments = [],
    } = body as {
      message: string;
      history: { role: "user" | "assistant"; content: string }[];
      materials: { type: string; data: string; name: string; uri?: string; mimeType?: string }[];
      attachments?: { name: string; mimeType: string; uri?: string; data?: string }[];
    };

    const materialParts: Part[] = [];
    const materialNames: string[] = [];

    for (const mat of materials) {
      if (mat.type === "pdf") {
        if (mat.uri) {
          materialParts.push({ fileData: { mimeType: mat.mimeType || "application/pdf", fileUri: mat.uri } });
        } else if (mat.data) {
          materialParts.push({ inlineData: { mimeType: "application/pdf", data: mat.data } });
        } else {
          continue;
        }
        materialNames.push(mat.name);
      } else if (mat.type === "image") {
        if (mat.uri) {
          materialParts.push({ fileData: { mimeType: mat.mimeType || "image/png", fileUri: mat.uri } });
        } else if (mat.data) {
          materialParts.push({ inlineData: { mimeType: mat.mimeType || "image/png", data: mat.data } });
        } else {
          continue;
        }
        materialNames.push(mat.name);
      } else if (mat.type === "text") {
        materialParts.push({ text: `[Study notes - "${mat.name}"]:\n${mat.data}\n` });
        materialNames.push(mat.name);
      } else if (mat.type === "link") {
        materialParts.push({ text: `[Reference link: ${mat.data}]\n` });
        materialNames.push(mat.name);
      }
    }

    const attachmentParts: Part[] = [];
    for (const att of attachments) {
      if (att.uri) {
        attachmentParts.push({ fileData: { mimeType: att.mimeType || "image/png", fileUri: att.uri } });
      } else if (att.data) {
        attachmentParts.push({ inlineData: { mimeType: att.mimeType || "image/png", data: att.data } });
      }
    }

    const systemPrompt = `You are a helpful study assistant. The student has uploaded these materials: ${materialNames.join(", ")}.

Your job is to help them learn and understand the material. When answering:
- Primarily use the uploaded materials as your knowledge source
- You can supplement with your general knowledge when the materials don't cover something
- Explain concepts clearly with examples
- If the student asks about something in the materials, quote or reference specific parts
- Ask follow-up questions to deepen understanding
- Use HTML for formatting: <strong>, <em>, <code>, <pre>, <ul>, <ol>, <li>, <p>, <h3>, <h4>, <blockquote>, <table>
- Be encouraging and pedagogical`;

    const chatHistory: Content[] = history.map((msg) => ({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }],
    }));

    const genAI = new GoogleGenerativeAI(apiKey);

    for (const modelName of MODELS) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const chat = model.startChat({
          history: [
            {
              role: "user",
              parts: [
                { text: systemPrompt },
                ...materialParts,
                { text: "I've shared my study materials with you. Ready to help me study?" },
              ],
            },
            {
              role: "model",
              parts: [{ text: "I've reviewed your materials. Ask me anything about them — I'll help you understand the concepts, solve problems, and prepare for exams." }],
            },
            ...chatHistory,
          ],
        });

        const result = attachmentParts.length > 0
          ? await chat.sendMessage([{ text: message }, ...attachmentParts])
          : await chat.sendMessage(message);
        const text = result.response.text();
        const usage = result.response.usageMetadata;

        return NextResponse.json({
          reply: text,
          _usage: {
            tokensIn: usage?.promptTokenCount ?? 0,
            tokensOut: usage?.candidatesTokenCount ?? 0,
          },
        });
      } catch (e: unknown) {
        const err = e instanceof Error ? e : new Error(String(e));
        const m = err.message;
        const isRetryable =
          m.includes("429") || m.includes("quota") || m.includes("RESOURCE_EXHAUSTED") ||
          m.includes("503") || m.includes("UNAVAILABLE") || m.includes("overloaded") || m.includes("high demand") ||
          m.includes("500") || m.includes("INTERNAL") ||
          m.includes("502") || m.includes("504") || m.includes("DEADLINE_EXCEEDED");
        if (isRetryable) {
          console.log(`${modelName} unavailable (${m.slice(0, 80)}), trying next...`);
          continue;
        }
        throw e;
      }
    }

    return NextResponse.json({ error: "High usage — try again in a minute." }, { status: 503 });
  } catch (e: unknown) {
    const raw = e instanceof Error ? e.message : "Unknown error";
    console.error("Chat error:", raw);
    let clean = raw;
    if (/429|quota|RESOURCE_EXHAUSTED|503|UNAVAILABLE|overloaded|high demand|500|INTERNAL|502|504|DEADLINE_EXCEEDED/.test(raw)) {
      clean = "High usage — try again in a minute.";
    } else if (/PERMISSION_DENIED|API key not valid|API_KEY_INVALID/.test(raw)) {
      clean = "API key issue — check your configuration.";
    } else if (/SAFETY/.test(raw)) {
      clean = "Blocked by safety filter.";
    } else if (/expired|NOT_FOUND.*files/.test(raw)) {
      clean = "Uploaded PDFs expired (48h limit) — re-upload them.";
    } else if (raw.length > 120) {
      clean = "Chat failed. Try again.";
    }
    return NextResponse.json({ error: clean }, { status: 500 });
  }
}
