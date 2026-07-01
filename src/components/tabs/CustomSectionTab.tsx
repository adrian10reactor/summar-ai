"use client";

import { useState } from "react";
import { Subject, CustomSection } from "@/types";
import { saveCustomSectionHtml, deleteCustomSection, updateCustomSection } from "@/lib/storage";
import { deductCredits, estimateApiCost } from "@/lib/credits";
import { parseApiResponse } from "@/lib/api";
import { ImageLookup, swapMaterialImages } from "@/lib/render";

export default function CustomSectionTab({
  subject,
  section,
  getMaterials,
  hasLoadedMaterials,
  hasMaterials,
  onCost,
  onUpdated,
  onDeleted,
  imageLookup,
}: {
  subject: Subject;
  section: CustomSection;
  getMaterials: () => { type: string; data: string; name: string }[];
  hasLoadedMaterials: boolean;
  hasMaterials: boolean;
  onCost: (amount: number, action: string) => void;
  onUpdated: () => void;
  onDeleted: () => void;
  imageLookup: ImageLookup;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(section.name);
  const [editPrompt, setEditPrompt] = useState(section.prompt);

  const handleGenerate = async () => {
    const materials = getMaterials();
    if (materials.length === 0) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "custom", materials, customSectionPrompt: section.prompt }),
      });
      const data = await parseApiResponse<{ html: string; _usage?: { tokensIn: number; tokensOut: number } }>(res);

      const usage = data._usage || { tokensIn: 0, tokensOut: 0 };
      const apiCost = estimateApiCost(usage.tokensIn, usage.tokensOut);
      const { charged } = deductCredits(apiCost, "custom", subject.name, usage.tokensIn, usage.tokensOut);
      onCost(charged, `Generated ${section.name}`);

      saveCustomSectionHtml(subject.id, section.id, data.html);
      onUpdated();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveEdit = () => {
    updateCustomSection(subject.id, section.id, { name: editName, prompt: editPrompt });
    onUpdated();
    setEditing(false);
  };

  const handleDelete = () => {
    if (!confirm(`Delete "${section.name}"?`)) return;
    deleteCustomSection(subject.id, section.id);
    onUpdated();
    onDeleted();
  };

  if (editing) {
    return (
      <div className="space-y-3 max-w-xl">
        <h3 className="text-lg font-semibold text-zinc-200">Edit Section</h3>
        <div>
          <label className="text-xs text-zinc-500 block mb-1">Section name</label>
          <input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-violet-500"
          />
        </div>
        <div>
          <label className="text-xs text-zinc-500 block mb-1">Prompt / instructions</label>
          <textarea
            value={editPrompt}
            onChange={(e) => setEditPrompt(e.target.value)}
            rows={4}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-violet-500 resize-none"
          />
        </div>
        <div className="flex gap-2">
          <button onClick={handleSaveEdit} className="px-4 py-2 text-sm rounded-lg bg-violet-600 text-white hover:bg-violet-500 transition-colors">
            Save
          </button>
          <button onClick={() => setEditing(false)} className="px-4 py-2 text-sm rounded-lg text-zinc-400 hover:text-zinc-200 transition-colors">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (!section.html) {
    return (
      <div className="py-8 space-y-4 max-w-xl">
        <div>
          <h3 className="text-lg font-semibold text-zinc-200 mb-1">{section.name}</h3>
          <p className="text-xs text-zinc-500 mb-2">Custom section · not yet generated</p>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-sm text-zinc-400">
            <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1">Prompt</p>
            <p className="whitespace-pre-wrap">{section.prompt}</p>
          </div>
        </div>
        {error && <p className="text-red-400 text-sm bg-red-950/30 rounded-lg px-4 py-3">{error}</p>}
        <div className="flex gap-2">
          <button
            onClick={handleGenerate}
            disabled={loading || !hasLoadedMaterials}
            className="px-5 py-2.5 rounded-xl font-semibold text-white bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {loading ? "Generating..." : !hasMaterials ? "Upload materials first" : !hasLoadedMaterials ? "Re-upload PDFs first" : "Generate"}
          </button>
          <button onClick={() => setEditing(true)} className="px-3 py-2.5 rounded-xl text-sm border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors">
            Edit
          </button>
          <button onClick={handleDelete} className="px-3 py-2.5 rounded-xl text-sm border border-zinc-800 text-zinc-500 hover:text-red-400 hover:border-red-900 transition-colors">
            Delete
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-zinc-200 truncate">{section.name}</h2>
          <p className="text-xs text-zinc-600">
            Generated {section.generatedAt ? new Date(section.generatedAt).toLocaleDateString() : "—"}
          </p>
        </div>
        <button onClick={() => setEditing(true)} className="text-xs px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors">
          Edit
        </button>
        <button
          onClick={handleGenerate}
          disabled={loading || !hasLoadedMaterials}
          className="text-xs px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 disabled:opacity-40 transition-colors"
        >
          {loading ? "Regenerating..." : "Regenerate"}
        </button>
        <button onClick={handleDelete} className="text-xs px-3 py-1.5 rounded-lg border border-zinc-800 text-zinc-500 hover:text-red-400 hover:border-red-900 transition-colors">
          Delete
        </button>
      </div>

      {error && <p className="text-red-400 text-sm bg-red-950/30 rounded-lg px-4 py-3">{error}</p>}

      <div
        className="prose prose-invert prose-sm max-w-none
          bg-zinc-900 border border-zinc-800 rounded-xl p-6
          [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-violet-300 [&_h2]:mt-8 [&_h2]:mb-4 [&_h2]:first:mt-0
          [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-zinc-200 [&_h3]:mt-6 [&_h3]:mb-3
          [&_h4]:text-base [&_h4]:font-medium [&_h4]:text-zinc-300 [&_h4]:mt-4 [&_h4]:mb-2
          [&_p]:text-zinc-300 [&_p]:leading-relaxed [&_p]:mb-3
          [&_ul]:space-y-1 [&_ul]:ml-4 [&_ul]:list-disc [&_ol]:space-y-1 [&_ol]:ml-4 [&_ol]:list-decimal
          [&_li]:text-zinc-300 [&_strong]:text-zinc-100
          [&_code]:bg-zinc-800 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-violet-300 [&_code]:text-xs
          [&_pre]:bg-zinc-950 [&_pre]:rounded-lg [&_pre]:p-4 [&_pre]:overflow-x-auto [&_pre_code]:bg-transparent [&_pre_code]:p-0
          [&_blockquote]:border-l-4 [&_blockquote]:border-violet-500 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-zinc-400
          [&_table]:w-full [&_th]:bg-zinc-800 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:text-zinc-200 [&_th]:text-sm
          [&_td]:px-3 [&_td]:py-2 [&_td]:border-t [&_td]:border-zinc-800 [&_td]:text-zinc-300 [&_td]:text-sm
          [&_hr]:border-zinc-800 [&_hr]:my-6"
        dangerouslySetInnerHTML={{ __html: swapMaterialImages(section.html, subject, imageLookup) }}
      />
    </div>
  );
}
