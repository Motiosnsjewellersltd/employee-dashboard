"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { GameDefinition, PublicGame } from "@/lib/quizActivityTypes";
import styles from "./AdminDailyJewelleryQuiz.module.css";
import formStyles from "./DailyJewelleryQuiz.module.css";
export type EditableLibraryGame = GameDefinition & { revision?: string; preview: PublicGame };
export default function QuizGameEditor({ game, onClose, onSaved }: { game: EditableLibraryGame; onClose: () => void; onSaved: (game: EditableLibraryGame) => void }) {
  const [draft,setDraft] = useState<GameDefinition>(()=>JSON.parse(JSON.stringify(game))), [busy,setBusy] = useState(false), [error,setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(()=>{ dialog.current?.showModal(); const previous=document.body.style.overflow;document.body.style.overflow="hidden";return()=>{dialog.current?.close();document.body.style.overflow=previous;}; },[]);
  async function save() {
    if(busy)return;setBusy(true);setError("");
    try { const response=await fetch("/api/daily-quiz/admin",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"gameContent",game:draft,revision:game.revision})});const value=await response.json();if(!response.ok||!value.ok)throw Error(value.error||"Could not save game content.");onSaved(value.data.game); }
    catch(e){setError(e instanceof Error?e.message:"Could not save game content.");}finally{setBusy(false);}
  }
  const field=(label:string,value:string,onChange:(value:string)=>void,max=1200)=><label key={label}>{label}<textarea value={value} disabled={busy} maxLength={max} rows={2} onChange={e=>onChange(e.target.value)} /></label>;
  if(typeof document==="undefined")return null;
  return createPortal(<dialog ref={dialog} className={styles.dialog} aria-label="Edit Game Content" onCancel={e=>{e.preventDefault();if(!busy)onClose();}}><div className={styles.dialogBody}><div className={formStyles.header}><h2>Edit Game Content</h2><button type="button" className="light small" disabled={busy} onClick={onClose} aria-label="Close game editor">×</button></div><form className={formStyles.form} onSubmit={e=>{e.preventDefault();void save();}}>
    <label>Game Title<input required maxLength={160} value={draft.title} disabled={busy} onChange={e=>setDraft({...draft,title:e.target.value})} /></label>
    {draft.rounds?.map((round,i)=><fieldset key={i}><legend>Question {i+1}</legend>{field("Question",round.question||"",question=>setDraft({...draft,rounds:draft.rounds!.map((r,n)=>n===i?{...r,question}:r)}))}{round.options.map((option,j)=>field(`Option ${String.fromCharCode(65+j)}`,option,value=>setDraft({...draft,rounds:draft.rounds!.map((r,n)=>n===i?{...r,options:r.options.map((old,k)=>j===k?value:old)}:r)}),300))}<label>Correct Answer<select value={round.correctIndex} disabled={busy} onChange={e=>setDraft({...draft,rounds:draft.rounds!.map((r,n)=>n===i?{...r,correctIndex:Number(e.target.value)}:r)})}>{round.options.map((option,j)=><option key={j} value={j}>{String.fromCharCode(65+j)} · {option}</option>)}</select></label>{field("Explanation (optional)",round.explanation||"",explanation=>setDraft({...draft,rounds:draft.rounds!.map((r,n)=>n===i?{...r,explanation}:r)}),2400)}{round.facts?.map((fact,j)=>field(`Statement ${j+1}`,fact,value=>setDraft({...draft,rounds:draft.rounds!.map((r,n)=>n===i?{...r,facts:r.facts!.map((old,k)=>k===j?value:old)}:r)}),600))}</fieldset>)}
    {draft.pairs?.map((pair,i)=><fieldset key={i}><legend>Pair {i+1}</legend>{field("Term",pair.term,term=>setDraft({...draft,pairs:draft.pairs!.map((p,n)=>n===i?{...p,term}:p)}),200)}{field("Meaning",pair.meaning,meaning=>setDraft({...draft,pairs:draft.pairs!.map((p,n)=>n===i?{...p,meaning}:p)}),600)}</fieldset>)}
    {draft.steps?.map((step,i)=>field(`Correct Step ${i+1}`,step,value=>setDraft({...draft,steps:draft.steps!.map((old,n)=>n===i?value:old)}),600))}
    {draft.words?.map((word,i)=><fieldset key={i}><legend>Word {i+1}</legend>{field("Clue",word.clue,clue=>setDraft({...draft,words:draft.words!.map((w,n)=>n===i?{...w,clue}:w)}),600)}<label>Correct English Word<input required maxLength={24} disabled={busy} value={word.word} onChange={e=>setDraft({...draft,words:draft.words!.map((w,n)=>n===i?{...w,word:e.target.value.toUpperCase()}:w)})} /></label></fieldset>)}
    {draft.bingo?.cells.map((cell,i)=>field(`Bingo Cell ${i+1}`,cell.label,label=>setDraft({...draft,bingo:{...draft.bingo!,cells:draft.bingo!.cells.map((c,n)=>n===i?{...c,label}:c)}}),120))}
    {draft.bingo?.clues.map((clue,i)=>field(`Bingo Clue ${i+1}`,clue.text,text=>setDraft({...draft,bingo:{...draft.bingo!,clues:draft.bingo!.clues.map((c,n)=>n===i?{...c,text}:c)}}),600))}
    <p className={formStyles.hint}>Library corrections apply when a game is next saved. Existing dated games and answers stay unchanged.</p>
    {error&&<p className={formStyles.error} role="alert">{error}</p>}<div className={formStyles.actions}><button className="primary" disabled={busy}>{busy?"Saving…":"Save Game Content"}</button><button type="button" className="light" disabled={busy} onClick={onClose}>Cancel</button></div>
  </form></div></dialog>,document.body);
}
