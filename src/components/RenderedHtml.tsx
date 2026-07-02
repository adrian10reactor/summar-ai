"use client";

import { useEffect, useRef, useMemo } from "react";
import { Subject } from "@/types";
import { ImageLookup, swapMaterialImages } from "@/lib/render";
import "katex/dist/katex.min.css";

let mermaidInitialized = false;

// Undo two common model mistakes before KaTeX runs:
// (1) escaped dollar delimiters like \$x^2\$  →  $x^2$
// (2) math wrapped in <pre> or <code> code blocks  →  unwrapped inline
export function preprocessMath(html: string): string {
  if (!html) return html;
  let out = html;

  // (1) Strip the backslash from escaped dollars.
  out = out.replace(/\\\$/g, "$");

  // (2) Unwrap <pre>...$$...$$...</pre> and <code>...$$...$$...</code> whose
  // sole content is a math expression.
  out = out.replace(
    /<pre\b[^>]*>\s*(\$\$[\s\S]+?\$\$)\s*<\/pre>/gi,
    '<p class="math-display-block">$1</p>'
  );
  out = out.replace(
    /<code\b[^>]*>\s*(\$\$[\s\S]+?\$\$)\s*<\/code>/gi,
    '$1'
  );
  // Also unwrap <code>$...$</code> when the code content is a bare inline math expression.
  out = out.replace(
    /<code\b[^>]*>\s*(\$[^\s$][^$]{0,300}?\$)\s*<\/code>/g,
    '$1'
  );

  return out;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

type KatexAutoRender = (
  element: HTMLElement,
  options: {
    delimiters: { left: string; right: string; display: boolean }[];
    throwOnError?: boolean;
    errorColor?: string;
    ignoredTags?: string[];
  }
) => void;

async function renderMath(root: HTMLElement) {
  try {
    const mod = (await import("katex/contrib/auto-render")) as unknown as { default: KatexAutoRender } | KatexAutoRender;
    const renderMathInElement: KatexAutoRender =
      typeof mod === "function" ? mod : (mod as { default: KatexAutoRender }).default;
    renderMathInElement(root, {
      delimiters: [
        { left: "$$", right: "$$", display: true },
        { left: "\\[", right: "\\]", display: true },
        { left: "\\(", right: "\\)", display: false },
        { left: "$", right: "$", display: false },
      ],
      throwOnError: false,
      errorColor: "#f87171",
      ignoredTags: ["script", "noscript", "style", "textarea", "pre", "code"],
    });
  } catch (e) {
    console.warn("KaTeX render failed", e);
  }
}

// Mount React artifact components into any `<div class="artifact" data-type=...
// data-params=...>` placeholders the model emitted. Each mount is memoized on
// the DOM node itself so re-renders of the parent don't re-mount and flicker.
const artifactRoots = new WeakMap<HTMLElement, { destroy: () => void }>();
async function renderArtifacts(root: HTMLElement) {
  const nodes = root.querySelectorAll<HTMLElement>(".artifact[data-type]:not([data-artifact-mounted='true'])");
  if (nodes.length === 0) return;
  try {
    const [{ createRoot }, { default: ArtifactRegistry }] = await Promise.all([
      import("react-dom/client"),
      import("./artifacts/ArtifactRegistry"),
    ]);
    const React = await import("react");
    for (const node of Array.from(nodes)) {
      if (node.dataset.artifactMounted === "true") continue;
      const type = node.dataset.type || "";
      let params: Record<string, unknown> = {};
      const raw = node.dataset.params;
      if (raw) {
        try { params = JSON.parse(raw); } catch { /* keep {} */ }
      }
      node.dataset.artifactMounted = "true";
      node.innerHTML = "";
      const r = createRoot(node);
      r.render(React.createElement(ArtifactRegistry, { type, params }));
      artifactRoots.set(node, { destroy: () => r.unmount() });
    }
  } catch (e) {
    console.warn("Artifact render failed", e);
  }
}

async function renderMermaid(root: HTMLElement) {
  const nodes = root.querySelectorAll<HTMLElement>(".mermaid:not([data-processed='true']):not([data-mermaid-rendered='true'])");
  if (nodes.length === 0) return;
  try {
    const { default: mermaid } = await import("mermaid");
    if (!mermaidInitialized) {
      mermaid.initialize({
        startOnLoad: false,
        theme: "dark",
        securityLevel: "loose",
        fontFamily: "system-ui, -apple-system, sans-serif",
        themeVariables: {
          primaryColor: "#5b21b6",
          primaryTextColor: "#f4f4f5",
          primaryBorderColor: "#a78bfa",
          lineColor: "#a1a1aa",
          secondaryColor: "#27272a",
          tertiaryColor: "#18181b",
          background: "#0f0f13",
          mainBkg: "#5b21b6",
          nodeTextColor: "#f4f4f5",
        },
      });
      mermaidInitialized = true;
    }

    for (const node of Array.from(nodes)) {
      const source = (node.textContent || "").trim();
      node.setAttribute("data-mermaid-rendered", "true");
      if (!source) continue;
      try {
        // Pre-validate — throws on syntax errors so we can catch instead of the bomb icon.
        await mermaid.parse(source);
        await mermaid.run({ nodes: [node], suppressErrors: true });
      } catch {
        // Malformed diagram — replace the bomb-icon UI with a graceful fallback
        // that still shows the source so the student isn't left with nothing.
        node.classList.remove("mermaid");
        node.innerHTML = `
          <div style="border:1px dashed #52525b;padding:12px;border-radius:8px;background:#18181b">
            <p style="color:#a1a1aa;font-size:12px;margin:0 0 6px">Diagram couldn't be rendered — regenerate to try a different version. Source:</p>
            <pre style="color:#71717a;font-size:11px;overflow-x:auto;margin:0;white-space:pre-wrap">${escapeHtml(source)}</pre>
          </div>
        `;
      }
    }
  } catch (e) {
    console.warn("Mermaid load failed", e);
  }
}

export default function RenderedHtml({
  html,
  subject,
  imageLookup,
  className,
  onMouseUp,
  onScroll,
  innerRef,
  onCrossRefClick,
}: {
  html: string;
  subject: Subject;
  imageLookup: ImageLookup;
  className?: string;
  onMouseUp?: () => void;
  onScroll?: () => void;
  innerRef?: React.Ref<HTMLDivElement>;
  onCrossRefClick?: (target: { subjectId: string; section?: string }) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const processed = useMemo(() => {
    let out = swapMaterialImages(html, subject, imageLookup);
    out = preprocessMath(out);
    // Style cross-subject reference links as pill buttons inline.
    out = out.replace(
      /<a\b([^>]*)\bdata-subject-ref="([^"]+)"([^>]*)>([\s\S]*?)<\/a>/gi,
      (_m, before, subjectId, after, inner) => {
        const sectionMatch = (before + after).match(/\bdata-section="([^"]*)"/i);
        const section = sectionMatch ? sectionMatch[1] : "";
        return `<a href="#" data-subject-ref="${subjectId}" data-section="${section}" class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-violet-500/40 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 hover:text-violet-200 no-underline text-xs mx-0.5 align-baseline">🔗 ${inner}</a>`;
      }
    );
    return out;
  }, [html, subject, imageLookup]);

  useEffect(() => {
    if (!ref.current) return;
    renderMath(ref.current);
    renderMermaid(ref.current);
    renderArtifacts(ref.current);
  }, [processed]);

  const handleClick: React.MouseEventHandler<HTMLDivElement> = (e) => {
    if (!onCrossRefClick) return;
    const target = (e.target as HTMLElement).closest("[data-subject-ref]") as HTMLElement | null;
    if (!target) return;
    e.preventDefault();
    const subjectId = target.getAttribute("data-subject-ref");
    if (!subjectId) return;
    const section = target.getAttribute("data-section") || undefined;
    onCrossRefClick({ subjectId, section });
  };

  const combinedRef = (node: HTMLDivElement | null) => {
    ref.current = node;
    if (typeof innerRef === "function") innerRef(node);
    else if (innerRef && typeof innerRef === "object" && "current" in innerRef) {
      (innerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
    }
  };

  return (
    <div
      ref={combinedRef}
      className={className}
      onMouseUp={onMouseUp}
      onScroll={onScroll}
      onClick={onCrossRefClick ? handleClick : undefined}
      dangerouslySetInnerHTML={{ __html: processed }}
    />
  );
}
