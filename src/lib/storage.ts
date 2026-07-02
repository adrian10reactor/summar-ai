import { Quiz, SavedQuiz, Subject, Material, ChatMessage, ChatConversation, CustomSection, CrossSubjectChat, Flashcard } from "@/types";

const DAY_MS = 24 * 60 * 60 * 1000;

const SUBJECTS_KEY = "summar-subjects";
const CROSS_CHATS_KEY = "summar-cross-chats";

const SUBJECT_COLORS = [
  "#8b5cf6", "#6366f1", "#3b82f6", "#06b6d4",
  "#10b981", "#f59e0b", "#ef4444", "#ec4899",
];

export function getSubjects(): Subject[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SUBJECTS_KEY);
    if (!raw) return [];
    const subjects: Subject[] = JSON.parse(raw);
    return subjects.map((s) => {
      const content = s.content || { quizzes: [], chats: [], customSections: [] };
      if (!content.chats) {
        content.chats = [];
        if (content.chatHistory && content.chatHistory.length > 0) {
          content.chats.push({
            id: crypto.randomUUID(),
            name: "General",
            messages: content.chatHistory,
            createdAt: content.chatHistory[0]?.timestamp || Date.now(),
          });
        }
        delete content.chatHistory;
      }
      if (!content.customSections) content.customSections = [];
      return { ...s, content };
    });
  } catch {
    return [];
  }
}

function saveSubjects(subjects: Subject[]) {
  localStorage.setItem(SUBJECTS_KEY, JSON.stringify(subjects));
}

export function createSubject(name: string): Subject {
  const all = getSubjects();
  const color = SUBJECT_COLORS[all.length % SUBJECT_COLORS.length];
  const subject: Subject = {
    id: crypto.randomUUID(),
    name,
    color,
    materials: [],
    content: { quizzes: [], chats: [], customSections: [] },
    createdAt: Date.now(),
  };
  all.push(subject);
  saveSubjects(all);
  return subject;
}

export function deleteSubject(id: string) {
  saveSubjects(getSubjects().filter((s) => s.id !== id));
}

export function renameSubject(id: string, name: string) {
  const all = getSubjects();
  const s = all.find((s) => s.id === id);
  if (s) {
    s.name = name;
    saveSubjects(all);
  }
}

export function addMaterial(subjectId: string, material: Omit<Material, "id" | "addedAt">): Material {
  const all = getSubjects();
  const s = all.find((s) => s.id === subjectId);
  if (!s) throw new Error("Subject not found");
  const mat: Material = {
    ...material,
    id: crypto.randomUUID(),
    addedAt: Date.now(),
  };
  s.materials.push(mat);
  saveSubjects(all);
  return mat;
}

export function removeMaterial(subjectId: string, materialId: string) {
  const all = getSubjects();
  const s = all.find((s) => s.id === subjectId);
  if (s) {
    s.materials = s.materials.filter((m) => m.id !== materialId);
    saveSubjects(all);
  }
}

export function updateMaterial(subjectId: string, materialId: string, patch: Partial<Material>) {
  const all = getSubjects();
  const s = all.find((s) => s.id === subjectId);
  if (!s) return;
  const mat = s.materials.find((m) => m.id === materialId);
  if (mat) {
    Object.assign(mat, patch);
    saveSubjects(all);
  }
}

export function saveStudyGuide(subjectId: string, html: string) {
  const all = getSubjects();
  const s = all.find((s) => s.id === subjectId);
  if (s) {
    s.content.studyGuide = { html, generatedAt: Date.now() };
    saveSubjects(all);
  }
}

export function saveCheatSheet(subjectId: string, html: string) {
  const all = getSubjects();
  const s = all.find((s) => s.id === subjectId);
  if (s) {
    s.content.cheatSheet = { html, generatedAt: Date.now() };
    saveSubjects(all);
  }
}

export function saveExamPrep(subjectId: string, html: string) {
  const all = getSubjects();
  const s = all.find((s) => s.id === subjectId);
  if (s) {
    s.content.examPrep = { html, generatedAt: Date.now() };
    saveSubjects(all);
  }
}

export function saveExamSolutions(subjectId: string, html: string) {
  const all = getSubjects();
  const s = all.find((s) => s.id === subjectId);
  if (s) {
    s.content.examSolutions = { html, generatedAt: Date.now() };
    saveSubjects(all);
  }
}

export function saveQuizToSubject(subjectId: string, quiz: Quiz, name: string): SavedQuiz {
  const all = getSubjects();
  const s = all.find((s) => s.id === subjectId);
  if (!s) throw new Error("Subject not found");
  const saved: SavedQuiz = {
    id: crypto.randomUUID(),
    name,
    quiz,
    createdAt: Date.now(),
  };
  s.content.quizzes.unshift(saved);
  saveSubjects(all);
  return saved;
}

export function updateQuizScore(subjectId: string, quizId: string, score: number) {
  const all = getSubjects();
  const s = all.find((s) => s.id === subjectId);
  const q = s?.content.quizzes.find((q) => q.id === quizId);
  if (q) {
    q.lastScore = score;
    q.lastPlayed = Date.now();
    saveSubjects(all);
  }
}

export function deleteQuiz(subjectId: string, quizId: string) {
  const all = getSubjects();
  const s = all.find((s) => s.id === subjectId);
  if (s) {
    s.content.quizzes = s.content.quizzes.filter((q) => q.id !== quizId);
    saveSubjects(all);
  }
}

export function saveChatHistory(subjectId: string, messages: ChatMessage[]) {
  const all = getSubjects();
  const s = all.find((s) => s.id === subjectId);
  if (s) {
    if (s.content.chats.length > 0) {
      s.content.chats[0].messages = messages.slice(-100);
    }
    saveSubjects(all);
  }
}

export function createChat(subjectId: string, name: string, mode: "regular" | "feynman" | "blurting" = "regular"): ChatConversation {
  const all = getSubjects();
  const s = all.find((s) => s.id === subjectId);
  if (!s) throw new Error("Subject not found");
  const chat: ChatConversation = {
    id: crypto.randomUUID(),
    name,
    messages: [],
    createdAt: Date.now(),
    mode,
  };
  s.content.chats.unshift(chat);
  saveSubjects(all);
  return chat;
}

export function deleteChat(subjectId: string, chatId: string) {
  const all = getSubjects();
  const s = all.find((s) => s.id === subjectId);
  if (s) {
    s.content.chats = s.content.chats.filter((c) => c.id !== chatId);
    saveSubjects(all);
  }
}

export function saveChatMessages(subjectId: string, chatId: string, messages: ChatMessage[]) {
  const all = getSubjects();
  const s = all.find((s) => s.id === subjectId);
  if (!s) return;
  const chat = s.content.chats.find((c) => c.id === chatId);
  if (chat) {
    chat.messages = messages.slice(-100);
    saveSubjects(all);
  }
}

export function renameChat(subjectId: string, chatId: string, name: string) {
  const all = getSubjects();
  const s = all.find((s) => s.id === subjectId);
  if (!s) return;
  const chat = s.content.chats.find((c) => c.id === chatId);
  if (chat) {
    chat.name = name;
    saveSubjects(all);
  }
}

export function addCustomSection(subjectId: string, name: string, prompt: string): CustomSection {
  const all = getSubjects();
  const s = all.find((s) => s.id === subjectId);
  if (!s) throw new Error("Subject not found");
  const section: CustomSection = {
    id: crypto.randomUUID(),
    name,
    prompt,
  };
  s.content.customSections.push(section);
  saveSubjects(all);
  return section;
}

export function updateCustomSection(subjectId: string, sectionId: string, patch: Partial<CustomSection>) {
  const all = getSubjects();
  const s = all.find((s) => s.id === subjectId);
  if (!s) return;
  const sec = s.content.customSections.find((c) => c.id === sectionId);
  if (sec) {
    Object.assign(sec, patch);
    saveSubjects(all);
  }
}

export function saveCustomSectionHtml(subjectId: string, sectionId: string, html: string) {
  const all = getSubjects();
  const s = all.find((s) => s.id === subjectId);
  if (!s) return;
  const sec = s.content.customSections.find((c) => c.id === sectionId);
  if (sec) {
    sec.html = html;
    sec.generatedAt = Date.now();
    saveSubjects(all);
  }
}

export function deleteCustomSection(subjectId: string, sectionId: string) {
  const all = getSubjects();
  const s = all.find((s) => s.id === subjectId);
  if (!s) return;
  s.content.customSections = s.content.customSections.filter((c) => c.id !== sectionId);
  saveSubjects(all);
}

// Flashcards + spaced repetition (SM-2 variant)
// -------------------------------------------------------------------------

export function getFlashcards(subjectId: string): Flashcard[] {
  const all = getSubjects();
  const s = all.find((s) => s.id === subjectId);
  return s?.content.flashcards || [];
}

export function addFlashcards(
  subjectId: string,
  cards: { front: string; back: string }[]
): Flashcard[] {
  const all = getSubjects();
  const s = all.find((s) => s.id === subjectId);
  if (!s) throw new Error("Subject not found");
  if (!s.content.flashcards) s.content.flashcards = [];
  const now = Date.now();
  const created: Flashcard[] = cards.map((c) => ({
    id: crypto.randomUUID(),
    front: c.front,
    back: c.back,
    createdAt: now,
    interval: 0,
    easeFactor: 2.5,
    dueAt: now,             // new cards are due immediately
    reviewCount: 0,
  }));
  s.content.flashcards.push(...created);
  saveSubjects(all);
  return created;
}

export function deleteFlashcard(subjectId: string, cardId: string) {
  const all = getSubjects();
  const s = all.find((s) => s.id === subjectId);
  if (!s || !s.content.flashcards) return;
  s.content.flashcards = s.content.flashcards.filter((c) => c.id !== cardId);
  saveSubjects(all);
}

export function updateFlashcard(
  subjectId: string,
  cardId: string,
  patch: Partial<Pick<Flashcard, "front" | "back">>
) {
  const all = getSubjects();
  const s = all.find((s) => s.id === subjectId);
  const card = s?.content.flashcards?.find((c) => c.id === cardId);
  if (card) {
    Object.assign(card, patch);
    saveSubjects(all);
  }
}

// SM-2 rating: 0 = Again, 1 = Hard, 2 = Good, 3 = Easy
export function reviewFlashcard(subjectId: string, cardId: string, rating: 0 | 1 | 2 | 3) {
  const all = getSubjects();
  const s = all.find((s) => s.id === subjectId);
  const card = s?.content.flashcards?.find((c) => c.id === cardId);
  if (!card) return;

  const now = Date.now();
  card.reviewCount += 1;
  card.lastReview = now;

  if (rating === 0) {
    // Again — reset interval, drop ease.
    card.interval = 0;
    card.easeFactor = Math.max(1.3, card.easeFactor - 0.2);
  } else {
    if (card.interval === 0) {
      card.interval = rating === 1 ? 1 : rating === 2 ? 2 : 4;
    } else if (card.interval === 1) {
      card.interval = rating === 1 ? 2 : rating === 2 ? 4 : 7;
    } else {
      const mult = rating === 1 ? 1.2 : rating === 2 ? card.easeFactor : card.easeFactor * 1.3;
      card.interval = Math.round(card.interval * mult);
    }
    const delta = rating === 1 ? -0.15 : rating === 2 ? 0 : 0.10;
    card.easeFactor = Math.max(1.3, Math.min(2.7, card.easeFactor + delta));
  }

  card.dueAt = now + Math.max(1, card.interval) * DAY_MS - (card.interval === 0 ? DAY_MS : 0);
  // For a "0" Again result, set the card to be due in 10 minutes rather than
  // instantly, so the user can churn through a review session without one
  // troublesome card cycling infinitely.
  if (rating === 0) card.dueAt = now + 10 * 60 * 1000;

  saveSubjects(all);
}

export function getDueFlashcards(subjectId: string): Flashcard[] {
  const cards = getFlashcards(subjectId);
  const now = Date.now();
  return cards.filter((c) => c.dueAt <= now);
}

export function getDueCountAcrossSubjects(): { subjectId: string; due: number }[] {
  const all = getSubjects();
  const now = Date.now();
  return all
    .map((s) => ({
      subjectId: s.id,
      due: (s.content.flashcards || []).filter((c) => c.dueAt <= now).length,
    }))
    .filter((x) => x.due > 0);
}

// -------------------------------------------------------------------------
// Cross-subject chats (global, not scoped to any subject)

export function getCrossChats(): CrossSubjectChat[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CROSS_CHATS_KEY);
    if (!raw) return [];
    const chats: CrossSubjectChat[] = JSON.parse(raw);
    return chats.map((c) => ({ ...c, subjectIds: c.subjectIds || [], messages: c.messages || [] }));
  } catch {
    return [];
  }
}

function saveCrossChats(chats: CrossSubjectChat[]) {
  localStorage.setItem(CROSS_CHATS_KEY, JSON.stringify(chats));
}

export function createCrossChat(name: string, subjectIds: string[]): CrossSubjectChat {
  const all = getCrossChats();
  const chat: CrossSubjectChat = {
    id: crypto.randomUUID(),
    name,
    subjectIds,
    messages: [],
    createdAt: Date.now(),
  };
  all.unshift(chat);
  saveCrossChats(all);
  return chat;
}

export function deleteCrossChat(id: string) {
  saveCrossChats(getCrossChats().filter((c) => c.id !== id));
}

export function renameCrossChat(id: string, name: string) {
  const all = getCrossChats();
  const c = all.find((c) => c.id === id);
  if (c) { c.name = name; saveCrossChats(all); }
}

export function updateCrossChatSubjects(id: string, subjectIds: string[]) {
  const all = getCrossChats();
  const c = all.find((c) => c.id === id);
  if (c) { c.subjectIds = subjectIds; saveCrossChats(all); }
}

export function saveCrossChatMessages(id: string, messages: ChatMessage[]) {
  const all = getCrossChats();
  const c = all.find((c) => c.id === id);
  if (c) { c.messages = messages.slice(-100); saveCrossChats(all); }
}

export function getStorageUsage(): { used: number; limit: number } {
  let used = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key) {
      used += localStorage.getItem(key)?.length || 0;
    }
  }
  return { used: used * 2, limit: 5 * 1024 * 1024 };
}
