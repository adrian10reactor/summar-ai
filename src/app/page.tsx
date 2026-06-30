"use client";

import { useState, useEffect, useCallback } from "react";
import { Subject } from "@/types";
import { getSubjects, createSubject, deleteSubject } from "@/lib/storage";
import { getBalance, resetCredits } from "@/lib/credits";
import SubjectView from "@/components/SubjectView";

export default function Home() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [balance, setBalance] = useState(10);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");

  const refresh = useCallback(() => {
    const all = getSubjects();
    setSubjects(all);
    setBalance(getBalance());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleCreate = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    const s = createSubject(trimmed);
    setNewName("");
    setAdding(false);
    refresh();
    setActiveId(s.id);
  };

  const handleDelete = (id: string) => {
    deleteSubject(id);
    if (activeId === id) setActiveId(null);
    refresh();
  };

  const handleResetCredits = () => {
    if (confirm("Reset credits to €10.00?")) {
      resetCredits();
      refresh();
    }
  };

  const active = subjects.find((s) => s.id === activeId) || null;

  if (active) {
    return (
      <SubjectView
        key={active.id}
        subject={active}
        balance={balance}
        onSubjectUpdated={refresh}
        onBack={() => setActiveId(null)}
        onResetCredits={handleResetCredits}
        onDelete={() => { handleDelete(active.id); setActiveId(null); }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      <div className="max-w-4xl mx-auto px-4 md:px-6 py-8 md:py-12">
        <div className="flex items-center gap-4 mb-2">
          <img src="/logo.png" alt="Summar AI" className="h-16 w-auto object-contain" style={{ mixBlendMode: "screen" }} />
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent">
              Summar AI
            </h1>
            <p className="text-xs text-zinc-600">AI study platform</p>
          </div>
        </div>

        <p className="text-sm text-zinc-500 mt-4 mb-8 max-w-lg">
          Create a subject, upload your materials, then generate study guides, quizzes, cheat sheets, or chat with AI about your content.
        </p>

        <div className="flex items-center gap-3 mb-6">
          {adding ? (
            <div className="flex gap-2 flex-1 min-w-0">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                  if (e.key === "Escape") { setAdding(false); setNewName(""); }
                }}
                placeholder="Subject name..."
                className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500 flex-1 min-w-0 max-w-64"
              />
              <button onClick={handleCreate} className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm hover:bg-violet-500 transition-colors">
                Create
              </button>
              <button onClick={() => { setAdding(false); setNewName(""); }} className="text-zinc-500 hover:text-zinc-300 text-sm px-2">
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-500 transition-colors"
            >
              + New Subject
            </button>
          )}

          <div className="ml-auto text-right">
            <span className="text-[10px] text-zinc-600 uppercase tracking-wider">Credits</span>
            <p className={`text-sm font-mono font-bold ${balance < 1 ? "text-red-400" : "text-emerald-400"}`}>
              &euro;{balance.toFixed(2)}
            </p>
          </div>
        </div>

        {subjects.length === 0 && (
          <div className="text-center py-16 text-zinc-600">
            <p className="text-4xl mb-4">📚</p>
            <p className="text-sm">No subjects yet. Create one to get started.</p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {subjects.map((s) => (
            <button
              key={s.id}
              onClick={() => setActiveId(s.id)}
              className="group p-4 rounded-xl border border-zinc-800 hover:border-violet-500/40 text-left transition-all hover:bg-zinc-900/50"
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                <span className="text-sm font-medium text-zinc-200 truncate">{s.name}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`Delete "${s.name}"?`)) handleDelete(s.id);
                  }}
                  className="ml-auto text-zinc-700 hover:text-red-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  ✕
                </button>
              </div>
              <div className="text-xs text-zinc-600 space-x-2">
                <span>{s.materials.length} material{s.materials.length !== 1 ? "s" : ""}</span>
                {s.content.quizzes.length > 0 && <span>· {s.content.quizzes.length} quiz{s.content.quizzes.length !== 1 ? "zes" : ""}</span>}
                {s.content.studyGuide && <span>· study guide</span>}
                {s.content.cheatSheet && <span>· cheat sheet</span>}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
