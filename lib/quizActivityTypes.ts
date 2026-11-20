export type QuizVisual = "diamond" | "gold" | "scale" | "customer" | "man" | "child" | "cartoon";
export type QuestionTemplate = { id: string; category: string; question: string; options: string[]; correctIndex: number; explanation: string; visual: QuizVisual };
export type GameKind = "pairs" | "shape" | "rapid" | "customer" | "memory";
export type GameDefinition = { id: string; kind: GameKind; title: string; icon: string; character?: "lady" | "man" | "child" | "cartoon"; pairs?: { term: string; meaning: string }[]; rounds?: { shape: number; options: string[]; correctIndex: number }[]; questionIds?: number[]; items?: number[] };
export type PublicGame = { id: string; kind: GameKind; title: string; icon: string; character?: "lady" | "man" | "child" | "cartoon"; seconds: number; terms?: string[]; meanings?: string[]; rounds?: { question: string; options: string[]; shape?: number }[]; cards?: number[] };
export type GameSubmission = { choices?: number[]; flips?: number[] };
export type GameResult = { score: number; total: number; isCorrect: boolean; timedOut: boolean; summary: string };
export type QuizActivity = { type: "question"; visual: QuizVisual } | { type: "game"; definition: GameDefinition };
