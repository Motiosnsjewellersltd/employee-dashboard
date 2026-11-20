"use client";
import { useEffect, useState } from "react";
import QuizAnswerAnimation from "./QuizAnswerAnimation";
import FourDotsLoader from "./FourDotsLoader";
import styles from "./DailyJewelleryQuiz.module.css";
type Quiz = { id: string; version: string; date: string; question: string; options: string[]; canAnswer: boolean; correctIndex?: number; explanation?: string; answer: { selectedIndex: number; isCorrect: boolean; answeredAt: string } | null };
export default function DailyJewelleryQuiz({ standalone = false }: { standalone?: boolean }) {
  const [quiz, setQuiz] = useState<Quiz | null>(null), [selected, setSelected] = useState<number | null>(null);
  const [visible, setVisible] = useState(false), [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [error, setError] = useState("");
  const [animation, setAnimation] = useState<{ correct: boolean; token: number } | null>(null);
  useEffect(() => { if (!animation) return; const timer = window.setTimeout(() => setAnimation(null), 3400); return () => window.clearTimeout(timer); }, [animation]);
  useEffect(() => { setSelected(null); }, [quiz?.id, quiz?.version]);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); let visibleAlready = false;
    async function load() {
      if (document.hidden) return;
      try {
        const date = standalone ? new URLSearchParams(window.location.search).get("quizDate") : null;
        const response = await fetch(`/api/daily-quiz${date ? `?${new URLSearchParams({ date })}` : ""}`, { cache: "no-store", signal: controller.signal });
        if (response.status === 403) { if (!controller.signal.aborted) { setVisible(false); setQuiz(null); } return; }
        const result = await response.json(); if (!response.ok || !result.ok) throw new Error(result.error || "Could not load quiz.");
        if (!controller.signal.aborted) { setVisible(true); visibleAlready = true; setQuiz(result.data.quiz); setError(""); }
      } catch (e) { if (!controller.signal.aborted && (standalone || visibleAlready)) setError(e instanceof Error ? e.message : "Could not load quiz."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load(); const timer = window.setInterval(load, 60000); document.addEventListener("visibilitychange", load);
    return () => { controller.abort(); window.clearInterval(timer); document.removeEventListener("visibilitychange", load); };
  }, [standalone, refresh]);
  async function answer() {
    if (!quiz || selected === null || saving) return;
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/daily-quiz", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ questionId: quiz.id, version: quiz.version, selectedIndex: selected }) });
      const result = await response.json(); if (!response.ok || !result.ok) throw new Error(result.error || "Could not submit answer.");
      setQuiz(result.data.quiz);
      setAnimation({ correct: result.data.quiz.answer.isCorrect, token: Date.now() });
    } catch (e) { setError(e instanceof Error ? e.message : "Could not submit answer."); }
    finally { setSaving(false); }
  }
  if (!visible && !standalone) return null;
  return <section className={styles.panel} aria-label="Daily Jewellery Quiz">{animation && <QuizAnswerAnimation key={animation.token} correct={animation.correct} />}<div className={styles.header}><div><h2>💎 आज का Jewellery सवाल</h2>{quiz && <span className={styles.date}>{quiz.date.split("-").reverse().join("/")}</span>}</div><button className="light small" type="button" disabled={saving} onClick={() => setRefresh(value => value + 1)}>Refresh</button></div>
    {loading && <FourDotsLoader label="Loading quiz…" />}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {!loading && !visible && !error && <p className={styles.hint}>Quiz is not available for this account.</p>}
    {visible && !quiz && !loading && <p className={styles.hint}>इस दिन का सवाल अभी उपलब्ध नहीं है।</p>}
    {visible && quiz && <><p className={styles.question}>{quiz.question}</p><div className={styles.options}>{quiz.options.map((option, index) => <button type="button" key={index} aria-pressed={quiz.answer ? quiz.answer.selectedIndex === index : selected === index} disabled={!quiz.canAnswer || saving} onClick={() => setSelected(index)} className={`${styles.option} ${quiz.correctIndex === index ? styles.correct : quiz.answer?.selectedIndex === index ? styles.incorrect : selected === index && !quiz.answer ? styles.selected : ""}`}><b>{String.fromCharCode(65 + index)}.</b><span>{option}</span></button>)}</div>
      {quiz.canAnswer && <button type="button" className="primary" disabled={selected === null || saving} onClick={() => void answer()}>{saving ? "Submitting…" : "जवाब Submit करें"}</button>}
      {quiz.correctIndex !== undefined && <div className={styles.result} role="status" aria-live="polite"><strong>{quiz.answer ? quiz.answer.isCorrect ? "👏 सही जवाब!" : "💡 इस बार सही जवाब है:" : "इस दिन का सही जवाब:"} {quiz.options[quiz.correctIndex]}</strong><p>{quiz.explanation}</p></div>}
      {!quiz.canAnswer && !quiz.answer && <p className={styles.hint}>इस सवाल के जवाब देने का समय समाप्त हो गया है।</p>}
    </>}
  </section>;
}
