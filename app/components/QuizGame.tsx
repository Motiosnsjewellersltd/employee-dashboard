"use client";
import { useEffect, useRef, useState } from "react";
import type { GameSubmission, PublicGame, GameDefinition } from "@/lib/quizActivityTypes";
import { checkPuzzleStep, bingoLineSize } from "@/lib/quizPuzzleLogic";
import TrainingArtwork from "./TrainingArtwork";
import { CustomerScene, DiamondPhoto, JewelleryPhoto } from "./QuizArtwork";
import styles from "./QuizGame.module.css";
type Props = { previewDefinition?: GameDefinition; title?: string; questionId?: string; version?: string; preview?: PublicGame; onComplete?: (quiz: unknown) => void; onBusy?: (busy: boolean) => void };
export default function QuizGame({ previewDefinition, title, questionId, version, preview, onComplete, onBusy }: Props) {
  const [game, setGame] = useState<PublicGame | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [seconds, setSeconds] = useState(60), [choices, setChoices] = useState<number[]>([]), [round, setRound] = useState(0), [term, setTerm] = useState<number | null>(null);
  const [flips, setFlips] = useState<number[]>([]), [open, setOpen] = useState<number[]>([]), [matched, setMatched] = useState<number[]>([]), [previewDone, setPreviewDone] = useState(false);
  const [order, setOrder] = useState<number[]>([]), [revealed, setRevealed] = useState<Record<number, number[]>>({});
  const [wordSlots,setWordSlots] = useState<number[][]>([]), [bingoPicks,setBingoPicks] = useState<number[]>([]), [bingoWon,setBingoWon] = useState(false), [unlocked,setUnlocked] = useState(0);
  const checking = useRef(false);
  const dragIndex = useRef<number | null>(null);
  const deadline = useRef(0), timed = useRef(false), submitRef = useRef<() => void>(() => {}), hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (hideTimer.current) clearTimeout(hideTimer.current); }, []);
  useEffect(() => { onBusy?.(busy); }, [busy, onBusy]);
  useEffect(() => {
    if (!game || previewDone) return;
    const tick = () => { const remaining = Math.max(0, Math.ceil((deadline.current - performance.now()) / 1000)); setSeconds(remaining); if (!remaining && !timed.current && !checking.current) { timed.current = true; submitRef.current(); } };
    const id = setInterval(tick, 250); document.addEventListener("visibilitychange", tick); tick();
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", tick); };
  }, [game, previewDone]);
  async function start() {
    setBusy(true); setError("");
    try {
      let view = preview, remaining = 60000;
      if (!preview) {
        const response = await fetch("/api/daily-quiz", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ questionId, version, action: "start" }) });
        const payload = await response.json(); if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not start game.");
        view = payload.data.game; remaining = Math.max(0, Date.parse(payload.data.deadline) - Date.parse(payload.data.serverNow));
      }
      if (!view) throw new Error("Game unavailable. Refresh to check your answer.");
      setWordSlots([]); setBingoPicks([]); setBingoWon(false); setUnlocked(0);
      setOrder(view.steps ? view.steps.map((_, i) => i) : []); setRevealed({});
      setChoices([]); setFlips([]); setOpen([]); setMatched([]); setRound(0); setTerm(null); setPreviewDone(false); timed.current = false;
      deadline.current = performance.now() + remaining; setSeconds(Math.ceil(remaining / 1000)); setGame(view);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not start game."); }
    finally { setBusy(false); }
  }
  async function submit() {
    if (!game || busy || previewDone) return;
    setBusy(true); setError("");
    const submission: GameSubmission = game.kind === "word" ? { words: wordSlots } : game.kind === "bingo" ? { cells: bingoPicks } : game.kind === "memory" ? { flips } : game.kind === "sequence" ? { order } : { choices };
    try {
      if (preview) { setPreviewDone(true); return; }
      const response = await fetch("/api/daily-quiz", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ questionId, version, gameSubmission: submission }) });
      const payload = await response.json(); if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not save game result.");
      onComplete?.(payload.data.quiz);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not submit game."); }
    finally { setBusy(false); }
  }
  submitRef.current = () => void submit();
  const view = game || preview;
  const total = view?.kind === "bingo" ? 3 : view?.words?.length || view?.steps?.length || view?.terms?.length || view?.rounds?.length || (view?.cards?.length || 0) / 2;
  const count = game?.kind === "word" ? wordSlots.filter((indices,i)=>indices.length===game.words![i].letters.length).length : game?.kind === "bingo" ? bingoLineSize(bingoPicks) : game?.kind === "escape" ? unlocked : game?.kind === "sequence" ? order.length : game?.kind === "memory" ? matched.length / 2 : choices.filter(n => n >= 0).length;
  const blocked = busy || seconds <= 0 || previewDone;
  const current = view?.rounds?.[round];
  function flip(index: number) {
    if (blocked || open.length >= 2 || open.includes(index) || matched.includes(index) || flips.length >= 240) return;
    setFlips(old => [...old, index]); const next = [...open, index]; setOpen(next);
    if (next.length === 2) {
      if (view!.cards![next[0]] === view!.cards![next[1]]) { setMatched(old => [...old, ...next]); setOpen([]); }
      else hideTimer.current = setTimeout(() => setOpen([]), 850);
    }
  }
  function moveStep(from: number, to: number) {
    if (blocked || to < 0 || to >= order.length || from === to) return;
    setOrder(previous => { const next = [...previous]; const [item] = next.splice(from, 1); next.splice(to, 0, item); return next; });
  }
  async function checkStep(submission: GameSubmission) {
    if (!game || blocked) return;
    checking.current = true; setBusy(true); setError("");
    try {
      let result;
      if (preview) {
        if (!previewDefinition) throw new Error("Reload the preview.");
        result = checkPuzzleStep(previewDefinition, game, submission);
      } else {
        const response = await fetch("/api/daily-quiz", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({questionId,version,action:"checkStep",gameSubmission:submission}) });
        const payload=await response.json(); if(!response.ok||!payload.ok) throw new Error(payload.error||"Could not check this move.");
        result=payload.data.step;
      }
      if(!result?.valid){setError("यह जवाब सही नहीं है। फिर चुनें।");return;}
      if(game.kind==="escape"){setUnlocked(result.progress);setRound(Math.min(result.progress,total-1));}
      else{setBingoPicks(submission.cells!);setBingoWon(result.won);}
    } catch(e){setError(e instanceof Error?e.message:"Could not check move.");}
    finally{checking.current=false;setBusy(false);}
  }
  return <div className={styles.game}>
    {!game ? <><h3>{preview?.icon || "🎮"} {preview?.title || title || "आज का Jewellery Game"}</h3>{preview?.art && <TrainingArtwork art={preview.art} />}{preview?.kind === "customer" && <CustomerScene character={preview.character} text={preview.rounds?.[0].question || "आप क्या जवाब देंगे?"} />}{preview?.kind === "shape" && <DiamondPhoto index={preview.rounds?.[0].shape || 0} />}{preview?.kind === "memory" && <div className={styles.memory}>{preview.cards?.slice(0,6).map((photo,i) => <div key={i} className={styles.card}><JewelleryPhoto index={photo} /></div>)}</div>}{preview?.kind === "pairs" && <div className={styles.pairs}><div className={styles.column}>{preview.terms?.map(text => <div className={styles.tile} key={text}>{text}</div>)}</div><div className={styles.column}>{preview.meanings?.map(text => <div className={styles.tile} key={text}>{text}</div>)}</div></div>}<button type="button" className="primary" disabled={busy} onClick={() => void start()}>{busy ? "Starting…" : preview ? "Try Preview" : "Start Game"}</button></> : <>
      <h3>{game.icon} {game.title}</h3><div className={styles.meta}><span>{game.kind === "memory" || game.kind === "pairs" ? `${count} / ${total} pairs` : game.kind === "bingo" ? `Bingo ${count} / 3` : game.kind === "escape" ? `Locks ${unlocked} / ${total}` : game.kind === "sequence" ? `${total} steps` : `सवाल ${round + 1} / ${total}`}</span><span className={`${styles.timer} ${seconds <= 10 ? styles.timerLow : ""}`} role="timer" aria-label={`${seconds} seconds remaining`}>{String(Math.floor(seconds / 60)).padStart(2,"0")}:{String(seconds % 60).padStart(2,"0")}</span></div><div className={styles.progress}><span style={{ width: `${count / total * 100}%` }} /></div>
      {game.kind === "pairs" && <><div className={styles.pairs}><div className={styles.column}>{game.terms!.map((text,i) => <button key={i} type="button" disabled={blocked} className={`${styles.tile} ${term === i ? styles.selected : choices[i] >= 0 ? styles.linked : ""}`} onClick={() => setTerm(i)}><span className={styles.pairMark}>{i+1}</span>{text}</button>)}</div><div className={styles.column}>{game.meanings!.map((text,i) => <button key={i} type="button" disabled={blocked || term === null} className={`${styles.tile} ${choices.includes(i) ? styles.linked : ""}`} onClick={() => { if (term === null) return; setChoices(old => game.terms!.map((_,j) => j === term ? i : old[j] === i ? -1 : old[j] ?? -1)); setTerm(null); }}>{choices.includes(i) && <span className={styles.pairMark}>{choices.indexOf(i)+1}</span>}{text}</button>)}</div></div><p className={styles.hint}>Term चुनें, फिर meaning।</p></>}
      {game.kind === "memory" && <><div className={styles.memory}>{game.cards!.map((photo,i) => { const faceUp = open.includes(i) || matched.includes(i); return <button type="button" key={i} className={`${styles.card} ${matched.includes(i) ? styles.matched : ""}`} disabled={blocked || matched.includes(i)} aria-label={faceUp ? `Card ${i+1} open` : `Open card ${i+1}`} aria-pressed={faceUp} onClick={() => flip(i)}>{faceUp ? <JewelleryPhoto index={photo} /> : <span aria-hidden="true">💎</span>}</button>; })}</div><p className={styles.hint}>दो cards खोलें। {flips.length >= 240 ? "Move limit reached; submit your result." : ""}</p></>}
      {game.kind === "word" && game.words && <><div className={styles.trainingScene}><TrainingArtwork art="thinkingMan" small /><p><b>{game.words[round].clue}</b></p></div>{game.words[round].jewellery !== undefined && <div className={styles.wordPhoto}><JewelleryPhoto index={game.words[round].jewellery!} concealName /></div>}<div className={styles.wordSlots} aria-label="Your word" style={{gridTemplateColumns:`repeat(${game.words[round].letters.length},minmax(0,1fr))`}}>{game.words[round].letters.map((_,i)=><span key={i}>{game.words![round].letters[(wordSlots[round]||[])[i]]||""}</span>)}</div><div className={styles.letterTiles}>{game.words[round].letters.map((letter,i)=><button type="button" key={i} aria-label={`Use letter ${letter} tile ${i+1}`} disabled={blocked||(wordSlots[round]||[]).includes(i)||(wordSlots[round]||[]).length>=game.words![round].letters.length} onClick={()=>setWordSlots(old=>game.words!.map((_,j)=>j===round?[...(old[j]||[]),i]:old[j]||[]))}>{letter}</button>)}</div><div className={styles.meta}><button type="button" className="light" disabled={blocked||!(wordSlots[round]||[]).length} onClick={()=>setWordSlots(old=>old.map((row,i)=>i===round?row.slice(0,-1):row))}>Undo</button><button type="button" className="light" disabled={blocked||!(wordSlots[round]||[]).length} onClick={()=>setWordSlots(old=>old.map((row,i)=>i===round?[]:row))}>Clear</button></div><div className={styles.meta}><button type="button" className="light" disabled={blocked||round===0} onClick={()=>setRound(n=>n-1)}>Previous</button>{round<total-1&&<button type="button" className="primary" disabled={blocked||(wordSlots[round]||[]).length!==game.words[round].letters.length} onClick={()=>setRound(n=>n+1)}>Next Word</button>}</div></>}
      {game.kind === "escape" && <div className={styles.lockRow} aria-label="Escape locks">{game.rounds!.map((_,i)=><span key={i} className={i<unlocked?styles.lockOpen:""} aria-label={`Lock ${i+1} ${i<unlocked?"open":"closed"}`}>{i<unlocked?"🔓":"🔒"}<small>{i+1}</small></span>)}</div>}
      {game.kind === "bingo" && game.bingo && <><div className={styles.trainingScene}><TrainingArtwork art="pointingWoman" small /><p><b>{bingoWon?"Bingo! 🎯":game.bingo.clues[bingoPicks.length]}</b></p></div><div className={styles.bingoBoard}>{game.bingo.cells.map((cell,i)=><button type="button" key={cell.id} className={bingoPicks.includes(i)?styles.bingoMarked:""} aria-label={`Bingo cell ${i+1}: ${cell.label}`} aria-pressed={bingoPicks.includes(i)} disabled={blocked||bingoWon||bingoPicks.includes(i)} onClick={()=>void checkStep({cells:[...bingoPicks,i]})}>{cell.jewellery!==undefined&&<div className={styles.bingoPhoto}><JewelleryPhoto index={cell.jewellery} /></div>}<b>{cell.label}</b>{bingoPicks.includes(i)&&<span aria-hidden="true"> ✓</span>}</button>)}</div></>}
      {game.kind === "sequence" && <><TrainingArtwork art="orderWoman" /><p className={styles.hint}>सही क्रम में रखें।</p><ol className={styles.stepList}>{order.map((index, position) => <li key={index} draggable={!blocked} onDragStart={() => { dragIndex.current = position; }} onDragEnd={() => { dragIndex.current = null; }} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (dragIndex.current !== null) moveStep(dragIndex.current, position); dragIndex.current = null; }}><span className={styles.stepNumber}>{position + 1}</span><b>{game.steps![index]}</b><div className={styles.stepActions}><button type="button" aria-label={`Move step ${position+1} up`} className="light small" disabled={blocked || position === 0} onClick={() => moveStep(position, position-1)}>↑</button><button type="button" aria-label={`Move step ${position+1} down`} className="light small" disabled={blocked || position === order.length-1} onClick={() => moveStep(position, position+1)}>↓</button></div></li>)}</ol></>}
      {current && <>
        {game.kind === "customer" ? <CustomerScene character={game.character} text={current.question} /> : <>
          {game.art && ["design", "selection", "repair", "error", "myth", "escape"].includes(game.kind) ? <div className={styles.trainingScene}><TrainingArtwork art={game.art} small /><p><b>{current.question}</b></p></div> : <p><b>{current.question}</b></p>}
          {current.art && current.art !== game.art && <TrainingArtwork art={current.art} />}
          {game.kind === "weight" && <TrainingArtwork art="scale" />}
          {game.kind === "risk" && <TrainingArtwork art="mixedTray" />}
          {game.kind === "care" && <TrainingArtwork art="pearlPhoto" />}
        </>}
        {current.shape !== undefined && <DiamondPhoto index={current.shape} />}
        {game.kind === "design" && current.jewellery !== undefined && <div className={styles.puzzle}><JewelleryPhoto index={current.jewellery} concealName /><div className={styles.puzzleTiles}>{[0,1,2,3].map(tile => <button type="button" key={tile} aria-label={`Reveal tile ${tile+1}`} disabled={blocked || tile === 0 || (revealed[round] || []).includes(tile)} className={tile === 0 || (revealed[round] || []).includes(tile) ? styles.revealed : ""} onClick={() => setRevealed(previous => ({ ...previous, [round]: [...(previous[round] || []),tile] }))}>{tile === 0 || (revealed[round] || []).includes(tile) ? "" : "🧩"}</button>)}</div></div>}
        {game.kind === "error" && <span className={styles.demoLabel}>DEMO TAG</span>}
        <div className={`${styles.options} ${current.imageChoices || current.jewelleryChoices ? styles.imageOptions : ""} ${game.kind === "risk" ? styles.riskOptions : ""}`}>
          {current.options.map((text,i) => <button type="button" key={i} disabled={blocked || (game.kind === "escape" && round < unlocked)} aria-pressed={choices[round] === i} className={choices[round] === i ? styles.selected : ""} onClick={() => setChoices(old => Array.from({length:total},(_,j) => j === round ? i : old[j] ?? -1))}>
            {current.imageChoices?.[i] && <TrainingArtwork art={current.imageChoices[i]} />}
            {current.jewelleryChoices?.[i] !== undefined && <div className={styles.optionPhoto}><JewelleryPhoto index={current.jewelleryChoices[i]} /></div>}
            <span>{game.kind === "error" || game.kind === "risk" ? text : `${String.fromCharCode(65+i)}. ${text}`}</span>
          </button>)}
        </div>
        {game.kind === "escape" ? <button type="button" className="primary" disabled={blocked||unlocked>=total||!(choices[round]>=0)} onClick={()=>void checkStep({choices:choices.slice(0,round+1)})}>Unlock</button> : <div className={styles.meta}><button type="button" className="light" disabled={blocked || round === 0} onClick={() => setRound(n => n-1)}>Previous</button>{round < total-1 && <button type="button" className="primary" disabled={blocked || !(choices[round] >= 0)} onClick={() => setRound(n => n+1)}>Next</button>}</div>}
      </>}

      {previewDone ? <p role="status">Preview complete.</p> : <button type="button" className={`primary ${styles.submit}`} disabled={busy || (seconds > 0 && count < total)} onClick={() => void submit()}>{busy ? "Submitting…" : seconds <= 0 ? "Retry Save Result" : "Submit Game"}</button>}
    </>}
    {error && <p role="alert">{error}</p>}{previewDone && <button type="button" className="light" onClick={() => void start()}>Try Again</button>}
  </div>;
}
