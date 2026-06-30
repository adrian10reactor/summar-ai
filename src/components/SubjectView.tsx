"use client";

import { useState, useRef } from "react";
import { Subject, SubjectTab } from "@/types";
import MaterialsTab from "./tabs/MaterialsTab";
import StudyGuideTab from "./tabs/StudyGuideTab";
import QuizTab from "./tabs/QuizTab";
import CheatSheetTab from "./tabs/CheatSheetTab";
import ExamPrepTab from "./tabs/ExamPrepTab";
import ChatTab from "./tabs/ChatTab";
import CustomSectionTab from "./tabs/CustomSectionTab";

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
}: {
  subject: Subject;
  balance: number;
  onSubjectUpdated: () => void;
  onBack: () => void;
  onResetCredits: () => void;
  onDelete: () => void;
}) {
  const [tab, setTab] = useState<TabKey>("materials");
  const [lastCost, setLastCost] = useState<{ amount: number; action: string } | null>(null);
  const [chatLaunch, setChatLaunch] = useState<{ message: string; chatName: string; nonce: number } | null>(null);
  const pdfDataRef = useRef<Map<string, string>>(new Map());

  const getMaterialsForApi = () => {
    const out: { type: string; data: string; name: string; uri?: string; mimeType?: string }[] = [];
    for (const m of subject.materials) {
      if (m.type === "pdf") {
        if (m.uri) {
          out.push({ type: "pdf", data: "", name: m.name, uri: m.uri, mimeType: m.mimeType || "application/pdf" });
        } else {
          const base64 = pdfDataRef.current.get(m.id);
          if (base64) out.push({ type: "pdf", data: base64, name: m.name });
        }
      } else if (m.data) {
        out.push({ type: m.type, data: m.data, name: m.name });
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

  const handleAskAboutText = (payload: { message: string; chatName: string }) => {
    setChatLaunch({ ...payload, nonce: Date.now() });
    setTab("chat");
  };

  const handleNavigateToSection = (target: SubjectTab | { kind: "custom"; id: string }) => {
    setTab(target);
  };

  const customSections = subject.content.customSections || [];
  const activeCustomSection = isCustomTab(tab)
    ? customSections.find((c) => c.id === tab.id)
    : null;

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-950">
      {/* Section sidebar */}
      <nav className="w-56 shrink-0 border-r border-zinc-800 flex flex-col h-full bg-zinc-950">
        <div className="p-3 border-b border-zinc-800">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors mb-2"
          >
            &larr; All subjects
          </button>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: subject.color }} />
            <h2 className="text-sm font-bold text-zinc-200 truncate flex-1">{subject.name}</h2>
            <button
              onClick={() => { if (confirm(`Delete "${subject.name}"?`)) onDelete(); }}
              className="text-zinc-700 hover:text-red-400 text-xs transition-colors"
            >
              ✕
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
                onClick={() => setTab(s.key)}
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
                    onClick={() => setTab({ kind: "custom", id: cs.id })}
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
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl px-8 py-6">
          {tab === "materials" && (
            <MaterialsTab
              subject={subject}
              pdfDataRef={pdfDataRef}
              getMaterials={getMaterialsForApi}
              hasLoadedMaterials={hasLoadedMaterials}
              hasMaterials={hasMaterials}
              onCost={handleCostIncurred}
              onUpdated={onSubjectUpdated}
              onNavigate={handleNavigateToSection}
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
            />
          )}
          {activeCustomSection && (
            <CustomSectionTab
              subject={subject}
              section={activeCustomSection}
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
    </div>
  );
}
