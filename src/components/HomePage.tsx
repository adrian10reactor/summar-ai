"use client";

import { useState, useEffect } from "react";
import { Quiz, SavedQuiz } from "@/types";
import { getSavedQuizzes, deleteQuiz } from "@/lib/storage";
import { copyShareLink } from "@/lib/share";
import { downloadQuizAsHtml } from "@/lib/download";

export default function HomePage({
  onCreateNew,
  onPlay,
}: {
  onCreateNew: () => void;
  onPlay: (quiz: Quiz, id: string) => void;
}) {
  const [quizzes, setQuizzes] = useState<SavedQuiz[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    setQuizzes(getSavedQuizzes());
  }, []);

  const handleDelete = (id: string) => {
    deleteQuiz(id);
    setQuizzes(getSavedQuizzes());
  };

  const handleShare = async (sq: SavedQuiz) => {
    const ok = await copyShareLink(sq.quiz);
    if (ok) {
      setCopiedId(sq.id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: d.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
    });
  };

  return (
    <div className="space-y-8">
      <button
        onClick={onCreateNew}
        className="w-full py-5 rounded-xl border-2 border-dashed border-zinc-700 hover:border-violet-500 text-zinc-400 hover:text-violet-400 transition-all duration-200 hover:bg-violet-500/5 group"
      >
        <span className="text-2xl block mb-1 group-hover:scale-110 transition-transform">+</span>
        <span className="font-medium">Create New Quiz</span>
      </button>

      {quizzes.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zinc-200">Your Quizzes</h2>
            <span className="text-xs text-zinc-600">
              {quizzes.length} quiz{quizzes.length !== 1 ? "zes" : ""}
            </span>
          </div>

          <div className="space-y-3">
            {quizzes.map((sq) => (
              <div
                key={sq.id}
                className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-zinc-700 transition-colors group"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-medium text-zinc-200 truncate">
                      {sq.name}
                    </h3>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {sq.quiz.title}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDelete(sq.id)}
                    className="text-xs text-zinc-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                  >
                    Delete
                  </button>
                </div>

                <div className="flex items-center gap-3 text-xs text-zinc-500 mb-3">
                  <span>{sq.quiz.questions.length} questions</span>
                  <span>{formatDate(sq.createdAt)}</span>
                  {sq.lastScore !== undefined && (
                    <span className="text-violet-400">
                      Best: {Math.round((sq.lastScore / sq.quiz.questions.length) * 100)}%
                    </span>
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => onPlay(sq.quiz, sq.id)}
                    className="flex-1 py-2 text-sm rounded-lg bg-violet-600 text-white font-medium hover:bg-violet-500 transition-colors"
                  >
                    Play
                  </button>
                  <button
                    onClick={() => handleShare(sq)}
                    className="px-3 py-2 text-sm rounded-lg border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors"
                  >
                    {copiedId === sq.id ? "Copied!" : "Share"}
                  </button>
                  <button
                    onClick={() => downloadQuizAsHtml(sq.quiz, sq.name)}
                    className="px-3 py-2 text-sm rounded-lg border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors"
                  >
                    HTML
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {quizzes.length === 0 && (
        <div className="text-center py-12 text-zinc-600">
          <p className="text-lg mb-1">No quizzes yet</p>
          <p className="text-sm">Upload a PDF to create your first quiz</p>
        </div>
      )}
    </div>
  );
}
