"use client";

import { useState } from "react";
import { Subject, Quiz } from "@/types";
import { saveQuizToSubject, updateQuizScore, deleteQuiz } from "@/lib/storage";
import { deductCredits, estimateApiCost } from "@/lib/credits";
import { copyShareLink } from "@/lib/share";
import { downloadQuizAsHtml } from "@/lib/download";
import { parseApiResponse } from "@/lib/api";
import QuizStep from "../QuizStep";
import ResultStep from "../ResultStep";

type View = "list" | "playing" | "result";

export default function QuizTab({
  subject,
  getMaterials,
  hasLoadedMaterials,
  hasMaterials,
  onCost,
  onUpdated,
}: {
  subject: Subject;
  getMaterials: () => { type: string; data: string; name: string }[];
  hasLoadedMaterials: boolean;
  hasMaterials: boolean;
  onCost: (amount: number, action: string) => void;
  onUpdated: () => void;
}) {
  const [view, setView] = useState<View>("list");
  const [activeQuiz, setActiveQuiz] = useState<Quiz | null>(null);
  const [activeQuizId, setActiveQuizId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [score, setScore] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [durationMinutes, setDurationMinutes] = useState<number>(0); // 0 = no timer

  const runGenerate = async (opts: { customPrompt?: string; label?: string; durationMinutes?: number } = {}) => {
    const materials = getMaterials();
    if (materials.length === 0) return;
    setLoading(true);
    setError("");

    try {
      const body: Record<string, unknown> = { mode: "quiz", materials };
      if (opts.customPrompt) body.customPrompt = opts.customPrompt;

      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await parseApiResponse<{ title?: string; questions: import("@/types").Question[]; _usage?: { tokensIn: number; tokensOut: number } }>(res);

      const usage = data._usage || { tokensIn: 0, tokensOut: 0 };
      const apiCost = estimateApiCost(usage.tokensIn, usage.tokensOut);
      const { charged } = deductCredits(apiCost, "quiz", subject.name, usage.tokensIn, usage.tokensOut);
      onCost(charged, opts.label || "Generated Quiz");

      const finalDuration = opts.durationMinutes ?? (durationMinutes || undefined);
      const quiz: Quiz = { title: data.title || "Quiz", questions: data.questions, durationMinutes: finalDuration };
      const saved = saveQuizToSubject(subject.id, quiz, data.title || "Quiz");
      setActiveQuiz(quiz);
      setActiveQuizId(saved.id);
      setAnswers({});
      setView("playing");
      onUpdated();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = () => runGenerate();

  const handleDrillWeakSpots = async (wrongQuestions: string[]) => {
    if (wrongQuestions.length === 0) return;
    const prompt = `Generate a new quiz that focuses SPECIFICALLY on the topics and concepts underlying these questions the student got wrong: \n\n${wrongQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")}\n\nCover the SAME topics/concepts but with fresh questions, not identical wording. Include easier warm-up questions on the concept AND slightly harder variants to build mastery.`;
    await runGenerate({ customPrompt: prompt, label: "Drill: weak spots", durationMinutes: 0 });
  };

  const handlePlay = (quizId: string) => {
    const sq = subject.content.quizzes.find((q) => q.id === quizId);
    if (!sq) return;
    setActiveQuiz(sq.quiz);
    setActiveQuizId(sq.id);
    setAnswers({});
    setView("playing");
  };

  const handleSubmit = (ans: Record<number, number>) => {
    if (!activeQuiz) return;
    setAnswers(ans);
    const correct = activeQuiz.questions.reduce(
      (acc, q, i) => acc + (ans[i] === q.correctIndex ? 1 : 0), 0
    );
    setScore(correct);
    if (activeQuizId) {
      updateQuizScore(subject.id, activeQuizId, correct);
      onUpdated();
    }
    setView("result");
  };

  const handleBack = () => {
    setView("list");
    setActiveQuiz(null);
    setActiveQuizId(null);
  };

  const handleDelete = (quizId: string) => {
    deleteQuiz(subject.id, quizId);
    onUpdated();
  };

  const handleShare = async (sq: { id: string; quiz: Quiz }) => {
    const ok = await copyShareLink(sq.quiz);
    if (ok) {
      setCopiedId(sq.id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  if (view === "playing" && activeQuiz) {
    return (
      <div className="animate-slide-up">
        <button onClick={handleBack} className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-4">
          &larr; Back to quizzes
        </button>
        <QuizStep quiz={activeQuiz} onSubmit={handleSubmit} />
      </div>
    );
  }

  if (view === "result" && activeQuiz) {
    return (
      <div className="animate-slide-up">
        <ResultStep
          quiz={activeQuiz}
          answers={answers}
          score={score}
          onReset={handleBack}
          onDrillWeakSpots={handleDrillWeakSpots}
          drilling={loading}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <h3 className="text-sm font-semibold text-zinc-300">Quizzes</h3>
        <div className="ml-auto flex items-center gap-2">
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Timer</label>
          <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-0.5">
            {[
              { v: 0, label: "Off" },
              { v: 5, label: "5m" },
              { v: 15, label: "15m" },
              { v: 30, label: "30m" },
              { v: 60, label: "60m" },
            ].map((opt) => (
              <button
                key={opt.v}
                onClick={() => setDurationMinutes(opt.v)}
                className={`text-[11px] px-2 py-1 rounded-md transition-colors ${
                  durationMinutes === opt.v
                    ? "bg-violet-600/30 text-violet-200"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button
            onClick={handleGenerate}
            disabled={loading || !hasLoadedMaterials}
            className="text-xs px-3 py-1.5 rounded-lg bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-40 transition-colors"
          >
            {loading ? "Generating..." : "Generate New Quiz"}
          </button>
        </div>
      </div>

      {error && (
        <p className="text-red-400 text-sm bg-red-950/30 rounded-lg px-4 py-3">{error}</p>
      )}

      {!hasMaterials && (
        <p className="text-sm text-zinc-500 text-center py-8">Upload materials first to generate quizzes.</p>
      )}

      {subject.content.quizzes.length === 0 && hasMaterials && (
        <div className="text-center py-12 space-y-4">
          <p className="text-4xl">❓</p>
          <p className="text-sm text-zinc-500">No quizzes yet. Generate one from your materials.</p>
        </div>
      )}

      {subject.content.quizzes.map((sq) => (
        <div key={sq.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 group">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-zinc-200 truncate">{sq.name}</span>
            <button
              onClick={() => handleDelete(sq.id)}
              className="text-zinc-600 hover:text-red-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
            >
              Delete
            </button>
          </div>
          <div className="flex items-center gap-3 text-xs text-zinc-500 mb-2">
            <span>{sq.quiz.questions.length} questions</span>
            {sq.quiz.durationMinutes && sq.quiz.durationMinutes > 0 && (
              <span className="text-amber-400 font-mono">⏱ {sq.quiz.durationMinutes}m</span>
            )}
            <span>{new Date(sq.createdAt).toLocaleDateString()}</span>
            {sq.lastScore !== undefined && (
              <span className="text-violet-400">
                Best: {Math.round((sq.lastScore / sq.quiz.questions.length) * 100)}%
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={() => handlePlay(sq.id)}
              className="flex-1 py-1.5 text-xs rounded-lg bg-violet-600 text-white font-medium hover:bg-violet-500 transition-colors">
              Play
            </button>
            <button onClick={() => handleShare(sq)}
              className="px-2 py-1.5 text-xs rounded-lg border border-zinc-700 text-zinc-400 hover:text-white transition-colors">
              {copiedId === sq.id ? "Copied!" : "Share"}
            </button>
            <button onClick={() => downloadQuizAsHtml(sq.quiz, sq.name)}
              className="px-2 py-1.5 text-xs rounded-lg border border-zinc-700 text-zinc-400 hover:text-white transition-colors">
              HTML
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
