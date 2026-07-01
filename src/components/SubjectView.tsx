"use client";

import { useState, useRef } from "react";
import { Subject, SubjectTab, ChatAttachment } from "@/types";
import MaterialsTab from "./tabs/MaterialsTab";
import StudyGuideTab from "./tabs/StudyGuideTab";
import QuizTab from "./tabs/QuizTab";
import CheatSheetTab from "./tabs/CheatSheetTab";
import ExamPrepTab from "./tabs/ExamPrepTab";
import ChatTab from "./tabs/ChatTab";
import CustomSectionTab from "./tabs/CustomSectionTab";
import { ImageLookup } from "@/lib/render";
import { useGeneration } from "@/lib/useGeneration";
import CrossRefModal, { CrossRefTarget } from "./CrossRefModal";
import { getSubjects } from "@/lib/storage";

type TabKey = SubjectTab | { kind: "custom"; id: string };

const SECTIONS: { key: SubjectTab; label: string; icon: string }[] = [
  { key: "materials", label: "Materials", icon: "📁" },
  { key: "study-guide", label: "Study Guide", icon: "📖" },
  { key: "quiz", label: "Quiz", icon: "❓" },
  { key: "cheat-sheet", label: "Cheat Sheet", icon: "⚡" },
  { key: "exam-prep", label: "Exam Prep", icon: "🎓" },
  { key: "chat", label: "Chat", icon: "💬" },
];

function sectionStatus(subject: Subject, key: SubjectTab): "empty" | "ready" {
  if (key === "materials") return subject.materials.length > 0 ? "ready" : "empty";
  if (key === "study-guide") return subject.content.studyGuide ? "ready" : "empty";
  if (key === "quiz") return subject.content.quizzes.length > 0 ? "ready" : "empty";
  if (key === "cheat-sheet") return subject.content.cheatSheet ? "ready" : "empty";
  if (key === "exam-prep") return subject.content.examPrep ? "ready" : "empty";
  if (key === "chat") return subject.content.chats.length > 0 ? "ready" : "empty";
  return "empty";
}

function isCustomTab(tab: TabKey): tab is { kind: "custom"; id: string } {
  return typeof tab === "object" && tab !== null && (tab as { kind?: string }).kind === "custom";
}

export default function SubjectView({
  subject,
  balance,
  onSubjectUpdated,
  onBack,
  onResetCredits,
  onDelete,
  onOpenOtherSubject,
}: {
  subject: Subject;
  balance: number;
  onSubjectUpdated: () => void;
  onBack: () => void;
  onResetCredits: () => void;
  onDelete: () => void;
  onOpenOtherSubject?: (subjectId: string) => void;
}) {
  const [tab, setTab] = useState<TabKey>("materials");
  const [lastCost, setLastCost] = useState<{ amount: number; action: string } | null>(null);
  const [chatLaunch, setChatLaunch] = useState<{ message: string; chatName: string; nonce: number; attachments?: ChatAttachment[] } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [crossRef, setCrossRef] = useState<CrossRefTarget | null>(null);
  const pdfDataRef = useRef<Map<string, string>>(new Map());
  // Client-side blob URLs for rendering images inline. Keyed by materialId for standalone
  // images, or `${materialId}::${pageNum}` for rasterized PDF pages.
  const imageBlobRef = useRef<Map<string, string>>(new Map());

  const imageLookup: ImageLookup = {
    getUrl: (materialId, pageNum) => {
      const key = pageNum !== undefined ? `${materialId}::${pageNum}` : materialId;
      return imageBlobRef.current.get(key);
    },
  };

  const selectTab = (next: TabKey) => {
    setTab(next);
    setSidebarOpen(false);
  };

  const getMaterialsForApi = () => {
    const out: { type: string; data: string; name: string; id?: string; uri?: string; mimeType?: string; pageUris?: { pageNum: number; uri: string; mimeType: string }[]; pageCount?: number }[] = [];
    for (const m of subject.materials) {
      if (m.type === "pdf") {
        if (m.uri) {
          out.push({
            type: "pdf", data: "", name: m.name, id: m.id,
            uri: m.uri, mimeType: m.mimeType || "application/pdf",
            pageUris: m.pageUris, pageCount: m.pageCount,
          });
        } else {
          const base64 = pdfDataRef.current.get(m.id);
          if (base64) out.push({ type: "pdf", data: base64, name: m.name, id: m.id });
        }
      } else if (m.type === "image") {
        if (m.uri) {
          out.push({ type: "image", data: "", name: m.name, id: m.id, uri: m.uri, mimeType: m.mimeType || "image/png" });
        } else if (m.data) {
          out.push({ type: "image", data: m.data, name: m.name, id: m.id, mimeType: m.mimeType || "image/png" });
        }
      } else if (m.data) {
        out.push({ type: m.type, data: m.data, name: m.name, id: m.id });
      }
    }
    return out;
  };

  const hasMaterials = subject.materials.length > 0;
  const hasLoadedMaterials = getMaterialsForApi().length > 0;

  const handleCostIncurred = (amount: number, action: string) => {
    setLastCost({ amount, action });
    onSubjectUpdated();
    setTimeout(() => setLastCost(null), 8000);
  };

  const generation = useGeneration(subject, getMaterialsForApi, handleCostIncurred, onSubjectUpdated);

  const handleAskAboutText = (payload: { message: string; chatName: string }) => {
    setChatLaunch({ ...payload, nonce: Date.now() });
    selectTab("chat");
  };

  const handleNavigateToSection = (target: SubjectTab | { kind: "custom"; id: string }) => {
    selectTab(target);
  };

  const customSections = subject.content.customSections || [];
  const activeCustomSection = isCustomTab(tab)
    ? customSections.find((c) => c.id === tab.id)
    : null;

  const activeLabel = isCustomTab(tab)
    ? activeCustomSection?.name || "Section"
    : SECTIONS.find((s) => s.key === tab)?.label || "Section";

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-950">
      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 inset-x-0 z-30 flex items-center gap-2 px-3 h-12 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur">
        <button
          onClick={() => setSidebarOpen(true)}
          aria-label="Open menu"
          className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: subject.color }} />
        <span className="text-sm font-semibold text-zinc-200 truncate">{subject.name}</span>
        <span className="text-xs text-zinc-600">·</span>
        <span className="text-xs text-zinc-400 truncate">{activeLabel}</span>
        <div className="ml-auto" />
        {generation.batch && (() => {
          const total = generation.batch.length;
          const doneCount = generation.batch.filter((b) => b.state === "done" || b.state === "error").length;
          const allDone = doneCount === total;
          return (
            <button
              onClick={() => selectTab("materials")}
              className="flex items-center gap-1 text-[10px] text-violet-300 border border-violet-500/40 bg-violet-500/10 rounded-full px-2 py-0.5 shrink-0"
            >
              {!allDone && <span className="w-1.5 h-1.5 rounded-full border border-violet-300 border-t-transparent animate-spin-slow" />}
              {allDone && <span className="text-emerald-400">✓</span>}
              <span className="font-mono">{doneCount}/{total}</span>
            </button>
          );
        })()}
        <span className={`text-xs font-mono shrink-0 ${balance < 1 ? "text-red-400" : "text-emerald-400"}`}>
          &euro;{balance.toFixed(2)}
        </span>
      </div>

      {/* Backdrop (mobile) */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="md:hidden fixed inset-0 z-40 bg-black/60 animate-fade-in"
        />
      )}

      {/* Section sidebar */}
      <nav className={`w-64 md:w-56 shrink-0 border-r border-zinc-800 flex flex-col h-full bg-zinc-950 transition-transform duration-200 ${
        sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      } fixed md:relative z-50 md:z-auto top-0 left-0`}>
        <div className="p-3 border-b border-zinc-800">
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={onBack}
              className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              &larr; All subjects
            </button>
            <button
              onClick={() => setSidebarOpen(false)}
              aria-label="Close menu"
              className="md:hidden text-zinc-500 hover:text-zinc-300 text-xs px-1"
            >
              ✕
            </button>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: subject.color }} />
            <h2 className="text-sm font-bold text-zinc-200 truncate flex-1">{subject.name}</h2>
            <button
              onClick={() => { if (confirm(`Delete "${subject.name}"?`)) onDelete(); }}
              className="text-zinc-700 hover:text-red-400 text-xs transition-colors"
              aria-label="Delete subject"
            >
              🗑
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
          <div className="text-[10px] text-zinc-600 uppercase tracking-wider px-2 mt-1 mb-1">Sections</div>
          {SECTIONS.map((s) => {
            const status = sectionStatus(subject, s.key);
            const active = !isCustomTab(tab) && tab === s.key;
            return (
              <button
                key={s.key}
                onClick={() => selectTab(s.key)}
                className={`w-full text-left flex items-center gap-2 px-2.5 py-2 text-sm transition-colors rounded-lg ${
                  active ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
                }`}
              >
                <span className="text-xs">{s.icon}</span>
                <span className="flex-1">{s.label}</span>
                {status === "ready" && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                )}
              </button>
            );
          })}

          {customSections.length > 0 && (
            <>
              <div className="text-[10px] text-zinc-600 uppercase tracking-wider px-2 mt-4 mb-1">Custom</div>
              {customSections.map((cs) => {
                const active = isCustomTab(tab) && tab.id === cs.id;
                const ready = !!cs.html;
                return (
                  <button
                    key={cs.id}
                    onClick={() => selectTab({ kind: "custom", id: cs.id })}
                    className={`w-full text-left flex items-center gap-2 px-2.5 py-2 text-sm transition-colors rounded-lg ${
                      active ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
                    }`}
                    title={cs.name}
                  >
                    <span className="text-xs">✨</span>
                    <span className="flex-1 truncate">{cs.name}</span>
                    {ready && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />}
                  </button>
                );
              })}
            </>
          )}

          {generation.batch && (() => {
            const total = generation.batch.length;
            const doneCount = generation.batch.filter((b) => b.state === "done" || b.state === "error").length;
            const allDone = doneCount === total;
            const errCount = generation.batch.filter((b) => b.state === "error").length;
            const pct = (doneCount / Math.max(total, 1)) * 100;
            return (
              <button
                onClick={() => selectTab("materials")}
                className="mx-1 mt-3 w-[calc(100%-8px)] block text-left px-2.5 py-2 rounded-lg border border-violet-500/30 bg-gradient-to-br from-violet-900/40 to-zinc-900 hover:from-violet-800/40 transition-colors animate-fade-in"
                title="Open Materials tab to see details"
              >
                <div className="flex items-center gap-1.5 mb-1">
                  {!allDone && <div className="w-2.5 h-2.5 rounded-full border-2 border-violet-400 border-t-transparent animate-spin-slow" />}
                  {allDone && <span className="text-emerald-400 text-xs animate-check">✓</span>}
                  <span className="text-[10px] font-semibold text-zinc-200 flex-1 truncate">
                    {allDone ? (errCount ? `${errCount} error${errCount !== 1 ? "s" : ""}` : "All done!") : "Generating…"}
                  </span>
                  <span className="text-[10px] text-violet-300 font-mono shrink-0">{doneCount}/{total}</span>
                </div>
                <div className="h-1 w-full bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${allDone ? (errCount ? "bg-amber-500" : "bg-emerald-500") : "bg-gradient-to-r from-violet-500 to-indigo-500 progress-stripes"} transition-all duration-500 ease-out`}
                    style={{ width: `${Math.max(pct, 3)}%` }}
                  />
                </div>
              </button>
            );
          })()}

          {lastCost && (
            <div className="mx-1 mt-3 px-2.5 py-2 bg-amber-950/30 border border-amber-800/30 rounded-lg animate-fade-in">
              <p className="text-[10px] text-amber-400">{lastCost.action}</p>
              <p className="text-xs text-amber-300 font-mono">-&euro;{lastCost.amount.toFixed(4)}</p>
            </div>
          )}
        </div>

        <div className="p-3 border-t border-zinc-800">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Credits</span>
            <button
              onClick={onResetCredits}
              className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              reset
            </button>
          </div>
          <p className={`text-lg font-mono font-bold mt-0.5 ${balance < 1 ? "text-red-400" : "text-emerald-400"}`}>
            &euro;{balance.toFixed(2)}
          </p>
        </div>
      </nav>

      {/* Content */}
      <div className="flex-1 overflow-y-auto pt-12 md:pt-0">
        <div className="max-w-5xl px-4 md:px-8 py-4 md:py-6">
          {tab === "materials" && (
            <MaterialsTab
              subject={subject}
              pdfDataRef={pdfDataRef}
              imageBlobRef={imageBlobRef}
              getMaterials={getMaterialsForApi}
              hasLoadedMaterials={hasLoadedMaterials}
              hasMaterials={hasMaterials}
              onCost={handleCostIncurred}
              onUpdated={onSubjectUpdated}
              onNavigate={handleNavigateToSection}
              generation={generation}
            />
          )}
          {tab === "study-guide" && (
            <StudyGuideTab
              subject={subject}
              getMaterials={getMaterialsForApi}
              hasLoadedMaterials={hasLoadedMaterials}
              hasMaterials={hasMaterials}
              onCost={handleCostIncurred}
              onUpdated={onSubjectUpdated}
              onAskAbout={handleAskAboutText}
              imageLookup={imageLookup}
              onCrossRefClick={setCrossRef}
            />
          )}
          {tab === "quiz" && (
            <QuizTab
              subject={subject}
              getMaterials={getMaterialsForApi}
              hasLoadedMaterials={hasLoadedMaterials}
              hasMaterials={hasMaterials}
              onCost={handleCostIncurred}
              onUpdated={onSubjectUpdated}
            />
          )}
          {tab === "cheat-sheet" && (
            <CheatSheetTab
              subject={subject}
              getMaterials={getMaterialsForApi}
              hasLoadedMaterials={hasLoadedMaterials}
              hasMaterials={hasMaterials}
              onCost={handleCostIncurred}
              onUpdated={onSubjectUpdated}
              imageLookup={imageLookup}
              onCrossRefClick={setCrossRef}
            />
          )}
          {tab === "exam-prep" && (
            <ExamPrepTab
              subject={subject}
              getMaterials={getMaterialsForApi}
              hasLoadedMaterials={hasLoadedMaterials}
              hasMaterials={hasMaterials}
              onCost={handleCostIncurred}
              onUpdated={onSubjectUpdated}
              imageLookup={imageLookup}
              onCrossRefClick={setCrossRef}
            />
          )}
          {tab === "chat" && (
            <ChatTab
              subject={subject}
              getMaterials={getMaterialsForApi}
              hasLoadedMaterials={hasLoadedMaterials}
              hasMaterials={hasMaterials}
              onCost={handleCostIncurred}
              onUpdated={onSubjectUpdated}
              launch={chatLaunch}
              onLaunchConsumed={() => setChatLaunch(null)}
              imageLookup={imageLookup}
              imageBlobRef={imageBlobRef}
            />
          )}
          {activeCustomSection && (
            <CustomSectionTab
              subject={subject}
              section={activeCustomSection}
              imageLookup={imageLookup}
              onCrossRefClick={setCrossRef}
              getMaterials={getMaterialsForApi}
              hasLoadedMaterials={hasLoadedMaterials}
              hasMaterials={hasMaterials}
              onCost={handleCostIncurred}
              onUpdated={onSubjectUpdated}
              onDeleted={() => setTab("materials")}
            />
          )}
        </div>
      </div>

      {crossRef && (
        <CrossRefModal
          target={crossRef}
          subjects={getSubjects()}
          imageLookup={imageLookup}
          onClose={() => setCrossRef(null)}
          onOpenSubject={(id) => { onOpenOtherSubject?.(id); }}
        />
      )}
    </div>
  );
}
