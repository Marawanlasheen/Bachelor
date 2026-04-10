export interface Lecture {
  id: string;
  title: string;
  description: string;
  progress: number;
  completed: boolean;
  duration: string;
  pdfUrl: string;
  subtopics: Subtopic[];
}

export interface Subtopic {
  id: string;
  title: string;
  description: string;
}

export interface Question {
  id: string;
  title: string;
  description: string;
  prompt?: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  solved: boolean;
  starterCode?: string;
  solution?: string;
  chatHistory?: ChatMessage[];
  examples?: {
    input: string;
    output: string;
  }[];
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  message: string;
  timestamp: number;
}

export interface Assignment {
  id: string;
  title: string;
  description: string;
  dueDate: string;
  progress: number;
  questions: Question[];
  pdfUrl: string;
}
