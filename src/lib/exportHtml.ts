// Wrap generated HTML in a self-contained page with dark theme, KaTeX for math,
// and Mermaid for diagrams. Uses CDN for KaTeX/Mermaid so the file stays small —
// works offline for text but math/diagrams need internet on first open.

export function buildExportHtml(contentHtml: string, displayName: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${displayName} - Summar AI</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css">
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
  svg { max-width: 100%; height: auto; margin: 1rem 0; background: #09090b; border-radius: 8px; padding: 0.75rem; }
  .mermaid { margin: 1rem 0; background: #09090b; border-radius: 8px; padding: 0.75rem; overflow-x: auto; text-align: center; }
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
<script src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js" defer></script>
<script src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js" defer
  onload="renderMathInElement(document.body, {
    delimiters: [
      {left: '$$', right: '$$', display: true},
      {left: '\\\\[', right: '\\\\]', display: true},
      {left: '\\\\(', right: '\\\\)', display: false},
      {left: '$', right: '$', display: false}
    ],
    throwOnError: false,
    ignoredTags: ['script','noscript','style','textarea','pre','code']
  });"></script>
<script type="module">
  import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";
  mermaid.initialize({
    startOnLoad: true, theme: "dark", securityLevel: "loose",
    themeVariables: { primaryColor: "#5b21b6", primaryTextColor: "#f4f4f5", primaryBorderColor: "#a78bfa", lineColor: "#a1a1aa", background: "#09090b" }
  });
</script>
</body>
</html>`;
}

export function downloadAsHtml(contentHtml: string, displayName: string) {
  const html = buildExportHtml(contentHtml, displayName);
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${displayName.replace(/[^a-zA-Z0-9]/g, "_")}.html`;
  a.click();
  URL.revokeObjectURL(url);
}
