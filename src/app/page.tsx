"use client";

import { useState, useCallback } from "react";
import { Quiz } from "@/types";
import { saveQuiz, updateQuizScore } from "@/lib/storage";
import HomePage from "@/components/HomePage";
import UploadStep from "@/components/UploadStep";
import LoadingScreen from "@/components/LoadingScreen";
import QuizStep from "@/components/QuizStep";
import ResultStep from "@/components/ResultStep";

type Step = "home" | "create" | "loading" | "quiz" | "result";

export default function Home() {
  const [step, setStep] = useState<Step>("home");
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [score, setScore] = useState(0);
  const [fileName, setFileName] = useState("");
  const [savedId, setSavedId] = useState<string | null>(null);

  const handleLoading = useCallback((name: string) => {
    setFileName(name);
    setStep("loading");
  }, []);

  const handleQuizGenerated = useCallback(
    (q: Quiz, name: string) => {
      const saved = saveQuiz(q, name);
      setSavedId(saved.id);
      setQuiz(q);
      setAnswers({});
      setStep("quiz");
    },
    []
  );

  const handleError = useCallback(() => {
    setStep("create");
  }, []);

  const handlePlaySaved = useCallback((q: Quiz, id: string) => {
    setQuiz(q);
    setSavedId(id);
    setAnswers({});
    setStep("quiz");
  }, []);

  const handleSubmitQuiz = useCallback(
    (ans: Record<number, number>) => {
      if (!quiz) return;
      setAnswers(ans);
      const correct = quiz.questions.reduce(
        (acc, q, i) => acc + (ans[i] === q.correctIndex ? 1 : 0),
        0
      );
      setScore(correct);
      if (savedId) updateQuizScore(savedId, correct);
      setStep("result");
    },
    [quiz, savedId]
  );

  const handleReset = useCallback(() => {
    setStep("home");
    setQuiz(null);
    setAnswers({});
    setScore(0);
    setFileName("");
    setSavedId(null);
  }, []);

  return (
    <div className="flex flex-col flex-1 items-center px-4 py-12">
      <header className="mb-10 text-center">
        <button onClick={handleReset}>
          <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent">
            Sumar AI
          </h1>
        </button>
        <p className="mt-2 text-zinc-400 text-sm">
          Upload a PDF, get an AI-generated quiz
        </p>
      </header>

      <main className="w-full max-w-2xl space-y-8">
        {step === "home" && (
          <div className="animate-fade-in">
            <HomePage
              onCreateNew={() => setStep("create")}
              onPlay={handlePlaySaved}
            />
          </div>
        )}
        {step === "create" && (
          <div className="animate-fade-in">
            <UploadStep
              onLoading={handleLoading}
              onGenerated={handleQuizGenerated}
              onError={handleError}
              onBack={() => setStep("home")}
            />
          </div>
        )}
        {step === "loading" && <LoadingScreen fileName={fileName} />}
        {step === "quiz" && quiz && (
          <div className="animate-slide-up">
            <QuizStep quiz={quiz} onSubmit={handleSubmitQuiz} />
          </div>
        )}
        {step === "result" && quiz && (
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
