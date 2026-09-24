import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import { pathToFileURL } from "node:url";
const temp = await fs.mkdtemp(path.join(process.cwd(), ".nova-tests-course-"));
async function compile(file, name, replacements = []) {
  let source = await fs.readFile(file, "utf8");
  for(const dep of ["content-integrity","curriculum-audit","learning-content","socratic","student-evidence"]){
    source=source.replaceAll(`"./${dep}"`,`"./${dep}.mjs"`).replaceAll(`"@/lib/novalearn/${dep}"`,`"./${dep}.mjs"`);
  }
  for (const [a, b] of replacements)
    source = source.replaceAll(a, b).replaceAll(a.replaceAll("'", '"'), b);
  await fs.writeFile(
    path.join(temp, name),
    ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ES2022,
      },
    }).outputText,
  );
}
for(const name of ["content-integrity","curriculum-audit","learning-content","socratic","student-evidence"])
  await compile(`lib/novalearn/${name}.ts`,`${name}.mjs`,[["'./course-domain'","'./domain.mjs'"],["'./learning-domain'","'./learning.mjs'"]]);
await compile("lib/novalearn/learning-domain.ts", "learning.mjs");
await compile("lib/novalearn/course-domain.ts", "domain.mjs", [["'./learning-domain'", "'./learning.mjs'"]]);
await compile("lib/novalearn/course-compiler.ts", "compiler.mjs", [["'./course-domain'", "'./domain.mjs'"],["'./learning-domain'", "'./learning.mjs'"]]);
await compile("lib/novalearn/assessment-engine.ts", "assessment.mjs", [["'./course-domain'", "'./domain.mjs'"]]);
await compile("lib/novalearn/course-sample.ts", "sample.mjs", [
  ["'./course-domain'", "'./domain.mjs'"],
  ["'./learning-domain'", "'./learning.mjs'"],
]);
await compile("lib/novalearn/evidence.ts", "evidence.mjs", [
  ["'./course-domain'", "'./domain.mjs'"],
]);
await compile("lib/novalearn/course-ai.ts", "ai.mjs", [
  ["'./course-domain'", "'./domain.mjs'"],
]);
await fs.writeFile(
  path.join(temp, "cookies.mjs"),
  "export async function cookies(){return globalThis.novaCookies;}",
);
await fs.writeFile(
  path.join(temp, "response.mjs"),
  "export const NextResponse={json:(d,o)=>Response.json(d,o)};",
);
await compile("lib/novalearn/server.ts", "server.mjs", [
  ["'next/headers'", "'./cookies.mjs'"],
]);
await compile("app/api/course/route.ts", "route.mjs", [
  ["'next/server'", "'./response.mjs'"],
  ["'@/lib/novalearn/server'", "'./server.mjs'"],
  ["'@/lib/novalearn/course-domain'", "'./domain.mjs'"],
  ["'@/lib/novalearn/course-ai'", "'./ai.mjs'"],
  ["'@/lib/novalearn/evidence'", "'./evidence.mjs'"],
  ["'@/lib/novalearn/learning-domain'", "'./learning.mjs'"],
  ["'@/lib/novalearn/course-compiler'", "'./compiler.mjs'"],
  ["'@/lib/novalearn/assessment-engine'", "'./assessment.mjs'"],
]);
const mod = async (name) => import(pathToFileURL(path.join(temp, name)).href);
const domain = await mod("domain.mjs"),
  { sampleCourse, sampleDemonstrations } = await mod("sample.mjs"),
  { saveAnswers } = await mod("evidence.mjs"),
  route = await mod("route.mjs");
test("sample graph is valid and prerequisites reject cycles", () => {
  const c = sampleCourse();
  domain.validateGraph(c.data);
  c.data.modules[0].prerequisites = [c.data.modules[2].id];
  assert.throws(() => domain.validateGraph(c.data), /cycle/);
});
test("unknown objectives are not accepted in module maps", () => {
  const c = sampleCourse();
  c.data.modules[0].objectiveIds = ["invented"];
  assert.throws(() => domain.validateGraph(c.data), /unknown objective/);
});
test("rubric weights must sum to 100 and cover objectives", () => {
  const c = sampleCourse();
  domain.validateCheckpoint(c.data.checkpoints[0], c.data);
  c.data.checkpoints[0].rubric[0].weight = 1;
  assert.throws(
    () => domain.validateCheckpoint(c.data.checkpoints[0], c.data),
    /100/,
  );
});
test("released course strips syllabus and unapproved sources, materials and checkpoints", () => {
  const c = sampleCourse();
  c.data.sources.push({ ...c.data.sources[0], id: "private", approved: false });
  c.data.materials.push({
    ...c.data.materials[0],
    id: "draft",
    approved: false,
  });
  c.data.checkpoints.push({
    ...c.data.checkpoints[0],
    id: "draft",
    published: false,
  });
  const d = domain.publishable(c);
  assert.equal(d.syllabus, "");
  assert.equal(d.sources.length, 1);
  assert.equal(d.materials.length, 1);
  assert.equal(d.checkpoints.length, 1);
  assert.ok(c.data.syllabus.length > 0);
});
test("publication requires class and graph approval", () => {
  const c = sampleCourse();
  c.class_id = null;
  assert.throws(() => domain.publishable(c), /class/);
  c.class_id = "x";
  c.data.graphApproved = false;
  assert.throws(() => domain.publishable(c), /Approve/);
});
test("retrieval uses only approved sources and returns real chunks", () => {
  const c = sampleCourse();
  const result = domain.retrieve(
    c.data.sources,
    "retrieval generation evidence",
  );
  assert.ok(result.length > 0);
  c.data.sources[0].approved = false;
  assert.equal(domain.retrieve(c.data.sources, "retrieval").length, 0);
});
test("evidence bundle must include every follow-up and transfer", () => {
  const d = sampleDemonstrations(sampleCourse())[0];
  domain.canSubmit(d);
  d.data.evidence = d.data.evidence.filter((e) => e.kind !== "transfer");
  assert.throws(() => domain.canSubmit(d), /changed-scenario/);
});
test("AI cannot cite invented evidence IDs", () => {
  const d = sampleDemonstrations(sampleCourse())[0];
  const e = structuredClone(d.data.evaluation);
  e.findings[0].evidenceIds = ["fabricated"];
  assert.throws(() => domain.validateEvaluation(e, d), /does not exist/);
});
test("unsupported finding is normalized to low-confidence verification", () => {
  const d = sampleDemonstrations(sampleCourse())[0];
  const e = structuredClone(d.data.evaluation);
  e.findings[0].evidenceIds = [];
  const out = domain.validateEvaluation(e, d);
  assert.equal(out.findings[0].level, "Needs verification");
  assert.equal(out.findings[0].confidence, "Low");
});
test("every frozen objective must receive one finding", () => {
  const d = sampleDemonstrations(sampleCourse())[0];
  const e = structuredClone(d.data.evaluation);
  e.findings.pop();
  assert.throws(() => domain.validateEvaluation(e, d), /required objectives/);
});
test("editing initial work clears dependent followups and transfer evidence", () => {
  const d = sampleDemonstrations(sampleCourse())[0];
  d.status = "revision_requested";
  saveAnswers(d, {
    artifact: "An improved response with concrete supporting evidence.",
    explanation:
      "I changed my reasoning to explain the retrieval failure and its causal impact.",
    followupAnswers: { q0: "old answer" },
    transfer: "old transfer",
  });
  assert.equal(d.data.questions.length, 0);
  assert.equal(d.data.evidence.filter((e) => e.kind === "transfer").length, 0);
  assert.equal(d.status, "draft");
});
test("professor findings replace AI suggestions in aggregate", () => {
  const c = sampleCourse(),
    d = sampleDemonstrations(c)[0];
  d.data.review = {
    decision: "override",
    note: "Professor reviewed the source evidence.",
    at: new Date().toISOString(),
    findings: d.data.evaluation.findings.map((f) => ({
      ...f,
      level: "Developing",
    })),
  };
  const rows = domain.courseInsights(c, [d]);
  assert.equal(rows.find((r) => r.objective.id === "o3").Developing, 1);
  assert.equal(rows.find((r) => r.objective.id === "o3").Strong, 0);
});
const nativeFetch = globalThis.fetch,
  env = { ...process.env };
const user = "11111111-1111-4111-8111-111111111111",
  cid = "22222222-2222-4222-8222-222222222222",
  did = "33333333-3333-4333-8333-333333333333",
  classId = "44444444-4444-4444-8444-444444444444";
let role, course, demo, requests, budget, ai, missing, conflict;
function reset() {
  role = "teacher";
  course = sampleCourse();
  course.id = cid;
  course.teacher_id = user;
  course.class_id = classId;
  demo = sampleDemonstrations(course)[0];
  demo.id = did;
  demo.course_id = cid;
  demo.student_id = user;
  requests = [];
  budget = true;
  ai = null;
  missing = false;
  conflict = false;
  Object.assign(process.env, {
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_ANON_KEY: "test",
    SUPABASE_SERVICE_ROLE_KEY: "test-admin",
    OPENAI_API_KEY: "test-ai",
  });
  globalThis.novaCookies = {
    get: (k) => (k === "nova_access" ? { value: "token" } : undefined),
  };
}
globalThis.fetch = async (url, options = {}) => {
  const u = String(url);
  requests.push({ url: u, ...options });
  const out = (d, status = 200) => Response.json(d, { status });
  if (u.endsWith("/auth/v1/user")) return out({ id: user });
  if (u.includes("/profiles")) return out([{ id: user, role, name: "Test" }]);
  if (u.includes("/rpc/consume_ai_budget")) return out(budget);
  if (u.includes("/chat/completions"))
    return ai
      ? out({ choices: [{ message: { content: JSON.stringify(Array.isArray(ai)?ai.shift():ai) } }] })
      : out({ error: "unavailable" }, 503);
  if (u.includes("/classes")) return out([{ id: classId, teacher_id: user }]);
  if (u.includes("/nova_courses") || u.includes("/nova_publications")) {
    if (missing) return out([]);
    if (options.method === "PATCH")
      return out(conflict ? [] : [{ ...course, ...JSON.parse(options.body) }]);
    if (options.method === "POST")
      return out([{ id: cid, ...JSON.parse(options.body) }]);
    return out([course]);
  }
  if (u.includes("/nova_demonstrations")) {
    if (options.method === "PATCH")
      return out(conflict ? [] : [{ ...demo, ...JSON.parse(options.body) }]);
    if (options.method === "POST")
      return out([{ id: did, ...JSON.parse(options.body) }]);
    return out([demo]);
  }
  return out([]);
};
const post = (body, origin = "http://localhost:3000") =>
  route.POST(
    new Request("http://localhost:3000/api/course", {
      method: "POST",
      headers: { origin, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
const assessmentEngine=await mod("assessment.mjs");
const studentEvidence=await mod("student-evidence.mjs");
function seedAssessment(){const inputs={moduleId:course.data.modules[0].id,objectiveIds:course.data.modules[0].objectiveIds,category:"Assignment",format:"Case study",emphasis:"Apply concepts and justify decisions using evidence.",duration:60,difficulty:"Core",verification:"Standard",aiPolicy:"Planning only; disclose use",collaboration:"Individual",resources:"Approved notes",knowledgeQuestions:1};course.data.assessmentDesigns=[assessmentEngine.createAssessmentDesign(course.data,inputs,"design-test","cp-test")];}
test("student cannot run assessment design stages",async()=>{reset();role="student";const r=await post({action:"assessment-create",courseId:cid,version:course.version});assert.equal(r.status,403);assert.ok(!requests.some(r=>r.url.includes("/chat/completions")));});
test("stale assessment stages do not spend model budget",async()=>{reset();seedAssessment();const r=await post({action:"assessment-step",courseId:cid,version:-1,designId:"design-test",key:"evidence"});assert.equal(r.status,409);assert.ok(!requests.some(r=>r.url.includes("consume_ai_budget")));});
test("assessment outage records failure and preserves existing course content",async()=>{reset();seedAssessment();const r=await post({action:"assessment-step",courseId:cid,version:course.version,designId:"design-test",key:"evidence"});assert.equal(r.status,400);const write=requests.find(r=>r.method==="PATCH"&&r.url.includes("nova_courses"));assert.ok(write);const data=JSON.parse(write.body).data;assert.equal(data.assessmentDesigns[0].log[0].status,"failed");assert.deepEqual(data.checkpoints,course.data.checkpoints);});
test("assessment stage validates and saves under optimistic concurrency",async()=>{reset();seedAssessment();const out=await assessmentEngine.runAssessmentStage(course.data,"design-test","evidence");ai={evidence:out.assessmentDesigns[0].evidence};const r=await post({action:"assessment-step",courseId:cid,version:course.version,designId:"design-test",key:"evidence"});assert.equal(r.status,200);assert.equal((await r.json()).data.assessmentDesigns[0].log[0].status,"complete");assert.ok(requests.some(r=>r.method==="PATCH"&&r.url.includes(`version=eq.${course.version}`)));});
test("professor approval cannot skip assessment validation",async()=>{reset();seedAssessment();const r=await post({action:"assessment-approve",courseId:cid,version:course.version,designId:"design-test"});assert.equal(r.status,400);assert.ok(!requests.some(r=>r.method==="PATCH"));});
test("authentic publication rejects edited package even with a published flag",async()=>{reset();seedAssessment();for(const stage of assessmentEngine.assessmentStages)course.data=await assessmentEngine.runAssessmentStage(course.data,"design-test",stage.key);assessmentEngine.approveAssessment(course.data,"design-test");course.data.checkpoints.find(c=>c.id==="cp-test").prompt+=" Changed task.";const r=await post({action:"release",courseId:cid});assert.equal(r.status,400);assert.ok(!requests.some(r=>r.url.includes("nova_release_course")));});
test("course API rejects unauthenticated access", async () => {
  reset();
  globalThis.novaCookies.get = () => undefined;
  const r = await route.GET();
  assert.equal(r.status, 401);
});
test("cross-origin course mutation is blocked before provider/database calls", async () => {
  reset();
  const r = await post(
    { action: "create", title: "Test" },
    "https://evil.example",
  );
  assert.equal(r.status, 400);
  assert.equal(requests.length, 0);
});
test("student cannot create a professor course", async () => {
  reset();
  role = "student";
  const r = await post({ action: "create", title: "Test" });
  assert.equal(r.status, 403);
  assert.ok(!requests.some((r) => r.method === "POST"));
});
test("course creation binds owner to authenticated professor", async () => {
  reset();
  const r = await post({
    action: "create",
    title: "My course",
    teacher_id: "attacker",
  });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).teacher_id, user);
});
test("course save uses optimistic concurrency and does not overwrite stale work", async () => {
  reset();
  conflict = true;
  const r = await post({
    action: "save",
    courseId: cid,
    version: 1,
    title: course.title,
    classId,
    data: course.data,
  });
  assert.equal(r.status, 409);
  assert.ok(requests.some((r) => r.url.includes("version=eq.1")));
});
test("graph edits invalidate approval until explicitly reapproved", async () => {
  reset();
  const data = structuredClone(course.data);
  data.objectives[0].title = "A revised measurable course objective";
  const r = await post({
    action: "save",
    courseId: cid,
    version: 1,
    title: course.title,
    classId,
    data,
  });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).data.graphApproved, false);
});
test("RLS-invisible course cannot be released by another professor", async () => {
  reset();
  missing = true;
  const r = await post({ action: "release", courseId: cid });
  assert.equal(r.status, 403);
  assert.ok(!requests.some((r) => r.method === "POST"));
});
test("student cannot review their own evidence", async () => {
  reset();
  role = "student";
  const r = await post({ action: "review", id: did, version: 1 });
  assert.equal(r.status, 403);
});
test("submitted evidence cannot be changed by student", async () => {
  reset();
  role = "student";
  const r = await post({
    action: "evidence",
    id: did,
    version: demo.version,
    artifact: "Changed",
  });
  assert.equal(r.status, 400);
  assert.match((await r.json()).error, /locked/);
});
test("AI budget denial stops graph generation before provider request", async () => {
  reset();
  budget = false;
  const r = await post({
    action: "graph",
    syllabus:
      "Introduction to retrieval and grounded generation with assessment of evidence.",
  });
  assert.equal(r.status, 400);
  assert.ok(!requests.some((r) => r.url.includes("/chat/completions")));
});
test("model outage still delivers complete evidence to the professor", async () => {
  reset();
  role = "student";
  demo.status = "followup";
  const r = await post({ action: "submit", id: did, version: demo.version });
  assert.equal(r.status, 200);
  const data = await r.json();
  assert.equal(data.status, "submitted");
  assert.equal(data.data.evaluation, null);
  assert.equal(data.data.evidenceBundle.status,"unavailable");
  assert.ok(data.data.evidenceEvents.length);
  assert.match(data.notice, /submitted/);
});
test("student submission persists exact passages and professor override history without mastery mutation",async()=>{
  reset();role="student";demo.status="followup";
  const targets=studentEvidence.evidenceTargets(demo).filter(t=>demo.data.evidence.some(e=>t.kinds.includes(e.kind)&&e.objectiveIds.includes(t.objectiveId)&&e.answer.trim()));
  ai={observations:targets.map(t=>{const e=demo.data.evidence.find(e=>t.kinds.includes(e.kind)&&e.objectiveIds.includes(t.objectiveId)&&e.answer.trim()),quote=e.answer.slice(0,35);return {targetId:t.id,status:"SUPPORTED",strength:"STRONG",confidence:"HIGH",claim:"The student supplied a relevant explanation for professor review.",supports:[{evidenceId:e.id,start:0,end:quote.length,quote}]};})};
  let r=await post({action:"submit",id:did,version:demo.version});assert.equal(r.status,200);const submitted=await r.json();assert.equal(submitted.data.evidenceBundle.status,"evaluated");assert.ok(submitted.data.evidenceEvents.some(e=>e.status==="SUPPORTED"));assert.ok(submitted.data.evidenceEvents.every(e=>e.supports.every(s=>submitted.data.evidence.find(x=>x.id===s.evidenceId).answer.slice(s.start,s.end)===s.quote)));assert.ok(!requests.some(x=>x.url.includes("nova_learning_records")));
  demo={...submitted};role="teacher";const findings=structuredClone(submitted.data.evaluation.findings);
  r=await post({action:"review",id:did,version:demo.version,review:{decision:"override",note:"I reviewed the original responses and revised the evidence interpretation.",findings}});assert.equal(r.status,200);const reviewed=await r.json();assert.equal(reviewed.status,"reviewed");assert.equal(reviewed.data.reviewHistory.length,1);assert.equal(reviewed.data.reviewHistory[0].reviewerId,user);assert.deepEqual(reviewed.data.evidenceEvents,submitted.data.evidenceEvents);
});
test("student cannot evaluate another student's submission",async()=>{reset();role="student";demo.student_id="another-student";demo.status="followup";const r=await post({action:"submit",id:did,version:demo.version});assert.equal(r.status,403);assert.ok(!requests.some(x=>x.url.includes("/chat/completions")));});
test("review normalizes unsupported findings and archives revision evidence", async () => {
  reset();
  const findings = structuredClone(demo.data.evaluation.findings);
  findings[0].evidenceIds = [];
  const r = await post({
    action: "review",
    id: did,
    version: demo.version,
    review: {
      decision: "request_revision",
      note: "Please supply a better-supported transfer explanation.",
      findings,
    },
  });
  assert.equal(r.status, 200);
  const data = await r.json();
  assert.equal(data.status, "revision_requested");
  assert.equal(data.data.revisions.length, 1);
  assert.equal(data.data.review.findings[0].confidence, "Low");
});
test("SQL migration grants reads only; browser cannot mutate assessment records", async () => {
  const sql = await fs.readFile("supabase/002-course-os.sql", "utf8");
  assert.match(
    sql,
    /revoke all on public.nova_courses,public.nova_publications,public.nova_demonstrations from anon,authenticated/,
  );
  assert.match(sql, /student_id=auth.uid\(\)/);
  assert.match(sql, /public.enrolled\(class_id\)/);
});
function compilerDraft(){course.data.compiler={inputs:{code:"CS381",level:"Introductory",weeks:12,hoursPerWeek:3,moduleCount:3,checkpointCount:3,intent:"Students demonstrate transferable understanding with evidence and explanation.",prerequisites:"",breakWeeks:[],startDate:"",assessmentWeights:{assignments:40,checkpoints:30,final:30}},log:[],schedule:[],sourceMap:[],reviewed:false};}
test("student cannot invoke compiler stages",async()=>{reset();role="student";compilerDraft();const r=await post({action:"compiler-step",courseId:cid,version:course.version,key:"intent"});assert.equal(r.status,403);assert.ok(!requests.some(x=>x.url.includes("chat/completions")));});
test("compiler rejects stale versions before spending provider budget",async()=>{reset();compilerDraft();const r=await post({action:"compiler-step",courseId:cid,version:-1,key:"intent"});assert.equal(r.status,409);assert.ok(!requests.some(x=>x.url.includes("consume_ai_budget")));});
test("compiler stage saves validated output with optimistic version guard",async()=>{reset();compilerDraft();ai={summary:"Students apply knowledge to a changed scenario.",priorities:["Explanation","Application"]};const r=await post({action:"compiler-step",courseId:cid,version:course.version,key:"intent"});assert.equal(r.status,200);const saved=await r.json();assert.equal(saved.data.compiler.log[0].status,"complete");assert.equal(saved.version,course.version+1);assert.ok(requests.some(x=>x.method==="PATCH"&&x.url.includes(`version=eq.${course.version}`)));});
test("compiler outage records a resumable failure without replacing content",async()=>{reset();compilerDraft();const old=structuredClone(course.data.modules);const r=await post({action:"compiler-step",courseId:cid,version:course.version,key:"intent"});assert.equal(r.status,400);const write=requests.find(x=>x.method==="PATCH");assert.ok(write);const body=JSON.parse(write.body);assert.equal(body.data.compiler.log[0].status,"failed");assert.deepEqual(body.data.modules,old);});
test("release endpoint rejects incomplete compiler despite approved legacy graph",async()=>{reset();compilerDraft();const r=await post({action:"release",courseId:cid});assert.equal(r.status,400);assert.ok(!requests.some(x=>x.url.includes("nova_release_course")));});
test.after(async () => {
  globalThis.fetch = nativeFetch;
  for (const k of Object.keys(process.env))
    if (!(k in env)) delete process.env[k];
  Object.assign(process.env, env);
  await fs.rm(temp, { recursive: true, force: true });
});

const contentEngine=await mod("learning-content.mjs");
test("student cannot generate or approve learning chapters",async()=>{reset();role="student";for(const action of ["content-outline","content-generate","content-approve"]){const r=await post({action,courseId:cid,version:course.version});assert.equal(r.status,403);}assert.ok(!requests.some(r=>r.url.includes("consume_ai_budget")));});
test("chapter generation checks version before model budget",async()=>{reset();const r=await post({action:"content-generate",courseId:cid,version:-1,chapterId:"chapter-m1"});assert.equal(r.status,409);assert.ok(!requests.some(r=>r.url.includes("consume_ai_budget")));});
test("chapter outline API preserves existing course data and persists JSONB extension",async()=>{reset();const r=await post({action:"content-outline",courseId:cid,version:course.version});assert.equal(r.status,200);const saved=await r.json();assert.equal(saved.data.chapters.length,course.data.modules.length);assert.deepEqual(saved.data.materials,course.data.materials);assert.equal(saved.version,course.version+1);});
test("live content route performs draft and critique before one optimistic write",async()=>{reset();course.data.chapters=contentEngine.deriveChapters(course.data);const id=course.data.chapters[0].id;const template=await contentEngine.generateChapter(course.data,id);ai=[{blocks:template.blocks,quality:[]},{issues:[],notes:["Professor verifies the source interpretation."]}];const r=await post({action:"content-generate",courseId:cid,version:course.version,chapterId:id});assert.equal(r.status,200);const saved=await r.json();assert.equal(saved.data.chapters[0].generation.mode,"live");assert.equal(saved.data.chapters[0].status,"draft");assert.equal(requests.filter(r=>r.url.includes("/chat/completions")).length,2);assert.equal(requests.filter(r=>r.method==="PATCH").length,1);});
test("content critic rejection preserves persisted course without partial write",async()=>{reset();course.data.chapters=contentEngine.deriveChapters(course.data);const id=course.data.chapters[0].id,template=await contentEngine.generateChapter(course.data,id);ai=[{blocks:template.blocks},{issues:["Unsupported claim"],notes:[]}];const r=await post({action:"content-generate",courseId:cid,version:course.version,chapterId:id});assert.equal(r.status,400);assert.match((await r.json()).error,/Unsupported claim/);assert.ok(!requests.some(r=>r.method==="PATCH"));});
test("Socratic route enforces evidence ownership and locked submissions",async()=>{reset();role="student";demo.student_id="another-student";let r=await post({action:"socratic-next",id:did,version:demo.version});assert.equal(r.status,403);reset();role="student";demo.status="submitted";r=await post({action:"socratic-next",id:did,version:demo.version});assert.equal(r.status,400);assert.ok(!requests.some(r=>r.url.includes("/chat/completions")));});
