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
  quiz: Quiz;
  createdAt: number;
  lastScore?: number;
  lastPlayed?: number;
}
