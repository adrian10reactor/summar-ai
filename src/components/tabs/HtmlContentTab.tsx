"use client";

import { useState } from "react";
import { Subject } from "@/types";
import { deductCredits, estimateApiCost } from "@/lib/credits";
import { parseApiResponse } from "@/lib/api";

function downloadAsHtml(contentHtml: string, displayName: string) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${displayName} - Summar AI</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, sans-serif; background: #0f0f13; color: #e4e4e7; min-height: 100vh; padding: 3rem 1rem; }
  .container { max-width: 800px; margin: 0 auto; }
  h1 { font-size: 1.8rem; font-weight: 700; background: linear-gradient(90deg, #a78bfa, #818cf8); -webkit-background-clip: text; -webkit-text-fill-color: transparent; text-align: center; margin-bottom: 0.5rem; }
  .subtitle { text-align: center; color: #71717a; font-size: 0.875rem; margin-bottom: 2.5rem; }
  .content { background: #18181b; border: 1px solid #27272a; border-radius: 12px; padding: 2rem; }
  h2 { font-size: 1.3rem; font-weight: 700; color: #a78bfa; margin-top: 2rem; margin-bottom: 1rem; }
  h2:first-child { margin-top: 0; }
  h3 { font-size: 1.1rem; font-weight: 600; color: #e4e4e7; margin-top: 1.5rem; margin-bottom: 0.75rem; }
  h4 { font-size: 1rem; font-weight: 500; color: #d4d4d8; margin-top: 1rem; margin-bottom: 0.5rem; }
  p { color: #d4d4d8; line-height: 1.7; margin-bottom: 0.75rem; }
  ul, ol { margin-left: 1.5rem; margin-bottom: 0.75rem; }
  li { color: #d4d4d8; margin-bottom: 0.25rem; line-height: 1.6; }
  strong { color: #f4f4f5; }
  code { background: #27272a; padding: 0.15em 0.4em; border-radius: 4px; color: #a78bfa; font-size: 0.85em; }
  pre { background: #09090b; border-radius: 8px; padding: 1rem; overflow-x: auto; margin: 0.75rem 0; }
  pre code { background: transparent; padding: 0; }
  blockquote { border-left: 4px solid #7c3aed; padding-left: 1rem; font-style: italic; color: #a1a1aa; margin: 0.75rem 0; }
  table { width: 100%; border-collapse: collapse; margin: 0.75rem 0; }
  th { background: #27272a; padding: 0.5rem 0.75rem; text-align: left; color: #e4e4e7; font-size: 0.875rem; }
  td { padding: 0.5rem 0.75rem; border-top: 1px solid #27272a; color: #d4d4d8; font-size: 0.875rem; }
  hr { border: none; border-top: 1px solid #27272a; margin: 1.5rem 0; }
  details { background: #09090b; border-radius: 8px; padding: 1rem; margin: 0.75rem 0; }
  summary { cursor: pointer; color: #a78bfa; font-weight: 500; font-size: 0.875rem; }
  .footer { text-align: center; color: #3f3f46; font-size: 0.75rem; margin-top: 3rem; }
</style>
</head>
<body>
<div class="container">
  <h1>Summar AI</h1>
  <p class="subtitle">${displayName}</p>
  <div class="content">${contentHtml}</div>
  <p class="footer">Generated with Summar AI</p>
</div>
</body>
</html>`;

  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${displayName.replace(/[^a-zA-Z0-9]/g, "_")}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function HtmlContentTab({
  subject,
  contentKey,
  title,
  emptyIcon,
  emptyText,
  apiMode,
  getMaterials,
  hasLoadedMaterials,
  hasMaterials,
  onSave,
  onCost,
  onUpdated,
}: {
  subject: Subject;
  contentKey: "studyGuide" | "cheatSheet" | "examPrep";
  title: string;
  emptyIcon: string;
  emptyText: string;
  apiMode: string;
  getMaterials: () => { type: string; data: string; name: string }[];
  hasLoadedMaterials: boolean;
  hasMaterials: boolean;
  onSave: (subjectId: string, html: string) => void;
  onCost: (amount: number, action: string) => void;
  onUpdated: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const existing = subject.content[contentKey];

  const handleGenerate = async () => {
    const materials = getMaterials();
    if (materials.length === 0) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: apiMode, materials }),
      });
      const data = await parseApiResponse<{ html: string; _usage?: { tokensIn: number; tokensOut: number } }>(res);

      const usage = data._usage || { tokensIn: 0, tokensOut: 0 };
      const apiCost = estimateApiCost(usage.tokensIn, usage.tokensOut);
      const { charged } = deductCredits(apiCost, apiMode, subject.name, usage.tokensIn, usage.tokensOut);
      onCost(charged, `Generated ${title}`);

      onSave(subject.id, data.html);
      onUpdated();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  if (!existing) {
    return (
      <div className="py-16 space-y-4">
        <p className="text-5xl">{emptyIcon}</p>
        <h3 className="text-lg font-semibold text-zinc-300">{title}</h3>
        <p className="text-sm text-zinc-500 max-w-sm">{emptyText}</p>
        {error && (
          <p className="text-red-400 text-sm bg-red-950/30 rounded-lg px-4 py-3 max-w-md">{error}</p>
        )}
        <button
          onClick={handleGenerate}
          disabled={loading || !hasLoadedMaterials}
          className="px-6 py-3 rounded-xl font-semibold text-white bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          {loading ? "Generating..." : !hasMaterials ? "Upload materials first" : !hasLoadedMaterials ? "Re-upload PDFs first" : `Generate ${title}`}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <p className="text-xs text-zinc-600 flex-1">
          Generated {new Date(existing.generatedAt).toLocaleDateString()}
        </p>
        <button
          onClick={() => downloadAsHtml(existing.html, `${subject.name} - ${title}`)}
          className="text-xs px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors"
        >
          Download HTML
        </button>
        <button
          onClick={handleGenerate}
          disabled={loading || !hasLoadedMaterials}
          className="text-xs px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 disabled:opacity-40 transition-colors"
        >
          {loading ? "Regenerating..." : "Regenerate"}
        </button>
      </div>

      {error && (
        <p className="text-red-400 text-sm bg-red-950/30 rounded-lg px-4 py-3">{error}</p>
      )}

      <div
        className="prose prose-invert prose-sm max-w-none
          bg-zinc-900 border border-zinc-800 rounded-xl p-6
          [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-violet-300 [&_h2]:mt-8 [&_h2]:mb-4 [&_h2]:first:mt-0
          [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-zinc-200 [&_h3]:mt-6 [&_h3]:mb-3
          [&_h4]:text-base [&_h4]:font-medium [&_h4]:text-zinc-300 [&_h4]:mt-4 [&_h4]:mb-2
          [&_p]:text-zinc-300 [&_p]:leading-relaxed [&_p]:mb-3
          [&_ul]:space-y-1 [&_ul]:ml-4 [&_ul]:list-disc [&_ol]:space-y-1 [&_ol]:ml-4 [&_ol]:list-decimal
          [&_li]:text-zinc-300
          [&_strong]:text-zinc-100
          [&_code]:bg-zinc-800 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-violet-300 [&_code]:text-xs
          [&_pre]:bg-zinc-950 [&_pre]:rounded-lg [&_pre]:p-4 [&_pre]:overflow-x-auto [&_pre_code]:bg-transparent [&_pre_code]:p-0
          [&_blockquote]:border-l-4 [&_blockquote]:border-violet-500 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-zinc-400
          [&_table]:w-full [&_th]:bg-zinc-800 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:text-zinc-200 [&_th]:text-sm
          [&_td]:px-3 [&_td]:py-2 [&_td]:border-t [&_td]:border-zinc-800 [&_td]:text-zinc-300 [&_td]:text-sm
          [&_hr]:border-zinc-800 [&_hr]:my-6
          [&_details]:bg-zinc-950 [&_details]:rounded-lg [&_details]:p-4 [&_details]:my-3
          [&_summary]:cursor-pointer [&_summary]:text-violet-400 [&_summary]:font-medium [&_summary]:text-sm"
        dangerouslySetInnerHTML={{ __html: existing.html }}
      />
    </div>
  );
}
