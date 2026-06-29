import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI, Part } from "@google/generative-ai";

const MODELS = [
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.5-pro",
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-3-flash-preview",
  "gemini-3-pro-preview",
  "gemini-3.1-pro-preview",
  "gemini-2.0-flash-001",
  "gemini-2.0-flash-lite-001",
  "gemma-4-31b-it",
  "gemma-4-26b-a4b-it",
];

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "your_key_here") {
    return NextResponse.json(
      { error: "GEMINI_API_KEY not configured in .env.local" },
      { status: 500 }
    );
  }

  try {
    const formData = await req.formData();
    const files = formData.getAll("pdf") as File[];
    const countRaw = formData.get("count") as string | null;
    const difficulty = (formData.get("difficulty") as string) || "mixed";
    const autoCount = countRaw === "auto";
    const count = autoCount
      ? null
      : Math.min(Math.max(parseInt(countRaw || "10"), 3), 50);

    if (files.length === 0) {
      return NextResponse.json({ error: "No PDF uploaded" }, { status: 400 });
    }

    const pdfParts: Part[] = [];
    for (const file of files) {
      const bytes = await file.arrayBuffer();
      const base64 = Buffer.from(bytes).toString("base64");
      pdfParts.push({
        inlineData: {
          mimeType: "application/pdf",
          data: base64,
        },
      });
    }

    const countInstruction = autoCount
      ? "Decide the appropriate number of questions based on the amount and complexity of the content (between 5 and 40)."
      : `Generate exactly ${count} multiple-choice questions.`;

    const difficultyInstruction =
      difficulty === "mixed"
        ? "Mix easy, medium, and hard questions."
        : `All questions should be ${difficulty} difficulty.`;

    const multiFileNote =
      files.length > 1
        ? `You are given ${files.length} PDF documents. Generate questions that cover material from ALL of them.`
        : "";

    const prompt = `You are a quiz generator for students. Based on the content of the provided PDF${files.length > 1 ? "s" : ""}, ${countInstruction}

${multiFileNote}

Rules:
- Each question must have exactly 4 options (A, B, C, D)
- ${difficultyInstruction}
- Questions should test understanding, not just recall
- Include a brief explanation for the correct answer
- Respond ONLY with valid JSON, no markdown fences

JSON format:
{
  "title": "Quiz: <short topic name>",
  "questions": [
    {
      "question": "...",
      "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
      "correctIndex": 0,
      "explanation": "..."
    }
  ]
}`;

    const genAI = new GoogleGenerativeAI(apiKey);

    for (const modelName of MODELS) {
      try {
        console.log(`Trying model: ${modelName}`);
        const model = genAI.getGenerativeModel({ model: modelName });

        const result = await model.generateContent([
          { text: prompt },
          ...pdfParts,
        ]);

        const raw = result.response.text();
        const jsonStr = raw
          .replace(/```json\n?/g, "")
          .replace(/```\n?/g, "")
          .trim();
        const quiz = JSON.parse(jsonStr);

        return NextResponse.json(quiz);
      } catch (e: unknown) {
        const err = e instanceof Error ? e : new Error(String(e));
        const is429 =
          err.message.includes("429") ||
          err.message.includes("quota") ||
          err.message.includes("RESOURCE_EXHAUSTED");
        if (is429) {
          console.log(`Rate limited on ${modelName}, trying next model...`);
          continue;
        }
        throw e;
      }
    }

    return NextResponse.json(
      {
        error:
          "All models are rate-limited. The free tier quota is exhausted — wait a minute and try again, or try a smaller PDF.",
      },
      { status: 429 }
    );
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("Generate error:", message);

    if (message.includes("429") || message.includes("quota")) {
      return NextResponse.json(
        {
          error:
            "Rate limit hit — wait about 30-60 seconds and try again. If it persists, the daily free quota may be exhausted.",
        },
        { status: 429 }
      );
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
