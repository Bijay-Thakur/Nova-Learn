import { z } from "zod";
import type { Course, CourseData, Demonstration } from "./course-domain";

const id = z.string().min(1).max(100);
export const conceptSchema = z.object({ id, name: z.string().min(2).max(120), moduleId: id, objectiveIds: z.array(id).min(1).max(15), prerequisites: z.array(id).max(30) });
export const activitySchema = z.object({
  id, moduleId: id, title: z.string().min(3).max(200),
  kind: z.enum(["Diagnostic", "Pulse check", "Exit ticket", "Practice", "Spaced review"]),
  conceptIds: z.array(id).min(1).max(6), question: z.string().min(10).max(3000),
  options: z.array(z.string().min(1).max(600)).min(2).max(6),
  answer: z.number().int().min(0).max(5).optional(),
  explanation: z.string().max(2500).default(""),
  difficulty: z.enum(["Foundation", "Core", "Challenge"]),
  sourceIds: z.array(id).max(20).default([]), approved: z.boolean().default(false),
});
export const learningConfigSchema = z.object({
  weeks: z.number().int().min(1).max(52).default(12),
  hoursPerWeek: z.number().min(1).max(40).default(6),
  checkpointEvery: z.number().int().min(1).max(12).default(3),
  teachingIntent: z.string().max(2000).default("Build transferable understanding through explanation, practice, and application."),
  concepts: z.array(conceptSchema).max(200), releasedModuleIds: z.array(id).max(30),
  activities: z.array(activitySchema).max(160),
});
export type Concept = z.infer<typeof conceptSchema>;
export type Activity = z.infer<typeof activitySchema>;
export type LearningConfig = z.infer<typeof learningConfigSchema>;
export type Signal = { id: string; conceptId: string; at: string; correct: boolean; strength: number; source: string; rationale: string; confidence: number; modality: "Quick check" | "Professor review"; supersedes?: string };
export type Attempt = { id: string; activityId: string; activityTitle: string; courseVersion: number; selected: number; answerText: string; explanation: string; confidence: number; hints: boolean; at: string; correct: boolean; feedback: string; conceptIds: string[]; elapsedSeconds: number; reflection?: string };
export type Support = { id: string; kind: "Practice" | "Reteach" | "Office hours" | "Question"; conceptId: string; note: string; reply: string; status: "Open" | "Resolved"; at: string; by: "student" | "teacher"; resolvedAt?: string };
export type LearningRecord = { id: string; course_id: string; student_id: string; version: number; data: { attempts: Attempt[]; signals: Signal[]; support: Support[]; goal: string }; updated_at: string };
export type Mastery = { conceptId: string; probability: number; count: number; label: "Strong" | "Developing" | "Needs practice" | "Insufficient evidence"; uncertainty: string; dueAt: string | null; history: { at: string; before: number; after: number; signal: Signal }[] };
export const BKT = Object.freeze({ prior: 0.25, learn: 0.12, slip: 0.12, guess: 0.25, version: "weighted-bkt-1" });
export function learningConfig(data: CourseData): LearningConfig {
  if (data.learning) return data.learning;
  const concepts = data.modules.flatMap(m => m.concepts.map((name, i) => ({ id: `${m.id}-concept-${i + 1}`, name, moduleId: m.id, objectiveIds: m.objectiveIds, prerequisites: [] as string[] })));
  for (const c of concepts) c.prerequisites = concepts.filter(p => data.modules.find(m => m.id === c.moduleId)!.prerequisites.includes(p.moduleId)).map(p => p.id);
  return { weeks: Math.max(12, ...data.modules.map(m => m.week)), hoursPerWeek: 6, checkpointEvery: 3, teachingIntent: "Build transferable understanding through explanation, practice, and application.", concepts, releasedModuleIds: data.modules.map(m => m.id), activities: [] };
}
export function validateLearning(data: CourseData) {
  const l = learningConfigSchema.parse(learningConfig(data));
  const ids = new Set(l.concepts.map(c => c.id)), modules = new Set(data.modules.map(m => m.id)), objectives = new Set(data.objectives.map(o => o.id));
  if (ids.size !== l.concepts.length) throw new Error("Concept IDs must be unique.");
  if (l.releasedModuleIds.some(id => !modules.has(id))) throw new Error("Release rules refer to an unknown module.");
  for (const c of l.concepts) {
    if (!modules.has(c.moduleId) || c.objectiveIds.some(id => !objectives.has(id))) throw new Error("Concepts must belong to a module and valid objectives.");
    if (c.prerequisites.some(p => !ids.has(p) || p === c.id)) throw new Error("Choose valid concept prerequisites.");
  }
  const active = new Set<string>(), done = new Set<string>();
  const visit = (id: string) => { if (active.has(id)) throw new Error("Concept prerequisites must not form a cycle."); if (done.has(id)) return; active.add(id); l.concepts.find(c => c.id === id)!.prerequisites.forEach(visit); active.delete(id); done.add(id); };
  l.concepts.forEach(c => visit(c.id));
  if (new Set(l.activities.map(a => a.id)).size !== l.activities.length) throw new Error("Activity IDs must be unique.");
  const chunks = new Set(data.sources.filter(s => s.approved).flatMap(s => s.chunks.map(c => c.id)));
  for (const a of l.activities) {
    if (!modules.has(a.moduleId) || a.conceptIds.some(c => !ids.has(c) || l.concepts.find(x => x.id === c)?.moduleId !== a.moduleId)) throw new Error("Quick checks must map to concepts in their module.");
    if (a.approved && (a.answer === undefined || a.answer >= a.options.length)) throw new Error("An approved quick check needs a valid answer key.");
    if (a.sourceIds.some(id => !chunks.has(id))) throw new Error("Quick checks may only cite approved sources.");
  }
  return l;
}
export const isReleased = (data: CourseData, moduleId: string) => learningConfig(data).releasedModuleIds.includes(moduleId);
export function publicLearning(data: CourseData) {
  const l = validateLearning(data);
  return { ...l, activities: l.activities.filter(a => a.approved && l.releasedModuleIds.includes(a.moduleId)).map(({ answer, explanation, ...a }) => ({ ...a, explanation: "" })) };
}
// Estimates, not grades or calibrated psychometric diagnoses. Missing evidence never counts as failure.
export function mastery(conceptId: string, signals: Signal[]): Mastery {
  const superseded = new Set(signals.map(s => s.supersedes).filter(Boolean));
  const seen = new Set<string>();
  const events = signals.filter(s => s.conceptId === conceptId && !superseded.has(s.id)).sort((a, b) => a.at.localeCompare(b.at)).filter(s => { if (seen.has(s.id)) return false; seen.add(s.id); return s.strength > 0; });
  let p: number = BKT.prior;
  const history: Mastery["history"] = [];
  for (const signal of events) {
    const before = p;
    const posterior = signal.correct ? p * (1 - BKT.slip) / (p * (1 - BKT.slip) + (1 - p) * BKT.guess) : p * BKT.slip / (p * BKT.slip + (1 - p) * (1 - BKT.guess));
    const strength = Math.min(1, Math.max(0, signal.strength));
    p = Math.min(0.99, Math.max(0.01, p + strength * (posterior - p) + (1 - posterior) * BKT.learn * strength));
    history.push({ at: signal.at, before, after: p, signal });
  }
  const count = events.length, last = events.at(-1);
  const independent = new Set(events.map(s => s.source)).size;
  const strong = p >= 0.8 && count >= 3 && independent >= 2;
  return { conceptId, probability: p, count, label: count < 2 ? "Insufficient evidence" : strong ? "Strong" : p >= 0.45 ? "Developing" : "Needs practice", uncertainty: count < 3 || independent < 2 ? "Limited evidence; collect a different task before concluding." : "Model estimate, not a grade. Confirm with application and discussion.", dueAt: last ? new Date(Date.parse(last.at) + (strong ? 7 : p >= 0.45 ? 3 : 1) * 86400000).toISOString() : null, history };
}
export function reviewSignals(course: Course, demos: Demonstration[], studentId: string): Signal[] {
  const concepts = learningConfig(course.data).concepts;
  return demos.filter(d => d.course_id === course.id && d.student_id === studentId && d.status === "reviewed" && d.data.review && d.data.review.decision !== "request_revision").flatMap(d => concepts.flatMap(c => {
    const findings = d.data.review!.findings.filter(f => c.objectiveIds.includes(f.objectiveId) && f.evidenceIds.length > 0 && f.level !== "Needs verification");
    if (!findings.length) return [];
    // One conservative event per bundle/concept, not one per correlated rubric row.
    const correct = findings.every(f => f.level === "Strong");
    return [{ id: `review-${d.id}-${c.id}`, conceptId: c.id, at: d.data.review!.at, correct, strength: findings.some(f => f.confidence === "Low") ? 0.35 : 0.75, source: d.id, rationale: findings.map(f => f.rationale).join(" "), confidence: 0, modality: "Professor review" as const }];
  }));
}
export function studentMastery(course: Course, record: LearningRecord | undefined, demos: Demonstration[], studentId = record?.student_id || "") {
  const signals = [...(record?.data.signals || []), ...reviewSignals(course, demos, studentId)];
  return learningConfig(course.data).concepts.map(c => mastery(c.id, signals));
}
export function recommend(course: Course, states: Mastery[], now = Date.now()) {
  const l = learningConfig(course.data), available = l.concepts.filter(c => l.releasedModuleIds.includes(c.moduleId));
  const ranked = available.map(c => ({ c, m: states.find(s => s.conceptId === c.id) || mastery(c.id, []) })).sort((a, b) => (a.m.count === 0 ? -1 : a.m.probability) - (b.m.count === 0 ? -1 : b.m.probability));
  let target = ranked[0];
  if (!target) return null;
  const prerequisite = ranked.find(x => target.c.prerequisites.includes(x.c.id) && x.m.label !== "Strong");
  if (prerequisite) target = prerequisite;
  const { c, m } = target;
  const track = m.count < 2 ? "Discover" : m.label === "Strong" ? "Challenge" : m.probability < 0.45 ? "Support" : "Core";
  const due = m.dueAt && Date.parse(m.dueAt) <= now;
  return { concept: c, track, mode: m.count < 2 ? "Check" : due ? "Retrieve" : track === "Support" ? "Teach" : track === "Challenge" ? "Apply" : "Practice", reason: prerequisite ? "Strengthen this prerequisite before the next concept." : m.count < 2 ? "A short diagnostic will help us choose your starting point." : due ? "This concept is due for spaced review." : track === "Support" ? "Recent evidence suggests another worked example and guided practice." : track === "Challenge" ? "Try a new scenario to test transfer. The learning objective stays the same." : "Practice this concept, then explain your reasoning in your own words." };
}
export const attemptInputSchema = z.object({ activityId: id, publicationVersion: z.number().int(), selected: z.number().int().min(0).max(5), explanation: z.string().trim().min(10).max(3000), confidence: z.number().int().min(1).max(5), hints: z.boolean(), elapsedSeconds: z.number().int().min(0).max(7200), reflection: z.string().max(2000).default("") });
export function markAttempt(course: Course, input: z.infer<typeof attemptInputSchema>, previous: Attempt[], uid: string, at: string): { attempt: Attempt; signals: Signal[] } {
  const b = attemptInputSchema.parse(input), a = learningConfig(course.data).activities.find(a => a.id === b.activityId && a.approved && isReleased(course.data, a.moduleId));
  if (!a || a.answer === undefined) throw new Error("This check is not released or has no approved answer key.");
  if (course.version !== b.publicationVersion) throw new Error("The course release changed. Reload before submitting.");
  if (b.selected >= a.options.length) throw new Error("Choose an available answer.");
  const prior = previous.filter(p => p.activityId === a.id), correct = b.selected === a.answer;
  // Repeat exposure to a revealed key is practice, never additional mastery evidence.
  const strength = prior.length ? 0 : (b.hints ? 0.25 : a.difficulty === "Challenge" ? 0.7 : 0.55);
  const feedback = `${correct ? "Correct." : "Not yet."} ${a.explanation || "Discuss your reasoning with your professor."}${prior.length ? " Repeat practice: this does not add a second mastery signal." : " Your explanation is saved for professor review; it is not automatically scored."}`;
  return { attempt: { id: uid, activityId: a.id, activityTitle: a.title, courseVersion: course.version, selected: b.selected, answerText: a.options[b.selected], explanation: b.explanation, confidence: b.confidence, hints: b.hints, elapsedSeconds: b.elapsedSeconds, reflection: b.reflection, at, correct, feedback, conceptIds: a.conceptIds }, signals: a.conceptIds.map(conceptId => ({ id: `${uid}-${conceptId}`, conceptId, at, correct, strength, source: a.id, rationale: `${a.title}: ${correct ? "correct" : "incorrect"} selected answer. ${b.hints ? "Help disclosed; lower weight." : "Explanation requires human review."}`, confidence: b.confidence, modality: "Quick check" })) };
}
export function emptyRecord(courseId: string, studentId: string, id: string): LearningRecord { return { id, course_id: courseId, student_id: studentId, version: 1, data: { attempts: [], signals: [], support: [], goal: "" }, updated_at: new Date().toISOString() }; }
