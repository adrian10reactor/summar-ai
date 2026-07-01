"use client";

import { useEffect, useRef, useMemo } from "react";
import { Subject } from "@/types";
import { ImageLookup, swapMaterialImages } from "@/lib/render";
import "katex/dist/katex.min.css";

let mermaidInitialized = false;

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
    await mermaid.run({ nodes: Array.from(nodes), suppressErrors: true });
    // Belt-and-braces: some mermaid versions use different flag names.
    nodes.forEach((n) => n.setAttribute("data-mermaid-rendered", "true"));
  } catch (e) {
    console.warn("Mermaid render failed", e);
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
