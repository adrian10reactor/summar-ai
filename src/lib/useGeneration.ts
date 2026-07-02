"use client";

import { useState } from "react";
import { Subject, Quiz, Question } from "@/types";
import {
  saveStudyGuide, saveCheatSheet, saveExamPrep, saveExamSolutions,
  saveQuizToSubject, saveCustomSectionHtml, addFlashcards,
  getSubjects,
} from "@/lib/storage";
import { deductCredits, estimateApiCost } from "@/lib/credits";
import { parseApiResponse } from "@/lib/api";
import { extractSubjectTopics } from "@/lib/render";

export type BatchItemState = "queued" | "generating" | "done" | "error";
export interface BatchItem {
  key: string;
  label: string;
  icon: string;
  state: BatchItemState;
  startedAt?: number;
}

export interface GenerationState {
  batch: BatchItem[] | null;
  generating: Set<string>;
  done: Set<string>;
  errors: Record<string, string>;
  statusText: string;
  isRunning: boolean;
  generateOne: (mode: string, opts?: { customSectionId?: string; customSectionPrompt?: string; label?: string; customPrompt?: string }) => Promise<{ ok: boolean; error?: string }>;
  startBatch: (items: BatchItem[], customPrompt?: string) => Promise<void>;
}

export function useGeneration(
  subject: Subject,
  getMaterials: () => { type: string; data: string; name: string }[],
  onCost: (amount: number, action: string) => void,
  onUpdated: () => void,
): GenerationState {
  const [batch, setBatch] = useState<BatchItem[] | null>(null);
  const [generating, setGenerating] = useState<Set<string>>(new Set());
  const [done, setDone] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [statusText, setStatusText] = useState("");

  const generateOne: GenerationState["generateOne"] = async (mode, opts) => {
    const materials = getMaterials();
    if (materials.length === 0) return { ok: false, error: "No materials" };
    const stateKey = opts?.customSectionId || mode;
    setGenerating((p) => new Set(p).add(stateKey));
    setErrors((p) => { const n = { ...p }; delete n[stateKey]; return n; });
    setStatusText(`Analyzing ${materials.length} material${materials.length !== 1 ? "s" : ""}...`);

    try {
      const otherSubjects = getSubjects()
        .filter((s) => s.id !== subject.id)
        .map((s) => ({ id: s.id, name: s.name, topics: extractSubjectTopics(s) }))
        .filter((s) => s.topics.length > 0);

      const body: Record<string, unknown> = { mode, materials };
      if (opts?.customPrompt?.trim()) body.customPrompt = opts.customPrompt.trim();
      if (opts?.customSectionPrompt) body.customSectionPrompt = opts.customSectionPrompt;
      if (otherSubjects.length > 0) body.otherSubjects = otherSubjects;

      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await parseApiResponse<{ html: string; title?: string; questions?: Question[]; cards?: { front: string; back: string }[]; _usage?: { tokensIn: number; tokensOut: number } }>(res);

      const usage = data._usage || { tokensIn: 0, tokensOut: 0 };
      const apiCost = estimateApiCost(usage.tokensIn, usage.tokensOut);
      const { charged } = deductCredits(apiCost, mode, subject.name, usage.tokensIn, usage.tokensOut);
      onCost(charged, `Generated ${opts?.label || mode}`);

      if (mode === "study-guide") saveStudyGuide(subject.id, data.html);
      else if (mode === "cheat-sheet") saveCheatSheet(subject.id, data.html);
      else if (mode === "exam-prep") saveExamPrep(subject.id, data.html);
      else if (mode === "exam-solve") saveExamSolutions(subject.id, data.html);
      else if (mode === "quiz") {
        const quiz: Quiz = { title: data.title || "Quiz", questions: data.questions || [] };
        saveQuizToSubject(subject.id, quiz, data.title || "Quiz");
      } else if (mode === "custom" && opts?.customSectionId) {
        saveCustomSectionHtml(subject.id, opts.customSectionId, data.html);
      } else if (mode === "flashcards") {
        const cards = data.cards || [];
        if (cards.length > 0) addFlashcards(subject.id, cards);
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

  const startBatch: GenerationState["startBatch"] = async (queue, customPrompt) => {
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
          result = await generateOne("custom", { customSectionId: id, customSectionPrompt: sec.prompt, label: sec.name, customPrompt });
        } else {
          result = { ok: false, error: "Section missing" };
        }
      } else {
        result = await generateOne(item.key, { customPrompt });
      }

      setBatch((b) => b ? b.map((x) => x.key === item.key ? { ...x, state: result.ok ? "done" : "error" } : x) : b);
    }

    setStatusText("All done!");
    setTimeout(() => {
      setBatch(null);
      setStatusText("");
    }, 2500);
  };

  return {
    batch, generating, done, errors, statusText,
    isRunning: generating.size > 0 || (batch?.some((b) => b.state === "generating" || b.state === "queued") ?? false),
    generateOne, startBatch,
  };
}
