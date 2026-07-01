"use client";

import { useState, useRef, useMemo } from "react";
import { Subject } from "@/types";
import { saveStudyGuide } from "@/lib/storage";
import { deductCredits, estimateApiCost } from "@/lib/credits";
import { parseApiResponse } from "@/lib/api";
import { ImageLookup, swapMaterialImages } from "@/lib/render";

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

type Subsection = { title: string; html: string };
type Section = { title: string; introHtml: string; subsections: Subsection[] };

function splitIntoSections(html: string): Section[] {
  if (typeof window === "undefined") return [{ title: "All", introHtml: html, subsections: [] }];
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, "text/html");
  const root = doc.body.firstElementChild;
  if (!root) return [{ title: "All", introHtml: html, subsections: [] }];

  const sections: Section[] = [];
  let currentSection: Section | null = null;
  let currentSub: Subsection | null = null;

  const closeSub = () => {
    if (currentSection && currentSub) {
      currentSection.subsections.push(currentSub);
      currentSub = null;
    }
  };

  for (const child of Array.from(root.children)) {
    if (child.tagName === "H2") {
      closeSub();
      if (currentSection) sections.push(currentSection);
      currentSection = { title: child.textContent || `Section ${sections.length + 1}`, introHtml: "", subsections: [] };
    } else if (child.tagName === "H3") {
      closeSub();
      if (!currentSection) {
        currentSection = { title: "Overview", introHtml: "", subsections: [] };
      }
      currentSub = { title: child.textContent || `Part ${currentSection.subsections.length + 1}`, html: "" };
    } else {
      if (currentSub) {
        currentSub.html += child.outerHTML;
      } else if (currentSection) {
        currentSection.introHtml += child.outerHTML;
      } else {
        currentSection = { title: "Overview", introHtml: child.outerHTML, subsections: [] };
      }
    }
  }
  closeSub();
  if (currentSection) sections.push(currentSection);

  if (sections.length === 0) return [{ title: "All", introHtml: html, subsections: [] }];
  return sections;
}

function shortTitle(title: string, max = 30): string {
  if (title.length <= max) return title;
  return title.slice(0, max - 1) + "…";
}

export default function StudyGuideTab({
  subject,
  getMaterials,
  hasLoadedMaterials,
  hasMaterials,
  onCost,
  onUpdated,
  onAskAbout,
  imageLookup,
}: {
  subject: Subject;
  getMaterials: () => { type: string; data: string; name: string }[];
  hasLoadedMaterials: boolean;
  hasMaterials: boolean;
  onCost: (amount: number, action: string) => void;
  onUpdated: () => void;
  onAskAbout: (payload: { message: string; chatName: string }) => void;
  imageLookup: ImageLookup;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const [activeSubIdx, setActiveSubIdx] = useState(0);
  const [selectionTooltip, setSelectionTooltip] = useState<{ x: number; y: number; text: string } | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const existing = subject.content.studyGuide;
  const sections = useMemo(() => existing ? splitIntoSections(existing.html) : [], [existing]);

  const handleGenerate = async () => {
    const materials = getMaterials();
    if (materials.length === 0) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "study-guide", materials }),
      });
      const data = await parseApiResponse<{ html: string; _usage?: { tokensIn: number; tokensOut: number } }>(res);

      const usage = data._usage || { tokensIn: 0, tokensOut: 0 };
      const apiCost = estimateApiCost(usage.tokensIn, usage.tokensOut);
      const { charged } = deductCredits(apiCost, "study-guide", subject.name, usage.tokensIn, usage.tokensOut);
      onCost(charged, "Generated Study Guide");
      saveStudyGuide(subject.id, data.html);
      onUpdated();
      setActiveIdx(0);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const readSelection = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !contentRef.current) {
      setSelectionTooltip(null);
      return;
    }
    const text = sel.toString().trim();
    if (text.length < 10) { setSelectionTooltip(null); return; }
    const range = sel.getRangeAt(0);
    if (!contentRef.current.contains(range.commonAncestorContainer)) {
      setSelectionTooltip(null);
      return;
    }
    const rect = range.getBoundingClientRect();
    const containerRect = contentRef.current.getBoundingClientRect();
    setSelectionTooltip({
      x: rect.left - containerRect.left + rect.width / 2,
      y: rect.top - containerRect.top - 8,
      text: text.slice(0, 1500),
    });
  };

  const handleMouseUp = () => {
    // Defer so the browser has finalized the selection
    setTimeout(readSelection, 0);
  };

  const handleScroll = () => setSelectionTooltip(null);

  const launchAsk = (verb: string, template: string) => {
    if (!selectionTooltip) return;
    const text = selectionTooltip.text;
    const snippet = text.length > 40 ? text.slice(0, 40) + "…" : text;
    onAskAbout({
      message: `${template}\n\n"${text}"`,
      chatName: `${verb}: ${snippet}`,
    });
    setSelectionTooltip(null);
    window.getSelection()?.removeAllRanges();
  };

  if (!existing) {
    return (
      <div className="py-12 space-y-4">
        <p className="text-4xl">📖</p>
        <h3 className="text-lg font-semibold text-zinc-300">Study Guide</h3>
        <p className="text-sm text-zinc-500 max-w-sm">Generate a comprehensive study guide organized by topics from your materials.</p>
        {error && <p className="text-red-400 text-sm bg-red-950/30 rounded-lg px-4 py-3 max-w-md">{error}</p>}
        <button
          onClick={handleGenerate}
          disabled={loading || !hasLoadedMaterials}
          className="px-6 py-3 rounded-xl font-semibold text-white bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          {loading ? "Generating..." : !hasMaterials ? "Upload materials first" : !hasLoadedMaterials ? "Re-upload PDFs first" : "Generate Study Guide"}
        </button>
      </div>
    );
  }

  const active = sections[activeIdx] || sections[0];
  const safeIdx = Math.min(activeIdx, sections.length - 1);
  const subs = active?.subsections || [];
  const safeSubIdx = subs.length > 0 ? Math.min(activeSubIdx, subs.length - 1) : 0;
  const activeSub = subs[safeSubIdx];
  const bodyHtml = subs.length > 0 ? (activeSub?.html || "") : (active?.introHtml || "");
  const chooseSection = (i: number) => { setActiveIdx(i); setActiveSubIdx(0); };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <p className="text-xs text-zinc-600 flex-1">
          Generated {new Date(existing.generatedAt).toLocaleDateString()} · {sections.length} section{sections.length !== 1 ? "s" : ""}
        </p>
        <button
          onClick={() => downloadAsHtml(existing.html, `${subject.name} - Study Guide`)}
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

      {error && <p className="text-red-400 text-sm bg-red-950/30 rounded-lg px-4 py-3">{error}</p>}

      <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-4">
        {/* Section sub-nav: horizontal pills on mobile, vertical list on desktop */}
        <nav className="md:space-y-0.5 self-start md:sticky md:top-2 flex md:block gap-1.5 overflow-x-auto md:overflow-visible pb-2 md:pb-0 -mx-1 px-1">
          <div className="hidden md:block text-[10px] text-zinc-600 uppercase tracking-wider px-2 mb-1">Lectures</div>
          {sections.map((s, i) => (
            <button
              key={i}
              onClick={() => chooseSection(i)}
              title={s.title}
              className={`shrink-0 md:w-full text-left px-2.5 py-1.5 text-xs rounded-lg transition-colors whitespace-nowrap md:whitespace-normal ${
                i === safeIdx
                  ? "bg-violet-600/20 text-violet-300 md:border-l-2 md:border-violet-500 border border-violet-500/40 md:border-l-2"
                  : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200 md:border-l-2 md:border-transparent border border-zinc-800"
              }`}
            >
              <div>{shortTitle(s.title)}</div>
              {s.subsections.length > 0 && (
                <div className="text-[9px] text-zinc-600 md:block hidden mt-0.5">{s.subsections.length} parts</div>
              )}
            </button>
          ))}
        </nav>

        {/* Active section content */}
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-violet-300 mb-3">{active?.title}</h2>

          {/* Sub-tabs (h3 → subsection) */}
          {subs.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto mb-3 pb-1 -mx-1 px-1 border-b border-zinc-800">
              {subs.map((sub, i) => (
                <button
                  key={i}
                  onClick={() => setActiveSubIdx(i)}
                  title={sub.title}
                  className={`shrink-0 text-xs px-3 py-1.5 rounded-t-lg transition-colors whitespace-nowrap border-b-2 -mb-px ${
                    i === safeSubIdx
                      ? "border-violet-500 text-violet-300 bg-violet-600/10"
                      : "border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40"
                  }`}
                >
                  {shortTitle(sub.title, 26)}
                </button>
              ))}
            </div>
          )}

          {subs.length > 0 && activeSub && (
            <h3 className="text-lg font-semibold text-zinc-200 mb-3">{activeSub.title}</h3>
          )}

          <div className="relative" ref={contentRef}>
            {selectionTooltip && (
              <div
                className="absolute z-50 flex gap-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl p-1 animate-fade-in select-none"
                style={{ left: selectionTooltip.x, top: selectionTooltip.y, transform: "translate(-50%, -100%)" }}
                onMouseDown={(e) => e.preventDefault()}
              >
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => launchAsk("Explain", "Explain this in more detail:")}
                  className="text-xs px-2.5 py-1.5 rounded text-violet-300 hover:bg-violet-600/20 transition-colors whitespace-nowrap"
                >
                  Explain
                </button>
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => launchAsk("Simplify", "Simplify and rewrite this so it's easier to understand:")}
                  className="text-xs px-2.5 py-1.5 rounded text-violet-300 hover:bg-violet-600/20 transition-colors whitespace-nowrap"
                >
                  Simplify
                </button>
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => launchAsk("Examples", "Give me examples for this concept:")}
                  className="text-xs px-2.5 py-1.5 rounded text-violet-300 hover:bg-violet-600/20 transition-colors whitespace-nowrap"
                >
                  Examples
                </button>
              </div>
            )}

            <div
              onMouseUp={handleMouseUp}
              onScroll={handleScroll}
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
              dangerouslySetInnerHTML={{ __html: swapMaterialImages(bodyHtml, subject, imageLookup) }}
            />
          </div>

          {(sections.length > 1 || subs.length > 1) && (() => {
            const goPrev = () => {
              if (subs.length > 0 && safeSubIdx > 0) {
                setActiveSubIdx(safeSubIdx - 1);
              } else if (safeIdx > 0) {
                const prevIdx = safeIdx - 1;
                const prevSubs = sections[prevIdx].subsections;
                setActiveIdx(prevIdx);
                setActiveSubIdx(prevSubs.length > 0 ? prevSubs.length - 1 : 0);
              }
            };
            const goNext = () => {
              if (subs.length > 0 && safeSubIdx < subs.length - 1) {
                setActiveSubIdx(safeSubIdx + 1);
              } else if (safeIdx < sections.length - 1) {
                setActiveIdx(safeIdx + 1);
                setActiveSubIdx(0);
              }
            };
            const atStart = safeIdx === 0 && (subs.length === 0 || safeSubIdx === 0);
            const atEnd = safeIdx === sections.length - 1 && (subs.length === 0 || safeSubIdx === subs.length - 1);
            return (
              <div className="flex justify-between mt-4">
                <button
                  onClick={goPrev}
                  disabled={atStart}
                  className="text-xs px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 disabled:opacity-30 transition-colors"
                >
                  &larr; Previous
                </button>
                <button
                  onClick={goNext}
                  disabled={atEnd}
                  className="text-xs px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 disabled:opacity-30 transition-colors"
                >
                  Next &rarr;
                </button>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
