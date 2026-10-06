import { NextResponse } from "next/server";
import { z } from "zod";
import { identity, sameOrigin, sb } from "@/lib/novalearn/server";
import { attemptInputSchema, emptyRecord, learningConfig, markAttempt, type LearningRecord } from "@/lib/novalearn/learning-domain";
import type { Course } from "@/lib/novalearn/course-domain";
export const runtime = "nodejs";
const uuid = z.string().uuid();
const text = z.string().trim().min(3).max(3000);
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const { profile, token } = await identity();
    const raw = await req.text();
    if (raw.length > 20000) throw new Error("Request too large.");
    const b = JSON.parse(raw), courseId = uuid.parse(b.courseId), teacher = profile.role === "teacher";
    const [course] = await sb(`/rest/v1/${teacher ? "nova_courses" : "nova_publications"}?id=eq.${courseId}&select=*`, {}, token) as Course[];
    if (!course || (teacher && course.teacher_id !== profile.id)) return NextResponse.json({ error: "Course access not permitted." }, { status: 403 });
    const rows: LearningRecord[] = await sb(`/rest/v1/nova_learning_records?course_id=eq.${courseId}&select=*&order=updated_at.desc`, {}, token);
    if (b.action === "load") {
      const versions = teacher ? await sb(`/rest/v1/nova_course_versions?course_id=eq.${courseId}&select=version,released_at&order=version.desc&limit=30`, {}, token) : [];
      return NextResponse.json({ records: rows, versions });
    }
    const studentId = teacher ? uuid.parse(b.studentId) : profile.id;
    // A teacher may target only an enrolled student in their own course.
    if (teacher) {
      const enrolled = await sb(`/rest/v1/enrollments?class_id=eq.${course.class_id}&student_id=eq.${studentId}&select=student_id`, {}, token);
      if (!enrolled.length) throw new Error("This student is not enrolled in the course class.");
    }
    const old = rows.find(r => r.student_id === studentId);
    if (old && old.version !== b.recordVersion) return NextResponse.json({ error: "Learning evidence changed in another session. Refresh and try again." }, { status: 409 });
    const record = structuredClone(old || emptyRecord(courseId, studentId, crypto.randomUUID()));
    const at = new Date().toISOString(), id = crypto.randomUUID();
    if (b.action === "attempt") {
      if (teacher) throw new Error("A student account is required to submit a check.");
      if (record.data.attempts.length >= 500) throw new Error("This course reached its 500-attempt pilot limit. Export records and start a new course version for the next semester.");
      // Resolve keys from the immutable release, never an unpublished draft or browser input.
      const [release] = await sb(`/rest/v1/nova_course_versions?course_id=eq.${courseId}&version=eq.${course.version}&select=snapshot`, {}, undefined, true);
      if (!release) throw new Error("Ask your professor to release this course with the adaptive-learning migration installed.");
      const marked = markAttempt(release.snapshot, attemptInputSchema.parse(b), record.data.attempts, id, at);
      record.data.attempts.push(marked.attempt); record.data.signals.push(...marked.signals);
    } else if (b.action === "goal") {
      if (teacher) throw new Error("Only students can edit their learning goal.");
      record.data.goal = text.parse(b.goal);
    } else if (b.action === "support" || b.action === "intervene") {
      if ((b.action === "intervene") !== teacher) throw new Error("Action not permitted for this account.");
      if (record.data.support.length >= 100) throw new Error("Support record limit reached for this course.");
      const kind = z.enum(["Practice", "Reteach", "Office hours", "Question"]).parse(b.kind), conceptId = z.string().max(100).parse(b.conceptId || "");
      if (conceptId && !learningConfig(course.data).concepts.some(c => c.id === conceptId)) throw new Error("Unknown concept.");
      record.data.support.push({ id, kind, conceptId, note: text.parse(b.note), reply: "", status: "Open", by: teacher ? "teacher" : "student", at });
    } else if (b.action === "respond") {
      const item = record.data.support.find(s => s.id === b.supportId);
      if (!item) throw new Error("Support request not found.");
      if (teacher) { item.reply = text.parse(b.reply); item.status = z.enum(["Open", "Resolved"]).parse(b.status); }
      else { if (item.by !== "teacher") throw new Error("Your professor will resolve this request."); item.reply = text.parse(b.reply); item.status = "Resolved"; }
      if (item.status === "Resolved") item.resolvedAt = at;
    } else if (b.action === "review") {
      if (!teacher) throw new Error("Only the professor can review explanation evidence.");
      const a = record.data.attempts.find(a => a.id === b.attemptId);
      if (!a) throw new Error("Attempt not found.");
      if (record.data.attempts.find(p => p.activityId === a.activityId)?.id !== a.id) throw new Error("Review the first attempt; repeated answer-key exposure is practice only.");
      const correct = z.boolean().parse(b.demonstrated), rationale = text.parse(b.rationale);
      for (const conceptId of a.conceptIds) {
        const prior = record.data.signals.filter(s => s.source === a.activityId && s.conceptId === conceptId).at(-1);
        record.data.signals.push({ id: `${id}-${conceptId}`, conceptId, at, correct, strength: 0.8, source: a.activityId, rationale, confidence: a.confidence, modality: "Professor review", supersedes: prior?.id });
      }
    } else throw new Error("Unknown learning action.");
    record.updated_at = at;
    if (old) {
      const updated = await sb(`/rest/v1/nova_learning_records?id=eq.${old.id}&version=eq.${old.version}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ data: record.data, updated_at: at, version: old.version + 1 }) }, undefined, true);
      if (!updated.length) return NextResponse.json({ error: "Learning evidence changed in another session. Refresh and try again." }, { status: 409 });
      return NextResponse.json(updated[0]);
    }
    const added = await sb("/rest/v1/nova_learning_records", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(record) }, undefined, true);
    return NextResponse.json(added[0]);
  } catch (e) {
    const message = e instanceof z.ZodError ? "Please complete all fields with valid values." : (e as Error).message;
    return NextResponse.json({ error: message }, { status: message.includes("sign in") ? 401 : 400 });
  }
}
