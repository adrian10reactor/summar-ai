"use client";

import { useState, useMemo } from "react";
import { Subject, Flashcard } from "@/types";
import {
  addFlashcards, deleteFlashcard, updateFlashcard, reviewFlashcard,
  getFlashcards, getDueFlashcards,
} from "@/lib/storage";
import { deductCredits, estimateApiCost } from "@/lib/credits";
import { parseApiResponse } from "@/lib/api";
import { ImageLookup } from "@/lib/render";
import RenderedHtml from "../RenderedHtml";

type View = "browse" | "review";

export default function FlashcardsTab({
  subject,
  getMaterials,
  hasLoadedMaterials,
  hasMaterials,
  onCost,
  onUpdated,
  imageLookup,
}: {
  subject: Subject;
  getMaterials: () => { type: string; data: string; name: string }[];
  hasLoadedMaterials: boolean;
  hasMaterials: boolean;
  onCost: (amount: number, action: string) => void;
  onUpdated: () => void;
  imageLookup: ImageLookup;
}) {
  const [view, setView] = useState<View>("browse");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFront, setEditFront] = useState("");
  const [editBack, setEditBack] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [newFront, setNewFront] = useState("");
  const [newBack, setNewBack] = useState("");

  const cards = getFlashcards(subject.id);
  const due = useMemo(() => getDueFlashcards(subject.id), [subject]);

  const generateCards = async () => {
    const materials = getMaterials();
    if (materials.length === 0) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "flashcards", materials }),
      });
      const data = await parseApiResponse<{ cards: { front: string; back: string }[]; _usage?: { tokensIn: number; tokensOut: number } }>(res);

      const usage = data._usage || { tokensIn: 0, tokensOut: 0 };
      const apiCost = estimateApiCost(usage.tokensIn, usage.tokensOut);
      const { charged } = deductCredits(apiCost, "flashcards", subject.name, usage.tokensIn, usage.tokensOut);
      onCost(charged, `Generated ${data.cards.length} flashcards`);

      addFlashcards(subject.id, data.cards);
      onUpdated();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (c: Flashcard) => {
    setEditingId(c.id);
    setEditFront(c.front);
    setEditBack(c.back);
  };
  const saveEdit = () => {
    if (!editingId) return;
    updateFlashcard(subject.id, editingId, { front: editFront, back: editBack });
    setEditingId(null);
    onUpdated();
  };
  const handleDelete = (id: string) => {
    if (!confirm("Delete this card?")) return;
    deleteFlashcard(subject.id, id);
    onUpdated();
  };
  const handleAdd = () => {
    if (!newFront.trim() || !newBack.trim()) return;
    addFlashcards(subject.id, [{ front: newFront.trim(), back: newBack.trim() }]);
    setNewFront(""); setNewBack("");
    setShowAdd(false);
    onUpdated();
  };

  if (view === "review") {
    return <ReviewSession subject={subject} onExit={() => { setView("browse"); onUpdated(); }} imageLookup={imageLookup} onUpdated={onUpdated} />;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-zinc-300">Flashcards</h3>
          <p className="text-xs text-zinc-500">
            {cards.length} card{cards.length !== 1 ? "s" : ""} · {due.length} due now
          </p>
        </div>
        <div className="ml-auto flex gap-2">
          {due.length > 0 && (
            <button
              onClick={() => setView("review")}
              className="text-xs px-4 py-1.5 rounded-lg bg-violet-600 text-white hover:bg-violet-500 transition-colors font-medium"
            >
              Start review ({due.length})
            </button>
          )}
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="text-xs px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors"
          >
            + Add
          </button>
          <button
            onClick={generateCards}
            disabled={loading || !hasLoadedMaterials}
            className="text-xs px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 disabled:opacity-40 transition-colors"
          >
            {loading ? "Generating..." : cards.length === 0 ? "Generate from materials" : "Generate more"}
          </button>
        </div>
      </div>

      {error && <p className="text-red-400 text-sm bg-red-950/30 rounded-lg px-4 py-3">{error}</p>}

      {showAdd && (
        <div className="p-3 rounded-xl border border-violet-500/30 bg-violet-500/5 space-y-2 animate-fade-in">
          <input
            autoFocus
            value={newFront}
            onChange={(e) => setNewFront(e.target.value)}
            placeholder="Front (question / prompt)"
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-violet-500"
          />
          <textarea
            value={newBack}
            onChange={(e) => setNewBack(e.target.value)}
            placeholder="Back (answer)"
            rows={2}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-violet-500 resize-none"
          />
          <div className="flex gap-2">
            <button onClick={handleAdd} disabled={!newFront.trim() || !newBack.trim()}
              className="text-xs px-3 py-1.5 rounded-lg bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-40 transition-colors">
              Add card
            </button>
            <button onClick={() => { setShowAdd(false); setNewFront(""); setNewBack(""); }}
              className="text-xs text-zinc-500 hover:text-zinc-300 px-2">
              Cancel
            </button>
          </div>
        </div>
      )}

      {cards.length === 0 && !showAdd && (
        <div className="py-12 text-center space-y-3">
          <p className="text-4xl">🃏</p>
          <p className="text-sm text-zinc-500">No flashcards yet.</p>
          <p className="text-xs text-zinc-600">
            {hasMaterials ? "Generate a set from your materials, or add one manually above." : "Upload materials first, then generate a set of cards."}
          </p>
        </div>
      )}

      {cards.length > 0 && (
        <div className="space-y-1.5">
          {cards.map((c) => {
            const isDue = c.dueAt <= Date.now();
            const isNew = c.reviewCount === 0;
            return (
              <div key={c.id} className={`bg-zinc-900 border rounded-lg group ${isDue ? "border-violet-500/30" : "border-zinc-800"}`}>
                {editingId === c.id ? (
                  <div className="p-3 space-y-2">
                    <input value={editFront} onChange={(e) => setEditFront(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-violet-500" />
                    <textarea value={editBack} onChange={(e) => setEditBack(e.target.value)} rows={2}
                      className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-violet-500 resize-none" />
                    <div className="flex gap-2">
                      <button onClick={saveEdit} className="text-xs px-3 py-1.5 rounded-lg bg-violet-600 text-white hover:bg-violet-500">Save</button>
                      <button onClick={() => setEditingId(null)} className="text-xs text-zinc-500 hover:text-zinc-300 px-2">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 flex items-start gap-3">
                    <div className="flex-1 min-w-0 space-y-1">
                      <RenderedHtml html={c.front} subject={subject} imageLookup={imageLookup}
                        className="text-sm text-zinc-200 [&_p]:m-0 [&_p]:inline" />
                      <RenderedHtml html={c.back} subject={subject} imageLookup={imageLookup}
                        className="text-xs text-zinc-500 [&_p]:m-0 [&_p]:inline" />
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <div className="flex items-center gap-2 text-[10px]">
                        {isNew && <span className="text-emerald-400">new</span>}
                        {!isNew && isDue && <span className="text-violet-400">due</span>}
                        {!isNew && !isDue && (
                          <span className="text-zinc-600">next in {Math.max(1, Math.ceil((c.dueAt - Date.now()) / (24 * 60 * 60 * 1000)))}d</span>
                        )}
                        <span className="text-zinc-700">·</span>
                        <span className="text-zinc-600 font-mono">{c.reviewCount}rev</span>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => startEdit(c)} className="text-[10px] text-zinc-500 hover:text-zinc-300 px-1">✎</button>
                        <button onClick={() => handleDelete(c.id)} className="text-[10px] text-zinc-600 hover:text-red-400 px-1">✕</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


function ReviewSession({
  subject, onExit, imageLookup, onUpdated,
}: {
  subject: Subject;
  onExit: () => void;
  imageLookup: ImageLookup;
  onUpdated: () => void;
}) {
  const [queue, setQueue] = useState<Flashcard[]>(() => getDueFlashcards(subject.id));
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [reviewed, setReviewed] = useState(0);

  const card = queue[idx];

  const rate = (rating: 0 | 1 | 2 | 3) => {
    if (!card) return;
    reviewFlashcard(subject.id, card.id, rating);
    setReviewed((n) => n + 1);
    // If the user hit "Again", loop the card back onto the end of the queue.
    if (rating === 0) {
      setQueue((q) => [...q, card]);
    }
    setFlipped(false);
    setIdx((i) => i + 1);
    onUpdated();
  };

  if (!card || idx >= queue.length) {
    return (
      <div className="py-16 space-y-4 text-center">
        <p className="text-5xl">🎉</p>
        <h3 className="text-lg font-semibold text-zinc-300">All done!</h3>
        <p className="text-sm text-zinc-500">You reviewed {reviewed} card{reviewed !== 1 ? "s" : ""} in this session.</p>
        <button onClick={onExit}
          className="px-5 py-2.5 rounded-xl bg-violet-600 text-white hover:bg-violet-500 transition-colors">
          Back to cards
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 text-xs text-zinc-500">
        <button onClick={onExit} className="hover:text-zinc-300 transition-colors">← Exit</button>
        <div className="flex-1" />
        <span>Card {idx + 1} of {queue.length}</span>
      </div>

      <div className="w-full bg-zinc-800 rounded-full h-1">
        <div
          className="bg-gradient-to-r from-violet-500 to-indigo-500 h-1 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${(idx / Math.max(queue.length, 1)) * 100}%` }}
        />
      </div>

      <div
        onClick={() => !flipped && setFlipped(true)}
        className={`min-h-[280px] bg-zinc-900 border border-zinc-800 rounded-2xl p-8 flex flex-col ${!flipped ? "cursor-pointer hover:border-zinc-700" : ""} transition-colors`}
      >
        <div className="text-[10px] text-zinc-600 uppercase tracking-wider mb-4">Question</div>
        <RenderedHtml html={card.front} subject={subject} imageLookup={imageLookup}
          className="text-xl text-zinc-100 leading-relaxed
            [&_p]:mb-2 [&_code]:bg-zinc-800 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-violet-300" />

        {flipped && (
          <>
            <div className="border-t border-zinc-800 my-6" />
            <div className="text-[10px] text-zinc-600 uppercase tracking-wider mb-4">Answer</div>
            <RenderedHtml html={card.back} subject={subject} imageLookup={imageLookup}
              className="text-lg text-zinc-300 leading-relaxed
                [&_p]:mb-2 [&_strong]:text-zinc-100 [&_code]:bg-zinc-800 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-violet-300
                [&_svg]:max-w-full [&_svg]:h-auto [&_svg]:my-3" />
          </>
        )}

        <div className="flex-1" />

        {!flipped && (
          <p className="text-center text-xs text-zinc-600 mt-6">Click card to reveal answer</p>
        )}
      </div>

      {flipped && (
        <div className="grid grid-cols-4 gap-2 animate-fade-in">
          <button onClick={() => rate(0)}
            className="py-3 rounded-xl bg-red-600/20 border border-red-500/30 text-red-300 hover:bg-red-600/30 transition-colors">
            <div className="text-sm font-semibold">Again</div>
            <div className="text-[10px] text-red-400/70">&lt; 10 min</div>
          </button>
          <button onClick={() => rate(1)}
            className="py-3 rounded-xl bg-amber-600/20 border border-amber-500/30 text-amber-300 hover:bg-amber-600/30 transition-colors">
            <div className="text-sm font-semibold">Hard</div>
            <div className="text-[10px] text-amber-400/70">{Math.max(1, Math.round((card.interval || 0) * 1.2))}d</div>
          </button>
          <button onClick={() => rate(2)}
            className="py-3 rounded-xl bg-emerald-600/20 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-600/30 transition-colors">
            <div className="text-sm font-semibold">Good</div>
            <div className="text-[10px] text-emerald-400/70">{Math.max(1, Math.round((card.interval || 1) * card.easeFactor))}d</div>
          </button>
          <button onClick={() => rate(3)}
            className="py-3 rounded-xl bg-violet-600/20 border border-violet-500/30 text-violet-300 hover:bg-violet-600/30 transition-colors">
            <div className="text-sm font-semibold">Easy</div>
            <div className="text-[10px] text-violet-400/70">{Math.max(2, Math.round((card.interval || 1) * card.easeFactor * 1.3))}d</div>
          </button>
        </div>
      )}
    </div>
  );
}
