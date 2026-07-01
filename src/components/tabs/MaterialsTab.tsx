"use client";

import { useState, useRef, MutableRefObject } from "react";
import { Subject, SubjectTab, Quiz, Material } from "@/types";
import {
  addMaterial, removeMaterial, updateMaterial,
  saveStudyGuide, saveCheatSheet, saveExamPrep, saveQuizToSubject,
  addCustomSection, deleteCustomSection, updateCustomSection, saveCustomSectionHtml,
} from "@/lib/storage";
import { deductCredits, estimateApiCost } from "@/lib/credits";
import { parseApiResponse } from "@/lib/api";
import { rasterizePdf } from "@/lib/pdfPages";

const GEN_SECTIONS = [
  { key: "study-guide", label: "Study Guide", icon: "📖", desc: "Comprehensive notes organized by topic" },
  { key: "quiz", label: "Quiz", icon: "❓", desc: "Multiple-choice questions from materials" },
  { key: "cheat-sheet", label: "Cheat Sheet", icon: "⚡", desc: "Compact reference with key facts & formulas" },
  { key: "exam-prep", label: "Exam Prep", icon: "🎓", desc: "Solved problems, likely questions, traps" },
] as const;

type NavTarget = SubjectTab | { kind: "custom"; id: string };

export default function MaterialsTab({
  subject,
  pdfDataRef,
  imageBlobRef,
  getMaterials,
  hasLoadedMaterials,
  hasMaterials,
  onCost,
  onUpdated,
  onNavigate,
}: {
  subject: Subject;
  pdfDataRef: MutableRefObject<Map<string, string>>;
  imageBlobRef: MutableRefObject<Map<string, string>>;
  getMaterials: () => { type: string; data: string; name: string }[];
  hasLoadedMaterials: boolean;
  hasMaterials: boolean;
  onCost: (amount: number, action: string) => void;
  onUpdated: () => void;
  onNavigate: (target: NavTarget) => void;
}) {
  const [tab, setTab] = useState<"pdf" | "image" | "link" | "text">("pdf");
  const [dragOver, setDragOver] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkName, setLinkName] = useState("");
  const [textContent, setTextContent] = useState("");
  const [textName, setTextName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set(["study-guide", "quiz", "cheat-sheet", "exam-prep"]));
  const [customPrompt, setCustomPrompt] = useState("");
  const [generating, setGenerating] = useState<Set<string>>(new Set());
  const [done, setDone] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});

  type BatchItemState = "queued" | "generating" | "done" | "error";
  type BatchItem = { key: string; label: string; icon: string; state: BatchItemState; startedAt?: number };
  const [batch, setBatch] = useState<BatchItem[] | null>(null);
  const [statusText, setStatusText] = useState("");

  const [editingCustomId, setEditingCustomId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPrompt, setEditPrompt] = useState("");
  const [uploading, setUploading] = useState<Set<string>>(new Set());
  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({});
  // materialId -> { done, total } while pdf pages are being rasterized
  const [rasterProgress, setRasterProgress] = useState<Record<string, { done: number; total: number }>>({});

  const isImage = (f: File) => f.type.startsWith("image/");
  const isPdf = (f: File) => f.type === "application/pdf";

  const uploadFile = async (mat: Material, file: File) => {
    setUploading((p) => new Set(p).add(mat.id));
    setUploadErrors((p) => { const n = { ...p }; delete n[mat.id]; return n; });
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload-pdf", { method: "POST", body: fd });
      const data = await parseApiResponse<{ uri: string; mimeType: string; name: string }>(res);
      updateMaterial(subject.id, mat.id, { uri: data.uri, mimeType: data.mimeType });
      onUpdated();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Upload failed";
      setUploadErrors((p) => ({ ...p, [mat.id]: msg }));
    } finally {
      setUploading((p) => { const n = new Set(p); n.delete(mat.id); return n; });
    }
  };

  const rasterizePdfMaterial = async (materialId: string, file: File) => {
    try {
      // Peek at page count first (cheap) so we can show total in progress badge.
      // We'll set an initial "done: 0, total: ~unknown" and update as pages complete.
      setRasterProgress((p) => ({ ...p, [materialId]: { done: 0, total: 0 } }));

      const { pageCount } = await rasterizePdf(
        file,
        ({ pageNum, blobUrl }) => {
          imageBlobRef.current.set(`${materialId}::${pageNum}`, blobUrl);
          setRasterProgress((p) => ({
            ...p,
            [materialId]: { done: pageNum, total: p[materialId]?.total || pageNum },
          }));
        }
      );

      updateMaterial(subject.id, materialId, { pageCount });
      onUpdated();
    } catch (e) {
      console.error("PDF rasterization failed:", e);
    } finally {
      setRasterProgress((p) => {
        const n = { ...p };
        delete n[materialId];
        return n;
      });
    }
  };

  const handleAddFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList).filter((f) => isPdf(f) || isImage(f));
    for (const file of files) {
      const dup = subject.materials.find((m) => m.name === file.name && m.size === file.size);
      if (dup) continue;

      const type = isImage(file) ? "image" : "pdf";
      const mat = addMaterial(subject.id, { name: file.name, type, data: "", size: file.size, mimeType: file.type });
      if (type === "image") {
        imageBlobRef.current.set(mat.id, URL.createObjectURL(file));
      }
      onUpdated();

      await uploadFile(mat, file);

      // Kick off page rasterization for PDFs in the background so the model can
      // reference specific pages as figures. Doesn't block the upload flow.
      if (type === "pdf") {
        rasterizePdfMaterial(mat.id, file);
      }
    }
  };

  const handleAddPdfs = handleAddFiles;
  const handleAddImages = handleAddFiles;

  const handleAddLink = () => {
    const url = linkUrl.trim();
    if (!url) return;
    addMaterial(subject.id, { name: linkName.trim() || url, type: "link", data: url, size: url.length });
    setLinkUrl(""); setLinkName(""); onUpdated();
  };

  const handleAddText = () => {
    const text = textContent.trim();
    if (!text) return;
    addMaterial(subject.id, { name: textName.trim() || "Text note", type: "text", data: text, size: text.length });
    setTextContent(""); setTextName(""); onUpdated();
  };

  const handleRemove = (id: string) => {
    pdfDataRef.current.delete(id);
    const blobUrl = imageBlobRef.current.get(id);
    if (blobUrl?.startsWith("blob:")) URL.revokeObjectURL(blobUrl);
    imageBlobRef.current.delete(id);
    // also revoke any page rasters for this material
    for (const key of Array.from(imageBlobRef.current.keys())) {
      if (key.startsWith(`${id}::`)) {
        const url = imageBlobRef.current.get(key);
        if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
        imageBlobRef.current.delete(key);
      }
    }
    removeMaterial(subject.id, id);
    onUpdated();
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  const icons: Record<string, string> = { pdf: "📄", link: "🔗", text: "📝", image: "🖼" };

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const generateOne = async (mode: string, opts?: { customSectionId?: string; customSectionPrompt?: string; label?: string }): Promise<{ ok: boolean; error?: string }> => {
    const materials = getMaterials();
    if (materials.length === 0) return { ok: false, error: "No materials" };
    const stateKey = opts?.customSectionId || mode;
    setGenerating((p) => new Set(p).add(stateKey));
    setErrors((p) => { const n = { ...p }; delete n[stateKey]; return n; });
    setStatusText(`Analyzing ${materials.length} material${materials.length !== 1 ? "s" : ""}...`);

    try {
      const body: Record<string, unknown> = { mode, materials };
      if (customPrompt.trim()) body.customPrompt = customPrompt.trim();
      if (opts?.customSectionPrompt) body.customSectionPrompt = opts.customSectionPrompt;

      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await parseApiResponse<{ html: string; title?: string; questions?: import("@/types").Question[]; _usage?: { tokensIn: number; tokensOut: number } }>(res);

      const usage = data._usage || { tokensIn: 0, tokensOut: 0 };
      const apiCost = estimateApiCost(usage.tokensIn, usage.tokensOut);
      const { charged } = deductCredits(apiCost, mode, subject.name, usage.tokensIn, usage.tokensOut);
      onCost(charged, `Generated ${opts?.label || mode}`);

      if (mode === "study-guide") saveStudyGuide(subject.id, data.html);
      else if (mode === "cheat-sheet") saveCheatSheet(subject.id, data.html);
      else if (mode === "exam-prep") saveExamPrep(subject.id, data.html);
      else if (mode === "quiz") {
        const quiz: Quiz = { title: data.title || "Quiz", questions: data.questions || [] };
        saveQuizToSubject(subject.id, quiz, data.title || "Quiz");
      } else if (mode === "custom" && opts?.customSectionId) {
        saveCustomSectionHtml(subject.id, opts.customSectionId, data.html);
      }

      setDone((p) => new Set(p).add(stateKey));
      onUpdated();
      return { ok: true };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed";
      setErrors((p) => ({ ...p, [stateKey]: msg }));
      return { ok: false, error: msg };
    } finally {
      setGenerating((p) => { const n = new Set(p); n.delete(stateKey); return n; });
    }
  };

  const buildBatchItem = (key: string): BatchItem | null => {
    if (key.startsWith("custom:")) {
      const id = key.slice(7);
      const sec = subject.content.customSections.find((c) => c.id === id);
      if (!sec) return null;
      return { key, label: sec.name, icon: "✨", state: "queued" };
    }
    const std = GEN_SECTIONS.find((s) => s.key === key);
    if (!std) return null;
    return { key, label: std.label, icon: std.icon, state: "queued" };
  };

  const generateSelected = async () => {
    const queue = Array.from(selected).map(buildBatchItem).filter(Boolean) as BatchItem[];
    if (queue.length === 0) return;
    setBatch(queue);
    setDone(new Set());
    setErrors({});

    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];
      setBatch((b) => b ? b.map((x) => x.key === item.key ? { ...x, state: "generating", startedAt: Date.now() } : x) : b);
      setStatusText(`Generating ${item.label}... (${i + 1}/${queue.length})`);

      let result: { ok: boolean; error?: string };
      if (item.key.startsWith("custom:")) {
        const id = item.key.slice(7);
        const sec = subject.content.customSections.find((c) => c.id === id);
        if (sec) {
          result = await generateOne("custom", { customSectionId: id, customSectionPrompt: sec.prompt, label: sec.name });
        } else {
          result = { ok: false, error: "Section missing" };
        }
      } else {
        result = await generateOne(item.key);
      }

      setBatch((b) => b ? b.map((x) => x.key === item.key ? { ...x, state: result.ok ? "done" : "error" } : x) : b);
    }

    setStatusText("All done!");
    setTimeout(() => {
      setBatch(null);
      setStatusText("");
    }, 2500);
  };

  const hasExisting = (key: string) => {
    if (key === "study-guide") return !!subject.content.studyGuide;
    if (key === "quiz") return subject.content.quizzes.length > 0;
    if (key === "cheat-sheet") return !!subject.content.cheatSheet;
    if (key === "exam-prep") return !!subject.content.examPrep;
    return false;
  };

  const anyGenerating = generating.size > 0;

  const handleStartNewCustom = () => {
    const sec = addCustomSection(subject.id, "New custom section", "");
    onUpdated();
    setEditingCustomId(sec.id);
    setEditName(sec.name);
    setEditPrompt("");
  };

  const handleSaveCustomEdit = (id: string) => {
    const name = editName.trim() || "Untitled section";
    const prompt = editPrompt.trim();
    updateCustomSection(subject.id, id, { name, prompt });
    onUpdated();
    setEditingCustomId(null);
  };

  const handleCancelEdit = (id: string) => {
    const sec = subject.content.customSections.find((c) => c.id === id);
    if (sec && !sec.prompt && sec.name === "New custom section") {
      deleteCustomSection(subject.id, id);
      onUpdated();
    }
    setEditingCustomId(null);
  };

  const handleDeleteCustom = (id: string, name: string) => {
    if (!confirm(`Delete "${name}"?`)) return;
    deleteCustomSection(subject.id, id);
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(`custom:${id}`);
      return next;
    });
    onUpdated();
  };

  return (
    <div className="space-y-6">
      {/* Upload area */}
      <div className="space-y-4">
        <div className="flex gap-1 bg-zinc-900 p-1 rounded-lg w-fit">
          {(["pdf", "image", "link", "text"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`text-xs px-4 py-1.5 rounded-md transition-colors ${
                tab === t ? "bg-zinc-700 text-zinc-200" : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {t === "pdf" ? "PDFs" : t === "image" ? "Images" : t === "link" ? "Links" : "Text Notes"}
            </button>
          ))}
        </div>

        {tab === "pdf" && (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); handleAddPdfs(e.dataTransfer.files); }}
            onClick={() => inputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-6 cursor-pointer transition-all ${
              dragOver ? "border-violet-400 bg-violet-500/5" : "border-zinc-700 hover:border-violet-500"
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".pdf"
              multiple
              className="hidden"
              onChange={(e) => { if (e.target.files) handleAddPdfs(e.target.files); e.target.value = ""; }}
            />
            <p className="text-zinc-400 text-sm">Drop PDFs here or click to browse</p>
            <p className="text-zinc-600 text-xs mt-1">Upload lecture slides, textbooks, past exams</p>
          </div>
        )}

        {tab === "image" && (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); handleAddImages(e.dataTransfer.files); }}
            onClick={() => imageInputRef.current?.click()}
            onPaste={(e) => {
              const files = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
              if (files.length) handleAddImages(files);
            }}
            className={`border-2 border-dashed rounded-xl p-6 cursor-pointer transition-all ${
              dragOver ? "border-violet-400 bg-violet-500/5" : "border-zinc-700 hover:border-violet-500"
            }`}
          >
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => { if (e.target.files) handleAddImages(e.target.files); e.target.value = ""; }}
            />
            <p className="text-zinc-400 text-sm">Drop images, paste, or click to browse</p>
            <p className="text-zinc-600 text-xs mt-1">Diagrams, screenshots, hand-written notes — anything the AI should “see”</p>
          </div>
        )}

        {tab === "link" && (
          <div className="space-y-2 max-w-lg">
            <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://..."
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500" />
            <input value={linkName} onChange={(e) => setLinkName(e.target.value)} placeholder="Name (optional)"
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500" />
            <button onClick={handleAddLink} disabled={!linkUrl.trim()}
              className="py-2 px-4 text-sm rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 disabled:opacity-40 transition-colors">
              Add Link
            </button>
          </div>
        )}

        {tab === "text" && (
          <div className="space-y-2 max-w-lg">
            <input value={textName} onChange={(e) => setTextName(e.target.value)} placeholder="Title (optional)"
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500" />
            <textarea value={textContent} onChange={(e) => setTextContent(e.target.value)} placeholder="Paste notes, key concepts..." rows={4}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500 resize-none" />
            <button onClick={handleAddText} disabled={!textContent.trim()}
              className="py-2 px-4 text-sm rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 disabled:opacity-40 transition-colors">
              Add Text
            </button>
          </div>
        )}
      </div>

      {/* Material list */}
      {subject.materials.length > 0 && (
        <div className="space-y-1.5">
          <h3 className="text-xs text-zinc-500 uppercase tracking-wider">
            {subject.materials.length} material{subject.materials.length !== 1 ? "s" : ""} uploaded
          </h3>
          {subject.materials.map((m) => {
            const isFile = m.type === "pdf" || m.type === "image";
            const isUploading = uploading.has(m.id);
            const uploadError = uploadErrors[m.id];
            const hasUri = !!m.uri;
            const hasMemoryBase64 = pdfDataRef.current.has(m.id) && !hasUri;
            const ready = !isFile || hasUri || hasMemoryBase64;
            const needsReupload = isFile && !ready && !isUploading && !uploadError;
            const thumb = m.type === "image" ? imageBlobRef.current.get(m.id) : undefined;
            const raster = rasterProgress[m.id];

            return (
              <div key={m.id}
                className={`flex items-center gap-2.5 bg-zinc-900 border rounded-lg px-3 py-2 text-sm group ${
                  uploadError ? "border-red-900/40" : ready ? "border-zinc-800" : "border-amber-900/30"
                }`}>
                {thumb ? (
                  <img src={thumb} alt="" className="w-8 h-8 object-cover rounded shrink-0" />
                ) : (
                  <span className="text-xs w-8 text-center shrink-0">{icons[m.type]}</span>
                )}
                <span className={`truncate flex-1 ${ready ? "text-zinc-300" : "text-zinc-500"}`}>{m.name}</span>
                {isUploading && (
                  <span className="text-[10px] text-violet-400 flex items-center gap-1 shrink-0">
                    <span className="inline-block w-2 h-2 border border-violet-400 border-t-transparent rounded-full animate-spin-slow" />
                    uploading...
                  </span>
                )}
                {uploadError && (
                  <span className="text-[10px] text-red-400 shrink-0" title={uploadError}>upload failed</span>
                )}
                {needsReupload && (
                  <span className="text-[10px] text-amber-400 shrink-0">re-upload needed</span>
                )}
                {hasUri && !isUploading && !raster && (
                  <span className="text-[10px] text-emerald-500 shrink-0" title="Uploaded to Gemini File API">✓</span>
                )}
                {raster && (
                  <span className="text-[10px] text-violet-400 flex items-center gap-1 shrink-0" title="Rendering pages so figures can be embedded">
                    <span className="inline-block w-2 h-2 border border-violet-400 border-t-transparent rounded-full animate-spin-slow" />
                    rendering page {raster.done}
                  </span>
                )}
                {m.pageCount && m.type === "pdf" && !raster && (
                  <span className="text-[10px] text-zinc-600 shrink-0" title={`${m.pageCount} pages rasterized for inline figures`}>
                    {m.pageCount}p
                  </span>
                )}
                <span className="text-zinc-600 text-xs shrink-0">{formatSize(m.size)}</span>
                <button onClick={() => handleRemove(m.id)}
                  className="text-zinc-600 hover:text-red-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}

      {subject.materials.length === 0 && (
        <p className="text-sm text-zinc-600 py-4">No materials yet. Upload PDFs, add links, or paste notes.</p>
      )}

      {/* Generate sections */}
      {hasMaterials && (
        <div className="border-t border-zinc-800 pt-6 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-zinc-200 mb-1">Generate Sections</h3>
            <p className="text-xs text-zinc-500">
              Select which sections to generate from your {subject.materials.length} material{subject.materials.length !== 1 ? "s" : ""}.
            </p>
          </div>

          {/* Batch progress strip */}
          {batch && (() => {
            const doneCount = batch.filter((b) => b.state === "done" || b.state === "error").length;
            const errCount = batch.filter((b) => b.state === "error").length;
            const pct = (doneCount / batch.length) * 100;
            const allDone = doneCount === batch.length;
            return (
              <div className="rounded-xl border border-violet-500/30 bg-gradient-to-br from-violet-950/40 via-zinc-900 to-zinc-900 p-4 space-y-3 animate-fade-in">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {!allDone && <div className="w-3.5 h-3.5 rounded-full border-2 border-violet-400 border-t-transparent animate-spin-slow" />}
                    {allDone && <span className="text-emerald-400 text-base animate-check">✓</span>}
                    <span className="text-sm font-semibold text-zinc-100">
                      {allDone
                        ? errCount > 0 ? `Done with ${errCount} error${errCount !== 1 ? "s" : ""}` : "All sections generated!"
                        : `Generating ${doneCount + 1} of ${batch.length}`}
                    </span>
                  </div>
                  <span className="text-xs text-violet-300 font-mono">{doneCount}/{batch.length}</span>
                </div>

                {/* Progress bar */}
                <div className="h-2 w-full bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${allDone ? (errCount > 0 ? "bg-amber-500" : "bg-emerald-500") : "bg-gradient-to-r from-violet-500 to-indigo-500 progress-stripes"} transition-all duration-500 ease-out`}
                    style={{ width: `${Math.max(pct, 3)}%` }}
                  />
                </div>

                {/* Chips */}
                <div className="flex flex-wrap gap-1.5">
                  {batch.map((b) => {
                    const cls =
                      b.state === "done" ? "bg-emerald-600/15 text-emerald-300 border-emerald-700/30" :
                      b.state === "error" ? "bg-red-600/15 text-red-300 border-red-700/30" :
                      b.state === "generating" ? "bg-violet-600/20 text-violet-200 border-violet-500/40 animate-glow" :
                      "bg-zinc-800/50 text-zinc-500 border-zinc-700/40";
                    const stateMark =
                      b.state === "done" ? <span className="inline-block animate-check">✓</span> :
                      b.state === "error" ? <span>✕</span> :
                      b.state === "generating" ? <span className="inline-block w-2 h-2 rounded-full bg-violet-300 animate-pulse" /> :
                      <span className="text-zinc-600">·</span>;
                    return (
                      <div key={b.key} className={`flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-lg border transition-all ${cls}`}>
                        <span className="text-xs">{b.icon}</span>
                        <span className="truncate max-w-[120px]">{b.label}</span>
                        {stateMark}
                      </div>
                    );
                  })}
                </div>

                {statusText && !allDone && (
                  <p className="text-[11px] text-violet-300/80 italic">{statusText}</p>
                )}
              </div>
            );
          })()}

          <div className="space-y-2">
            {GEN_SECTIONS.map((s) => {
              const isGenerating = generating.has(s.key);
              const isDone = done.has(s.key);
              const exists = hasExisting(s.key);
              const error = errors[s.key];

              return (
                <div key={s.key}
                  className={`relative flex items-center gap-3 p-3 rounded-xl border overflow-hidden transition-all ${
                    isGenerating ? "border-violet-500/60 bg-violet-500/10 animate-glow" :
                    isDone ? "border-emerald-500/40 bg-emerald-500/5" :
                    selected.has(s.key) ? "border-violet-500/30 bg-violet-500/5" : "border-zinc-800 bg-zinc-900/50"
                  }`}>
                  {isGenerating && (
                    <div className="absolute inset-x-0 bottom-0 h-0.5 shimmer-bar" />
                  )}
                  <input
                    type="checkbox"
                    checked={selected.has(s.key)}
                    onChange={() => toggle(s.key)}
                    disabled={anyGenerating}
                    className="accent-violet-500 w-4 h-4 shrink-0"
                  />
                  <span className={`text-sm transition-transform ${isGenerating ? "scale-110" : ""}`}>{s.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-zinc-200">{s.label}</span>
                      {!isGenerating && !isDone && exists && <span className="text-[10px] text-emerald-400">exists</span>}
                      {isGenerating && (
                        <span className="text-[10px] text-violet-300 flex items-center gap-1">
                          <span className="inline-block w-1 h-1 rounded-full bg-violet-300 animate-bounce" style={{ animationDelay: "0ms" }} />
                          <span className="inline-block w-1 h-1 rounded-full bg-violet-300 animate-bounce" style={{ animationDelay: "150ms" }} />
                          <span className="inline-block w-1 h-1 rounded-full bg-violet-300 animate-bounce" style={{ animationDelay: "300ms" }} />
                          generating
                        </span>
                      )}
                      {isDone && <span className="text-[10px] text-emerald-400 flex items-center gap-1"><span className="inline-block animate-check">✓</span>done</span>}
                    </div>
                    <p className="text-xs text-zinc-500">{s.desc}</p>
                    {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
                  </div>
                  <button onClick={() => generateOne(s.key)} disabled={!hasLoadedMaterials || anyGenerating}
                    className="text-xs px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 disabled:opacity-30 transition-colors shrink-0">
                    {isGenerating ? "..." : exists ? "Regen" : "Generate"}
                  </button>
                  {exists && (
                    <button onClick={() => onNavigate(s.key as SubjectTab)}
                      className="text-xs text-violet-400 hover:text-violet-300 transition-colors shrink-0">
                      View &rarr;
                    </button>
                  )}
                </div>
              );
            })}

            {/* Custom sections */}
            {subject.content.customSections.map((cs) => {
              const stateKey = cs.id;
              const selKey = `custom:${cs.id}`;
              const isGenerating = generating.has(stateKey);
              const isDone = done.has(stateKey);
              const exists = !!cs.html;
              const error = errors[stateKey];
              const isEditing = editingCustomId === cs.id;

              if (isEditing) {
                return (
                  <div key={cs.id} className="border border-violet-500/30 bg-violet-500/5 rounded-xl p-3 space-y-2">
                    <input
                      autoFocus
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Section name (e.g. Glossary, Timeline...)"
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-violet-500"
                    />
                    <textarea
                      value={editPrompt}
                      onChange={(e) => setEditPrompt(e.target.value)}
                      placeholder="What should this section contain? e.g. 'Build a glossary of all key terms with definitions and examples...'"
                      rows={3}
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-violet-500 resize-none"
                    />
                    <div className="flex gap-2">
                      <button onClick={() => handleSaveCustomEdit(cs.id)} disabled={!editName.trim() || !editPrompt.trim()}
                        className="text-xs px-3 py-1.5 rounded-lg bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-40 transition-colors">
                        Save
                      </button>
                      <button onClick={() => handleCancelEdit(cs.id)}
                        className="text-xs px-3 py-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 transition-colors">
                        Cancel
                      </button>
                    </div>
                  </div>
                );
              }

              return (
                <div key={cs.id}
                  className={`relative flex items-center gap-3 p-3 rounded-xl border overflow-hidden transition-all ${
                    isGenerating ? "border-violet-500/60 bg-violet-500/10 animate-glow" :
                    isDone ? "border-emerald-500/40 bg-emerald-500/5" :
                    selected.has(selKey) ? "border-violet-500/30 bg-violet-500/5" : "border-zinc-800 bg-zinc-900/50"
                  }`}>
                  {isGenerating && (
                    <div className="absolute inset-x-0 bottom-0 h-0.5 shimmer-bar" />
                  )}
                  <input
                    type="checkbox"
                    checked={selected.has(selKey)}
                    onChange={() => toggle(selKey)}
                    disabled={anyGenerating}
                    className="accent-violet-500 w-4 h-4 shrink-0"
                  />
                  <span className={`text-sm transition-transform ${isGenerating ? "scale-110" : ""}`}>✨</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-zinc-200 truncate">{cs.name}</span>
                      {!isGenerating && !isDone && exists && <span className="text-[10px] text-emerald-400">exists</span>}
                      {isGenerating && (
                        <span className="text-[10px] text-violet-300 flex items-center gap-1">
                          <span className="inline-block w-1 h-1 rounded-full bg-violet-300 animate-bounce" style={{ animationDelay: "0ms" }} />
                          <span className="inline-block w-1 h-1 rounded-full bg-violet-300 animate-bounce" style={{ animationDelay: "150ms" }} />
                          <span className="inline-block w-1 h-1 rounded-full bg-violet-300 animate-bounce" style={{ animationDelay: "300ms" }} />
                          generating
                        </span>
                      )}
                      {isDone && <span className="text-[10px] text-emerald-400 flex items-center gap-1"><span className="inline-block animate-check">✓</span>done</span>}
                    </div>
                    <p className="text-xs text-zinc-500 truncate">{cs.prompt || <em>no prompt</em>}</p>
                    {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
                  </div>
                  <button onClick={() => { setEditingCustomId(cs.id); setEditName(cs.name); setEditPrompt(cs.prompt); }}
                    className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors shrink-0">
                    Edit
                  </button>
                  <button onClick={() => generateOne("custom", { customSectionId: cs.id, customSectionPrompt: cs.prompt, label: cs.name })}
                    disabled={!hasLoadedMaterials || anyGenerating || !cs.prompt}
                    className="text-xs px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 disabled:opacity-30 transition-colors shrink-0">
                    {isGenerating ? "..." : exists ? "Regen" : "Generate"}
                  </button>
                  {exists && (
                    <button onClick={() => onNavigate({ kind: "custom", id: cs.id })}
                      className="text-xs text-violet-400 hover:text-violet-300 transition-colors shrink-0">
                      View &rarr;
                    </button>
                  )}
                  <button onClick={() => handleDeleteCustom(cs.id, cs.name)}
                    className="text-zinc-700 hover:text-red-400 text-xs transition-colors shrink-0">
                    ✕
                  </button>
                </div>
              );
            })}

            <button
              onClick={handleStartNewCustom}
              disabled={anyGenerating}
              className="w-full py-2.5 rounded-xl border border-dashed border-zinc-700 hover:border-violet-500 text-zinc-500 hover:text-violet-400 text-sm transition-colors disabled:opacity-40"
            >
              + Add custom section
            </button>
          </div>

          <div className="max-w-lg">
            <label className="text-xs text-zinc-500 block mb-1">Custom instructions for ALL selected (optional)</label>
            <textarea
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="e.g. Focus on MPI and PRAM topics, use Croatian..."
              rows={2}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500 resize-none"
            />
          </div>

          <button
            onClick={generateSelected}
            disabled={!hasLoadedMaterials || selected.size === 0 || anyGenerating}
            className="relative overflow-hidden px-6 py-3 rounded-xl font-semibold text-white bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {anyGenerating && batch && (
              <div
                className="absolute inset-y-0 left-0 bg-violet-800/60 progress-stripes transition-all duration-500 ease-out"
                style={{ width: `${(batch.filter((b) => b.state === "done" || b.state === "error").length / batch.length) * 100}%` }}
              />
            )}
            <span className="relative">
              {anyGenerating && batch
                ? `Generating ${batch.filter((b) => b.state === "done" || b.state === "error").length}/${batch.length}...`
                : `Generate ${selected.size} selected section${selected.size !== 1 ? "s" : ""}`}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
