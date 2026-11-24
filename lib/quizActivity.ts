import { editableGame, validateGameContent } from "@/lib/quizGameContent";
import { checkPuzzleStep, bingoLineSize } from "@/lib/quizPuzzleLogic";
import { GAME_LIBRARY, QUESTION_LIBRARY } from "@/lib/quizActivityCatalog";
import type { GameDefinition, PublicGame, GameSubmission, GameResult, QuizActivity, QuizVisual } from "@/lib/quizActivityTypes";
export function parseActivity(input: unknown): QuizActivity | null {
  if (!input || typeof input !== "object") return null;
  const x = input as Record<string, unknown>;
  if (x.type === "question" && ["diamond", "gold", "scale", "customer", "man", "child", "cartoon"].includes(String(x.visual))) return { type: "question", visual: x.visual as QuizVisual };
  if (x.type === "game" && x.definition && typeof x.definition === "object") {
    const definition = GAME_LIBRARY.find(g => g.id === (x.definition as Record<string, unknown>).id);
    if (definition && x.contentVersion === 1) {
      try { return { type: "game", definition: validateGameContent(x.definition), contentVersion: 1 }; } catch { return null; }
    }
    // Legacy activities retain their original curated content.
    if (definition) return { type: "game", definition };
  }
  return null;
}
export function activityForSave(input: unknown, library: GameDefinition[] = GAME_LIBRARY): QuizActivity | null {
  if (!input) return null;
  const data = input as Record<string, unknown>;
  if (data.type === "game") {
    const definition = library.find(g => g.id === data.gameId);
    if (!definition) throw new Error("Select a valid game from the library.");
    return { type: "game", definition: editableGame(definition), contentVersion: 1 };
  }
  const activity = parseActivity(input);
  if (!activity) throw new Error("Select a valid question illustration.");
  return activity;
}
export function shuffled<T>(values: T[], seed: string): T[] {
  let state = 2166136261;
  for (let i = 0; i < seed.length; i++) state = Math.imul(state ^ seed.charCodeAt(i), 16777619) >>> 0;
  const out = [...values];
  for (let i = out.length - 1; i > 0; i--) { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; const j = state % (i + 1); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}
export function publicGame(game: GameDefinition, seed: string): PublicGame {
  const base = { id: game.id, kind: game.kind, title: game.title, icon: game.icon, character: game.character, seconds: 60, art: game.art };
  if (game.kind === "word") return { ...base, words: game.words!.map((word, i) => ({ clue: word.clue, jewellery: word.jewellery, letters: shuffled(word.word.split(""), `${seed}:word:${i}`) })) };
  if (game.kind === "bingo") return { ...base, bingo: { cells: shuffled(game.bingo!.cells, seed), clues: game.bingo!.clues.map(clue => clue.text) } };
  if (game.kind === "pairs") return { ...base, terms: game.pairs!.map(p => p.term), meanings: shuffled(game.pairs!.map(p => p.meaning), seed) };
  if (game.kind === "memory") return { ...base, cards: shuffled([...game.items!, ...game.items!], seed) };
  if (game.kind === "sequence") return { ...base, steps: shuffled(game.steps!, seed) };
  if (game.rounds && game.kind !== "shape") return { ...base, rounds: game.rounds.map(({ correctIndex: _key, explanation: _explanation, ...round }) => ({ ...round, question: round.question || "" })) };
  if (game.kind === "shape") return { ...base, rounds: game.rounds!.map(r => ({ question: r.question || "यह कौन-सी Diamond Shape है?", shape: r.shape, options: r.options })) };
  return { ...base, rounds: game.questionIds!.map(index => { const q = QUESTION_LIBRARY[index]; return { question: q.question, options: q.options }; }) };
}
export function gradeGame(game: GameDefinition, seed: string, submission: unknown, expired = false): GameResult {
  if (!submission || typeof submission !== "object") throw new Error("Invalid game response.");
  const data = submission as GameSubmission, view = publicGame(game, seed);
  let total = 0, score = 0;
  if (game.kind === "word") {
    total = game.words!.length;
    if (!Array.isArray(data.words) || data.words.length > total) throw new Error("Invalid word response.");
    data.words.forEach((indices,i) => {
      if (!Array.isArray(indices) || indices.length > view.words![i].letters.length || new Set(indices).size !== indices.length || indices.some(n=>!Number.isInteger(n)||n<0||n>=view.words![i].letters.length)) throw new Error("Invalid letter selection.");
      if (indices.map(n=>view.words![i].letters[n]).join("") === game.words![i].word) score++;
    });
  } else if (game.kind === "bingo") {
    if (!Array.isArray(data.cells) || data.cells.length > 9 || data.cells.some(n=>!Number.isInteger(n)||n<0||n>=9)||new Set(data.cells).size!==data.cells.length) throw new Error("Invalid Bingo cells.");
    total = 3;
    score = checkPuzzleStep(game, view, data).valid ? bingoLineSize(data.cells) : 0;
  } else if (game.kind === "sequence") {
    total = game.steps!.length;
    if (!Array.isArray(data.order) || data.order.length !== total || data.order.some(n => !Number.isInteger(n) || n < 0 || n >= total) || new Set(data.order).size !== total) throw new Error("Invalid sequence order.");
    data.order.forEach((n, i) => { if (view.steps![n] === game.steps![i]) score++; });
  } else if (game.kind === "memory") {
    if (!Array.isArray(data.flips) || data.flips.length > 240 || data.flips.some(n => !Number.isInteger(n) || n < 0 || n >= view.cards!.length)) throw new Error("Invalid memory moves.");
    const matched = new Set<number>(); let previous: number | null = null;
    for (const n of data.flips) {
      if (matched.has(n) || previous === n) throw new Error("Invalid memory moves.");
      if (previous === null) previous = n;
      else { if (view.cards![previous] === view.cards![n]) { matched.add(previous); matched.add(n); } previous = null; }
    }
    total = game.items!.length; score = matched.size / 2;
  } else {
    total = game.kind === "pairs" ? game.pairs!.length : view.rounds!.length;
    if (!Array.isArray(data.choices) || data.choices.length > total || data.choices.some(n => !Number.isInteger(n) || n < -1 || n > 10)) throw new Error("Invalid game choices.");
    if (game.kind === "pairs") {
      const used = data.choices.filter(n => n >= 0); if (new Set(used).size !== used.length) throw new Error("Invalid matching choices.");
      data.choices.forEach((n, i) => { if (view.meanings![n] === game.pairs![i].meaning) score++; });
    } else data.choices.forEach((n, i) => { const correct = game.rounds ? game.rounds[i].correctIndex : QUESTION_LIBRARY[game.questionIds![i]].correctIndex; if (n === correct) score++; });
  }
  // The server owns the deadline; a late client cannot claim a perfect timed result.
  const isCorrect = score === total && !expired;
  return { score, total, isCorrect, timedOut: expired, summary: game.kind === "bingo" ? isCorrect ? "Bingo! एक line पूरी 🎯" : `${score} / 3 cells · line अधूरी${expired ? " · समय समाप्त" : ""}` : `${score} / ${total} ${game.kind === "memory" || game.kind === "pairs" ? "जोड़ियाँ सही" : "जवाब सही"}${expired ? " · समय समाप्त" : ""}` };
}
