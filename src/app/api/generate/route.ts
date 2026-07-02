import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI, Part } from "@google/generative-ai";
import { callOpenRouter, isOpenRouterConfigured, OpenRouterMessage } from "@/lib/openrouter";

const MODELS = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash-lite",
  "gemini-2.5-pro",
  "gemini-2.0-flash-001",
  "gemini-2.0-flash-lite-001",
];

type Mode = "quiz" | "study-guide" | "cheat-sheet" | "exam-prep" | "custom" | "exam-solve";

const RICH_VISUALS = `
RICH VISUALS — use whichever fits best. All render natively in the app:

1) MATH — always typeset math with LaTeX inside $...$ (inline) or $$...$$ (display).
   Write bare dollar delimiters — NOT escaped like \\$ or \\\\$. Just $x^2$ and $$\\int f(x)dx$$.
   NEVER wrap math inside <pre>, <code>, or a code block — those tags are for computer code (Python, C++, shell) ONLY. Do NOT use them for formulas, definitions, derivations, or any mathematical expression.
   NEVER write formulas as plain text like "E = m*c^2" or "f'(x) = lim(h→0) [f(x+h) - f(x)] / h" — always convert to LaTeX: $E = mc^2$, or for the derivative definition: $$f'(x) = \\lim_{h \\to 0} \\frac{f(x+h) - f(x)}{h}$$.
   RULE OF THUMB: if the "code" you're about to put in a <pre> block contains math operators (=, +, -, *, /, ^, ∫, ∑, √, →, greek letters, sub/superscripts) but is NOT actual programming syntax, it belongs in $$...$$ math instead.
   Applies to ALL subjects: physics, chemistry, statistics, econ, linguistics IPA, music theory, whatever.

2) STRUCTURED DIAGRAMS via Mermaid — wrap in <div class="mermaid">…</div>. Great for:
   - flowcharts (algorithm steps, decision trees)
   - state diagrams (finite automata, game states, protocol states)
   - sequence diagrams (network protocols, method calls, conversations)
   - class diagrams (OOP hierarchies, biology taxonomies, family trees)
   - ER diagrams (databases, relationships)
   - timelines / gantt (history, project plans)
   - mindmaps (concept maps)
   Example: <div class="mermaid">flowchart TD; A[Start] --> B{Decision}; B -->|yes| C; B -->|no| D</div>
   Mermaid syntax MUST be strict and minimal or it will fail:
   - Node labels: keep them SHORT and free of parentheses, quotes, math delimiters, angle brackets, or LaTeX. Rewrite "f(x_0)" as "f of x0" inside a label.
   - Never nest $...$ math or HTML tags inside Mermaid labels.
   - Prefer flowchart TD / LR with simple ASCII arrows (-->, ---, -.->).
   - If a diagram concept is spatial/quantitative (physics, geometry, etc.), use SVG instead — Mermaid is for structured flow/state.

3) FREEFORM SVG SKETCHES — inline <svg viewBox="0 0 W H" xmlns="http://www.w3.org/2000/svg">…</svg>.
   Use when a spatial diagram is called for and the numeric values from the problem matter:
   - physics: free-body force diagrams (arrows for gravity, normal force, tension, friction), projectile motion with initial velocity vector and trajectory, ray optics with mirrors/lenses/rays, circuits, wave diagrams
   - math: geometry constructions with labeled sides/angles, coordinate systems with plotted points/functions, vector operations, number lines
   - chemistry: molecular structures, reaction arrows, energy diagrams
   - biology: labeled anatomy, food webs
   Bake actual values from the problem into <text> labels (e.g. "v₀ = 20 m/s", "h = 45 m", "θ = 30°").
   Use stroke="#a78bfa" for main lines, stroke="#e4e4e7" for axes/reference, fill="#e4e4e7" for text, define arrowhead <marker> once and reuse.
   Give the SVG a viewBox that fits the drawing so it scales. Keep it clean, not photorealistic.

Pick the right tool: use Mermaid for structured/logical graphs, SVG for spatial/quantitative sketches, math delimiters for any equation.
`;

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

CRITICAL STRUCTURE RULES — THE UI RENDERS <h2> AS TOP-LEVEL TABS AND <h3> AS SUB-TABS. STRUCTURE ACCORDINGLY:
- <h2> = one per lecture / topic / chapter / uploaded PDF. If the materials cover "MPI", "PRAM", "APRAM", produce exactly one <h2> per one of those.
- <h3> = subsection tabs INSIDE a given <h2>. Every <h2> should have 3–8 <h3> children that break the topic into digestible parts a student can flip through (e.g. "Overview & motivation", "Key concepts & terminology", "Algorithms & examples", "Common patterns", "Complexity analysis", "Practice questions").
- <h4> = further headings INSIDE a subsection body (small groupings under an <h3>). Never use <h4> where an <h3> subtab would be more appropriate.
- Content between <h2> and its first <h3> is treated as an intro paragraph for that lecture. Keep it short — one or two sentences — everything meaty belongs inside <h3> subsections.
- Do NOT nest <h2> inside another section's content. Do NOT skip levels (no <h3> before any <h2>).

CONTENT QUALITY:
- Explain concepts thoroughly — full sentences, not just bullet lists. This should be a complete study resource, not a summary.
- Cover ALL important knowledge from every provided material. Do not skip topics — students rely on this for exams.
- Include key definitions in <strong> tags
- Include formulas/code in <code> or <pre> blocks
- Use <table> for comparisons, classifications, structured data
- Wrap worked examples in: <div style="background:#1e222e;border-left:3px solid #5b9dff;border-radius:6px;padding:10px 14px;margin:10px 0">
- Wrap study tips in: <div style="background:#1a2e1a;border-left:3px solid #7ee787;border-radius:6px;padding:10px 14px;margin:10px 0">
- Wrap common-mistake warnings in: <div style="background:#2e1a1a;border-left:3px solid #ff7b72;border-radius:6px;padding:10px 14px;margin:10px 0">

OUTPUT FORMAT:
- Output ONLY valid HTML (no markdown, no code fences, no wrapping)
- Use these HTML elements: <h2>, <h3>, <h4>, <p>, <ul>, <ol>, <li>, <strong>, <em>, <code>, <pre>, <blockquote>, <table>, <tr>, <th>, <td>, <hr>, <div>
- Do NOT include <html>, <head>, <body>, <style> tags

${RICH_VISUALS}

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
- Use these HTML elements: <h2>, <h3>, <p>, <ul>, <ol>, <li>, <strong>, <em>, <code>, <pre>, <table>, <tr>, <th>, <td>, <hr>, <div>, <svg>
- Do NOT include <html>, <head>, <body>, <style> tags

${RICH_VISUALS}

Start directly with the HTML content.`;
  }

  if (mode === "exam-solve") {
    return `You are a master tutor. The provided document${plural} contain one or more exam papers, problem sheets, or task collections. Your job: SOLVE every problem in them, one by one, with full explanations a student can learn from.

${multiNote}

For EACH problem:
1. Restate the problem clearly (paraphrased in your own words is fine, but include the given numbers verbatim).
2. Show the setup — list the givens and what's being asked, define notation.
3. Draw a sketch when the problem is spatial / quantitative (physics free body, projectile, geometry, circuit, ray optics, chemistry structure, etc.) — inline <svg> with the actual numbers from the problem baked into <text> labels.
4. Solve step by step. Every non-trivial step gets a one-line justification ("apply Newton's second law", "differentiate both sides w.r.t. t", etc.).
5. Box the final answer clearly (bold + a boxed div or clear delimiter).
6. Explain the conceptual takeaway in one or two sentences — what did this problem teach?
7. If the problem statement comes from a specific page of a specific uploaded PDF, cite it: "(from Exam_2023.pdf, p. 3)".

Structural rules:
- Use <h2> per exam / problem set, <h3> per individual problem ("Problem 1", "Zadatak 2", whatever the source uses).
- Include ALL problems — don't skip any, even easy ones. Students often want the easy ones worked too so they can check technique.
- If a problem is ambiguous or has multiple interpretations, briefly note that at the top and solve the most likely one.
- Output ONLY valid HTML (no markdown, no code fences, no wrapping).
- Use these HTML elements: <h2>, <h3>, <h4>, <p>, <ul>, <ol>, <li>, <strong>, <em>, <code>, <pre>, <blockquote>, <table>, <tr>, <th>, <td>, <hr>, <div>, <svg>, <details>, <summary>
- Do NOT include <html>, <head>, <body>, <style> tags

${RICH_VISUALS}

Start directly with the first <h2>.`;
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

${RICH_VISUALS}

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
- For problems involving physics forces, projectile motion, geometry, circuits, ray optics, etc., include an inline SVG sketch of the setup with the exact numbers from the problem baked into <text> labels — this is often what makes the answer clickable

${RICH_VISUALS}

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
  throw new Error("High usage — try again in a minute.");
}

function cleanError(message: string): string {
  // Let our own informative fallback messages pass through untouched.
  if (message.startsWith("Gemini daily quota exhausted.")) return message;
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
      otherSubjects = [],
    } = body as {
      mode: Mode;
      materials: {
        type: string; data: string; name: string;
        id?: string; uri?: string; mimeType?: string;
        pageUris?: { pageNum: number; uri: string; mimeType: string }[];
        pageCount?: number;
      }[];
      customPrompt?: string;
      customSectionPrompt?: string;
      otherSubjects?: { id: string; name: string; topics: string[] }[];
    };

    if (materials.length === 0) {
      return NextResponse.json({ error: "No materials provided" }, { status: 400 });
    }

    const parts: Part[] = [];
    let fileCount = 0;
    const imageMaterials: { id: string; name: string }[] = [];
    const pageMaterials: { id: string; name: string; pageCount: number }[] = [];

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
        const pc = mat.pageCount ?? mat.pageUris?.length ?? 0;
        if (mat.id && pc > 0) {
          pageMaterials.push({ id: mat.id, name: mat.name, pageCount: pc });
        }
      } else if (mat.type === "image") {
        if (mat.uri) {
          parts.push({ fileData: { mimeType: mat.mimeType || "image/png", fileUri: mat.uri } });
        } else if (mat.data) {
          parts.push({ inlineData: { mimeType: mat.mimeType || "image/png", data: mat.data } });
        } else {
          continue;
        }
        fileCount++;
        if (mat.id) imageMaterials.push({ id: mat.id, name: mat.name });
      } else if (mat.type === "link") {
        parts.push({ text: `[Reference link: ${mat.data}]\n` });
        fileCount++;
      } else if (mat.type === "text") {
        parts.push({ text: `[Study notes - "${mat.name}"]:\n${mat.data}\n` });
        fileCount++;
      }
    }

    let prompt = buildPrompt(mode, fileCount, customSectionPrompt);

    // Visual asset instructions — only applies to HTML modes, not quiz.
    if (mode !== "quiz" && (imageMaterials.length > 0 || pageMaterials.length > 0)) {
      const lines: string[] = [];
      lines.push("\n\nVISUAL ASSETS YOU CAN INCLUDE IN THE OUTPUT:");
      if (imageMaterials.length > 0) {
        lines.push("\nStandalone images the user uploaded (reference by id):");
        for (const im of imageMaterials) lines.push(`- id="${im.id}" name="${im.name}"`);
        lines.push('Embed with: <img data-material="ID" alt="short caption">');
      }
      if (pageMaterials.length > 0) {
        lines.push("\nPDF pages available as figures (reference by material id + 1-indexed page number):");
        for (const pm of pageMaterials) lines.push(`- id="${pm.id}" name="${pm.name}" pages=${pm.pageCount}`);
        lines.push('Embed with: <img data-material="ID" data-page="N" alt="short caption">');
        lines.push("Only reference a page when it contains a diagram / figure / table / equation worth showing in the study material — do not embed pure-text pages.");
      }
      lines.push("\nPlace each image at the natural point in the surrounding prose. Do not repeat the same image.");
      prompt += lines.join("\n");
    }

    // Cross-subject links — tell the model about the user's OTHER subjects and
    // let it insert links when a concept in this material is covered in another.
    if (mode !== "quiz" && otherSubjects.length > 0) {
      const lines: string[] = [];
      lines.push("\n\nCROSS-SUBJECT LINKS — VERY HIGH VALUE FOR THE STUDENT:");
      lines.push("The student is also studying these OTHER subjects. Their existing topics (top-level → subsection) are listed below.");
      lines.push("Actively hunt for opportunities to connect this material to those topics. Every time you mention a concept, tool, or formula that is CLEARLY owned by another subject on this list, add an inline link. Don't wait for a perfect match — even a partial connection is useful.");
      lines.push("");
      for (const s of otherSubjects) {
        const topicList = s.topics.length > 0 ? s.topics.join(", ") : "(no study guide yet)";
        lines.push(`- id="${s.id}" name="${s.name}" topics: ${topicList}`);
      }
      lines.push("");
      lines.push("Link syntax (place inline in the surrounding sentence, not on its own line):");
      lines.push('  <a data-subject-ref="OTHER_SUBJECT_ID" data-section="TOPIC_NAME">Covered in <em>Other Subject Name</em> → <em>Topic Name</em></a>');
      lines.push("");
      lines.push("Concrete examples:");
      lines.push('- Physics guide mentions "the velocity is the derivative of position" → add <a data-subject-ref="MATH_ID" data-section="Derivatives">Derivatives are covered in <em>Math</em></a>');
      lines.push('- Physics guide mentions "kinetic energy = 1/2 m v²" and Math has an "Integrals" topic → link to it when discussing work-energy theorem');
      lines.push('- Parallel Programming guide uses limits or asymptotic notation → link to Math\'s Limits / Asymptotic behavior');
      lines.push('- Any subject uses statistics/probability → link to the Statistics subject');
      lines.push("");
      lines.push("RULES:");
      lines.push("- The data-section string MUST come exactly from the topics list above (either the h2 or the 'h2 → h3' form). Never invent topic names.");
      lines.push("- Use links inline in prose, not as standalone sentences.");
      lines.push("- Aim for at least 1-2 cross-subject links per major section (<h2>) when the material genuinely touches another subject. If the material is completely unrelated, don't force it.");
      prompt += lines.join("\n");
    }

    if (customPrompt) {
      prompt += `\n\nADDITIONAL USER INSTRUCTIONS: ${customPrompt}`;
    }

    let result: { text: string; tokensIn: number; tokensOut: number };
    try {
      result = await callGemini(apiKey, prompt, parts);
    } catch (geminiErr) {
      if (!isOpenRouterConfigured()) {
        console.log("Gemini chain exhausted; OPENROUTER_API_KEY not set — no fallback available.");
        throw new Error("Gemini daily quota exhausted. Add OPENROUTER_API_KEY in Vercel env vars to enable free fallback, or wait until the quota resets (~1am Zagreb time).");
      }
      console.log("Gemini chain exhausted for generate, falling back to OpenRouter");
      // Assemble text-only view of the materials for the fallback.
      const textParts: string[] = [];
      const skipped: string[] = [];
      for (const mat of materials) {
        if (mat.type === "text") textParts.push(`### ${mat.name}\n${mat.data}`);
        else if (mat.type === "link") textParts.push(`- ${mat.name}: ${mat.data}`);
        else if (mat.type === "pdf" || mat.type === "image") skipped.push(mat.name);
      }
      const fallbackNote = skipped.length > 0
        ? `\n\n[Fallback mode — Gemini unavailable, running via OpenRouter. The following ${skipped.length} file material(s) can't be inspected in this fallback: ${skipped.slice(0, 5).join(", ")}${skipped.length > 5 ? "…" : ""}. Do your best from remaining sources and general knowledge.]`
        : "";
      const materialsSection = textParts.length > 0 ? `\n\nMATERIALS:\n\n${textParts.join("\n\n")}` : "";

      const or = await callOpenRouter([
        { role: "system", content: prompt + fallbackNote },
        { role: "user", content: `Generate now.${materialsSection}` },
      ], { maxTokens: 16384 });
      result = { text: or.text, tokensIn: or.tokensIn, tokensOut: or.tokensOut };
    }

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
