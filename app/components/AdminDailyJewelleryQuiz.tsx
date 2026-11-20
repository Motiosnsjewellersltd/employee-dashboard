"use client";
import { useEffect, useState } from "react";
import { DEFAULT_QUIZ_SETTINGS, type QuizSettings } from "@/lib/dailyQuizRules";
import { notificationTime } from "@/lib/notificationTime";
import FourDotsLoader from "./FourDotsLoader";
import styles from "./DailyJewelleryQuiz.module.css";
type Question = { id: string; date: string; question: string; options: string[]; correctIndex: number; explanation: string; isPublished: boolean; answers: Array<{ selectedIndex: number; isCorrect: boolean; answeredAt: string; employee: { name: string } }> };
type SettingsData = { today: string; settings: QuizSettings; target: { name: string; id: string; employeeCode?: string | null } | null; candidates: Array<{ id: string; name: string; employeeCode: string | null; branch: string | null }>; questions: Question[]; lastRun: { checkedAt: string; reason: string; sent: number; pushError: boolean } | null };
const blank = (date: string) => ({ id: "", date, question: "", options: ["", "", "", ""], correctIndex: 0, explanation: "", isPublished: false });
async function request(url: string, body?: unknown) {
  const response = await fetch(url, { cache: "no-store", ...(body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const result = await response.json(); if (!response.ok || !result.ok) throw new Error(result.error || "Quiz request failed."); return result.data;
}
export default function AdminDailyJewelleryQuiz() {
  const [data, setData] = useState<SettingsData | null>(null), [settings, setSettings] = useState<QuizSettings>(DEFAULT_QUIZ_SETTINGS), [messages, setMessages] = useState(DEFAULT_QUIZ_SETTINGS.messages.join("\n"));
  const [form, setForm] = useState(blank("")), [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  async function load(reset = true) {
    const next: SettingsData = await request("/api/daily-quiz/admin"); setData(next);
    if (reset) { setSettings(next.settings); setMessages(next.settings.messages.join("\n")); }
    setForm(previous => previous.date ? previous : blank(next.today));
  }
  useEffect(() => { let active = true; request("/api/daily-quiz/admin").then((next: SettingsData) => { if (active) { setData(next); setSettings(next.settings); setMessages(next.settings.messages.join("\n")); setForm(blank(next.today)); } }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, []);
  async function action(fn: () => Promise<void>) { setSaving(true); setError(""); setMessage(""); try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "Could not save quiz."); } finally { setSaving(false); } }
  const disabled = saving || loading;
  return <section className={styles.panel}><div className={styles.header}><div><h2>💎 Daily Jewellery Quiz</h2><p className={styles.hint}>Pilot: Admin management · Ghanshyam Jangir only</p></div><button className="light" disabled={disabled} onClick={() => void action(async () => { await load(); })}>Refresh</button></div>
    {loading && <FourDotsLoader label="Loading quiz management…" />}{error && <p className={styles.error} role="alert">{error}</p>}{message && <p className={styles.success} role="status">{message}</p>}
    {data && <><div className={styles.grid}><form className={styles.form} onSubmit={event => { event.preventDefault(); void action(async () => { await request("/api/daily-quiz/admin", { action: "settings", settings: { ...settings, messages: messages.split("\n").map(value => value.trim()).filter(Boolean) } }); await load(); setMessage("Pilot settings saved. Only the selected Ghanshyam Jangir profile is eligible."); }); }}>
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
    </form>
    <form className={styles.form} onSubmit={event => { event.preventDefault(); void action(async () => { const options = form.options.filter(value => value.trim()); if (form.options.some((value, index) => !value.trim() && index < form.options.length-1)) throw new Error("Fill the first three options; only the last option may be empty."); await request("/api/daily-quiz/admin", { action: "question", id: form.id, question: { ...form, options } }); setForm(blank(data.today)); await load(false); setMessage("Question saved. Published questions appear only on their assigned date."); }); }}>
      <h3>{form.id ? "Edit Question" : "Add Question"}</h3>
      <label>Date (IST)<input type="date" required min={data.today} disabled={disabled} value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></label>
      <label>Question<textarea rows={3} required maxLength={1200} disabled={disabled} value={form.question} onChange={e => setForm({ ...form, question: e.target.value })} /></label>
      {form.options.map((option, index) => <label key={index}>Option {String.fromCharCode(65+index)}{index===3 ? " (optional)" : ""}<input required={index<3} maxLength={300} disabled={disabled} value={option} onChange={e => setForm({ ...form, options: form.options.map((old,i) => i === index ? e.target.value : old) })} /></label>)}
      <label>Correct Answer<select value={form.correctIndex} disabled={disabled} onChange={e => setForm({ ...form, correctIndex: Number(e.target.value) })}>{form.options.map((option, index) => <option key={index} value={index}>{String.fromCharCode(65+index)}{option ? ` — ${option}` : ""}</option>)}</select></label>
      <label>Explanation<textarea rows={3} required maxLength={2400} disabled={disabled} value={form.explanation} onChange={e => setForm({ ...form, explanation: e.target.value })} /></label>
      <label className={styles.toggle}><input type="checkbox" checked={form.isPublished} disabled={disabled} onChange={e => setForm({ ...form, isPublished: e.target.checked })} />Published</label>
      <div className={styles.actions}><button className="primary" disabled={disabled}>{form.id ? "Save Question" : "Add Question"}</button><button className="light" type="button" disabled={disabled} onClick={() => setForm(blank(data.today))}>Clear Form</button></div>
    </form></div>
    <h3>Questions & Daily Answers</h3><div className={styles.table}><table><thead><tr><th>Date</th><th>Question</th><th>Status</th><th>Answer</th><th>Action</th></tr></thead><tbody>{data.questions.map(question => <tr key={question.id}><td>{question.date.split("-").reverse().join("/")}</td><td>{question.question}</td><td>{question.isPublished ? "Published" : "Draft"}</td><td>{question.answers.length ? question.answers.map((answer,index) => <div key={index}>{answer.employee.name}: {String.fromCharCode(65+answer.selectedIndex)} · {answer.isCorrect ? "Correct" : "Incorrect"}<small>{notificationTime(answer.answeredAt)}</small></div>) : "Not answered"}</td><td>{question.date >= data.today && !question.answers.length ? <button type="button" className="light small" disabled={disabled} onClick={() => setForm({ ...question, options: [...question.options, ...Array(4-question.options.length).fill("")] })}>Edit</button> : "Locked"}</td></tr>)}{!data.questions.length && <tr><td colSpan={5}>No questions yet. Add a question for today or a future date.</td></tr>}</tbody></table></div></>}
  </section>;
}
