"use client";

import { useState, useEffect } from "react";

const MESSAGES = [
  "Reading your PDF...",
  "Analyzing the content...",
  "Finding key concepts...",
  "Crafting questions...",
  "Generating answer choices...",
  "Writing explanations...",
  "Polishing the quiz...",
  "Almost there...",
];

export default function LoadingScreen({ fileName }: { fileName: string }) {
  const [msgIndex, setMsgIndex] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const msgTimer = setInterval(() => {
      setMsgIndex((i) => (i + 1) % MESSAGES.length);
    }, 3000);
    return () => clearInterval(msgTimer);
  }, []);

  useEffect(() => {
    const progTimer = setInterval(() => {
      setProgress((p) => {
        if (p >= 90) return p + 0.1;
        if (p >= 70) return p + 0.3;
        return p + 0.8;
      });
    }, 100);
    return () => clearInterval(progTimer);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center py-20 animate-fade-in">
      <div className="relative w-24 h-24 mb-8">
        <div className="absolute inset-0 rounded-full border-4 border-zinc-800" />
        <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-violet-500 animate-spin" />
        <div
          className="absolute inset-2 rounded-full border-4 border-transparent border-t-indigo-400 animate-spin"
          style={{ animationDirection: "reverse", animationDuration: "1.5s" }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-2xl">📄</span>
        </div>
      </div>

      <div className="w-full max-w-xs mb-6">
        <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 transition-all duration-300 ease-out"
            style={{ width: `${Math.min(progress, 95)}%` }}
          />
        </div>
        <p className="text-xs text-zinc-600 text-right mt-1 font-mono">
          {Math.min(Math.round(progress), 95)}%
        </p>
      </div>

      <p className="text-lg font-medium text-zinc-200 animate-pulse-slow">
        {MESSAGES[msgIndex]}
      </p>

      <p className="text-sm text-zinc-500 mt-3">
        Processing <span className="text-violet-400">{fileName}</span>
      </p>

      <div className="flex gap-1.5 mt-6">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="w-2 h-2 rounded-full bg-violet-500 animate-bounce"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  );
}
