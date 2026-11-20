"use client";
import { useState } from "react";
import styles from "./QuizGame.module.css";
export type QuizCandidate = { id: string; name: string; employeeCode: string | null; branch: string | null; department?: string | null; designation?: string | null };
export default function QuizAudiencePicker({ people, selected, disabled, onChange }: { people: QuizCandidate[]; selected: string[]; disabled: boolean; onChange: (ids: string[]) => void }) {
  const [search,setSearch] = useState("");
  const filtered = people.filter(p => `${p.name} ${p.employeeCode || ""} ${p.department || ""} ${p.branch || ""}`.toLowerCase().includes(search.toLowerCase()));
  const ids = new Set(selected), all = people.length > 0 && people.every(p => ids.has(p.id));
  return <details className={styles.audience}><summary>Employees · {selected.length} selected</summary><div className={styles.audienceBody}><label>Search employee<input type="search" value={search} disabled={disabled} placeholder="Name, code, department, branch…" onChange={e=>setSearch(e.target.value)} /></label><div className={styles.audienceActions}><label><input type="checkbox" checked={all} disabled={disabled || !people.length} onChange={e=>onChange(e.target.checked ? people.map(p=>p.id) : [])} />Select All ({people.length})</label><button type="button" className="light small" disabled={disabled || !selected.length} onClick={()=>onChange([])}>Clear All</button></div><div className={styles.employeeList}>{filtered.map(person=><label key={person.id}><input type="checkbox" checked={ids.has(person.id)} disabled={disabled} onChange={e=>onChange(e.target.checked ? [...new Set([...selected,person.id])] : selected.filter(id=>id!==person.id))} /><span><b>{person.name}</b><small>{[person.employeeCode,person.department,person.designation,person.branch].filter(Boolean).join(" · ")}</small></span></label>)}{!filtered.length && <p>No matching employees.</p>}</div></div></details>;
}
