import { z } from "zod";
import { learningConfigSchema, publicLearning, isReleased } from "./learning-domain";
import { approvedChapter } from "./content-integrity";

const id = z.string().min(1).max(100);
export const compilerInputSchema = z.object({
  courseTitle:z.string().min(3).max(200).optional(),
  code: z.string().trim().min(2).max(40),
  level: z.enum(["Introductory", "Intermediate", "Advanced", "Graduate"]),
  weeks: z.number().int().min(1).max(52),
  hoursPerWeek: z.number().min(0.5).max(40),
  moduleCount: z.number().int().min(1).max(12),
  checkpointCount: z.number().int().min(1).max(8),
  intent: z.string().trim().min(20).max(4000),
  prerequisites: z.string().max(2000),
  breakWeeks: z.array(z.number().int().min(1).max(52)).max(20),
  startDate: z.string().regex(/^$|^\d{4}-\d{2}-\d{2}$/),
  assessmentWeights: z.object({assignments:z.number().int().min(0).max(100),checkpoints:z.number().int().min(0).max(100),final:z.number().int().min(0).max(100)}),
  description: z.string().max(4000).optional(),
  targetLearners: z.string().max(2000).optional(),
  meetingPattern: z.string().max(1000).optional(),
  independentHoursPerWeek: z.number().min(0).max(80).optional(),
  endDate: z.string().regex(/^$|^\d{4}-\d{2}-\d{2}$/).optional(),
  explicitOutcomes: z.array(z.string().min(3).max(500)).max(15).optional(),
  requiredTopics: z.array(z.string().min(2).max(120)).max(30).optional(),
  optionalTopics: z.array(z.string().min(2).max(120)).max(30).optional(),
  institutionalConstraints: z.string().max(4000).optional(),
});
export const compilerSchema = z.object({
  inputs: compilerInputSchema,
  intent: z.object({summary:z.string().max(4000),priorities:z.array(z.string().max(500)).max(10)}).optional(),
  sourceMap: z.array(z.object({sourceId:id,name:z.string().max(180),chunks:z.number().int(),characters:z.number().int()})).default([]),
  schedule: z.array(z.object({moduleId:id,weeks:z.array(z.number().int()),hours:z.number(),checkpoint:z.boolean()})).max(30).default([]),
  log: z.array(z.object({key:z.string().max(150),status:z.enum(["complete","failed"]),at:z.string(),ms:z.number(),routing:z.string().max(200),detail:z.string().max(1000)})).max(80).default([]),
  reviewed: z.boolean().default(false),
  analysis:z.object({at:z.string(),method:z.literal("lexical-and-structural-v1"),coverage:z.array(z.object({objectiveId:id,sourceIds:z.array(id),moduleIds:z.array(id)})),issues:z.array(z.string()),researchQuestions:z.array(z.object({id,question:z.string(),reason:z.string(),status:z.literal("proposed")})).max(5)}).optional(),
});
export const objectiveSchema = z.object({
  id,
  title: z.string().min(3).max(500),
  level: z
    .enum(["Understand", "Apply", "Analyze", "Evaluate", "Create"])
    .default("Apply"),
});
export const moduleSchema = z.object({
  id,
  title: z.string().min(2).max(200),
  week: z.number().int().min(1).max(52),
  concepts: z.array(z.string().max(120)).max(20),
  objectiveIds: z.array(id).min(1).max(15),
  prerequisites: z.array(id).max(20),
  sourceIds:z.array(id).max(20).optional(),
});
export const graphSchema = z.object({
  objectives: z.array(objectiveSchema).min(1).max(30),
  modules: z.array(moduleSchema).min(1).max(30),
});
export const sourceSchema = z.object({
  id,
  name: z.string().min(1).max(180),
  text: z.string().min(10).max(100000),
  approved: z.boolean(),
  moduleIds: z.array(id).max(30).optional(),
  chunks: z
    .array(
      z.object({
        id,
        text: z.string().max(2000),
        page: z.number().optional(),
        vector: z.array(z.number()).max(4096).optional(),
      }),
    )
    .max(100),
});
export const materialSchema = z.object({
  id,
  moduleId: id,
  title: z.string().min(2).max(200),
  kind: z.enum(["Lecture notes", "Worked example", "Practice", "Discussion"]),
  content: z.string().min(10).max(25000),
  sourceIds: z.array(id).max(20),
  approved: z.boolean(),
});
// Additive JSONB extension: old courses retain their plain-text materials.
// All representations render these blocks; no parallel textbook/slide facts.
export const contentBlockSchema = z.object({
  id, topicId:id, subtopicId:id.optional(), objectiveIds:z.array(id).min(1).max(15),
  kind:z.enum(["explanation","definition","worked-example","equation","code","diagram","image","table","callout","case-study","question","reference","deeper-reading"]),
  title:z.string().min(2).max(200), text:z.string().min(1).max(6000),
  sourceIds:z.array(id).max(10),
  language:z.string().max(40).optional(), alt:z.string().max(1000).optional(),
  rows:z.array(z.array(z.string().max(500)).max(10)).max(30).optional(),
  nodes:z.array(z.object({id,label:z.string().max(150)})).max(20).optional(),
  edges:z.array(z.object({from:id,to:id})).max(30).optional(),
});
export const chapterSchema = z.object({
  id,moduleId:id,title:z.string().min(2).max(200),purpose:z.string().max(1000),
  objectiveIds:z.array(id).min(1).max(15), prerequisiteModuleIds:z.array(id).max(20),
  minutes:z.number().int().min(1).max(10000),depth:z.string().max(120),
  topics:z.array(z.object({id,title:z.string().min(2).max(200),objectiveIds:z.array(id).min(1).max(15),subtopics:z.array(z.object({id,title:z.string().min(2).max(200)})).max(20)})).min(1).max(20),
  blocks:z.array(contentBlockSchema).max(60),sourceIds:z.array(id).max(20),
  status:z.enum(["outline","draft","approved","stale"]),locked:z.boolean().default(false),
  contextFingerprint:z.string().max(100),approvedFingerprint:z.string().max(100).optional(),
  version:z.number().int().min(1),updatedAt:z.string(),
  generation:z.object({mode:z.enum(["live","demo","professor"]),provider:z.string().max(200),promptVersion:z.string().max(100),ms:z.number().min(0)}).optional(),
  quality:z.array(z.string().max(1000)).max(20).optional(),
});
export type Chapter=z.infer<typeof chapterSchema>;
export type ContentBlock=z.infer<typeof contentBlockSchema>;
export const rubricSchema = z.object({
  objectiveId: id,
  criterion: z.string().min(3).max(500),
  weight: z.number().int().min(1).max(100),
  descriptor: z.string().min(3).max(1200),
});
export const assessmentInputSchema = z.object({
  moduleId: id, objectiveIds: z.array(id).min(1).max(8),
  category: z.enum(["Assignment", "Checkpoint", "Final project", "Teach Nova"]),
  format: z.enum(["Case study", "Design challenge", "Data investigation", "Teach Nova", "Applied problem"]),
  emphasis: z.string().trim().min(10).max(1500),
  duration: z.number().int().min(15).max(600),
  difficulty: z.enum(["Foundation", "Core", "Challenge"]),
  verification: z.enum(["Standard", "Extended"]),
  aiPolicy: z.enum(["No AI assistance", "Planning only; disclose use", "AI allowed; disclose and verify"]),
  collaboration: z.enum(["Individual", "Group artifact; individual defense"]),
  resources: z.string().max(2000), knowledgeQuestions: z.number().int().min(0).max(5),
});
export const assessmentEvidenceSchema = z.object({objectiveId:id, observable:z.string().min(10).max(1000), artifact:z.string().min(10).max(1000), reasoning:z.string().min(10).max(1000), transfer:z.string().min(10).max(1000)});
export const assessmentTaskSchema = z.object({title:z.string().min(3).max(200),scenario:z.string().min(20).max(4000),instructions:z.string().min(20).max(5000),sourceIds:z.array(id).max(5),tasks:z.array(z.object({id,objectiveIds:z.array(id).min(1).max(8),kind:z.enum(["Knowledge","Application","Explanation","Reflection"]),prompt:z.string().min(10).max(1800),minutes:z.number().int().min(1).max(600)})).min(3).max(16)});
export const assessmentLevelsSchema = z.object({objectiveId:id,excellent:z.string().min(10).max(1000),proficient:z.string().min(10).max(1000),developing:z.string().min(10).max(1000),beginning:z.string().min(10).max(1000)});
export const assessmentVerificationSchema = z.object({followupStrategy:z.string().min(15).max(2000),transferPrompt:z.string().min(20).max(2500),variants:z.array(z.object({id,label:z.string().min(3).max(120),change:z.string().min(15).max(1000)})).min(1).max(3),privateGuide:z.array(z.object({objectiveId:id,expectedReasoning:z.string().min(10).max(1500),misconceptions:z.string().min(10).max(1000),sufficientEvidence:z.string().min(10).max(1000)})).min(1).max(8)});
export const assessmentDesignSchema = z.object({
  id, checkpointId:id, inputs:assessmentInputSchema, contextFingerprint:z.string().max(250000),
  evidence:z.array(assessmentEvidenceSchema).max(8).optional(),
  strategy:z.object({rationale:z.string().min(20).max(2000),sequence:z.array(z.string().min(5).max(500)).min(3).max(8),accessibility:z.string().min(15).max(1500)}).optional(),
  task:assessmentTaskSchema.optional(),
  scoring:z.object({rubric:z.array(rubricSchema).min(1).max(8),levels:z.array(assessmentLevelsSchema).min(1).max(8)}).optional(),
  verification:assessmentVerificationSchema.optional(),
  alignment:z.object({summary:z.string().max(2000),issues:z.array(z.string().max(1000)).max(15)}).optional(),
  log:z.array(z.object({key:z.string(),status:z.enum(["complete","failed"]),at:z.string(),ms:z.number(),routing:z.string().max(200),detail:z.string().max(1000)})).max(12).default([]),
  validatedFingerprint:z.string().max(120000).optional(), approvedFingerprint:z.string().max(120000).optional(),
});
export const authenticPackageSchema = z.object({
  curriculum:z.object({fingerprint:z.string().max(100),chapterIds:z.array(id).max(90),materialIds:z.array(id).max(80),sourceIds:z.array(id).max(20)}).optional(),
  designId:id, inputs:assessmentInputSchema, evidence:z.array(assessmentEvidenceSchema).min(1).max(8),
  strategy:z.object({rationale:z.string(),sequence:z.array(z.string()),accessibility:z.string()}),
  scenario:z.string(), tasks:assessmentTaskSchema.shape.tasks, sourceIds:z.array(id).max(5),
  levels:z.array(assessmentLevelsSchema).min(1).max(8),
  variants:assessmentVerificationSchema.shape.variants,
  assignedVariant:z.object({id,label:z.string(),change:z.string()}).optional(),
});
export type AssessmentDesign = z.infer<typeof assessmentDesignSchema>;
export type AssessmentInput = z.infer<typeof assessmentInputSchema>;
export const checkpointSchema = z.object({
  id,
  authentic: authenticPackageSchema.optional(),
  category: z.enum(["Assignment", "Checkpoint", "Final project", "Teach Nova"]).optional(),
  points: z.number().int().min(1).max(1000).optional(),
  title: z.string().min(3).max(200),
  moduleId: id,
  objectiveIds: z.array(id).min(1).max(10),
  prompt: z.string().min(20).max(6000),
  rubric: z.array(rubricSchema).min(1).max(10),
  followupStrategy: z.string().min(10).max(2000),
  transferPrompt: z.string().min(15).max(2500),
  dueAt: z.string().max(50).default(""),
  published: z.boolean().default(false),
});
export const courseDataSchema = z.object({
  chapters:z.array(chapterSchema).max(90).optional(),
  assessmentDesigns:z.array(assessmentDesignSchema).max(40).optional(),
  compiler: compilerSchema.optional(),
  learning: learningConfigSchema.optional(),
  syllabus: z.string().max(100000),
  objectives: z.array(objectiveSchema).max(30),
  modules: z.array(moduleSchema).max(30),
  sources: z.array(sourceSchema).max(20),
  materials: z.array(materialSchema).max(80),
  checkpoints: z.array(checkpointSchema).max(40),
  graphApproved: z.boolean(),
  revision: z.number().int().min(1),
  audit: z
    .array(z.object({ at: z.string(), action: z.string().max(250) }))
    .max(100),
});
export type Objective = z.infer<typeof objectiveSchema>;
export type Module = z.infer<typeof moduleSchema>;
export type Material = z.infer<typeof materialSchema>;
export type Source = z.infer<typeof sourceSchema>;
export type Checkpoint = z.infer<typeof checkpointSchema>;
export type CourseData = z.infer<typeof courseDataSchema>;
export type Course = {
  id: string;
  teacher_id: string;
  class_id: string | null;
  title: string;
  data: CourseData;
  version: number;
  updated_at: string;
};
export type EvidenceItem = {
  id: string;
  kind: "artifact" | "explanation" | "followup" | "transfer" | "reflection";
  prompt: string;
  answer: string;
  at: string;
  objectiveIds: string[];
};
export type Finding = {
  objectiveId: string;
  level: "Strong" | "Developing" | "Needs verification";
  confidence: "Low" | "Medium" | "High";
  rationale: string;
  evidenceIds: string[];
  uncertainty: string;
};
export type Evaluation = {
  summary: string;
  findings: Finding[];
  misconceptions: string[];
  nextSteps: string[];
  source: "AI suggestion" | "Example only";
  routing?: string;
};
export type Demonstration = {
  id: string;
  course_id: string;
  student_id: string;
  checkpoint_id: string;
  version: number;
  status:
    | "draft"
    | "followup"
    | "ready"
    | "submitted"
    | "reviewed"
    | "revision_requested";
  snapshot: {
    publicationVersion?: number;
    checkpoint: Checkpoint;
    objectives: Objective[];
    courseTitle: string;
    revision: number;
  };
  data: {
    dialogue?: { status:"active"|"complete"; maxProbes:number; reason:string; mode:"live"|"demo"; turns:{questionId:string; uncertainty:string; evidenceIds?:string[]; objectiveIds?:string[]; at:string}[] };
    revisions?: {
      at: string;
      evidence: EvidenceItem[];
      evaluation: Evaluation | null;
      review: unknown;
    }[];
    evidence: EvidenceItem[];
    questions: { id: string; prompt: string; objectiveIds: string[] }[];
    disclosure: string;
    helpUsed: string;
    events: { at: string; action: string }[];
    evaluation: Evaluation | null;
    review: {
      decision: "confirm" | "override" | "request_revision";
      note: string;
      findings: Finding[];
      at: string;
    } | null;
  };
  created_at: string;
};
export const findingSchema = z.object({
  objectiveId: id,
  level: z.enum(["Strong", "Developing", "Needs verification"]),
  confidence: z.enum(["Low", "Medium", "High"]),
  rationale: z.string().max(2500),
  evidenceIds: z.array(id).max(15),
  uncertainty: z.string().max(1500),
});
export const evaluationSchema = z.object({
  summary: z.string().max(4000),
  findings: z.array(findingSchema).min(1).max(15),
  misconceptions: z.array(z.string().max(600)).max(10),
  nextSteps: z.array(z.string().max(600)).max(10),
});
export function blankCourse(): CourseData {
  return {
    syllabus: "",
    objectives: [],
    modules: [],
    sources: [],
    materials: [],
    checkpoints: [],
    graphApproved: false,
    revision: 1,
    audit: [],
  };
}
export function validateGraph(data: {
  objectives: Objective[];
  modules: Module[];
}) {
  graphSchema.parse(data);
  const ids = new Set(data.objectives.map((o) => o.id)),
    mods = new Set(data.modules.map((m) => m.id));
  if (ids.size !== data.objectives.length || mods.size !== data.modules.length)
    throw new Error("Objective and module IDs must be unique.");
  for (const m of data.modules) {
    if (m.objectiveIds.some((x) => !ids.has(x)))
      throw new Error("Module references an unknown objective.");
    if (m.prerequisites.some((x) => !mods.has(x) || x === m.id))
      throw new Error("Choose valid prerequisites.");
  }
  const active = new Set<string>(),
    done = new Set<string>();
  const visit = (x: string) => {
    if (active.has(x)) throw new Error("Prerequisites must not form a cycle.");
    if (done.has(x)) return;
    active.add(x);
    data.modules.find((m) => m.id === x)!.prerequisites.forEach(visit);
    active.delete(x);
    done.add(x);
  };
  data.modules.forEach((m) => visit(m.id));
}
export function validateCheckpoint(c: Checkpoint, data: CourseData) {
  checkpointSchema.parse(c);
  if (!data.graphApproved)
    throw new Error(
      "Approve the course graph before publishing an assessment.",
    );
  if (!data.modules.some((m) => m.id === c.moduleId))
    throw new Error("Select a course module.");
  const ids = new Set(c.objectiveIds);
  if (c.objectiveIds.some((x) => !data.objectives.some((o) => o.id === x)))
    throw new Error("Assessment objective is not in the course graph.");
  if (c.rubric.reduce((a, r) => a + r.weight, 0) !== 100)
    throw new Error("Rubric weights must total 100%.");
  if (
    c.rubric.some((r) => !ids.has(r.objectiveId)) ||
    c.objectiveIds.some((x) => !c.rubric.some((r) => r.objectiveId === x))
  )
    throw new Error(
      "Every assessment objective needs a matching rubric criterion.",
    );
}
export function publishable(c: Course) {
  if (!c.class_id)
    throw new Error("Link a class before releasing this course.");
  if (!c.data.graphApproved) throw new Error("Approve the course graph first.");
  validateGraph(c.data);
  c.data.checkpoints
    .filter((a) => a.published)
    .forEach((a) => validateCheckpoint(a, c.data));
  const d = structuredClone(c.data);
  // Compiler prompts, logs and unreleased planning data are professor-private.
  delete d.compiler;
  delete d.assessmentDesigns;
  d.syllabus = "";
  d.sources = d.sources.filter((s) => s.approved && (!d.learning || (s.moduleIds?.length ? s.moduleIds.every(id => isReleased(d, id)) : d.modules.every(m => isReleased(d, m.id))))).map(s => ({...s, chunks: s.chunks.map(({vector, ...chunk}) => chunk)}));
  d.materials = d.materials.filter((m) => m.approved && isReleased(d, m.moduleId));
  d.chapters = d.chapters?.filter(ch => approvedChapter(c.data,ch) && isReleased(d,ch.moduleId)).map(ch => ({...ch, quality:undefined, generation:undefined}));
  // A chapter release exposes only its cited excerpts from otherwise private documents.
  const cited=new Set(d.chapters?.flatMap(ch=>ch.blocks.flatMap(b=>b.sourceIds))||[]);
  for(const source of c.data.sources.filter(s=>s.approved&&!d.sources.some(publicSource=>publicSource.id===s.id))){
    const chunks=source.chunks.filter(c=>cited.has(c.id)).map(chunk=>({id:chunk.id,text:chunk.text,...(chunk.page===undefined?{}:{page:chunk.page})}));
    if(chunks.length)d.sources.push({...source,text:chunks.map(c=>c.text).join("\n\n"),chunks,moduleIds:d.chapters!.filter(ch=>ch.sourceIds.some(id=>chunks.some(c=>c.id===id))).map(ch=>ch.moduleId)});
  }
  d.checkpoints = d.checkpoints.filter((a) => a.published && isReleased(d, a.moduleId));
  if (c.data.learning) d.learning = publicLearning(c.data);
  return d;
}
export function chunkText(text: string, sourceId: string) {
  const chunks: Source["chunks"] = [];
  const paragraphs = text.split(/\n\s*\n/);
  let buffer = "";
  for (const p of paragraphs) {
    if (buffer.length + p.length > 1300 && buffer) {
      chunks.push({ id: `${sourceId}-c${chunks.length + 1}`, text: buffer });
      buffer = "";
    }
    if (p.length > 1500) {
      for (let i = 0; i < p.length; i += 1200)
        chunks.push({
          id: `${sourceId}-c${chunks.length + 1}`,
          text: p.slice(i, i + 1500),
        });
    } else buffer += (buffer ? "\n\n" : "") + p;
  }
  if (buffer)
    chunks.push({ id: `${sourceId}-c${chunks.length + 1}`, text: buffer });
  return chunks.slice(0, 100);
}
export function retrieve(sources: Source[], query: string, vector?: number[]) {
  const terms = new Set(query.toLowerCase().match(/[a-z0-9]{3,}/g) || []);
  return sources
    .filter((s) => s.approved)
    .flatMap((s) =>
      s.chunks.map((c) => {
        const t = c.text.toLowerCase();
        const lexical = [...terms].reduce(
          (a, w) => a + (t.includes(w) ? 1 : 0),
          0,
        );
        let cosine = 0;
        if (vector && c.vector?.length === vector.length) {
          const dot = vector.reduce((a, v, i) => a + v * c.vector![i], 0);
          const a = Math.sqrt(vector.reduce((a, v) => a + v * v, 0)),
            b = Math.sqrt(c.vector.reduce((a, v) => a + v * v, 0));
          cosine = a && b ? dot / (a * b) : 0;
        }
        return {
          id: c.id,
          name: s.name,
          text: c.text,
          score: lexical + cosine * 4,
        };
      }),
    )
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}
export function validateEvaluation(
  value: unknown,
  d: Demonstration,
): Evaluation {
  const e = evaluationSchema.parse(value);
  const objectives = d.snapshot.checkpoint.objectiveIds;
  const evidence = new Map(d.data.evidence.map((x) => [x.id, x]));
  if (
    e.findings.length !== objectives.length ||
    new Set(e.findings.map((x) => x.objectiveId)).size !== objectives.length ||
    e.findings.some((x) => !objectives.includes(x.objectiveId))
  )
    throw new Error(
      "The assessment did not cover the required objectives. Please retry.",
    );
  for (const f of e.findings) {
    if (f.evidenceIds.some((x) => !evidence.has(x)))
      throw new Error("Assessment cited evidence that does not exist.");
    if (!f.evidenceIds.length) {
      f.level = "Needs verification";
      f.confidence = "Low";
      f.uncertainty =
        f.uncertainty || "No linked evidence supports this judgment.";
    }
  }
  return { ...e, source: "AI suggestion" };
}
export function canSubmit(d: Demonstration) {
  if(d.data.dialogue?.status === "active") throw new Error("Complete the Socratic defense before submitting.");
  const evidence = d.data.evidence;
  if(d.snapshot.checkpoint.authentic?.inputs.verification==="Extended"&&!evidence.some(e=>e.kind==="reflection"&&e.answer.trim().length>=20))throw new Error("Complete the reflection required by this assessment.");
  if(d.snapshot.checkpoint.authentic&&!d.data.disclosure.trim())throw new Error("Disclose any assistance, or state that none was used.");
  if (
    !evidence.some(
      (e) => e.kind === "artifact" && e.answer.trim().length >= 20,
    ) ||
    !evidence.some(
      (e) => e.kind === "explanation" && e.answer.trim().length >= 30,
    )
  )
    throw new Error("Add your work and a substantive explanation.");
  if (
    !d.data.questions.length ||
    d.data.questions.some(
      (q) =>
        !evidence.some(
          (e) =>
            e.kind === "followup" &&
            e.prompt === q.prompt &&
            e.answer.trim().length >= 10,
        ),
    )
  )
    throw new Error("Answer every follow-up question.");
  if (
    !evidence.some((e) => e.kind === "transfer" && e.answer.trim().length >= 20)
  )
    throw new Error("Complete the changed-scenario application.");
}
export function courseInsights(course: Course, items: Demonstration[]) {
  return course.data.objectives.map((o) => {
    const counts = { Strong: 0, Developing: 0, "Needs verification": 0 };
    let reviewed = 0;
    for (const d of items.filter(
      (d) =>
        d.course_id === course.id &&
        ["submitted", "reviewed", "revision_requested"].includes(d.status),
    )) {
      const f = (
        d.data.review?.findings ||
        d.data.evaluation?.findings ||
        []
      ).find((f) => f.objectiveId === o.id);
      if (f) {
        counts[f.level]++;
        if (d.data.review) reviewed++;
      }
    }
    return {
      objective: o,
      ...counts,
      reviewed,
      total: counts.Strong + counts.Developing + counts["Needs verification"],
    };
  });
}
