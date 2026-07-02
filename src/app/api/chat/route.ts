import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI, Part, Content } from "@google/generative-ai";
import { callOpenRouter, isOpenRouterConfigured, OpenRouterMessage } from "@/lib/openrouter";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODELS = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash-lite",
  "gemini-2.5-pro",
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
      crossSubject,
      mode = "regular",
    } = body as {
      message: string;
      history: { role: "user" | "assistant"; content: string }[];
      materials: { type: string; data: string; name: string; uri?: string; mimeType?: string }[];
      attachments?: { name: string; mimeType: string; uri?: string; data?: string }[];
      crossSubject?: { subjectNames: string[] };
      mode?: "regular" | "feynman" | "blurting";
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

    const crossHint = crossSubject && crossSubject.subjectNames.length > 1
      ? `\n\nThis is a CROSS-SUBJECT conversation. The student is combining these subjects at once: ${crossSubject.subjectNames.join(", ")}. Material file names are prefixed with [Subject Name] so you know which subject each source is from. Actively connect concepts across subjects when they overlap — call out when a technique from one subject applies in another.`
      : "";

    const modeIntro =
      mode === "feynman" ? `You are role-playing a CURIOUS, SLIGHTLY CONFUSED STUDENT (Feynman-technique mode). The USER will explain concepts to you as if teaching. Your job:
- Ask genuine clarifying questions where their explanation is unclear or has logical jumps ("wait, why does that follow?", "hmm, so does that mean X or Y?")
- Point out missing steps, hidden assumptions, or hand-waved conclusions
- Request concrete examples when they stay abstract
- Where their explanation contradicts the uploaded materials, mention it politely
- Be encouraging but genuinely probe for gaps — don't just accept everything
- Occasionally rephrase what they said back to them ("so if I understand right, ...") so they can see whether it makes sense
Do NOT lecture the student. You're not the teacher here — they are. Never explain the concept yourself unless directly asked. Your goal is to force them to explain fully, in their own words, until you (the student) actually get it.`
      : mode === "blurting" ? `You are running a BLURTING exercise. The USER will dump everything they remember about a topic. Your job: compare their dump against the uploaded materials and produce a structured review in this exact format:

<h3>✓ What you got right</h3>
<p>Brief acknowledgment of the correct points — one to three bullet lines, no long praise.</p>

<h3>✗ Missing from the materials</h3>
<p>The specific concepts, formulas, definitions, examples, or points from the uploaded materials that they did NOT mention. Be concrete. Reference which material each point comes from when possible.</p>

<h3>⚠ Errors or misconceptions</h3>
<p>Anything in their dump that's wrong or misleading, with the correction. If nothing is wrong, say so briefly.</p>

<h3>What to review next</h3>
<p>One or two specific sections/pages/topics they should re-read based on the gaps above.</p>

Keep the whole response focused and short — ~250-500 words. Every listed gap must be traceable to their uploaded materials.`
      : "";

    const systemPrompt = `You are a helpful study assistant. The student has uploaded these materials: ${materialNames.join(", ")}.${crossHint}${modeIntro ? "\n\n" + modeIntro : ""}

Your job is to help them learn and understand the material. When answering:
- Primarily use the uploaded materials as your knowledge source
- You can supplement with your general knowledge when the materials don't cover something
- Explain concepts clearly with examples
- If the student asks about something in the materials, quote or reference specific parts
- Ask follow-up questions to deepen understanding
- Use HTML for formatting: <strong>, <em>, <code>, <pre>, <ul>, <ol>, <li>, <p>, <h3>, <h4>, <blockquote>, <table>, <div>, <svg>
- Be encouraging and pedagogical

Rich visuals — use them when they help:
- Math: LaTeX inside $...$ (inline) or $$...$$ (display). Bare dollar delimiters, NOT escaped like \\$. Never wrap math inside <pre> or <code> — put delimiters inline in normal prose. Never write formulas as plain text like "x^2 + y^2 = r^2" — use $x^2 + y^2 = r^2$.
- Structured graphs (flowcharts, state, sequence, class, ER, timeline, mindmap): wrap Mermaid syntax in <div class="mermaid">…</div>. Keep labels SHORT and free of parens, quotes, math, angle brackets, or LaTeX — Mermaid parsing is fragile.
- Spatial sketches (physics force diagrams, projectile motion, geometry, circuits, ray optics, chemistry structures, etc.): inline <svg viewBox="0 0 W H" xmlns="http://www.w3.org/2000/svg">…</svg> with actual numbers from the problem baked into <text> labels. Use stroke="#a78bfa" for main lines, "#e4e4e7" for axes/text.
When solving a physics/math problem, draw the setup — a skica with the problem's specific values (v₀, h, angle, etc.) — alongside your solution.`;

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
          m.includes("502") || m.includes("504") || m.includes("DEADLINE_EXCEEDED") ||
          m.includes("404") || m.includes("NOT_FOUND") || m.includes("not found");
        if (isRetryable) {
          console.log(`${modelName} unavailable — full error: ${m}`);
          continue;
        }
        console.log(`${modelName} NON-retryable error (full): ${m}`);
        throw e;
      }
    }

    // Gemini chain exhausted — try OpenRouter as fallback if configured.
    if (isOpenRouterConfigured()) {
      console.log("Gemini chain exhausted, falling back to OpenRouter");
      try {
        // Build text-only prompt for OpenRouter. PDF/image URIs are Gemini-scoped
        // so we can't forward them; note this in the system prompt.
        const materialsText: string[] = [];
        const textMaterials: string[] = [];
        const skippedFiles: string[] = [];
        for (const mat of materials) {
          if (mat.type === "text") {
            textMaterials.push(`### ${mat.name}\n${mat.data}`);
          } else if (mat.type === "link") {
            materialsText.push(`- Reference link: ${mat.name} — ${mat.data}`);
          } else if (mat.type === "pdf" || mat.type === "image") {
            skippedFiles.push(mat.name);
          }
        }

        const fallbackSystem = systemPrompt +
          (skippedFiles.length > 0
            ? `\n\n[Fallback mode] Gemini was unavailable; running via OpenRouter. The following ${skippedFiles.length} file material(s) can't be inspected in this fallback: ${skippedFiles.slice(0, 5).join(", ")}${skippedFiles.length > 5 ? "…" : ""}. Answer based on the chat history, text notes, and general knowledge.`
            : "");

        const orMessages: OpenRouterMessage[] = [
          { role: "system", content: fallbackSystem },
        ];
        if (textMaterials.length > 0 || materialsText.length > 0) {
          orMessages.push({
            role: "system",
            content: [
              ...(textMaterials.length > 0 ? [`Study notes:\n\n${textMaterials.join("\n\n")}`] : []),
              ...(materialsText.length > 0 ? [`Other references:\n${materialsText.join("\n")}`] : []),
            ].join("\n\n"),
          });
        }
        for (const h of history) {
          orMessages.push({ role: h.role, content: h.content });
        }
        orMessages.push({ role: "user", content: message });

        const or = await callOpenRouter(orMessages);
        return NextResponse.json({
          reply: or.text,
          _usage: { tokensIn: or.tokensIn, tokensOut: or.tokensOut },
          _fallback: { provider: "openrouter", model: or.modelUsed },
        });
      } catch (e: unknown) {
        console.error("OpenRouter fallback failed:", e instanceof Error ? e.message : e);
        return NextResponse.json(
          { error: "Gemini quota exhausted and OpenRouter fallback also failed. Try again in a minute, or check OpenRouter account balance." },
          { status: 503 }
        );
      }
    }

    console.log("Gemini chain exhausted; OPENROUTER_API_KEY not set — no fallback available.");
    return NextResponse.json(
      { error: "Gemini daily quota exhausted. Add OPENROUTER_API_KEY in Vercel env vars to enable free fallback, or wait until the quota resets (~1am Zagreb time)." },
      { status: 503 }
    );
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
