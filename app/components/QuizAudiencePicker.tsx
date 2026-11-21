"use client";
import { useState } from "react";
import styles from "./QuizGame.module.css";
export type QuizCandidate = { id: string; name: string; employeeCode: string | null; branch: string | null; department?: string | null; designation?: string | null };
export default function QuizAudiencePicker({ people, selected, disabled, onChange }: { people: QuizCandidate[]; selected: string[]; disabled: boolean; onChange: (ids: string[]) => void }) {
  const [search,setSearch] = useState("");
  const [department,setDepartment] = useState("");
  const departments = [...new Set(people.map(person => person.department?.trim()).filter((name): name is string => Boolean(name)))].sort((a,b) => a.localeCompare(b));
  const filtered = people.filter(p => (!department || p.department?.trim() === department) && `${p.name} ${p.employeeCode || ""} ${p.department || ""} ${p.branch || ""}`.toLowerCase().includes(search.toLowerCase()));
  const ids = new Set(selected), visibleIds = new Set(filtered.map(person => person.id));
  const all = filtered.length > 0 && filtered.every(p => ids.has(p.id));
  return <details className={styles.audience}><summary>Employees · {selected.length} selected</summary><div className={styles.audienceBody}><label>Department<select value={department} disabled={disabled} onChange={e=>setDepartment(e.target.value)}><option value="">All Departments</option>{departments.map(name=><option key={name} value={name}>{name}</option>)}</select></label><label>Search employee<input type="search" value={search} disabled={disabled} placeholder="Name, code, department, branch…" onChange={e=>setSearch(e.target.value)} /></label><div className={styles.audienceActions}><label><input type="checkbox" checked={all} disabled={disabled || !filtered.length} onChange={e=>onChange(e.target.checked ? [...new Set([...selected,...visibleIds])] : selected.filter(id=>!visibleIds.has(id)))} />Select All ({filtered.length})</label><button type="button" className="light small" disabled={disabled || !selected.length} onClick={()=>onChange([])}>Clear All</button></div><div className={styles.employeeList}>{filtered.map(person=><label key={person.id}><input type="checkbox" checked={ids.has(person.id)} disabled={disabled} onChange={e=>onChange(e.target.checked ? [...new Set([...selected,person.id])] : selected.filter(id=>id!==person.id))} /><span><b>{person.name}</b><small>{[person.employeeCode,person.department,person.designation,person.branch].filter(Boolean).join(" · ")}</small></span></label>)}{!filtered.length && <p>No matching employees.</p>}</div></div></details>;
}
