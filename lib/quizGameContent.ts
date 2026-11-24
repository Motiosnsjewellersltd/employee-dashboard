import { GAME_LIBRARY, QUESTION_LIBRARY } from "@/lib/quizActivityCatalog";
import type { GameDefinition, TrainingRound } from "@/lib/quizActivityTypes";
export function editableGame(game: GameDefinition): GameDefinition {
  const result: GameDefinition = JSON.parse(JSON.stringify(game));
  if (result.questionIds) {
    result.rounds = result.questionIds.map(index => { const q = QUESTION_LIBRARY[index]; return { question: q.question, options: [...q.options], correctIndex: q.correctIndex, explanation: q.explanation }; });
    delete result.questionIds;
  }
  if (result.kind === "shape") result.rounds = result.rounds!.map(round => ({ ...round, question: round.question || "यह कौन-सी Diamond Shape है?" }));
  return result;
}
function text(value: unknown, max: number, label: string) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new Error(`Enter valid ${label} (up to ${max} characters).`);
  return value.trim();
}
function rows(value: unknown, length: number): Record<string, unknown>[] {
  if (!Array.isArray(value) || value.length !== length || value.some(row => !row || typeof row !== "object" || Array.isArray(row))) throw new Error("Enter all existing game entries.");
  return value;
}
export function validateGameContent(input: unknown): GameDefinition {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Select a valid game.");
  const x = input as Record<string, unknown>, original = GAME_LIBRARY.find(game => game.id === x.id);
  if (!original || original.kind !== x.kind) throw new Error("Select a valid game.");
  const game = editableGame(original);
  game.title = text(x.title, 160, "game title");
  if (game.rounds) game.rounds = rows(x.rounds, game.rounds.length).map((row, i) => {
    const base = game.rounds![i];
    if (!Array.isArray(row.options) || row.options.length !== base.options.length) throw new Error("Enter every game option.");
    const options = row.options.map(option => text(option, 300, "game option"));
    if (new Set(options.map(option => option.toLowerCase())).size !== options.length || !Number.isInteger(row.correctIndex) || Number(row.correctIndex) < 0 || Number(row.correctIndex) >= options.length) throw new Error("Enter distinct options and a valid correct answer.");
    const result: TrainingRound = { ...base, question: text(row.question, 1200, "game question"), options, correctIndex: Number(row.correctIndex) };
    if (row.explanation !== undefined && row.explanation !== "") result.explanation = text(row.explanation, 2400, "explanation"); else delete result.explanation;
    if (base.facts) {
      if (!Array.isArray(row.facts) || row.facts.length !== base.facts.length) throw new Error("Enter every game statement.");
      result.facts = row.facts.map(value => text(value, 600, "statement"));
    }
    return result;
  });
  if (game.pairs) {
    game.pairs = rows(x.pairs, game.pairs.length).map(pair => ({ term: text(pair.term, 200, "term"), meaning: text(pair.meaning, 600, "meaning") }));
    if (new Set(game.pairs.map(pair => pair.term)).size !== game.pairs.length || new Set(game.pairs.map(pair => pair.meaning)).size !== game.pairs.length) throw new Error("Enter distinct matching terms and meanings.");
  }
  if (game.steps) {
    if (!Array.isArray(x.steps) || x.steps.length !== game.steps.length) throw new Error("Enter every step in the correct order.");
    game.steps = x.steps.map(step => text(step, 600, "step"));
    if (new Set(game.steps).size !== game.steps.length) throw new Error("Enter distinct steps.");
  }
  if (game.words) game.words = rows(x.words, game.words.length).map((word,i) => {
    const answer = text(word.word, 24, "English answer word").toUpperCase();
    if (!/^[A-Z]{2,24}$/.test(answer)) throw new Error("Enter an English answer word using letters only.");
    return { ...game.words![i], clue: text(word.clue, 600, "word clue"), word: answer };
  });
  if (game.bingo) {
    const bingo = x.bingo as Record<string, unknown> | undefined;
    if (!bingo) throw new Error("Enter valid Bingo content.");
    game.bingo = { cells: rows(bingo.cells, game.bingo.cells.length).map((cell,i) => ({ ...game.bingo!.cells[i], label: text(cell.label, 120, "Bingo label") })), clues: rows(bingo.clues, game.bingo.clues.length).map((clue,i) => ({ ...game.bingo!.clues[i], text: text(clue.text, 600, "Bingo clue") })) };
  }
  // Artwork IDs, game mechanics, entry counts and Bingo mappings stay canonical.
  return game;
}
