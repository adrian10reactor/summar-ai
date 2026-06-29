"use client";

import { useState, useRef } from "react";
import { Quiz } from "@/types";

type Difficulty = "easy" | "medium" | "hard" | "mixed";

export default function UploadStep({
  onLoading,
  onGenerated,
  onError,
}: {
  onLoading: (fileName: string) => void;
  onGenerated: (quiz: Quiz) => void;
  onError: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [count, setCount] = useState(10);
  const [autoCount, setAutoCount] = useState(false);
  const [difficulty, setDifficulty] = useState<Difficulty>("mixed");
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f?.type === "application/pdf") setFile(f);
  };

  const handleSubmit = async () => {
    if (!file) return;
    setError("");
    onLoading(file.name);

    const formData = new FormData();
    formData.append("pdf", file);
    formData.append("count", autoCount ? "auto" : String(count));
    formData.append("difficulty", difficulty);

    try {
      const res = await fetch("/api/generate", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate quiz");
      onGenerated(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      onError();
    }
  };

  const difficulties: { value: Difficulty; label: string }[] = [
    { value: "easy", label: "Easy" },
    { value: "medium", label: "Medium" },
    { value: "hard", label: "Hard" },
    { value: "mixed", label: "Mixed" },
  ];

  return (
    <div className="space-y-6">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all duration-200 ${
          dragOver
            ? "border-violet-400 bg-violet-500/5 scale-[1.01]"
            : file
              ? "border-violet-600/50 bg-violet-500/5"
              : "border-zinc-700 hover:border-violet-500"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
        {file ? (
          <div className="animate-fade-in">
            <p className="text-lg font-medium text-violet-400">{file.name}</p>
            <p className="text-sm text-zinc-500 mt-1">
              {(file.size / 1024 / 1024).toFixed(2)} MB
            </p>
          </div>
        ) : (
          <div>
            <p className="text-3xl mb-3">📄</p>
            <p className="text-zinc-400 text-lg">
              Drop a PDF here or click to browse
            </p>
            <p className="text-zinc-600 text-sm mt-1">Supports any text-based PDF</p>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <label className="text-sm text-zinc-400 whitespace-nowrap w-20">
            Questions:
          </label>
          {autoCount ? (
            <p className="flex-1 text-sm text-zinc-500 italic">
              AI will decide based on content length
            </p>
          ) : (
            <>
              <input
                type="range"
                min={3}
                max={50}
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
                className="flex-1 accent-violet-500"
              />
              <span className="text-sm font-mono text-zinc-300 w-6 text-right">
                {count}
              </span>
            </>
          )}
          <button
            onClick={() => setAutoCount((v) => !v)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
              autoCount
                ? "border-violet-500 bg-violet-500/10 text-violet-300"
                : "border-zinc-700 text-zinc-500 hover:text-zinc-300"
            }`}
          >
            Auto
          </button>
        </div>

        <div className="flex items-center gap-4">
          <label className="text-sm text-zinc-400 whitespace-nowrap w-20">
            Difficulty:
          </label>
          <div className="flex gap-2 flex-1">
            {difficulties.map((d) => (
              <button
                key={d.value}
                onClick={() => setDifficulty(d.value)}
                className={`flex-1 text-sm px-3 py-2 rounded-lg border transition-colors ${
                  difficulty === d.value
                    ? "border-violet-500 bg-violet-500/10 text-violet-300"
                    : "border-zinc-700 text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="animate-fade-in">
          <p className="text-red-400 text-sm bg-red-950/30 rounded-lg px-4 py-3">
            {error}
          </p>
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={!file}
        className="w-full py-3 rounded-xl font-semibold text-white bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 hover:scale-[1.01] active:scale-[0.99]"
      >
        Generate Quiz
      </button>
    </div>
  );
}
