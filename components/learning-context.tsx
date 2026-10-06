"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useWorkspace } from "./course-ui";
import { learningPreview } from "@/lib/novalearn/learning-preview";
import type { LearningRecord } from "@/lib/novalearn/learning-domain";
type State = { records: LearningRecord[]; versions: { version: number; released_at: string }[]; loading: boolean; error: string; refresh: () => Promise<void>; act: (action: string, b?: any) => Promise<LearningRecord> };
const Context = createContext<State | null>(null);
export const useLearning = () => useContext(Context)!;
export function LearningProvider({ children }: { children: ReactNode }) {
  const w = useWorkspace();
  const [records, setRecords] = useState<LearningRecord[]>([]), [versions, setVersions] = useState<State["versions"]>([]), [loading, setLoading] = useState(true), [error, setError] = useState("");
  async function call(action: string, b: any = {}) {
    const body = { ...b, courseId: w.course.id };
    if (w.preview) return learningPreview(action, body);
    const r = await fetch("/api/learning", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, action }) });
    const data = await r.json(); if (!r.ok) throw new Error(data.error || "Learning request failed."); return data;
  }
  async function refresh() { const d = await call("load"); setRecords(d.records); setVersions(d.versions); setError(""); }
  useEffect(() => { let active = true; setLoading(true); setRecords([]); setVersions([]); setError(""); call("load").then(d => { if (active) { setRecords(d.records); setVersions(d.versions); } }).catch(e => active && setError(e.message)).finally(() => active && setLoading(false)); return () => { active = false; }; }, [w.course.id, w.course.version, w.profile.id]);
  async function act(action: string, b: any = {}) {
    const id = w.profile.role === "teacher" ? b.studentId : w.profile.id;
    const d = await call(action, { ...b, recordVersion: records.find(r => r.student_id === id)?.version || 0 });
    setRecords(old => [...old.filter(r => r.id !== d.id), d]); return d;
  }
  return <Context.Provider value={{ records, versions, loading, error, refresh, act }}>{error && <div role="alert" className="course-error">Adaptive-learning data could not load: {error}<button className="link" onClick={() => w.run(refresh)}>Retry</button></div>}{children}</Context.Provider>;
}
