"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Subject, CrossSubjectChat } from "@/types";
import { getSubjects, createSubject, deleteSubject, getCrossChats, createCrossChat } from "@/lib/storage";
import { getBalance, resetCredits } from "@/lib/credits";
import SubjectView from "@/components/SubjectView";
import CrossChatView from "@/components/CrossChatView";

type Active =
  | { kind: "home" }
  | { kind: "subject"; id: string }
  | { kind: "cross-chat"; id: string };

export default function Home() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [crossChats, setCrossChats] = useState<CrossSubjectChat[]>([]);
  const [active, setActive] = useState<Active>({ kind: "home" });
  const [balance, setBalance] = useState(10);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [creatingCross, setCreatingCross] = useState(false);
  const [crossName, setCrossName] = useState("");
  const [crossSelected, setCrossSelected] = useState<Set<string>>(new Set());
  const crossImageBlobRef = useRef<Map<string, string>>(new Map());

  const refresh = useCallback(() => {
    setSubjects(getSubjects());
    setCrossChats(getCrossChats());
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
    setActive({ kind: "subject", id: s.id });
  };

  const handleDelete = (id: string) => {
    deleteSubject(id);
    if (active.kind === "subject" && active.id === id) setActive({ kind: "home" });
    refresh();
  };

  const handleCreateCrossChat = () => {
    const trimmed = crossName.trim() || "Cross-subject chat";
    if (crossSelected.size === 0) return;
    const chat = createCrossChat(trimmed, Array.from(crossSelected));
    setCrossName("");
    setCrossSelected(new Set());
    setCreatingCross(false);
    refresh();
    setActive({ kind: "cross-chat", id: chat.id });
  };

  const toggleCrossSubject = (id: string) => {
    setCrossSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleResetCredits = () => {
    if (confirm("Reset credits to €10.00?")) {
      resetCredits();
      refresh();
    }
  };

  if (active.kind === "subject") {
    const s = subjects.find((x) => x.id === active.id);
    if (s) {
      return (
        <SubjectView
          key={s.id}
          subject={s}
          balance={balance}
          onSubjectUpdated={refresh}
          onBack={() => setActive({ kind: "home" })}
          onResetCredits={handleResetCredits}
          onDelete={() => { handleDelete(s.id); setActive({ kind: "home" }); }}
        />
      );
    }
  }

  if (active.kind === "cross-chat") {
    const chat = crossChats.find((c) => c.id === active.id);
    if (chat) {
      return (
        <CrossChatView
          key={chat.id}
          chat={chat}
          subjects={subjects}
          balance={balance}
          imageBlobRef={crossImageBlobRef}
          onBack={() => setActive({ kind: "home" })}
          onDelete={() => { refresh(); setActive({ kind: "home" }); }}
          onResetCredits={handleResetCredits}
          onUpdated={refresh}
        />
      );
    }
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
              onClick={() => setActive({ kind: "subject", id: s.id })}
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

        {/* Cross-subject chats */}
        {(subjects.length > 0 || crossChats.length > 0) && (
          <div className="mt-10">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-base">🧩</span>
              <h2 className="text-sm font-semibold text-zinc-300">Cross-subject chats</h2>
              <p className="text-[11px] text-zinc-600 flex-1">Connect knowledge across multiple subjects at once</p>
              {!creatingCross && subjects.length > 0 && (
                <button
                  onClick={() => setCreatingCross(true)}
                  className="text-xs px-3 py-1.5 rounded-lg border border-zinc-700 text-violet-400 hover:text-white hover:border-violet-500 transition-colors"
                >
                  + New
                </button>
              )}
            </div>

            {creatingCross && (
              <div className="mb-3 p-4 rounded-xl border border-violet-500/30 bg-violet-500/5 space-y-3 animate-fade-in">
                <div>
                  <label className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">Name</label>
                  <input
                    autoFocus
                    value={crossName}
                    onChange={(e) => setCrossName(e.target.value)}
                    placeholder="e.g. Math + Parallel Programming"
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">Include subjects</label>
                  <div className="flex flex-wrap gap-1.5">
                    {subjects.map((s) => (
                      <label key={s.id} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-800 hover:border-zinc-700 cursor-pointer transition-colors">
                        <input
                          type="checkbox"
                          checked={crossSelected.has(s.id)}
                          onChange={() => toggleCrossSubject(s.id)}
                          className="accent-violet-500 w-3.5 h-3.5"
                        />
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                        <span className="text-xs text-zinc-300">{s.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleCreateCrossChat}
                    disabled={crossSelected.size === 0}
                    className="px-4 py-2 text-sm rounded-lg bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-40 transition-colors"
                  >
                    Create
                  </button>
                  <button
                    onClick={() => { setCreatingCross(false); setCrossName(""); setCrossSelected(new Set()); }}
                    className="text-sm text-zinc-500 hover:text-zinc-300 px-2"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {crossChats.length === 0 && !creatingCross && (
              <p className="text-xs text-zinc-600">No cross-subject chats yet. Create one to connect concepts across your subjects.</p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {crossChats.map((c) => {
                const includedSubjects = subjects.filter((s) => c.subjectIds.includes(s.id));
                return (
                  <button
                    key={c.id}
                    onClick={() => setActive({ kind: "cross-chat", id: c.id })}
                    className="group p-4 rounded-xl border border-violet-500/20 hover:border-violet-500/50 bg-gradient-to-br from-violet-950/20 to-transparent text-left transition-all"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm">🧩</span>
                      <span className="text-sm font-medium text-zinc-200 truncate flex-1">{c.name}</span>
                    </div>
                    <div className="flex flex-wrap gap-1 mb-2">
                      {includedSubjects.map((s) => (
                        <span key={s.id} className="text-[10px] px-1.5 py-0.5 rounded-md bg-zinc-800 text-zinc-400 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: s.color }} />
                          {s.name}
                        </span>
                      ))}
                    </div>
                    <div className="text-[11px] text-zinc-600">
                      {c.messages.length} message{c.messages.length !== 1 ? "s" : ""}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
