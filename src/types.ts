export interface Question {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface Quiz {
  title: string;
  questions: Question[];
  durationMinutes?: number;
}

export interface SavedQuiz {
  id: string;
  name: string;
  quiz: Quiz;
  createdAt: number;
  lastScore?: number;
  lastPlayed?: number;
}

export interface Material {
  id: string;
  name: string;
  type: "pdf" | "link" | "text" | "image";
  data: string;
  size: number;
  addedAt: number;
  uri?: string;
  mimeType?: string;
  pageCount?: number;
  pageUris?: { pageNum: number; uri: string; mimeType: string }[];
}

export interface ChatAttachment {
  name: string;
  mimeType: string;
  uri?: string;
  data?: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  attachments?: ChatAttachment[];
}

export type ChatMode = "regular" | "feynman" | "blurting";

export interface ChatConversation {
  id: string;
  name: string;
  messages: ChatMessage[];
  createdAt: number;
  mode?: ChatMode;
}

export interface CrossSubjectChat {
  id: string;
  name: string;
  subjectIds: string[];
  messages: ChatMessage[];
  createdAt: number;
}

export interface CustomSection {
  id: string;
  name: string;
  prompt: string;
  html?: string;
  generatedAt?: number;
}

export interface Flashcard {
  id: string;
  front: string;
  back: string;
  createdAt: number;
  interval: number;      // days until next review
  easeFactor: number;    // SM-2 ease (starts at 2.5, clamps [1.3, 2.7])
  dueAt: number;         // ms epoch; if <= now, the card is due
  reviewCount: number;
  lastReview?: number;
}

export interface SubjectContent {
  studyGuide?: { html: string; generatedAt: number };
  cheatSheet?: { html: string; generatedAt: number };
  examPrep?: { html: string; generatedAt: number };
  examSolutions?: { html: string; generatedAt: number };
  quizzes: SavedQuiz[];
  chats: ChatConversation[];
  customSections: CustomSection[];
  flashcards?: Flashcard[];
  chatHistory?: ChatMessage[];
}

export interface Subject {
  id: string;
  name: string;
  color: string;
  materials: Material[];
  content: SubjectContent;
  createdAt: number;
}

export type SubjectTab = "materials" | "study-guide" | "quiz" | "cheat-sheet" | "exam-prep" | "exam-solve" | "flashcards" | "chat";
