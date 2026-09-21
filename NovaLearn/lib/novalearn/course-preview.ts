import { clientId } from "./client-id";
import { createAssessmentDesign, runAssessmentStage, resetAssessmentFrom, assessmentStages, approveAssessment, validateAuthenticPublication, reconcileAssessmentEdits, assessmentContextFingerprint, assignAssessmentVariant } from "./assessment-engine";
import { runCompilerJob, compilerIssues, nextCompilerJob, reviewFingerprint } from "./course-compiler";
import { learningConfig, validateLearning } from "./learning-domain";
import { saveAnswers } from "./evidence";
import { previewData } from "./preview";
import { sampleCourse, sampleDemonstrations } from "./course-sample";
import {
  blankCourse,
  chunkText,
  publishable,
  validateGraph,
  validateCheckpoint,
  canSubmit,
  type Course,
  type Demonstration,
} from "./course-domain";
const KEY = "novalearn-course-os-preview-v2";
export function readCoursePreview() {
  let value;
  try {
    value = JSON.parse(sessionStorage.getItem(KEY) || "null");
  } catch {}
  if (!value) {
    const c = sampleCourse();
    value = {
      courses: [c],
      publications: [{...structuredClone(c), data: publishable(c)}],
      versions: [structuredClone(c)],
      demonstrations: sampleDemonstrations(c),
    };
  }
  return value as {
    courses: Course[];
    publications: Course[];
    demonstrations: Demonstration[];
    versions?: Course[];
  };
}
function store(value: ReturnType<typeof readCoursePreview>) {
  sessionStorage.setItem(KEY, JSON.stringify(value));
}
export async function coursePreview(action: string, b: any = {}) {
  const s = readCoursePreview(),
    profile = previewData().profile,
    now = new Date().toISOString(),
    id = () => clientId();
  const c = s.courses.find((c) => c.id === b.courseId);
  const d = s.demonstrations.find((d) => d.id === b.id);
  const teacher = () => {
    if (profile.role !== "teacher")
      throw new Error("Switch to Professor to use this panel.");
  };
  if (action === "load")
    return {
      courses: profile.role === "teacher" ? s.courses : s.publications,
      demonstrations:
        profile.role === "teacher"
          ? s.demonstrations
          : s.demonstrations.filter((d) => d.student_id === profile.id),
      routing: {
        draft: "Example generator",
        dialogue: "Scripted guide",
        judge: "Example evidence synthesis",
        retrieval: "Keyword retrieval (preview)",
      },
    };
  if (action === "create") {
    teacher();
    const row: Course = {
      id: id(),
      title: b.title,
      class_id: b.classId || null,
      teacher_id: profile.id,
      data: blankCourse(),
      version: 1,
      updated_at: now,
    };
    s.courses.push(row);
    store(s);
    return row;
  }
  if (action === "save") {
    teacher();
    if (!c) throw new Error("Course not found");
    if (c.version !== b.version)
      throw new Error("This course changed. Reload before saving.");
    reconcileAssessmentEdits(b.data,c.data);
    if (JSON.stringify([b.data.modules,b.data.objectives,b.data.learning?.concepts]) !== JSON.stringify([c.data.modules,c.data.objectives,c.data.learning?.concepts]) && !b.approveGraph) b.data.graphApproved=false;
    if (b.approveGraph) b.data.graphApproved = true;
    if (b.data.graphApproved) validateGraph(b.data);
    if (b.data.learning) validateLearning(b.data);
    if(b.data.compiler&&reviewFingerprint(b.data)!==reviewFingerprint(c.data))b.data.compiler.reviewed=false;
    c.title = b.title;
    c.class_id = b.classId || null;
    b.data.revision = c.data.revision + 1;
    b.data.audit = [...c.data.audit.slice(-99),{at:now,action:b.approveGraph?"Professor approved course graph":"Professor saved course draft"}];
    c.data = b.data;
    c.version++;
    c.updated_at = now;
    store(s);
    return c;
  }
  if (action === "duplicate") {
    teacher(); if(!c)throw new Error("Course not found.");
    const row=structuredClone(c);row.id=id();row.class_id=null;row.title=`${c.title} · New semester`;row.version=1;row.data.revision=1;row.data.graphApproved=false;row.updated_at=now;row.data.audit=[{at:now,action:"Reused course template"}];if(row.data.learning)row.data.learning.releasedModuleIds=[];row.data.checkpoints.forEach(a=>a.published=false);s.courses.push(row);store(s);return row;
  }
  if(["assessment-create","assessment-step","assessment-reset","assessment-approve"].includes(action)){
    teacher();if(!c)throw new Error("Course not found.");if(c.version!==b.version)throw new Error("This course changed. Reload before saving.");
    if(action==="assessment-create")c.data.assessmentDesigns=[...(c.data.assessmentDesigns||[]),createAssessmentDesign(c.data,b.inputs,id(),id())];
    else if(action==="assessment-step")c.data=await runAssessmentStage(c.data,b.designId,b.key);
    else if(action==="assessment-approve")c.data=approveAssessment(c.data,b.designId);
    else {const d=c.data.assessmentDesigns?.find(d=>d.id===b.designId),key=assessmentStages.find(s=>s.key===b.key)?.key;if(!d||!key)throw new Error("Assessment stage not found.");const reset=resetAssessmentFrom(d,key);if(key==="evidence")reset.contextFingerprint=assessmentContextFingerprint(c.data,reset.inputs);c.data.assessmentDesigns=c.data.assessmentDesigns!.map(x=>x.id===d.id?reset:x);c.data.checkpoints.forEach(cp=>{if(cp.id===d.checkpointId)cp.published=false;});}
    c.version++;c.data.revision++;c.updated_at=now;store(s);return c;
  }
  if(action==="compiler-step"){
    teacher();if(!c)throw new Error("Course not found.");
    if(c.version!==b.version)throw new Error("This course changed. Reload before saving.");
    c.data=await runCompilerJob(c.data,b.key);c.version++;c.updated_at=now;store(s);return c;
  }
  if (action === "release") {
    teacher();
    if (!c) throw new Error("Course not found");
    if(c.data.compiler){if(nextCompilerJob(c.data))throw new Error("Finish the compiler pipeline first.");const errors=compilerIssues(c.data).filter(x=>x.level==="error");if(errors.length)throw new Error(errors.map(x=>x.text).join(" "));}
    const data = publishable(c);
    validateAuthenticPublication(c.data);
    s.publications = s.publications.filter((p) => p.id !== c.id);
    s.publications.push({ ...structuredClone(c), data });
    s.versions = [...(s.versions || []).filter(v => v.id !== c.id || v.version !== c.version), structuredClone(c)];
    store(s);
    return { ok: true };
  }
  if (action === "graph") {
    teacher();
    const sample = sampleCourse();
    return {
      objectives: sample.data.objectives,
      modules: sample.data.modules,
      notice:
        "Example graph. Edit it to fit your syllabus; live generation requires a configured model.",
    };
  }
  if (action === "material") {
    teacher();
    return {
      title: "Explain, apply, reflect",
      content: `Example teaching-material template\n\nLearning objectives\n${b.objectives.map((o: any) => o.title).join("\n")}\n\nCore explanation\nUse the approved course source below as the basis for your explanation.\n\n${
        c?.data.sources
          .filter((x) => x.approved)
          .map((x) => x.text.slice(0, 1200))
          .join("\n\n") || "Add an approved source in Course Architect."
      }\n\nActivity\nAsk students to compare two explanations and identify the evidence that supports each.\n\nReflection\nWhat would change your conclusion?`,
      sourceIds:
        c?.data.sources
          .filter((x) => x.approved)
          .flatMap((x) => x.chunks.slice(0, 1).map((c) => c.id)) || [],
    };
  }
  if (action === "quick-check") {
    teacher();
    if (!c) throw new Error("Save the course first.");
    const l = learningConfig(c.data), concepts = l.concepts.filter(x => x.moduleId === b.moduleId);
    if (!concepts.length) throw new Error("No concepts in this module.");
    const sample = l.activities.find(a => a.moduleId === b.moduleId);
    if (sample) return {...sample, id:id(), title:`Draft: ${sample.title}`, approved:false};
    return {id:id(),moduleId:b.moduleId,title:"Example template · edit before release",kind:"Pulse check",conceptIds:[concepts[0].id],question:"Which response is best supported by the approved course source? Replace these options with a specific scenario.",options:["A claim with no evidence","A claim that matches the source and its scope","A plausible but unverified claim"],answer:1,explanation:"Match a claim to supporting evidence and check its scope. This is an example template, not an AI-generated subject-specific check.",difficulty:"Core",sourceIds:[],approved:false};
  }
  if (action === "checkpoint") {
    teacher();
    const objectiveIds = b.objectives.map((o: any) => o.id);
    const weight = Math.floor(100 / objectiveIds.length);
    return {
      title: "Explain and defend your reasoning",
      prompt: `Submit a worked response that demonstrates: ${b.objectives.map((o: any) => o.title).join("; ")}. Include evidence or a concrete example and explain your choices.`,
      rubric: b.objectives.map((o: any, i: number) => ({
        objectiveId: o.id,
        criterion: o.title,
        weight: i === 0 ? 100 - weight * (objectiveIds.length - 1) : weight,
        descriptor:
          "Demonstrates the objective with a correct explanation, concrete evidence, and awareness of limitations.",
      })),
      followupStrategy:
        "Probe one claim and one assumption from the submitted explanation.",
      transferPrompt:
        "Now change one important assumption in your example. Explain what changes in your solution and what remains valid.",
    };
  }
  if (action === "begin") {
    const published = s.publications.find((x) => x.id === b.courseId);
    const publishedCheckpoint = published?.data.checkpoints.find((x) => x.id === b.checkpointId);
    if (!publishedCheckpoint || !published)
      throw new Error("Publish the checkpoint before starting.");
    const cp=assignAssessmentVariant(publishedCheckpoint,profile.id);
    const existing = s.demonstrations.find(
      (x) =>
        x.course_id === b.courseId &&
        x.checkpoint_id === cp.id &&
        x.student_id === profile.id,
    );
    if (existing) return existing;
    const row: Demonstration = {
      id: id(),
      course_id: published.id,
      student_id: profile.id,
      checkpoint_id: cp.id,
      version: 1,
      status: "draft",
      created_at: now,
      snapshot: {
        publicationVersion:published.version,
        checkpoint: structuredClone(cp),
        objectives: published.data.objectives.filter((o) =>
          cp.objectiveIds.includes(o.id),
        ),
        courseTitle: published.title,
        revision: published.data.revision,
      },
      data: {
        evidence: [],
        questions: [],
        disclosure: "",
        helpUsed: "",
        events: [],
        evaluation: null,
        review: null,
      },
    };
    s.demonstrations.push(row);
    store(s);
    return row;
  }
  if (action === "evidence") {
    if (!d) throw new Error("Demonstration not found");
    if (["submitted", "reviewed"].includes(d.status))
      throw new Error("This submission is locked.");
    saveAnswers(d, b);
    d.version++;
    store(s);
    return d;
  }
  if (action === "followups") {
    if (!d) throw new Error("Demonstration not found");
    if (d.data.questions.length) return d;
    d.data.questions = d.snapshot.checkpoint.objectiveIds
      .slice(0, 2)
      .map((o, i) => ({
        id: "q" + i,
        prompt:
          i === 0
            ? "Choose one claim in your submission. What evidence supports it, and why?"
            : "Which assumption in your explanation is most fragile? Give a counterexample.",
        objectiveIds: [o],
      }));
    d.status = "followup";
    d.data.events.push({
      at: now,
      action: "Scripted preview follow-ups generated",
    });
    d.version++;
    store(s);
    return d;
  }
  if (action === "submit") {
    if (!d) throw new Error("Demonstration not found");
    canSubmit(d);
    d.status = "submitted";
    d.data.review = null;
    d.data.evaluation = {
      source: "Example only",
      summary:
        "Preview evidence bundle. This demonstrates the review workflow; the content has not been assessed by a live model.",
      findings: d.snapshot.checkpoint.objectiveIds.map((o) => ({
        objectiveId: o,
        level: "Needs verification",
        confidence: "Low",
        rationale:
          "Professor review is needed; this preview does not judge your response.",
        evidenceIds: d.data.evidence
          .filter((e) => e.objectiveIds.includes(o))
          .map((e) => e.id),
        uncertainty: "No live assessment has been performed.",
      })),
      misconceptions: [],
      nextSteps: ["Open this bundle in Professor → Evidence Review."],
    };
    d.data.events.push({ at: now, action: "Evidence bundle submitted" });
    d.version++;
    store(s);
    return d;
  }
  if (action === "review") {
    teacher();
    if (!d) throw new Error("Demonstration not found");
    if (b.review.decision === "request_revision")
      d.data.revisions = [
        ...(d.data.revisions || []).slice(-9),
        {
          at: now,
          evidence: structuredClone(d.data.evidence),
          evaluation: structuredClone(d.data.evaluation),
          review: structuredClone(b.review),
        },
      ];
    d.data.review = { ...b.review, at: now };
    d.status =
      b.review.decision === "request_revision"
        ? "revision_requested"
        : "reviewed";
    d.data.events.push({ at: now, action: "Professor " + b.review.decision });
    d.version++;
    store(s);
    return d;
  }
  if (action === "chat")
    return {
      reply:
        "Preview guide: explain the idea in your own words, connect it to the course source, then give a case where your explanation would fail. This response is scripted.",
      citations:
        c?.data.sources
          .filter((s) => s.approved)
          .flatMap((s) =>
            s.chunks
              .slice(0, 1)
              .map((x) => ({ id: x.id, name: s.name, text: x.text })),
          ) || [],
      routing: "Scripted preview",
    };
  throw new Error("Preview action unavailable.");
}
