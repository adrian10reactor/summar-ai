import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI, Part, Content } from "@google/generative-ai";

const MODELS = [
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.5-pro",
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-3-flash-preview",
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
    } = body as {
      message: string;
      history: { role: "user" | "assistant"; content: string }[];
      materials: { type: string; data: string; name: string }[];
    };

    const materialParts: Part[] = [];
    const materialNames: string[] = [];

    for (const mat of materials) {
      if (mat.type === "pdf") {
        materialParts.push({ inlineData: { mimeType: "application/pdf", data: mat.data } });
        materialNames.push(mat.name);
      } else if (mat.type === "text") {
        materialParts.push({ text: `[Study notes - "${mat.name}"]:\n${mat.data}\n` });
        materialNames.push(mat.name);
      } else if (mat.type === "link") {
        materialParts.push({ text: `[Reference link: ${mat.data}]\n` });
        materialNames.push(mat.name);
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

        const result = await chat.sendMessage(message);
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
        if (err.message.includes("429") || err.message.includes("quota") || err.message.includes("RESOURCE_EXHAUSTED")) {
          continue;
        }
        throw e;
      }
    }

    return NextResponse.json({ error: "All models rate-limited. Try again in a minute." }, { status: 429 });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("Chat error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
