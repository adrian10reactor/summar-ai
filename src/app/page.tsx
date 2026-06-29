"use client";

import { useState, useCallback } from "react";
import { Quiz } from "@/types";
import { saveQuiz, updateQuizScore } from "@/lib/storage";
import UploadStep from "@/components/UploadStep";
import LoadingScreen from "@/components/LoadingScreen";
import QuizStep from "@/components/QuizStep";
import ResultStep from "@/components/ResultStep";
import SavedQuizzes from "@/components/SavedQuizzes";

type Step = "upload" | "loading" | "quiz" | "result";

export default function Home() {
  const [step, setStep] = useState<Step>("upload");
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [score, setScore] = useState(0);
  const [fileName, setFileName] = useState("");
  const [savedId, setSavedId] = useState<string | null>(null);

  const handleLoading = useCallback((name: string) => {
    setFileName(name);
    setStep("loading");
  }, []);

  const handleQuizGenerated = useCallback((q: Quiz) => {
    const saved = saveQuiz(q);
    setSavedId(saved.id);
    setQuiz(q);
    setAnswers({});
    setStep("quiz");
  }, []);

  const handleError = useCallback(() => {
    setStep("upload");
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
    setStep("upload");
    setQuiz(null);
    setAnswers({});
    setScore(0);
    setFileName("");
    setSavedId(null);
  }, []);

  return (
    <div className="flex flex-col flex-1 items-center px-4 py-12">
      <header className="mb-10 text-center">
        <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent">
          Sumar AI
        </h1>
        <p className="mt-2 text-zinc-400 text-sm">
          Upload a PDF, get an AI-generated quiz
        </p>
      </header>

      <main className="w-full max-w-2xl space-y-8">
        {step === "upload" && (
          <div className="animate-fade-in space-y-8">
            <UploadStep
              onLoading={handleLoading}
              onGenerated={handleQuizGenerated}
              onError={handleError}
            />
            <SavedQuizzes onPlay={handlePlaySaved} />
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
