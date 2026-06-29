"use client";

import { useState } from "react";
import { Quiz } from "@/types";
import { copyShareLink } from "@/lib/share";
import { downloadQuizAsHtml } from "@/lib/download";

export default function ResultStep({
  quiz,
  answers,
  score,
  onReset,
}: {
  quiz: Quiz;
  answers: Record<number, number>;
  score: number;
  onReset: () => void;
}) {
  const total = quiz.questions.length;
  const pct = Math.round((score / total) * 100);
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const ok = await copyShareLink(quiz);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center bg-zinc-900 border border-zinc-800 rounded-xl p-8">
        <p className="text-5xl font-bold bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent">
          {pct}%
        </p>
        <p className="text-zinc-400 mt-2">
          {score} out of {total} correct
        </p>
        <p className="text-sm text-zinc-500 mt-1">
          {pct >= 80
            ? "Excellent work!"
            : pct >= 50
              ? "Good effort, review the explanations below."
              : "Keep studying, you'll get there!"}
        </p>
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleShare}
          className="flex-1 py-2.5 text-sm rounded-lg border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 transition-all duration-200"
        >
          {copied ? "Link copied!" : "Share quiz"}
        </button>
        <button
          onClick={() => downloadQuizAsHtml(quiz)}
          className="flex-1 py-2.5 text-sm rounded-lg border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 transition-all duration-200"
        >
          Download HTML
        </button>
      </div>

      <div className="space-y-4">
        {quiz.questions.map((q, i) => {
          const correct = answers[i] === q.correctIndex;
          return (
            <div
              key={i}
              className={`rounded-xl border p-5 space-y-3 ${
                correct
                  ? "border-emerald-800/50 bg-emerald-950/20"
                  : "border-red-800/50 bg-red-950/20"
              }`}
            >
              <div className="flex gap-2 items-start">
                <span className="mt-0.5">{correct ? "✓" : "✗"}</span>
                <p className="font-medium leading-relaxed">{q.question}</p>
              </div>

              {!correct && (
                <p className="text-sm text-zinc-400">
                  <span className="text-red-400">Your answer:</span>{" "}
                  {q.options[answers[i]] ?? "Not answered"}
                </p>
              )}

              <p className="text-sm text-zinc-400">
                <span className="text-emerald-400">Correct:</span>{" "}
                {q.options[q.correctIndex]}
              </p>

              <p className="text-sm text-zinc-500 italic">{q.explanation}</p>
            </div>
          );
        })}
      </div>

      <button
        onClick={onReset}
        className="w-full py-3 rounded-xl font-semibold text-white bg-violet-600 hover:bg-violet-500 transition-colors"
      >
        Try Another PDF
      </button>
    </div>
  );
}
