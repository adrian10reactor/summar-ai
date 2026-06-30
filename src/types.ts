export interface Question {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface Quiz {
  title: string;
  questions: Question[];
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
  type: "pdf" | "link" | "text";
  data: string;
  size: number;
  addedAt: number;
  uri?: string;
  mimeType?: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export interface ChatConversation {
  id: string;
  name: string;
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

export interface SubjectContent {
  studyGuide?: { html: string; generatedAt: number };
  cheatSheet?: { html: string; generatedAt: number };
  examPrep?: { html: string; generatedAt: number };
  quizzes: SavedQuiz[];
  chats: ChatConversation[];
  customSections: CustomSection[];
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

export type SubjectTab = "materials" | "study-guide" | "quiz" | "cheat-sheet" | "exam-prep" | "chat";
