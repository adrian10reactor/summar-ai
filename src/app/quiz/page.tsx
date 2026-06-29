"use client";

import { useState, useCallback, useEffect } from "react";
import { Quiz } from "@/types";
import { decodeQuiz } from "@/lib/share";
import QuizStep from "@/components/QuizStep";
import ResultStep from "@/components/ResultStep";

export default function SharedQuizPage() {
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [step, setStep] = useState<"quiz" | "result">("quiz");
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [score, setScore] = useState(0);

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash) setQuiz(decodeQuiz(hash));
    setLoaded(true);
  }, []);

  const handleSubmit = useCallback(
    (ans: Record<number, number>) => {
      if (!quiz) return;
      setAnswers(ans);
      const correct = quiz.questions.reduce(
        (acc, q, i) => acc + (ans[i] === q.correctIndex ? 1 : 0),
        0
      );
      setScore(correct);
      setStep("result");
    },
    [quiz]
  );

  const handleReset = useCallback(() => {
    setStep("quiz");
    setAnswers({});
    setScore(0);
  }, []);

  return (
    <div className="flex flex-col flex-1 items-center px-4 py-12">
      <header className="mb-10 text-center">
        <a href="/">
          <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent">
            Summar AI
          </h1>
        </a>
        <p className="mt-2 text-zinc-400 text-sm">Shared quiz</p>
      </header>
      <main className="w-full max-w-2xl">
        {!loaded ? (
          <p className="text-center text-zinc-500">Loading quiz...</p>
        ) : !quiz ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-2xl mb-2">Invalid quiz link</p>
            <p className="text-zinc-500">This link is broken or expired.</p>
            <a
              href="/"
              className="mt-6 px-6 py-2 rounded-lg bg-violet-600 text-white font-semibold hover:bg-violet-500 transition-colors"
            >
              Create your own quiz
            </a>
          </div>
        ) : step === "quiz" ? (
          <div className="animate-slide-up">
            <QuizStep quiz={quiz} onSubmit={handleSubmit} />
          </div>
        ) : (
          <div className="animate-slide-up">
            <ResultStep
              quiz={quiz}
              answers={answers}
              score={score}
              onReset={handleReset}
            />
          </div>
        )}
      </main>
    </div>
  );
}
