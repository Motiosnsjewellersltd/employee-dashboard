"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { DEFAULT_QUIZ_SETTINGS, type QuizSettings } from "@/lib/dailyQuizRules";
import { notificationTime } from "@/lib/notificationTime";
import FourDotsLoader from "./FourDotsLoader";
import styles from "./DailyJewelleryQuiz.module.css";
import adminStyles from "./AdminDailyJewelleryQuiz.module.css";
type Question = { id: string; date: string; question: string; options: string[]; correctIndex: number; explanation: string; isPublished: boolean; answers: Array<{ selectedIndex: number; isCorrect: boolean; answeredAt: string; employee: { name: string } }>; report: { total: number; correct: number; wrong: number; noResponse: number; names: { correct: string[]; wrong: string[]; noResponse: string[] } } };
type SettingsData = { today: string; settings: QuizSettings; target: { name: string; id: string; employeeCode?: string | null } | null; candidates: Array<{ id: string; name: string; employeeCode: string | null; branch: string | null }>; questions: Question[]; lastRun: { checkedAt: string; reason: string; sent: number; pushError: boolean } | null };
const blank = (date: string) => ({ id: "", date, question: "", options: ["", "", "", ""], correctIndex: 0, explanation: "", isPublished: false });
async function request(url: string, body?: unknown, method = "POST") {
  const response = await fetch(url, { cache: "no-store", ...(body ? { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const result = await response.json(); if (!response.ok || !result.ok) throw new Error(result.error || "Quiz request failed."); return result.data;
}
function AdminQuizModal({ title, children, onClose, busy = false }: { title: string; children: ReactNode; onClose: () => void; busy?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null), close = useRef(onClose), saving = useRef(busy); close.current = onClose; saving.current = busy;
  useEffect(() => { const node = dialog.current; node?.showModal(); const overflow = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { node?.close(); document.body.style.overflow = overflow; }; }, []);
  return <dialog ref={dialog} className={adminStyles.dialog} aria-label={title} onCancel={event => { event.preventDefault(); if (!saving.current) close.current(); }}><div className={adminStyles.dialogBody}><div className={styles.header}><h2>{title}</h2><button type="button" className="light small" disabled={busy} aria-label="Close popup" onClick={onClose}>×</button></div>{children}</div></dialog>;
}
function EyeIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>; }
export default function AdminDailyJewelleryQuiz() {
  const [data, setData] = useState<SettingsData | null>(null), [settings, setSettings] = useState<QuizSettings>(DEFAULT_QUIZ_SETTINGS), [messages, setMessages] = useState(DEFAULT_QUIZ_SETTINGS.messages.join("\n"));
  const [form, setForm] = useState(blank("")), [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const [mode, setMode] = useState<"add" | "edit" | "view" | null>(null), [deleting, setDeleting] = useState<Question | null>(null), [names, setNames] = useState<{ title: string; date: string; people: string[] } | null>(null), [dateFilter, setDateFilter] = useState("");
  async function load(reset = true, date = dateFilter) {
    const next: SettingsData = await request(`/api/daily-quiz/admin${date ? `?${new URLSearchParams({ date })}` : ""}`); setData(next);
    if (reset) { setSettings(next.settings); setMessages(next.settings.messages.join("\n")); }
  }
  useEffect(() => { let active = true; request("/api/daily-quiz/admin").then((next: SettingsData) => { if (active) { setData(next); setSettings(next.settings); setMessages(next.settings.messages.join("\n")); setForm(blank(next.today)); } }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, []);
  useEffect(() => {
    if (saving || mode || deleting) return;
    const controller = new AbortController(); let running = false;
    async function refreshQuestions() {
      if (running || document.hidden || controller.signal.aborted) return;
      running = true;
      try {
        const response = await fetch(`/api/daily-quiz/admin${dateFilter ? `?${new URLSearchParams({ date: dateFilter })}` : ""}`, { cache: "no-store", signal: controller.signal });
        const payload = await response.json();
        if (!controller.signal.aborted && response.ok && payload.ok) setData(previous => previous ? { ...previous, questions: payload.data.questions, lastRun: payload.data.lastRun } : previous);
      } catch { /* A silent count refresh must not interrupt Admin forms. */ }
      finally { running = false; }
    }
    const timer = window.setInterval(refreshQuestions, 30000);
    document.addEventListener("visibilitychange", refreshQuestions);
    return () => { controller.abort(); window.clearInterval(timer); document.removeEventListener("visibilitychange", refreshQuestions); };
  }, [dateFilter, saving, mode, deleting]);
  async function action(fn: () => Promise<void>) { setSaving(true); setError(""); setMessage(""); try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "Could not save quiz."); } finally { setSaving(false); } }
  function openQuestion(question: Question, view: boolean) { setError(""); setForm({ id: question.id, date: question.date, question: question.question, options: [...question.options, ...Array(Math.max(0,4-question.options.length)).fill("")], correctIndex: question.correctIndex, explanation: question.explanation, isPublished: question.isPublished }); setMode(view ? "view" : "edit"); }
  const disabled = saving || loading;
  return <section className={styles.panel}><div className={styles.header}><div><h2>💎 Daily Jewellery Quiz</h2><p className={styles.hint}>Pilot: Admin management · Ghanshyam Jangir only</p></div><div className={adminStyles.headerActions}><button type="button" className="primary" disabled={disabled || !data} onClick={() => { setError(""); setForm(blank(data!.today)); setMode("add"); }}>Add Question</button><button type="button" className="light" disabled={disabled} onClick={() => void action(async () => { await load(); })}>Refresh</button></div></div>
    {loading && <FourDotsLoader label="Loading quiz management…" />}{error && !mode && !deleting && <p className={styles.error} role="alert">{error}</p>}{message && <p className={styles.success} role="status">{message}</p>}
    {data && <><details className={adminStyles.settings}><summary>Test Access & Notifications</summary><form className={styles.form} onSubmit={event => { event.preventDefault(); void action(async () => { await request("/api/daily-quiz/admin", { action: "settings", settings: { ...settings, messages: messages.split("\n").map(value => value.trim()).filter(Boolean) } }); await load(); setMessage("Pilot settings saved. Only the selected Ghanshyam Jangir profile is eligible."); }); }}>
      <h3>Test Access & Notifications</h3>
      <label className={styles.toggle}><input type="checkbox" checked={settings.enabled} disabled={disabled} onChange={e => setSettings({ ...settings, enabled: e.target.checked })} />Quiz enabled</label>
      <label>Test Employee<select value={settings.targetEmployeeId || (data.candidates.length === 1 ? data.candidates[0].id : "")} disabled={disabled} onChange={e => setSettings({ ...settings, targetEmployeeId: e.target.value })}><option value="">Select Ghanshyam Jangir</option>{data.candidates.map(person => <option key={person.id} value={person.id}>{person.name} · {person.employeeCode || "No code"} · {person.branch || "No branch"}</option>)}</select></label>
      {!data.candidates.length && <p className={styles.error}>Active EMPLOYEE profile named Ghanshyam Jangir was not found. No employee can receive the quiz until the correct profile is available.</p>}
      <p className={styles.hint}>Save settings once to bind the employee ID before publishing. HR and other employees have no access.</p>
      <label className={styles.toggle}><input type="checkbox" checked={settings.notificationsEnabled} disabled={disabled} onChange={e => setSettings({ ...settings, notificationsEnabled: e.target.checked })} />Repeated notifications enabled</label>
      <label>Notification Gap<select value={settings.intervalMinutes} disabled={disabled} onChange={e => setSettings({ ...settings, intervalMinutes: Number(e.target.value) })}>{[30,60,120,180].map(value => <option key={value} value={value}>{value} minutes</option>)}</select></label>
      <div className={styles.hourGrid}><label>Start Hour (IST)<select value={settings.startHour} disabled={disabled} onChange={e => setSettings({ ...settings, startHour: Number(e.target.value) })}>{Array.from({ length: 24 }, (_,i) => <option key={i} value={i}>{String(i).padStart(2,"0")}:00</option>)}</select></label><label>End Hour (IST)<select value={settings.endHour} disabled={disabled} onChange={e => setSettings({ ...settings, endHour: Number(e.target.value) })}>{Array.from({ length: 24 }, (_,i) => i+1).map(i => <option key={i} value={i}>{String(i).padStart(2,"0")}:00</option>)}</select></label></div>
      <label>Rotating Messages — one per line<textarea rows={7} value={messages} disabled={disabled} onChange={e => setMessages(e.target.value)} required /></label>
      <p className={styles.hint}>Reminders stop after the answer or at the end of the day. Scheduled delivery can be delayed. No weekly result notifications.</p>
      <div className={styles.actions}><button className="primary" disabled={disabled}>Save Settings</button><button className="light" type="button" disabled={disabled || !data.target} onClick={() => void action(async () => { const status = await request("/api/daily-quiz/reminders", {}); setMessage(status.reason); await load(false); })}>Send / Check Now</button></div>
      {data.lastRun && <p className={styles.hint}>Last Check: {notificationTime(data.lastRun.checkedAt)}<br />{data.lastRun.reason}{data.lastRun.pushError ? " Push status unavailable." : ""}</p>}
    </form></details>
    <div className={adminStyles.reportHeader}><h3>Questions & Daily Answers</h3><div className={adminStyles.headerActions}><input type="date" aria-label="Question date" value={dateFilter} disabled={disabled} onChange={event => setDateFilter(event.target.value)} /><button type="button" className="light small" disabled={disabled} onClick={() => void action(async () => { await load(false); })}>Filter</button>{dateFilter && <button type="button" className="light small" disabled={disabled} onClick={() => { setDateFilter(""); void action(async () => { await load(false, ""); }); }}>All Dates</button>}</div></div>
    <div className={styles.table}><table><thead><tr><th>Date</th><th>Question</th><th>Status</th><th>Correct</th><th>Wrong</th><th>No Response</th><th>Action</th></tr></thead><tbody>{data.questions.map(question => <tr key={question.id}><td>{question.date.split("-").reverse().join("/")}</td><td>{question.question}</td><td>{question.isPublished ? "Published" : "Draft"}</td>{([['correct','Correct'],['wrong','Wrong'],['noResponse','No Response']] as const).map(([key,label]) => <td key={key}><button type="button" className={adminStyles.count} aria-label={`${label}: ${question.report[key]}`} onClick={() => setNames({ title: label, date: question.date, people: question.report.names[key] })}>{question.report[key]}</button></td>)}<td><div className={adminStyles.rowActions}><button type="button" className="light small" aria-label="View question" title="View question" disabled={disabled} onClick={() => openQuestion(question, true)}><EyeIcon /></button>{!question.answers.length && <button type="button" className="light small" disabled={disabled} onClick={() => openQuestion(question, false)}>Edit</button>}<button type="button" className="danger-btn small" disabled={disabled} onClick={() => { setError(""); setDeleting(question); }}>Delete</button></div></td></tr>)}{!data.questions.length && <tr><td colSpan={7}>No questions found.</td></tr>}</tbody></table></div>
    {mode && <AdminQuizModal title={mode === "view" ? "View Question" : mode === "edit" ? "Edit Question" : "Add Question"} busy={saving} onClose={() => setMode(null)}>
      {mode === "view" ? <><p className={styles.date}>{form.date.split("-").reverse().join("/")} · {form.isPublished ? "Published" : "Draft"}</p><p className={styles.question}>{form.question}</p><ol className={adminStyles.viewOptions}>{form.options.filter(Boolean).map((option,index) => <li key={index} className={index === form.correctIndex ? adminStyles.rightOption : ""}><b>{String.fromCharCode(65+index)}.</b> {option}{index === form.correctIndex && <strong> ✓ Correct</strong>}</li>)}</ol><p className={styles.explanation}>{form.explanation}</p></> : <form className={styles.form} onSubmit={event => { event.preventDefault(); void action(async () => { const options = form.options.filter(value => value.trim()); if (form.options.some((value,index) => !value.trim() && index < form.options.length-1)) throw new Error("Fill the first three options; only the last option may be empty."); await request("/api/daily-quiz/admin", { action: "question", id: form.id, question: { ...form, options } }); setMode(null); setDateFilter(form.date); await load(false, form.date); setMessage("Question saved."); }); }}>
        <label>Date (IST)<input type="date" required min={mode === "add" ? data.today : undefined} disabled={disabled} value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></label>
        <label>Question<textarea rows={3} required maxLength={1200} disabled={disabled} value={form.question} onChange={e => setForm({ ...form, question: e.target.value })} /></label>
        {form.options.map((option,index) => <label key={index}>Option {String.fromCharCode(65+index)}{index===3 ? " (optional)" : ""}<input required={index<3} maxLength={300} disabled={disabled} value={option} onChange={e => setForm({ ...form, options: form.options.map((old,i) => i===index ? e.target.value : old) })} /></label>)}
        <label>Correct Answer<select value={form.correctIndex} disabled={disabled} onChange={e => setForm({ ...form, correctIndex: Number(e.target.value) })}>{form.options.map((option,index) => <option key={index} value={index}>{String.fromCharCode(65+index)}{option ? ` — ${option}` : ""}</option>)}</select></label>
        <label>Explanation<textarea rows={3} required maxLength={2400} disabled={disabled} value={form.explanation} onChange={e => setForm({ ...form, explanation: e.target.value })} /></label>
        <label className={styles.toggle}><input type="checkbox" checked={form.isPublished} disabled={disabled} onChange={e => setForm({ ...form, isPublished: e.target.checked })} />Published</label>
        {error && <p className={styles.error} role="alert">{error}</p>}
        <div className={styles.actions}><button className="primary" disabled={disabled}>{mode === "edit" ? "Save Changes" : "Add Question"}</button><button type="button" className="light" disabled={disabled} onClick={() => setMode(null)}>Cancel</button></div>
      </form>}
    </AdminQuizModal>}
    {deleting && <AdminQuizModal title="Delete Question?" busy={saving} onClose={() => setDeleting(null)}><p><b>{deleting.date.split("-").reverse().join("/")}</b></p><p>{deleting.question}</p><p>This permanently deletes this question, all its answers and related quiz notifications.</p>{error && <p className={styles.error} role="alert">{error}</p>}<div className={styles.actions}><button type="button" className="light" disabled={disabled} onClick={() => setDeleting(null)}>Cancel</button><button type="button" className="danger-btn" disabled={disabled} onClick={() => void action(async () => { await request("/api/daily-quiz/admin", { id: deleting.id }, "DELETE"); setDeleting(null); await load(false); setMessage("Question and its related answers/quiz notifications deleted."); })}>{saving ? "Deleting…" : "Delete Question"}</button></div></AdminQuizModal>}
    {names && <AdminQuizModal title={`${names.title}: ${names.people.length}`} onClose={() => setNames(null)}><p className={styles.date}>{names.date.split("-").reverse().join("/")}</p>{names.people.length ? <ul className={adminStyles.names}>{names.people.map((name,index) => <li key={index}>{name}</li>)}</ul> : <p>No employees.</p>}</AdminQuizModal>}
    </>}
  </section>;
}
