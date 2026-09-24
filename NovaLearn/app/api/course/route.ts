import { NextResponse } from "next/server";
import { z } from "zod";
import { identity, sameOrigin, sb } from "@/lib/novalearn/server";
import {
  blankCourse,
  courseDataSchema,
  graphSchema,
  validateGraph,
  publishable,
  validateCheckpoint,
  checkpointSchema,
  chunkText,
  validateEvaluation,
  findingSchema,
  canSubmit,
  type Course,
  type Demonstration,
} from "@/lib/novalearn/course-domain";
import {
  generate,
  context,
  embeddings,
  routingSummary,
} from "@/lib/novalearn/course-ai";
import { saveAnswers } from "@/lib/novalearn/evidence";
import { deriveChapters, generateChapter, approveChapter, refreshChapterOutline } from "@/lib/novalearn/learning-content";
import { reconcileContent } from "@/lib/novalearn/content-integrity";
import { advanceDialogue } from "@/lib/novalearn/socratic";
import { evidenceLinks, evidenceTargets, evaluateStudentEvidence } from "@/lib/novalearn/student-evidence";
import { appendEvidence, hydrateEvidence, recordProfessorReview } from "@/lib/novalearn/evidence-repository";
import { createAssessmentDesign, runAssessmentStage, nextAssessmentStage, resetAssessmentFrom, assessmentStages, approveAssessment, validateAuthenticPublication, reconcileAssessmentEdits, assessmentContextFingerprint, assignAssessmentVariant } from "@/lib/novalearn/assessment-engine";
import { runCompilerJob, compilerIssues, nextCompilerJob, reviewFingerprint } from "@/lib/novalearn/course-compiler";
import { validateLearning, isReleased, learningConfig, activitySchema } from "@/lib/novalearn/learning-domain";
export const runtime = "nodejs";
const uuid = z.string().uuid(),
  now = () => new Date().toISOString();
const encoded = (x: string) => encodeURIComponent(x);
const insert = async (table: string, body: unknown) =>
  (
    await sb(
      `/rest/v1/${table}`,
      {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(body),
      },
      undefined,
      true,
    )
  )[0];
async function update(
  table: string,
  id: string,
  version: number,
  body: unknown,
) {
  const rows = await sb(
    `/rest/v1/${table}?id=eq.${encoded(id)}&version=eq.${version}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(body),
    },
    undefined,
    true,
  );
  if (!rows.length)
    throw new Error(
      "This record changed in another session. Reload before saving.",
    );
  return rows[0];
}
function failure(e: unknown) {
  const message =
    e instanceof z.ZodError
      ? e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
      : (e as Error).message;
  return NextResponse.json(
    { error: message },
    {
      status: message.includes("sign in")
        ? 401
        : message.includes("not permitted")
          ? 403
          : message.includes("another session")
            ? 409
        : message.includes("persistence unavailable") || message.includes("Evidence records are temporarily unavailable")
          ? 503
          : 400,
    },
  );
}
export async function GET() {
  try {
    const { profile, token } = await identity();
    const courses = await sb(
      `/rest/v1/${profile.role === "teacher" ? "nova_courses" : "nova_publications"}?select=*&order=updated_at.desc`,
      {},
      token,
    );
    const demonstrations = await sb(
      "/rest/v1/nova_demonstrations?select=*&order=created_at.desc",
      {},
      token,
    );
    return NextResponse.json({
      courses,
      demonstrations:await hydrateEvidence(demonstrations,profile.role==="teacher"),
      routing: routingSummary(),
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const { profile, token } = await identity();
    const raw = await req.text();
    if (raw.length > 1500000)
      throw new Error(
        "Request too large. Split source documents into smaller sections.",
      );
    const b = JSON.parse(raw);
    const action = z.string().parse(b.action),
      teacher = profile.role === "teacher";
    const requireTeacher = () => {
      if (!teacher) throw new Error("Action not permitted for this account.");
    };
    const requireStudent = () => {
      if (teacher)
        throw new Error("Switch to a student account to demonstrate learning.");
    };
    const course = async (student = false): Promise<Course> => {
      const id = uuid.parse(b.courseId);
      const rows = await sb(
        `/rest/v1/${student ? "nova_publications" : "nova_courses"}?id=eq.${id}&select=*`,
        {},
        token,
      );
      if (!rows[0])
        throw new Error("Course not found or access not permitted.");
      return rows[0];
    };
    const demo = async (): Promise<Demonstration> => {
      const id = uuid.parse(b.id);
      const rows = await sb(
        `/rest/v1/nova_demonstrations?id=eq.${id}&select=*`,
        {},
        token,
      );
      if (!rows[0])
        throw new Error("Evidence not found or access not permitted.");
      const d = rows[0];
      if (!teacher && d.student_id !== profile.id)
        throw new Error("Action not permitted.");
      if (b.version !== d.version)
        throw new Error(
          "This record changed in another session. Reload before saving.",
        );
      return d;
    };
    const budget = async () => {
      const allowed = await sb(
        "/rest/v1/rpc/consume_ai_budget",
        { method: "POST", body: "{}" },
        token,
      );
      if (!allowed)
        throw new Error("AI request limit reached. Please try again later.");
    };
    const saveDemo = async (d: Demonstration) =>
      update("nova_demonstrations", d.id, d.version, {
        data: d.data,
        status: d.status,
        version: d.version + 1,
      });
    const checkClass = async (id: string | null) => {
      if (!id) return;
      uuid.parse(id);
      const rows = await sb(
        `/rest/v1/classes?id=eq.${id}&teacher_id=eq.${profile.id}&select=id`,
        {},
        token,
      );
      if (!rows.length) throw new Error("Link a class that you own.");
    };
    if (action === "create") {
      requireTeacher();
      const title = z.string().trim().min(3).max(200).parse(b.title);
      await checkClass(b.classId || null);
      return NextResponse.json(
        await insert("nova_courses", {
          title,
          teacher_id: profile.id,
          class_id: b.classId || null,
          data: blankCourse(),
        }),
      );
    }
    if (action === "duplicate") {
      requireTeacher();
      const c = await course();
      if (c.teacher_id !== profile.id) throw new Error("Action not permitted.");
      const data = structuredClone(c.data);
      data.revision = 1;
      data.audit = [{at:now(),action:`Reused professor-owned course template: ${c.title}`}];
      data.graphApproved = false;
      if (data.learning) data.learning.releasedModuleIds = [];
      data.checkpoints = data.checkpoints.map(a=>({...a,published:false}));
      return NextResponse.json(await insert("nova_courses",{teacher_id:profile.id,class_id:null,title:`${c.title.slice(0,170)} · New semester`,data}));
    }
    if (action === "save") {
      requireTeacher();
      const c = await course();
      if (c.teacher_id !== profile.id) throw new Error("Action not permitted.");
      const data = courseDataSchema.parse(b.data);
      const title = z.string().trim().min(3).max(200).parse(b.title);
      await checkClass(b.classId || null);
      const changed =
        JSON.stringify([data.modules, data.objectives, data.learning?.concepts]) !==
        JSON.stringify([c.data.modules, c.data.objectives, c.data.learning?.concepts]);
      if (changed && !b.approveGraph) data.graphApproved = false;
      if (b.approveGraph) {
        validateGraph(data);
        data.graphApproved = true;
      }
      if (data.graphApproved) validateGraph(data);
      if (data.learning) validateLearning(data);
      // Source chunks are derived server-side, so citations cannot substitute hidden text.
      data.sources = data.sources.map((s) => {
        const old = c.data.sources.find(
          (o) => o.id === s.id && o.text === s.text,
        );
        return { ...s, chunks: old?.chunks || chunkText(s.text, s.id) };
      });
      reconcileContent(data,c.data);
      reconcileAssessmentEdits(data,c.data);
      if(data.compiler&&reviewFingerprint(data)!==reviewFingerprint(c.data))data.compiler.reviewed=false;
      const moduleIds = new Set(data.modules.map((m) => m.id)),
        chunkIds = new Set(
          data.sources
            .filter((s) => s.approved)
            .flatMap((s) => s.chunks.map((x) => x.id)),
        );
      for (const m of data.materials) {
        if (!moduleIds.has(m.moduleId))
          throw new Error("A material refers to a removed module.");
        if (m.approved && m.sourceIds.some((id) => !chunkIds.has(id)))
          throw new Error(
            "Approved material must cite approved course sources.",
          );
      }
      if (
        new Set(data.checkpoints.map((c) => c.id)).size !==
        data.checkpoints.length
      )
        throw new Error("Checkpoint IDs must be unique.");
      if (data.graphApproved)
        data.checkpoints
          .filter((a) => a.published)
          .forEach((a) => validateCheckpoint(a, data));
      data.revision = c.data.revision + 1;
      data.audit = [
        ...c.data.audit.slice(-99),
        {
          at: now(),
          action: b.approveGraph
            ? "Professor approved course graph"
            : "Professor saved course draft",
        },
      ];
      return NextResponse.json(
        await update("nova_courses", c.id, z.number().int().parse(b.version), {
          title,
          class_id: b.classId || null,
          data,
          version: c.version + 1,
          updated_at: now(),
        }),
      );
    }
    if (["content-outline","content-generate","content-approve","content-refresh"].includes(action)) {
      requireTeacher();const c=await course();
      if(c.teacher_id!==profile.id)throw new Error("Action not permitted.");
      if(b.version!==c.version)throw new Error("This record changed in another session. Reload before saving.");
      const data=structuredClone(c.data);
      if(action==="content-outline")data.chapters=deriveChapters(data);
      else {
        const chapterId=z.string().min(1).max(100).parse(b.chapterId);
        const ch=action==="content-approve"?approveChapter(data,chapterId):action==="content-refresh"?refreshChapterOutline(data,chapterId):await generateChapter(data,chapterId,async(system,input)=>{await budget();return generate("draft",system,input,b.provider);},async(system,input)=>{await budget();return generate("judge",system,input,b.provider);});
        data.chapters=data.chapters!.map(c=>c.id===chapterId?ch:c);
      }
      reconcileAssessmentEdits(data,c.data);
      if(data.compiler)data.compiler.reviewed=false;
      data.revision++;data.audit=[...data.audit.slice(-99),{at:now(),action:`Learning content: ${action}`}];
      return NextResponse.json(await update("nova_courses",c.id,c.version,{data:courseDataSchema.parse(data),version:c.version+1,updated_at:now()}));
    }
    if (["assessment-create","assessment-step","assessment-reset","assessment-approve"].includes(action)) {
      requireTeacher();
      const c=await course();
      if(c.teacher_id!==profile.id)throw new Error("Action not permitted.");
      if(b.version!==c.version)throw new Error("This record changed in another session. Reload before saving.");
      let data=structuredClone(c.data);
      if(action==="assessment-create"){
        const design=createAssessmentDesign(data,b.inputs,crypto.randomUUID(),crypto.randomUUID());
        data.assessmentDesigns=[...(data.assessmentDesigns||[]),design];
      }else{
        const design=data.assessmentDesigns?.find(d=>d.id===b.designId);
        if(!design)throw new Error("Assessment design not found.");
        if(action==="assessment-approve")data=approveAssessment(data,design.id);
        else if(action==="assessment-reset"){
          const key=assessmentStages.find(s=>s.key===b.key)?.key;if(!key)throw new Error("Unknown assessment stage.");
          const reset=resetAssessmentFrom(design,key);
          if(key==="evidence")reset.contextFingerprint=assessmentContextFingerprint(data,reset.inputs);
          data.assessmentDesigns=data.assessmentDesigns!.map(d=>d.id===design.id?reset:d);
          data.checkpoints.forEach(cp=>{if(cp.id===design.checkpointId)cp.published=false;});
        }else{
          if(nextAssessmentStage(design)?.key!==b.key)throw new Error("Assessment stage changed. Reload and resume.");
          const started=Date.now();
          try{data=await runAssessmentStage(data,design.id,b.key,async(tier,system,input)=>{await budget();return generate(tier,system,input,b.provider);});}
          catch(e){design.log=[...design.log.filter(l=>l.key!==b.key),{key:b.key,status:"failed",at:now(),ms:Date.now()-started,routing:"No validated output saved",detail:(e as Error).message.slice(0,1000)}];await update("nova_courses",c.id,c.version,{data,version:c.version+1,updated_at:now()});throw e;}
        }
      }
      data.revision++;data.audit=[...data.audit.slice(-99),{at:now(),action:action==="assessment-approve"?"Professor approved authentic assessment package":action}];
      return NextResponse.json(await update("nova_courses",c.id,c.version,{data:courseDataSchema.parse(data),version:c.version+1,updated_at:now()}));
    }
    if (action === "compiler-step") {
      requireTeacher();
      const c=await course();
      if(c.teacher_id!==profile.id)throw new Error("Action not permitted.");
      if(b.version!==c.version)throw new Error("This record changed in another session. Reload before saving.");
      const key=z.string().max(150).parse(b.key);
      if(nextCompilerJob(c.data)?.key!==key)throw new Error("Compiler stage changed. Reload and resume the next pending stage.");
      const started=Date.now();
      let data;
      try{data=await runCompilerJob(c.data,key,async(system,input)=>{await budget();return generate("draft",system,input,b.provider);});}
      catch(e){
        if(c.data.compiler){c.data.compiler.log=[...c.data.compiler.log.filter(l=>l.key!==key),{key,status:"failed",at:now(),ms:Date.now()-started,routing:"No validated output saved",detail:(e as Error).message.slice(0,1000)}];
          await update("nova_courses",c.id,c.version,{data:c.data,version:c.version+1,updated_at:now()});}
        throw e;
      }
      return NextResponse.json(await update("nova_courses",c.id,c.version,{data,version:c.version+1,updated_at:now()}));
    }
    if (action === "release") {
      requireTeacher();
      const c = await course();
      if (c.teacher_id !== profile.id) throw new Error("Action not permitted.");
      if(c.data.compiler){
        if(nextCompilerJob(c.data))throw new Error("Finish the compiler pipeline before releasing this version.");
        const issues=compilerIssues(c.data).filter(x=>x.level==="error");
        if(issues.length)throw new Error(issues.map(x=>x.text).join(" "));
      }
      const data = publishable(c);
      validateAuthenticPublication(c.data);
      await checkClass(c.class_id);
      await sb(
        "/rest/v1/rpc/nova_release_course",
        {
          method: "POST",
          body: JSON.stringify({ p_course_id: c.id, p_version: c.version, p_public_data: data }),
        },
        undefined,
        true,
      );
      return NextResponse.json({ ok: true });
    }
    if (action === "index") {
      requireTeacher();
      const c = await course();
      const source = c.data.sources.find(
        (s) => s.id === b.sourceId && s.approved,
      );
      if (!source) throw new Error("Approve and save the source first.");
      await budget();
      const vectors = await embeddings(source.chunks.map((c) => c.text));
      if (!vectors)
        throw new Error(
          "Configure EMBEDDING_MODEL and EMBEDDING_API_KEY first. Keyword retrieval already works.",
        );
      source.chunks.forEach((c, i) => (c.vector = vectors[i]));
      return NextResponse.json(
        await update("nova_courses", c.id, c.version, {
          data: c.data,
          version: c.version + 1,
          updated_at: now(),
        }),
      );
    }
    if (action === "graph") {
      requireTeacher();
      const syllabus = z.string().min(40).max(100000).parse(b.syllabus);
      await budget();
      const result = await generate(
        "draft",
        "Design a university course graph grounded in the supplied syllabus. Return {objectives:[{id,title,level}],modules:[{id,title,week,concepts,objectiveIds,prerequisites}]}. level is Understand, Apply, Analyze, Evaluate, or Create. Stable short IDs, 3-20 measurable objectives and 2-12 modules, only valid IDs and acyclic prerequisites. Preserve subject and scope; do not invent institution policies.",
        { syllabus, constraints: b.constraints ? z.object({weeks:z.number().int().min(1).max(52),hoursPerWeek:z.number().min(1).max(40),checkpointEvery:z.number().int().min(1).max(12),teachingIntent:z.string().max(2000)}).parse(b.constraints) : undefined },
        b.provider,
      );
      const graph = graphSchema.parse(result.value);
      validateGraph(graph);
      return NextResponse.json({ ...graph, routing: result.routing });
    }
    if (action === "quick-check") {
      requireTeacher();
      const c = await course(), l = learningConfig(c.data), concepts = l.concepts.filter(x => x.moduleId === b.moduleId);
      if (!concepts.length) throw new Error("Save a valid module and concept graph first.");
      const chunks = await context(c.data, concepts.map(c => c.name).join(" "));
      if (!chunks.length) throw new Error("Add and approve relevant course sources first.");
      await budget();
      const r = await generate("draft", "Draft one university low-stakes applied multiple-choice concept check using ONLY supplied excerpts. Return {title,question,options:[3 distinct strings],answer:0-based correct index,explanation,conceptIds:[only provided IDs],difficulty:Foundation|Core|Challenge,sourceIds:[provided chunk IDs]}. Include a misconception-based distractor and explanatory feedback. Do not invent unsupported facts.", {concepts, sources:chunks}, b.provider);
      const a = activitySchema.parse({...r.value, id:crypto.randomUUID(), moduleId:b.moduleId, kind:"Pulse check", approved:false});
      if (a.answer === undefined || a.answer >= a.options.length || a.conceptIds.some(id => !concepts.some(c => c.id === id)) || !a.sourceIds.length || a.sourceIds.some(id => !chunks.some(c => c.id === id))) throw new Error("The generated check failed validation. Try again or create it manually.");
      return NextResponse.json(a);
    }
    if (["material", "checkpoint"].includes(action)) {
      requireTeacher();
      const c = await course();
      const module = c.data.modules.find((m) => m.id === b.moduleId);
      if (!module) throw new Error("Select a module.");
      const ids = z.array(z.string()).min(1).max(10).parse(b.objectiveIds);
      const objectives = c.data.objectives.filter((o) => ids.includes(o.id));
      if (objectives.length !== new Set(ids).size)
        throw new Error("Select valid course objectives.");
      const chunks = await context(
        c.data,
        `${module.title} ${objectives.map((o) => o.title).join(" ")}`,
      );
      if (!chunks.length)
        throw new Error(
          "Add and approve relevant course sources before generating grounded content.",
        );
      await budget();
      if (action === "material") {
        const kind = z
          .enum(["Lecture notes", "Worked example", "Practice", "Discussion"])
          .parse(b.kind);
        const result = await generate(
          "draft",
          "Draft professor-editable teaching material. Ground factual content ONLY in supplied source excerpts and mark gaps explicitly. Return {title,content,sourceIds}; content is readable plain text with section headings, examples, and a short activity. Include [chunk-id] inline citations and sourceIds containing only supplied IDs. Do not invent citations.",
          { module, objectives, kind, sources: chunks },
          b.provider,
        );
        const out = z
          .object({
            title: z.string().min(3).max(200),
            content: z.string().min(10).max(25000),
            sourceIds: z.array(z.string()).min(1).max(20),
          })
          .parse(result.value);
        if (out.sourceIds.some((id) => !chunks.some((c) => c.id === id)))
          throw new Error("The draft referenced an unknown source. Try again.");
        return NextResponse.json({ ...out, routing: result.routing });
      }
      const result = await generate(
        "judge",
        "Design an authentic university assessment. Return {title,prompt,rubric:[{objectiveId,criterion,weight,descriptor}],followupStrategy,transferPrompt}. Cover every supplied objective, integer weights sum 100. Require a substantive artifact plus explanation, then specify a strategy for 2 adaptive verification questions and a NEW changed-scenario transfer task. Judge understanding, not AI authorship. Rubric descriptors must explain observable evidence.",
        { module, objectives, sources: chunks },
        b.provider,
      );
      const cp = checkpointSchema.parse({
        ...result.value,
        id: crypto.randomUUID(),
        moduleId: module.id,
        objectiveIds: ids,
        published: false,
      });
      validateCheckpoint(cp, c.data);
      return NextResponse.json({ ...cp, routing: result.routing });
    }
    if (action === "begin") {
      requireStudent();
      const c = await course(true);
      const publishedCheckpoint = c.data.checkpoints.find(
        (c) => c.id === b.checkpointId && c.published,
      );
      if (!publishedCheckpoint) throw new Error("Published checkpoint not found.");
      const cp=assignAssessmentVariant(publishedCheckpoint,profile.id);
      const old = await sb(
        `/rest/v1/nova_demonstrations?course_id=eq.${c.id}&student_id=eq.${profile.id}&checkpoint_id=eq.${encoded(cp.id)}&select=*`,
        {},
        token,
      );
      if (old.length) return NextResponse.json(old[0]);
      return NextResponse.json(
        await insert("nova_demonstrations", {
          course_id: c.id,
          student_id: profile.id,
          checkpoint_id: cp.id,
          status: "draft",
          snapshot: {
            publicationVersion:c.version,
            checkpoint: cp,
            objectives: c.data.objectives.filter((o) =>
              cp.objectiveIds.includes(o.id),
            ),
            courseTitle: c.title,
            revision: c.data.revision,
            evidenceLinks: evidenceLinks(c.data,cp),
          },
          data: {
            evidence: [],
            questions: [],
            disclosure: "",
            helpUsed: "",
            events: [
              {
                at: now(),
                action: "Checkpoint started; rubric and objectives frozen",
              },
            ],
            evaluation: null,
            review: null,
          },
        }),
      );
    }
    if (["evidence", "followups", "socratic-next", "submit"].includes(action)) {
      requireStudent();
      const d = await demo();
      if (["submitted", "reviewed"].includes(d.status))
        throw new Error(
          "This submission is locked. Your professor can request a revision.",
        );
      if (action === "evidence") {
        saveAnswers(d, b);
        return NextResponse.json(await saveDemo(d));
      }
      if(action==="socratic-next"){
        const targets=evidenceTargets(d).filter(t=>t.type==="EXPLANATION"||t.type==="APPLICATION").map(t=>({id:t.id,objectiveId:t.objectiveId,expected:t.expected}));
        const advanced=await advanceDialogue(d,async(system,input)=>{await budget();return generate("dialogue",system,input,b.provider);},targets);
        return NextResponse.json(await saveDemo(advanced));
      }
      if (action === "followups") {
        if (d.data.questions.length) return NextResponse.json(d);
        if (
          !d.data.evidence.some(
            (e) => e.kind === "artifact" && e.answer.length >= 20,
          ) ||
          !d.data.evidence.some(
            (e) => e.kind === "explanation" && e.answer.length >= 30,
          )
        )
          throw new Error("Save your work and explanation first.");
        await budget();
        const result = await generate(
          "dialogue",
          "Ask exactly 2 short adaptive questions about specific claims or gaps in this submitted work. Follow the professor strategy. Do not reveal answers. Return {questions:[{id,prompt,objectiveIds}]}, using only provided objective IDs. Assess reasoning; never infer cheating.",
          {
            objectives: d.snapshot.objectives,
            strategy: d.snapshot.checkpoint.followupStrategy,
            evidence: d.data.evidence,
          },
          b.provider,
        );
        const questions = z
          .array(
            z.object({
              id: z.string(),
              prompt: z.string().min(15).max(1500),
              objectiveIds: z.array(z.string()).min(1).max(10),
            }),
          )
          .length(2)
          .parse(result.value.questions);
        if (
          questions.some((q) =>
            q.objectiveIds.some(
              (id) => !d.snapshot.checkpoint.objectiveIds.includes(id),
            ),
          )
        )
          throw new Error(
            "Follow-up referenced an unknown objective. Please retry.",
          );
        d.data.questions = questions.map((q, i) => ({ ...q, id: `q${i}` }));
        d.status = "followup";
        d.data.events.push({
          at: now(),
          action: `Adaptive questions generated (${result.routing})`,
        });
        return NextResponse.json(await saveDemo(d));
      }
      canSubmit(d);
      let notice = "";
      d.data.evidenceBundle=undefined;
      let releasedData;
      if(d.snapshot.checkpoint.authentic&&d.snapshot.publicationVersion){
        const [release]=await sb(`/rest/v1/nova_course_versions?course_id=eq.${d.course_id}&version=eq.${d.snapshot.publicationVersion}&select=snapshot`,{},undefined,true);
        releasedData=release?.snapshot?.data;
      }
      const result=await evaluateStudentEvidence(d,releasedData,async(tier,system,input)=>{await budget();return generate(tier,system,input,b.provider);});
      d.data.evidenceBundle=result.bundle;
      d.data.evaluation=result.evaluation;
      d.data.evidenceStoreVersion=1;
      notice=result.bundle.notice||"";
      d.status = "submitted";
      d.data.review = null;
      d.data.events.push({
        at: now(),
        action: notice || "Evidence submitted with provisional AI synthesis",
      });
      const saved = await appendEvidence(d,result.events,result.bundle);
      return NextResponse.json({ ...saved, notice });
    }
    if (action === "review") {
      requireTeacher();
      const d = await demo();
      if (!["submitted", "reviewed", "revision_requested"].includes(d.status))
        throw new Error("Only submitted evidence can be reviewed.");
      const owns = await sb(
        `/rest/v1/nova_courses?id=eq.${d.course_id}&teacher_id=eq.${profile.id}&select=id`,
        {},
        token,
      );
      if (!owns.length) throw new Error("Action not permitted.");
      const review = z
        .object({
          decision: z.enum(["confirm", "override", "request_revision"]),
          note: z.string().trim().min(10).max(6000),
          findings: z.array(findingSchema).min(1).max(10),
        })
        .parse(b.review);
      review.findings = validateEvaluation(
        {
          summary: review.note,
          findings:
            review.decision === "confirm" && d.data.evaluation
              ? d.data.evaluation.findings
              : review.findings,
          misconceptions: [],
          nextSteps: [],
        },
        d,
      ).findings;
      if (review.decision === "confirm" && !d.data.evaluation)
        throw new Error(
          "No AI suggestion exists to confirm; use Record professor decision.",
        );
      if (review.decision === "request_revision")
        d.data.revisions = [
          ...(d.data.revisions || []).slice(-9),
          {
            at: now(),
            evidence: structuredClone(d.data.evidence),
            evaluation: structuredClone(d.data.evaluation),
            evidenceBundle:structuredClone(d.data.evidenceBundle),
            review: structuredClone(review),
          },
        ];
      d.data.review = { ...review, at: now(),reviewerId:profile.id };
      d.status =
        review.decision === "request_revision"
          ? "revision_requested"
          : "reviewed";
      d.data.events.push({
        at: now(),
        action: `Professor ${review.decision}: ${review.note.slice(0, 500)}`,
      });
      const saved=await recordProfessorReview(d,d.data.review);
      return NextResponse.json((await hydrateEvidence([saved],true))[0]);
    }
    if (action === "chat") {
      const c = await course(!teacher);
      const module = c.data.modules.find((m) => m.id === b.moduleId);
      if (!teacher && !isReleased(c.data, b.moduleId)) throw new Error("This module has not been released yet.");
      if (!module) throw new Error("Module not found.");
      const message = z.string().trim().min(1).max(6000).parse(b.message);
      const history = z
        .array(
          z.object({
            role: z.enum(["user", "assistant"]),
            content: z.string().max(6000),
          }),
        )
        .max(16)
        .parse(b.history || []);
      const chunks = await context(c.data, `${module.title} ${message}`);
      if (!chunks.length)
        return NextResponse.json({
          reply:
            "I could not find relevant approved course sources. Ask your professor to add material before I make a factual claim.",
          citations: [],
          routing: "No model call — insufficient source context",
        });
      await budget();
      const result = await generate(
        "dialogue",
        "You are Nova, a curious learning partner. Ask the student to teach the concept, probe their reasoning with one question, and connect to approved course sources. This is private practice, not an assessment. Ground factual claims in excerpts; say when evidence is missing. Return {reply,citationIds}. Only cite supplied chunk IDs. Do not complete a graded assignment for the student.",
        {
          module,
          objectives: c.data.objectives.filter((o) =>
            module.objectiveIds.includes(o.id),
          ),
          sources: chunks,
          history,
          message,
        },
        b.provider,
      );
      const out = z
        .object({
          reply: z.string().min(1).max(6000),
          citationIds: z.array(z.string()).max(5),
        })
        .parse(result.value);
      if (out.citationIds.some((id) => !chunks.some((c) => c.id === id)))
        throw new Error(
          "The model returned an unsupported citation. Please retry.",
        );
      return NextResponse.json({
        reply: out.reply,
        citations: chunks.filter((c) => out.citationIds.includes(c.id)),
        routing: result.routing,
      });
    }
    throw new Error("Unknown course action.");
  } catch (e) {
    return failure(e);
  }
}
