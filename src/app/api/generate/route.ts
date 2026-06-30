import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI, Part } from "@google/generative-ai";

const MODELS = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash-lite",
  "gemini-2.5-pro",
  "gemini-2.0-flash-001",
  "gemini-2.0-flash-lite-001",
  "gemini-1.5-flash",
  "gemini-1.5-flash-8b",
  "gemini-1.5-pro",
];

type Mode = "quiz" | "study-guide" | "cheat-sheet" | "exam-prep" | "custom";

function buildPrompt(mode: Mode, fileCount: number, customSectionPrompt?: string): string {
  const plural = fileCount > 1 ? "s" : "";
  const multiNote = fileCount > 1
    ? `You are given ${fileCount} documents. Cover material from ALL of them.`
    : "";

  if (mode === "quiz") {
    return `You are a quiz generator for students. Based on the provided document${plural}, generate 10-20 multiple-choice questions.

${multiNote}

Rules:
- Each question must have exactly 4 options (A, B, C, D)
- Mix easy, medium, and hard questions
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
  }

  if (mode === "study-guide") {
    return `You are an expert study guide creator. Based on the provided document${plural}, create a comprehensive, well-organized study guide.

${multiNote}

CRITICAL STRUCTURE RULES:
- You MUST organize the guide into clearly separated SECTIONS using <h2> for each major topic/lecture/chapter
- Each <h2> section MUST have subsections using <h3> and <h4>
- If the materials cover multiple lectures (e.g. "Lecture 02: MPI", "Lecture 03: PRAM"), each lecture MUST be its own <h2> section
- Within each section, explain concepts thoroughly — don't just list bullet points
- Include key definitions in <strong> tags
- Include formulas/code in <code> or <pre> blocks
- Use <table> for comparisons, classifications, or structured data
- Use examples with step-by-step explanations wrapped in a div: <div style="background:#1e222e;border-left:3px solid #5b9dff;border-radius:6px;padding:10px 14px;margin:10px 0">
- Use tip boxes: <div style="background:#1a2e1a;border-left:3px solid #7ee787;border-radius:6px;padding:10px 14px;margin:10px 0">
- Use warning boxes for common mistakes: <div style="background:#2e1a1a;border-left:3px solid #ff7b72;border-radius:6px;padding:10px 14px;margin:10px 0">
- Separate sections with <hr>
- Output ONLY valid HTML (no markdown, no code fences, no wrapping)
- Use these HTML elements: <h2>, <h3>, <h4>, <p>, <ul>, <ol>, <li>, <strong>, <em>, <code>, <pre>, <blockquote>, <table>, <tr>, <th>, <td>, <hr>, <div>
- Do NOT include <html>, <head>, <body>, <style> tags
- Make it VERY detailed and useful for studying — this should be a complete study resource
- Each section should be long enough to actually learn from, not just a summary

Start directly with the first <h2> tag. Do NOT start with any preamble text.`;
  }

  if (mode === "cheat-sheet") {
    return `You are an expert at creating compact cheat sheets. Based on the provided document${plural}, create a dense, well-organized cheat sheet.

${multiNote}

Rules:
- Include ONLY the most essential formulas, definitions, key facts, rules
- Group by topic/category
- Keep each item as brief as possible (one-liners preferred)
- Use tables for structured data
- This should be something a student prints on 1-2 pages before an exam
- Output ONLY valid HTML (no markdown, no code fences, no wrapping)
- Use these HTML elements: <h2>, <h3>, <p>, <ul>, <ol>, <li>, <strong>, <em>, <code>, <pre>, <table>, <tr>, <th>, <td>, <hr>
- Do NOT include <html>, <head>, <body>, <style> tags

Start directly with the HTML content.`;
  }

  if (mode === "custom") {
    return `You are an expert content creator. Based on the provided document${plural}, create content following this specific instruction:

${customSectionPrompt || "Create a useful summary section."}

${multiNote}

Rules:
- Follow the user's instruction precisely
- Output ONLY valid HTML (no markdown, no code fences, no wrapping)
- Use these HTML elements: <h2>, <h3>, <h4>, <p>, <ul>, <ol>, <li>, <strong>, <em>, <code>, <pre>, <blockquote>, <table>, <tr>, <th>, <td>, <hr>, <div>, <details>, <summary>
- Use styled boxes where appropriate: tip <div style="background:#1a2e1a;border-left:3px solid #7ee787;border-radius:6px;padding:10px 14px;margin:10px 0">, example <div style="background:#1e222e;border-left:3px solid #5b9dff;border-radius:6px;padding:10px 14px;margin:10px 0">, warning <div style="background:#2e1a1a;border-left:3px solid #ff7b72;border-radius:6px;padding:10px 14px;margin:10px 0">
- Do NOT include <html>, <head>, <body>, <style> tags
- Be thorough and detailed

Start directly with the HTML content.`;
  }

  // exam-prep
  return `You are a university professor and exam preparation expert. Based on the provided document${plural}, create comprehensive exam preparation materials.

${multiNote}

Rules:
- If the documents contain previous exams or practice problems, SOLVE them with full step-by-step explanations
- Extract likely exam questions from the study material
- Include a mix of: definitions, short-answer, essay-type, and calculation/problem-solving questions
- For each question provide a detailed model answer
- Organize by topic and difficulty
- Highlight common traps and mistakes students make
- Include tips for answering each type of question
- Output ONLY valid HTML (no markdown, no code fences, no wrapping)
- Use these HTML elements: <h2>, <h3>, <h4>, <p>, <ul>, <ol>, <li>, <strong>, <em>, <code>, <pre>, <blockquote>, <table>, <tr>, <th>, <td>, <hr>, <details>, <summary>
- Use <details><summary>Show Answer</summary>...</details> for model answers so students can test themselves
- Do NOT include <html>, <head>, <body>, <style> tags

Start directly with the HTML content.`;
}

async function callGemini(apiKey: string, prompt: string, parts: Part[]) {
  const genAI = new GoogleGenerativeAI(apiKey);

  for (const modelName of MODELS) {
    try {
      console.log(`Trying model: ${modelName}`);
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent([{ text: prompt }, ...parts]);
      const raw = result.response.text();
      const usage = result.response.usageMetadata;
      return {
        text: raw,
        tokensIn: usage?.promptTokenCount ?? 0,
        tokensOut: usage?.candidatesTokenCount ?? 0,
      };
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
  throw new Error("High usage — try again in a minute.");
}

function cleanError(message: string): string {
  if (/429|quota|RESOURCE_EXHAUSTED|503|UNAVAILABLE|overloaded|high demand|500|INTERNAL|502|504|DEADLINE_EXCEEDED/.test(message)) {
    return "High usage — try again in a minute.";
  }
  if (/PERMISSION_DENIED|API key not valid|API_KEY_INVALID/.test(message)) {
    return "API key issue — check your configuration.";
  }
  if (/SAFETY/.test(message)) {
    return "Blocked by safety filter. Try different materials or prompt.";
  }
  if (/expired|NOT_FOUND.*files/.test(message)) {
    return "Uploaded PDFs expired (48h limit) — re-upload them.";
  }
  return message.length > 120 ? "Generation failed. Try again." : message;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "your_key_here") {
    return NextResponse.json(
      { error: "GEMINI_API_KEY not configured in .env.local" },
      { status: 500 }
    );
  }

  try {
    const body = await req.json();
    const {
      mode = "quiz",
      materials = [],
      customPrompt = "",
      customSectionPrompt = "",
    } = body as {
      mode: Mode;
      materials: { type: string; data: string; name: string; uri?: string; mimeType?: string }[];
      customPrompt?: string;
      customSectionPrompt?: string;
    };

    if (materials.length === 0) {
      return NextResponse.json({ error: "No materials provided" }, { status: 400 });
    }

    const parts: Part[] = [];
    let fileCount = 0;

    for (const mat of materials) {
      if (mat.type === "pdf") {
        if (mat.uri) {
          parts.push({ fileData: { mimeType: mat.mimeType || "application/pdf", fileUri: mat.uri } });
        } else if (mat.data) {
          parts.push({ inlineData: { mimeType: "application/pdf", data: mat.data } });
        } else {
          continue;
        }
        fileCount++;
      } else if (mat.type === "link") {
        parts.push({ text: `[Reference link: ${mat.data}]\n` });
        fileCount++;
      } else if (mat.type === "text") {
        parts.push({ text: `[Study notes - "${mat.name}"]:\n${mat.data}\n` });
        fileCount++;
      }
    }

    let prompt = buildPrompt(mode, fileCount, customSectionPrompt);
    if (customPrompt) {
      prompt += `\n\nADDITIONAL USER INSTRUCTIONS: ${customPrompt}`;
    }
    const result = await callGemini(apiKey, prompt, parts);

    if (mode === "quiz") {
      const jsonStr = result.text
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();
      const data = JSON.parse(jsonStr);
      return NextResponse.json({
        ...data,
        _usage: { tokensIn: result.tokensIn, tokensOut: result.tokensOut },
      });
    }

    // HTML modes
    const html = result.text
      .replace(/```html\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();

    return NextResponse.json({
      html,
      _usage: { tokensIn: result.tokensIn, tokensOut: result.tokensOut },
    });
  } catch (e: unknown) {
    const raw = e instanceof Error ? e.message : "Unknown error";
    console.error("Generate error:", raw);
    return NextResponse.json({ error: cleanError(raw) }, { status: 500 });
  }
}
