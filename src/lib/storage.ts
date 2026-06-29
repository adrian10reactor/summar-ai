import { Quiz, SavedQuiz } from "@/types";

const STORAGE_KEY = "summar-saved-quizzes";

export function getSavedQuizzes(): SavedQuiz[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveQuiz(quiz: Quiz, name: string): SavedQuiz {
  const saved: SavedQuiz = {
    id: crypto.randomUUID(),
    name,
    quiz,
    createdAt: Date.now(),
  };
  const all = getSavedQuizzes();
  all.unshift(saved);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  return saved;
}

export function renameQuiz(id: string, name: string) {
  const all = getSavedQuizzes();
  const item = all.find((q) => q.id === id);
  if (item) {
    item.name = name;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  }
}

export function updateQuizScore(id: string, score: number) {
  const all = getSavedQuizzes();
  const item = all.find((q) => q.id === id);
  if (item) {
    item.lastScore = score;
    item.lastPlayed = Date.now();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  }
}

export function deleteQuiz(id: string) {
  const all = getSavedQuizzes().filter((q) => q.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}
