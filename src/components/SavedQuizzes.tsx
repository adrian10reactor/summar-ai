"use client";

import { useState, useEffect } from "react";
import { Quiz, SavedQuiz } from "@/types";
import { getSavedQuizzes, deleteQuiz } from "@/lib/storage";

export default function SavedQuizzes({
  onPlay,
}: {
  onPlay: (quiz: Quiz, id: string) => void;
}) {
  const [quizzes, setQuizzes] = useState<SavedQuiz[]>([]);

  useEffect(() => {
    setQuizzes(getSavedQuizzes());
  }, []);

  const handleDelete = (id: string) => {
    deleteQuiz(id);
    setQuizzes(getSavedQuizzes());
  };

  if (quizzes.length === 0) return null;

  return (
    <div className="space-y-3 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-zinc-400">Saved Quizzes</h2>
        <span className="text-xs text-zinc-600">{quizzes.length} quiz{quizzes.length !== 1 ? "zes" : ""}</span>
      </div>

      <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
        {quizzes.map((sq) => (
          <div
            key={sq.id}
            className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 group hover:border-zinc-700 transition-colors"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-zinc-200 truncate">
                {sq.quiz.title}
              </p>
              <p className="text-xs text-zinc-500">
                {sq.quiz.questions.length} questions
                {sq.lastScore !== undefined && (
                  <span className="ml-2 text-violet-400">
                    Last: {Math.round((sq.lastScore / sq.quiz.questions.length) * 100)}%
                  </span>
                )}
                <span className="ml-2">
                  {new Date(sq.createdAt).toLocaleDateString()}
                </span>
              </p>
            </div>

            <button
              onClick={() => onPlay(sq.quiz, sq.id)}
              className="text-xs px-3 py-1.5 rounded-md bg-violet-600 text-white hover:bg-violet-500 transition-colors"
            >
              Play
            </button>
            <button
              onClick={() => handleDelete(sq.id)}
              className="text-xs px-2 py-1.5 rounded-md text-zinc-500 hover:text-red-400 hover:bg-red-950/30 transition-colors opacity-0 group-hover:opacity-100"
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
