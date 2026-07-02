"use client";

import { useState, useEffect, useRef } from "react";
import { Quiz } from "@/types";

export default function QuizStep({
  quiz,
  onSubmit,
}: {
  quiz: Quiz;
  onSubmit: (answers: Record<number, number>) => void;
}) {
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [current, setCurrent] = useState(0);
  const [direction, setDirection] = useState<"left" | "right">("right");
  const [animKey, setAnimKey] = useState(0);
  const total = quiz.questions.length;
  const q = quiz.questions[current];

  // Countdown timer (only if the quiz has a duration set).
  const [remaining, setRemaining] = useState<number | null>(
    quiz.durationMinutes ? quiz.durationMinutes * 60 : null
  );
  const submittedRef = useRef(false);
  const submitNow = (a: Record<number, number>) => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    onSubmit(a);
  };

  useEffect(() => {
    if (remaining === null) return;
    if (remaining <= 0) {
      submitNow(answers);
      return;
    }
    const id = setInterval(() => setRemaining((r) => (r === null ? null : r - 1)), 1000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining]);

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };
  const timeLow = remaining !== null && remaining <= 60;

  const select = (optIndex: number) => {
    setAnswers((prev) => ({ ...prev, [current]: optIndex }));
  };

  const navigate = (next: number) => {
    setDirection(next > current ? "right" : "left");
    setCurrent(next);
    setAnimKey((k) => k + 1);
  };

  const answered = Object.keys(answers).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between text-sm text-zinc-500">
        <span>{quiz.title}</span>
        <div className="flex items-center gap-3">
          {remaining !== null && (
            <span className={`font-mono px-2 py-0.5 rounded-md border ${
              timeLow ? "border-red-500/60 text-red-300 bg-red-500/10 animate-pulse" : "border-zinc-700 text-zinc-300 bg-zinc-900"
            }`}>
              ⏱ {formatTime(remaining)}
            </span>
          )}
          <span>{answered}/{total} answered</span>
        </div>
      </div>

      <div className="w-full bg-zinc-800 rounded-full h-1.5">
        <div
          className="bg-gradient-to-r from-violet-500 to-indigo-500 h-1.5 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${(answered / total) * 100}%` }}
        />
      </div>

      <div
        key={animKey}
        className={`bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-5 ${
          direction === "right" ? "animate-slide-right" : "animate-slide-left"
        }`}
        style={{
          animation: `slide-${direction} 0.25s ease-out both`,
        }}
      >
        <p className="text-xs text-zinc-500 font-mono">
          Question {current + 1} of {total}
        </p>
        <p className="text-lg font-medium leading-relaxed">{q.question}</p>

        <div className="space-y-2">
          {q.options.map((opt, i) => (
            <button
              key={i}
              onClick={() => select(i)}
              className={`w-full text-left px-4 py-3 rounded-lg border transition-all duration-200 ${
                answers[current] === i
                  ? "border-violet-500 bg-violet-500/10 text-violet-300 scale-[1.01]"
                  : "border-zinc-700 hover:border-zinc-500 hover:bg-zinc-800/50 text-zinc-300"
              }`}
              style={{ animationDelay: `${i * 50}ms` }}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate(Math.max(0, current - 1))}
          disabled={current === 0}
          className="px-4 py-2 text-sm rounded-lg border border-zinc-700 text-zinc-400 hover:text-white disabled:opacity-30 transition-all duration-200"
        >
          Previous
        </button>

        {current < total - 1 ? (
          <button
            onClick={() => navigate(current + 1)}
            className="px-4 py-2 text-sm rounded-lg bg-zinc-800 text-zinc-300 hover:text-white transition-all duration-200 hover:bg-zinc-700"
          >
            Next
          </button>
        ) : (
          <button
            onClick={() => submitNow(answers)}
            disabled={answered < total}
            className="px-6 py-2 text-sm rounded-lg bg-violet-600 text-white font-semibold hover:bg-violet-500 disabled:opacity-40 transition-all duration-200 hover:scale-105"
          >
            Submit Quiz
          </button>
        )}
      </div>

      <div className="flex justify-center gap-1.5 flex-wrap">
        {quiz.questions.map((_, i) => (
          <button
            key={i}
            onClick={() => navigate(i)}
            className={`w-8 h-8 rounded-md text-xs font-mono transition-all duration-200 ${
              i === current
                ? "bg-violet-600 text-white scale-110"
                : answers[i] !== undefined
                  ? "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
                  : "bg-zinc-800/50 text-zinc-600 hover:bg-zinc-800"
            }`}
          >
            {i + 1}
          </button>
        ))}
      </div>
    </div>
  );
}
