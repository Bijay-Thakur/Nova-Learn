import { previewData } from "./preview";
import { readCoursePreview } from "./course-preview";
import { clientId } from "./client-id";
import { emptyRecord, markAttempt, type LearningRecord } from "./learning-domain";
const KEY = "novalearn-learning-preview-v1";
export async function learningPreview(action: string, b: any) {
  const p = previewData().profile, teacher = p.role === "teacher", s = readCoursePreview();
  const c = (teacher ? s.courses : s.publications).find(c => c.id === b.courseId);
  if (!c) throw new Error("Course not available.");
  let all: LearningRecord[] = [];
  try { all = JSON.parse(sessionStorage.getItem(KEY) || "[]"); } catch {}
  const rows = all.filter(r => r.course_id === c.id && (teacher || r.student_id === p.id));
  if (action === "load") return { records: rows, versions: (s.versions || []).filter(v => v.id === c.id).map(v => ({ version: v.version, released_at: v.updated_at })) };
  const studentId = teacher ? b.studentId : p.id;
  if (!studentId) throw new Error("Select a student.");
  const old = rows.find(r => r.student_id === studentId);
  if (old && old.version !== b.recordVersion) throw new Error("Learning evidence changed. Refresh first.");
  const r = structuredClone(old || emptyRecord(c.id, studentId, clientId()));
  const at = new Date().toISOString(), id = clientId();
  if (action === "attempt") {
    if (teacher) throw new Error("Switch to Student to answer.");
    const full = s.versions?.find(v => v.id === c.id && v.version === c.version);
    if (!full) throw new Error("Release this course again from Course Architect first.");
    const result = markAttempt(full, b, r.data.attempts, id, at);
    r.data.attempts.push(result.attempt); r.data.signals.push(...result.signals);
  } else if (action === "goal") { if (teacher) throw new Error("Student action only."); r.data.goal = b.goal; }
  else if (action === "support" || action === "intervene") {
    if ((action === "intervene") !== teacher) throw new Error("Action not permitted.");
    r.data.support.push({ id, kind: b.kind, conceptId: b.conceptId || "", note: b.note, reply: "", status: "Open", by: teacher ? "teacher" : "student", at });
  } else if (action === "respond") {
    const item = r.data.support.find(x => x.id === b.supportId);
    if (!item || (!teacher && item.by !== "teacher")) throw new Error("Action not permitted.");
    item.reply = b.reply; item.status = teacher ? b.status : "Resolved"; if (item.status === "Resolved") item.resolvedAt = at;
  } else if (action === "review") {
    if (!teacher) throw new Error("Professor review only.");
    const a = r.data.attempts.find(a => a.id === b.attemptId);
    if (!a || r.data.attempts.find(p => p.activityId === a.activityId)?.id !== a.id) throw new Error("Review the first attempt only.");
    for (const conceptId of a.conceptIds) {
      const prior = r.data.signals.filter(s => s.source === a.activityId && s.conceptId === conceptId).at(-1);
      r.data.signals.push({ id: `${id}-${conceptId}`, conceptId, at, correct: b.demonstrated, strength: 0.8, source: a.activityId, rationale: b.rationale, confidence: a.confidence, modality: "Professor review", supersedes: prior?.id });
    }
  } else throw new Error("Unknown learning action.");
  r.version = (old?.version || 0) + 1; r.updated_at = at;
  all = [...all.filter(x => x.id !== r.id), r];
  sessionStorage.setItem(KEY, JSON.stringify(all)); return r;
}
