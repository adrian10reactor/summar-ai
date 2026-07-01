import { Subject } from "@/types";

// Pull topic labels out of a subject's generated study guide so the model can
// reference them in cross-subject links. Returns h2s at the top level plus each
// subject's h3 subsection titles nested underneath their parent.
export function extractSubjectTopics(subject: Subject): string[] {
  const html = subject.content.studyGuide?.html;
  if (!html) return [];

  const out: string[] = [];

  if (typeof window === "undefined") {
    // Server-side fallback: regex.
    const matches = html.match(/<(h2|h3)[^>]*>([^<]+)<\/(h2|h3)>/gi) || [];
    let currentH2 = "";
    for (const m of matches) {
      const text = m.replace(/<[^>]+>/g, "").trim();
      if (!text) continue;
      if (/^<h2/i.test(m)) {
        currentH2 = text;
        out.push(text);
      } else {
        out.push(currentH2 ? `${currentH2} → ${text}` : text);
      }
    }
    return out;
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, "text/html");
  const root = doc.body.firstElementChild;
  if (!root) return [];

  let currentH2 = "";
  for (const el of Array.from(root.children)) {
    const text = (el.textContent || "").trim();
    if (!text) continue;
    if (el.tagName === "H2") {
      currentH2 = text;
      out.push(text);
    } else if (el.tagName === "H3") {
      out.push(currentH2 ? `${currentH2} → ${text}` : text);
    }
  }
  return out;
}

const PLACEHOLDER_HTML = `<div style="border:1px dashed #52525b;padding:14px;border-radius:6px;color:#a1a1aa;font-size:12px;margin:8px 0">
  <strong style="color:#e4e4e7">Image unavailable.</strong>
  Re-upload the material to display this figure.
</div>`;

export interface ImageLookup {
  getUrl: (materialId: string, pageNum?: number) => string | undefined;
}

// Replace <img data-material="..." data-page="..."> placeholders in generated HTML
// with actual <img src="blobUrl"> tags. Materials are looked up by id first, then
// by name (case-insensitive) as a fallback since the model doesn't always echo IDs.
export function swapMaterialImages(html: string, subject: Subject, lookup: ImageLookup): string {
  if (!html) return "";

  const nameToId = new Map<string, string>();
  for (const m of subject.materials) {
    nameToId.set(m.name.toLowerCase(), m.id);
  }

  return html.replace(
    /<img\b[^>]*\bdata-material\s*=\s*"([^"]+)"[^>]*>/gi,
    (match, rawRef: string) => {
      const ref = rawRef.trim();
      const pageMatch = match.match(/\bdata-page\s*=\s*"(\d+)"/i);
      const altMatch = match.match(/\balt\s*=\s*"([^"]*)"/i);
      const pageNum = pageMatch ? parseInt(pageMatch[1], 10) : undefined;
      const alt = altMatch ? altMatch[1] : "";

      let materialId: string | undefined;
      if (subject.materials.some((m) => m.id === ref)) {
        materialId = ref;
      } else if (nameToId.has(ref.toLowerCase())) {
        materialId = nameToId.get(ref.toLowerCase());
      }
      if (!materialId) return PLACEHOLDER_HTML;

      const url = lookup.getUrl(materialId, pageNum);
      if (!url) return PLACEHOLDER_HTML;

      const safeAlt = alt.replace(/"/g, "&quot;");
      return `<img src="${url}" alt="${safeAlt}" style="max-width:100%;height:auto;border-radius:6px;margin:8px 0;display:block" />`;
    }
  );
}

// Build the "Available images" hint appended to prompts so the model knows how to reference materials.
export function buildImageMaterialsHint(subject: Subject): string {
  const images = subject.materials.filter((m) => m.type === "image");
  const pdfsWithPages = subject.materials.filter((m) => m.type === "pdf" && (m.pageUris?.length || m.pageCount));
  if (images.length === 0 && pdfsWithPages.length === 0) return "";

  const lines: string[] = [];
  lines.push("");
  lines.push("VISUAL ASSETS YOU CAN INCLUDE IN THE OUTPUT:");
  if (images.length > 0) {
    lines.push("");
    lines.push("Standalone images (reference by id):");
    for (const m of images) {
      lines.push(`- id="${m.id}" name="${m.name}"`);
    }
    lines.push('Use: <img data-material="ID" alt="short caption"> to embed one where it belongs.');
  }
  if (pdfsWithPages.length > 0) {
    lines.push("");
    lines.push("PDF pages available as figures (reference by material id + page number, 1-indexed):");
    for (const m of pdfsWithPages) {
      const n = m.pageCount ?? m.pageUris?.length ?? 0;
      lines.push(`- id="${m.id}" name="${m.name}" pages=${n}`);
    }
    lines.push('Use: <img data-material="ID" data-page="N" alt="short caption"> when a specific PDF page has a diagram, figure or table that belongs in the study material.');
    lines.push("Only reference pages that actually contain a diagram/figure/table worth showing — do not include page images for pure text pages.");
  }
  lines.push("");
  lines.push("Insert images at the natural point in the surrounding prose. Do not repeat the same image multiple times.");
  return lines.join("\n");
}
