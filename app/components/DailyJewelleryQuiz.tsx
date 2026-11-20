"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import QuizAnswerAnimation from "./QuizAnswerAnimation";
import FourDotsLoader from "./FourDotsLoader";
import styles from "./DailyJewelleryQuiz.module.css";
type Quiz = { id: string; version: string; date: string; question: string; options: string[]; canAnswer: boolean; correctIndex?: number; explanation?: string; answer: { selectedIndex: number; isCorrect: boolean; answeredAt: string } | null };
function QuizPopup({ children, result = false, onDismiss, saving = false }: { children: ReactNode; result?: boolean; onDismiss: () => void; saving?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null), dismiss = useRef(onDismiss), busy = useRef(saving);
  dismiss.current = onDismiss; busy.current = saving;
  useEffect(() => {
    const node = dialog.current; node?.showModal();
    const overflow = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { node?.close(); document.body.style.overflow = overflow; };
  }, []);
  return <dialog ref={dialog} className={`${styles.quizDialog} ${result ? styles.resultDialog : ""}`} aria-label={result ? "Quiz result" : "Daily Jewellery Quiz"} onCancel={event => { event.preventDefault(); if (!busy.current) dismiss.current(); }}>
    {children}
  </dialog>;
}
export default function DailyJewelleryQuiz({ standalone = false, onDone }: { standalone?: boolean; onDone?: () => void }) {
  const [quiz, setQuiz] = useState<Quiz | null>(null), [selected, setSelected] = useState<number | null>(null);
  const [visible, setVisible] = useState(false), [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [error, setError] = useState("");
  const [animation, setAnimation] = useState<{ correct: boolean; token: number } | null>(null);
  const [resultQuiz, setResultQuiz] = useState<Quiz | null>(null);
  const completedIds = useRef(new Set<string>()), dismissedIds = useRef(new Set<string>()), resultOpen = useRef(false), done = useRef(onDone);
  done.current = onDone;
  useEffect(() => { if (!animation) return; const timer = window.setTimeout(() => setAnimation(null), 3400); return () => window.clearTimeout(timer); }, [animation]);
  useEffect(() => { setSelected(null); }, [quiz?.id, quiz?.version]);
  const [refresh, setRefresh] = useState(0);
  function finish() {
    if (quiz) dismissedIds.current.add(quiz.id);
    resultOpen.current = false; setResultQuiz(null); setAnimation(null); setQuiz(null); setVisible(false);
    if (done.current) done.current();
    else if (standalone) window.location.assign("/?section=profile");
  }
  useEffect(() => {
    const controller = new AbortController(); let running = false;
    async function load() {
      if (document.hidden || running || resultOpen.current) return;
      running = true;
      try {
        const date = standalone ? new URLSearchParams(window.location.search).get("quizDate") : null;
        const response = await fetch(`/api/daily-quiz${date ? `?${new URLSearchParams({ date })}` : ""}`, { cache: "no-store", signal: controller.signal });
        if (controller.signal.aborted || resultOpen.current) return;
        if (response.status === 403) { setVisible(false); setQuiz(null); if (standalone) done.current?.(); return; }
        const payload = await response.json();
        if (controller.signal.aborted || resultOpen.current) return;
        if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not load quiz.");
        const current: Quiz | null = payload.data.quiz;
        // Answered/expired quizzes never leave a card or result on the employee home page.
        if (!current || current.answer || !current.canAnswer || completedIds.current.has(current.id) || dismissedIds.current.has(current.id)) {
          if (current?.answer) completedIds.current.add(current.id);
          setQuiz(null); setVisible(false); setError("");
          if (standalone) done.current?.();
          return;
        }
        setVisible(true); setQuiz(current); setError("");
      } catch (e) { if (!controller.signal.aborted && !resultOpen.current && standalone) { setError(e instanceof Error ? e.message : "Could not load quiz."); setVisible(true); } }
      finally { running = false; if (!controller.signal.aborted) setLoading(false); }
    }
    void load(); const timer = window.setInterval(load, 60000); document.addEventListener("visibilitychange", load);
    return () => { controller.abort(); window.clearInterval(timer); document.removeEventListener("visibilitychange", load); };
  }, [standalone, refresh]);
  async function answer() {
    if (!quiz || selected === null || saving || completedIds.current.has(quiz.id)) return;
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/daily-quiz", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ questionId: quiz.id, version: quiz.version, selectedIndex: selected }) });
      const payload = await response.json(); if (!response.ok || !payload.ok) { if (response.status === 409) setRefresh(value => value + 1); throw new Error(payload.error || "Could not submit answer."); }
      const saved: Quiz = payload.data.quiz;
      if (!saved.answer) throw new Error("Answer confirmation was not received. Refresh to check your saved answer.");
      // POST returns only after the answer commits. Keep this result open until OK.
      completedIds.current.add(saved.id); resultOpen.current = true;
      setQuiz(saved); setResultQuiz(saved);
      setAnimation({ correct: saved.answer.isCorrect, token: Date.now() });
    } catch (e) { setError(e instanceof Error ? e.message : "Could not submit answer."); }
    finally { setSaving(false); }
  }
  if (resultQuiz?.answer) return <QuizPopup key="result" result onDismiss={finish}>
    {animation && <QuizAnswerAnimation key={animation.token} correct={animation.correct} />}
    <div className={styles.quizDialogBody}><div className={styles.resultIcon} aria-hidden="true">{resultQuiz.answer.isCorrect ? "🎉" : "😔"}</div>
      <h2>{resultQuiz.answer.isCorrect ? "सही जवाब!" : "इस बार जवाब गलत है"}</h2>
      {resultQuiz.correctIndex !== undefined && <p className={styles.answerText}><b>सही जवाब:</b> {resultQuiz.options[resultQuiz.correctIndex]}</p>}
      {resultQuiz.explanation && <p className={styles.explanation}>{resultQuiz.explanation}</p>}
      <button type="button" className={`primary ${styles.okButton}`} autoFocus onClick={finish}>OK</button>
    </div>
  </QuizPopup>;
  if (!visible) return null;
  return <QuizPopup key="question" onDismiss={finish} saving={saving}><div className={styles.quizDialogBody}>
    <div className={styles.header}><div><h2>💎 आज का Jewellery सवाल</h2>{quiz && <span className={styles.date}>{quiz.date.split("-").reverse().join("/")}</span>}</div><button className="light small" type="button" disabled={saving} onClick={finish} aria-label="Close quiz and return home">×</button></div>
    {loading && <FourDotsLoader label="Loading quiz…" />}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {quiz && <><p className={styles.question}>{quiz.question}</p><div className={styles.options}>{quiz.options.map((option, index) => <button type="button" key={index} aria-pressed={selected === index} disabled={saving} onClick={() => setSelected(index)} className={`${styles.option} ${selected === index ? styles.selected : ""}`}><b>{String.fromCharCode(65 + index)}.</b><span>{option}</span></button>)}</div>
      <button type="button" className="primary" disabled={selected === null || saving} onClick={() => void answer()}>{saving ? "Submitting…" : "जवाब Submit करें"}</button></>}
    {error && <button className="light" type="button" disabled={saving} onClick={() => setRefresh(value => value + 1)}>Refresh</button>}
  </div></QuizPopup>;
}
