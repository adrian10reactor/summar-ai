"use client";

import { useSearchParams } from "next/navigation";
import { useState, useCallback, Suspense } from "react";
import { Quiz } from "@/types";
import { decodeQuiz } from "@/lib/share";
import QuizStep from "@/components/QuizStep";
import ResultStep from "@/components/ResultStep";

function SharedQuizInner() {
  const searchParams = useSearchParams();
  const data = searchParams.get("d");
  const quiz = data ? decodeQuiz(data) : null;

  const [step, setStep] = useState<"quiz" | "result">("quiz");
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [score, setScore] = useState(0);

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

  if (!quiz) {
    return (
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
    );
  }

  return (
    <>
      {step === "quiz" && (
        <div className="animate-slide-up">
          <QuizStep quiz={quiz} onSubmit={handleSubmit} />
        </div>
      )}
      {step === "result" && (
        <div className="animate-slide-up">
          <ResultStep
            quiz={quiz}
            answers={answers}
            score={score}
            onReset={handleReset}
          />
        </div>
      )}
    </>
  );
}

export default function SharedQuizPage() {
  return (
    <div className="flex flex-col flex-1 items-center px-4 py-12">
      <header className="mb-10 text-center">
        <a href="/">
          <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent">
            Sumar AI
          </h1>
        </a>
        <p className="mt-2 text-zinc-400 text-sm">Shared quiz</p>
      </header>
      <main className="w-full max-w-2xl">
        <Suspense
          fallback={
            <p className="text-center text-zinc-500">Loading quiz...</p>
          }
        >
          <SharedQuizInner />
        </Suspense>
      </main>
    </div>
  );
}
