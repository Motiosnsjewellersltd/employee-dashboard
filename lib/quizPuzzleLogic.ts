import type { GameDefinition, PublicGame, GameSubmission } from "./quizActivityTypes";
export function bingoLineSize(indices: number[]) {
  const selected = new Set(indices), lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  return Math.max(0,...lines.map(line=>line.filter(index=>selected.has(index)).length));
}
export function checkPuzzleStep(game: GameDefinition, view: PublicGame, submission: GameSubmission) {
  if(game.kind === "escape") {
    const choices=submission.choices;
    const valid=Array.isArray(choices) && choices.length>0 && choices.length<=game.rounds!.length && choices.every((choice,i)=>Number.isInteger(choice)&&choice===game.rounds![i].correctIndex);
    return { valid:Boolean(valid), progress:valid?choices!.length:0, won:Boolean(valid&&choices!.length===game.rounds!.length) };
  }
  if(game.kind === "bingo") {
    const cells=submission.cells;
    const valid=Array.isArray(cells) && cells.length>0 && cells.length<=game.bingo!.clues.length && new Set(cells).size===cells.length && cells.every((cell,i)=>Number.isInteger(cell)&&cell>=0&&cell<9&&view.bingo!.cells[cell].id===game.bingo!.clues[i].target);
    return { valid:Boolean(valid), progress:valid?cells!.length:0, won:Boolean(valid&&bingoLineSize(cells!)===3) };
  }
  return {valid:false,progress:0,won:false};
}
