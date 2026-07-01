"use client";

import { useMemo } from "react";
import { Subject } from "@/types";
import { swapMaterialImages, ImageLookup } from "@/lib/render";
import { preprocessMath } from "./RenderedHtml";

export interface CrossRefTarget {
  subjectId: string;
  section?: string;
}

function findSectionSnippet(subject: Subject, section?: string): { title: string; html: string } | null {
  const html = subject.content.studyGuide?.html;
  if (!html) return null;
  if (typeof window === "undefined") return null;

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, "text/html");
  const root = doc.body.firstElementChild;
  if (!root) return null;

  const raw = section?.trim() || "";
  // Section refs may come as "h2 → h3" from the topic list. Split so we can try
  // to land on the specific h3 first, then fall back to the h2 if not found.
  const parts = raw.split(/\s*(?:→|->|>)\s*/).map((p) => p.toLowerCase()).filter(Boolean);
  const wanted = parts[parts.length - 1] || "";

  const headings = Array.from(root.querySelectorAll("h2, h3"));
  let match: Element | null = null;
  if (wanted) {
    match = headings.find((h) => (h.textContent || "").toLowerCase().includes(wanted)) || null;
  }
  if (!match) match = headings[0] || null;
  if (!match) return null;

  // Walk siblings after this heading up to the next heading of same-or-higher rank.
  const rank = match.tagName === "H2" ? 2 : 3;
  const buf: string[] = [];
  let acc = 0;
  let node: Element | null = match.nextElementSibling;
  while (node && acc < 800) {
    const t = node.tagName;
    if (t === "H2" || (rank === 3 && t === "H3")) break;
    buf.push(node.outerHTML);
    acc += node.textContent?.length || 0;
    node = node.nextElementSibling;
  }
  return { title: match.textContent || section || "Section", html: buf.join("") };
}

export default function CrossRefModal({
  target,
  subjects,
  imageLookup,
  onClose,
  onOpenSubject,
}: {
  target: CrossRefTarget;
  subjects: Subject[];
  imageLookup: ImageLookup;
  onClose: () => void;
  onOpenSubject: (subjectId: string, section?: string) => void;
}) {
  const subject = subjects.find((s) => s.id === target.subjectId);
  const snippet = useMemo(() => (subject ? findSectionSnippet(subject, target.section) : null), [subject, target.section]);

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {!subject ? (
          <div className="p-6">
            <p className="text-sm text-zinc-400">That subject was deleted.</p>
            <button
              onClick={onClose}
              className="mt-4 text-xs text-zinc-500 hover:text-zinc-300"
            >
              Close
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 px-5 py-3 border-b border-zinc-800">
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: subject.color }} />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-zinc-600 uppercase tracking-wider">From {subject.name}</p>
                <p className="text-sm font-semibold text-zinc-100 truncate">{snippet?.title || target.section || "Study guide"}</p>
              </div>
              <button
                onClick={onClose}
                className="text-zinc-500 hover:text-zinc-300 text-lg leading-none px-2"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {!snippet ? (
                <p className="text-sm text-zinc-500">This subject doesn&apos;t have a generated study guide yet. Open the subject to generate one.</p>
              ) : (
                <div
                  className="prose prose-invert prose-sm max-w-none
                    [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-zinc-200 [&_h3]:mt-4 [&_h3]:mb-2
                    [&_h4]:text-sm [&_h4]:font-medium [&_h4]:text-zinc-300 [&_h4]:mt-3 [&_h4]:mb-1
                    [&_p]:text-zinc-300 [&_p]:leading-relaxed [&_p]:mb-2 [&_p]:text-sm
                    [&_ul]:ml-4 [&_ul]:list-disc [&_ol]:ml-4 [&_ol]:list-decimal
                    [&_li]:text-zinc-300 [&_li]:text-sm
                    [&_strong]:text-zinc-100
                    [&_code]:bg-zinc-800 [&_code]:px-1 [&_code]:rounded [&_code]:text-violet-300 [&_code]:text-xs"
                  dangerouslySetInnerHTML={{ __html: preprocessMath(swapMaterialImages(snippet.html, subject, imageLookup)) }}
                />
              )}
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-zinc-800">
              <button
                onClick={onClose}
                className="text-xs text-zinc-500 hover:text-zinc-300 px-3 py-1.5"
              >
                Close
              </button>
              <button
                onClick={() => { onOpenSubject(subject.id, target.section); onClose(); }}
                className="text-xs px-3 py-1.5 rounded-lg bg-violet-600 text-white hover:bg-violet-500 transition-colors"
              >
                Open {subject.name} →
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
