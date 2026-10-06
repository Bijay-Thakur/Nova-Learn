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
await compile("lib/novalearn/evidence-repository.ts", "evidence-repository.mjs", [
  ["'./server'", "'./server.mjs'"],
  ["'./course-domain'", "'./domain.mjs'"],
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
  ["'@/lib/novalearn/evidence-repository'", "'./evidence-repository.mjs'"],
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
let role, course, demo, requests, budget, ai, missing, conflict, persistenceFailure, evidenceRows, evidenceRuns, reviewRows;
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
  persistenceFailure=false;evidenceRows=[];evidenceRuns=[];reviewRows=[];
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
  if(u.includes("/rpc/nova_save_evidence")){
    if(persistenceFailure)return out({message:"Database request failed"},503);
    const p=JSON.parse(options.body);
    if(conflict||p.p_version!==demo.version)return out({message:"This record changed in another session. Reload before saving."},409);
    evidenceRuns.push({id:p.p_bundle.id,demonstration_id:did,bundle:p.p_bundle,artifact_snapshot:structuredClone(p.p_data.evidence),created_at:new Date().toISOString()});
    evidenceRows.push(...p.p_events.map(e=>({id:e.id,run_id:p.p_bundle.id,demonstration_id:did,course_id:cid,student_id:user,
      module_id:e.moduleId,chapter_ids:e.chapterIds,topic_ids:e.topicIds,concept_ids:e.conceptIds,objective_id:e.objectiveId,
      assessment_id:e.assessmentId,assessment_item_id:e.assessmentItemId,target_id:e.targetId,evidence_type:e.type,
      status:e.status,strength:e.strength,confidence:e.confidence,claim:e.claim,expected:e.expected,criterion:e.criterion,
      supports:e.supports,misconception:e.misconception,attempt_number:e.attemptNumber,variant_id:e.variantId,
      scaffolding:e.scaffolding,evaluator:e.evaluator,routing:e.routing,prompt_version:e.promptVersion,observed_at:e.at})));
    demo={...demo,data:p.p_data,status:"submitted",version:demo.version+1};return out([demo]);
  }
  if(u.includes("/rpc/nova_record_evidence_review")){
    if(persistenceFailure)return out({message:"Database request failed"},503);
    const p=JSON.parse(options.body);
    if(conflict||p.p_version!==demo.version)return out({message:"This record changed in another session. Reload before saving."},409);
    reviewRows.push({demonstration_id:did,run_id:p.p_data.evidenceBundle?.id||null,course_id:cid,student_id:user,
      reviewer_id:p.p_review.reviewerId,decision:p.p_review.decision,note:p.p_review.note,
      reviewed_findings:p.p_review.findings,previous_findings:demo.data.evaluation?.findings,created_at:p.p_review.at});
    demo={...demo,data:p.p_data,status:p.p_status,version:demo.version+1};return out([demo]);
  }
  if(u.includes("/nova_evidence_events")){
    let rows=evidenceRows;
    if(u.includes("student_id=eq."))rows=rows.filter(x=>x.student_id===new URL(u).searchParams.get("student_id")?.slice(3));
    if(u.includes("objective_id=eq."))rows=rows.filter(x=>x.objective_id===new URL(u).searchParams.get("objective_id")?.slice(3));
    if(u.includes("concept_ids=cs."))rows=rows.filter(x=>x.concept_ids.includes(new URL(u).searchParams.get("concept_ids")?.slice(4,-1)));
    return out(rows);
  }
  if(u.includes("/nova_evidence_runs"))return out(evidenceRuns);
  if(u.includes("/nova_evidence_reviews"))return out(reviewRows);
  if (u.includes("/nova_courses") || u.includes("/nova_publications")) {
    if (missing) return out([]);
    if(u.includes("teacher_id=eq.")&&course.teacher_id!==user)return out([]);
    if (options.method === "PATCH")
      return out(conflict ? [] : [{ ...course, ...JSON.parse(options.body) }]);
    if (options.method === "POST")
      return out([{ id: cid, ...JSON.parse(options.body) }]);
    return out([course]);
  }
  if (u.includes("/nova_demonstrations")) {
    if (options.method === "PATCH"){
      if(conflict)return out([]);
      demo={...demo,...JSON.parse(options.body)};return out([demo]);
    }
    if (options.method === "POST")
      return out([{ id: did, ...JSON.parse(options.body) }]);
    if(role==="student"&&demo.student_id!==user)return out([]);
    if(role==="teacher"&&course.teacher_id!==user)return out([]);
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
const evidenceRepository=await mod("evidence-repository.mjs");
function supportedEvidence(){
  const targets=studentEvidence.evidenceTargets(demo).filter(t=>demo.data.evidence.some(e=>t.kinds.includes(e.kind)&&e.objectiveIds.includes(t.objectiveId)&&e.answer.trim()));
  ai={observations:targets.map(t=>{const e=demo.data.evidence.find(e=>t.kinds.includes(e.kind)&&e.objectiveIds.includes(t.objectiveId)&&e.answer.trim()),quote=e.answer.slice(0,35);return {targetId:t.id,status:"SUPPORTED",strength:"STRONG",confidence:"HIGH",claim:"The student supplied a relevant explanation for professor review.",supports:[{evidenceId:e.id,start:0,end:quote.length,quote}]};})};
}
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
  supportedEvidence();
  let r=await post({action:"submit",id:did,version:demo.version});assert.equal(r.status,200);const submitted=await r.json();assert.equal(submitted.data.evidenceBundle.status,"evaluated");assert.ok(submitted.data.evidenceEvents.some(e=>e.status==="SUPPORTED"));assert.ok(submitted.data.evidenceEvents.every(e=>e.supports.every(s=>submitted.data.evidence.find(x=>x.id===s.evidenceId).answer.slice(s.start,s.end)===s.quote)));assert.ok(!requests.some(x=>x.url.includes("nova_learning_records")));
  role="teacher";const findings=structuredClone(submitted.data.evaluation.findings);
  r=await post({action:"review",id:did,version:demo.version,review:{decision:"override",note:"I reviewed the original responses and revised the evidence interpretation.",findings}});assert.equal(r.status,200);const reviewed=await r.json();assert.equal(reviewed.status,"reviewed");assert.equal(reviewed.data.reviewHistory.length,1);assert.equal(reviewed.data.reviewHistory[0].reviewerId,user);assert.deepEqual(reviewed.data.evidenceEvents.map(e=>e.id),submitted.data.evidenceEvents.map(e=>e.id));assert.ok(reviewed.data.evidenceEvents.some(e=>e.criterion));
});
test("submission atomically stores independent rows and frozen artifact references",async()=>{
  reset();role="student";demo.status="followup";supportedEvidence();
  const before=structuredClone(demo.data.evidence),r=await post({action:"submit",id:did,version:demo.version});
  assert.equal(r.status,200);const submitted=await r.json();
  assert.equal(evidenceRuns.length,1);assert.equal(evidenceRows.length,submitted.data.evidenceBundle.eventIds.length);
  assert.ok(evidenceRows.some(e=>e.evidence_type==="SOCRATIC_RESPONSE"&&e.supports.length));
  assert.equal(demo.data.evidenceEvents,undefined);assert.equal(demo.data.evidenceStoreVersion,1);
  assert.deepEqual(evidenceRuns[0].artifact_snapshot,before);
  for(const e of evidenceRows)for(const s of e.supports){const a=evidenceRuns[0].artifact_snapshot.find(a=>a.id===s.evidenceId);assert.equal(a.answer.slice(s.start,s.end),s.quote);}
  const refreshed=await route.GET();assert.equal(refreshed.status,200);
  const loaded=(await refreshed.json()).demonstrations[0];assert.equal(loaded.data.evidenceEvents.length,evidenceRows.length);
  assert.ok(loaded.data.evidenceEvents.every(e=>e.criterion===""));
  role="teacher";const professor=(await(await route.GET()).json()).demonstrations[0];
  assert.equal(professor.data.evidenceArchive.length,1);assert.deepEqual(professor.data.evidenceArchive[0].artifacts,before);
  assert.ok(professor.data.evidenceEvents.some(e=>e.criterion));
});
test("persistence outage never reports a submission or adds negative evidence",async()=>{
  reset();role="student";demo.status="followup";persistenceFailure=true;
  const r=await post({action:"submit",id:did,version:demo.version});assert.equal(r.status,503);
  assert.match((await r.json()).error,/persistence unavailable/);assert.equal(demo.status,"followup");
  assert.equal(evidenceRows.length,0);assert.equal(evidenceRuns.length,0);
});
test("stale retry cannot duplicate an evidence run or overwrite the original",async()=>{
  reset();role="student";demo.status="followup";const original=structuredClone(demo);
  assert.equal((await post({action:"submit",id:did,version:demo.version})).status,200);
  const first=structuredClone(evidenceRows);
  await assert.rejects(()=>evidenceRepository.appendEvidence(original,first,original.data.evidenceBundle||{id:"retry"}),/another session/);
  assert.deepEqual(evidenceRows,first);assert.equal(evidenceRuns.length,1);
});
test("review RPC retains original machine observations and prior interpretation",async()=>{
  reset();role="student";demo.status="followup";supportedEvidence();
  assert.equal((await post({action:"submit",id:did,version:demo.version})).status,200);
  const original=structuredClone(evidenceRows);role="teacher";
  const findings=structuredClone(demo.data.evaluation.findings);findings[0].level="Needs verification";
  const r=await post({action:"review",id:did,version:demo.version,review:{decision:"override",note:"I reviewed the explanation and require further verification.",findings}});
  assert.equal(r.status,200);assert.deepEqual(evidenceRows,original);assert.equal(reviewRows.length,1);
  assert.notDeepEqual(reviewRows[0].previous_findings,reviewRows[0].reviewed_findings);
  assert.equal((await r.json()).data.reviewHistory[0].reviewerId,user);
  const history=await evidenceRepository.getEvidenceHistory({studentId:user,courseId:cid});
  assert.ok(history.some(h=>h.reviews.some(v=>v.previous_findings&&v.reviewed_findings)));
});
test("failed professor review does not erase the machine record or claim a decision",async()=>{
  reset();persistenceFailure=true;
  const r=await post({action:"review",id:did,version:demo.version,review:{decision:"override",note:"I would adjust this interpretation after reading the work.",findings:demo.data.evaluation.findings}});
  assert.equal(r.status,503);assert.equal(reviewRows.length,0);assert.equal(demo.status,"submitted");
});
test("revision leaves earlier run and raw student work immutable",async()=>{
  reset();role="student";demo.status="followup";
  assert.equal((await post({action:"submit",id:did,version:demo.version})).status,200);
  const first=structuredClone(evidenceRows),artifact=structuredClone(evidenceRuns[0].artifact_snapshot);
  role="teacher";let r=await post({action:"review",id:did,version:demo.version,review:{decision:"request_revision",note:"Please revise your explanation and defend the changed scenario.",findings:demo.data.evaluation?.findings||demo.snapshot.objectives.map(o=>({objectiveId:o.id,level:"Needs verification",confidence:"Low",rationale:"More evidence needed",evidenceIds:[],uncertainty:"Review pending"}))}});assert.equal(r.status,200);
  role="student";r=await post({action:"evidence",id:did,version:demo.version,artifact:"Revised artifact with stronger source checks and a grounded retrieval plan.",explanation:"I now distinguish failed retrieval from generation by testing the same answer against supplied relevant passages.",transfer:"I would test the new context against a held out reference set and justify the change.",followupAnswers:{},disclosure:"No tools",helpUsed:"None"});assert.equal(r.status,200);
  assert.equal(demo.data.evidenceBundle,undefined);
  ai={questions:[{id:"one",prompt:"Which passage makes this diagnosis credible?",objectiveIds:[demo.snapshot.checkpoint.objectiveIds[0]]},{id:"two",prompt:"Which alternate explanation did you rule out?",objectiveIds:[demo.snapshot.checkpoint.objectiveIds[1]]}]};
  r=await post({action:"followups",id:did,version:demo.version});assert.equal(r.status,200);
  r=await post({action:"evidence",id:did,version:demo.version,artifact:"Revised artifact with stronger source checks and a grounded retrieval plan.",explanation:"I now distinguish failed retrieval from generation by testing the same answer against supplied relevant passages.",transfer:"I would test the new context against a held out reference set and justify the change.",followupAnswers:{q0:"The selected approved passage explicitly supports my diagnosis.",q1:"I ruled out generation by controlling the input passages."},disclosure:"No tools",helpUsed:"None"});assert.equal(r.status,200);
  r=await post({action:"submit",id:did,version:demo.version});assert.equal(r.status,200);
  assert.equal(evidenceRuns.length,2);assert.deepEqual(evidenceRuns[0].artifact_snapshot,artifact);
  assert.deepEqual(evidenceRows.slice(0,first.length),first);assert.ok(evidenceRows.length>first.length);
});
test("history API is scoped, queryable, and does not parse demonstration JSON",async()=>{
  reset();role="student";demo.status="followup";
  assert.equal((await post({action:"submit",id:did,version:demo.version})).status,200);
  const callsBefore=requests.length;const objectiveId=evidenceRows[0].objective_id;
  role="teacher";const history=await evidenceRepository.getEvidenceHistory({studentId:user,courseId:cid,objectiveId});
  assert.ok(history.length);assert.ok(history.every(x=>x.event.objectiveId===objectiveId));
  assert.ok(!requests.slice(callsBefore).some(x=>x.url.includes("/nova_demonstrations")));
  role="student";const own=await evidenceRepository.getEvidenceHistory({studentId:user,courseId:cid});assert.ok(own.every(x=>x.event.criterion===""));
  await assert.rejects(()=>evidenceRepository.getEvidenceHistory({studentId:"55555555-5555-4555-8555-555555555555",courseId:cid}),/not permitted/);
  role="teacher";
  course.teacher_id="different-teacher";
  await assert.rejects(()=>evidenceRepository.getEvidenceHistory({studentId:user,courseId:cid}),/not permitted/);
});
test("token-scoped GET does not hydrate another student or professor's evidence",async()=>{
  reset();role="student";demo.student_id="another-student";
  let r=await route.GET();assert.equal(r.status,200);assert.equal((await r.json()).demonstrations.length,0);
  assert.ok(!requests.some(x=>x.url.includes("/nova_evidence_events")));
  reset();role="teacher";course.teacher_id="another-professor";
  r=await route.GET();assert.equal(r.status,200);assert.equal((await r.json()).demonstrations.length,0);
  assert.ok(!requests.some(x=>x.url.includes("/nova_evidence_events")));
});
test("legacy JSONB evidence and review remain visible without normalized rows",async()=>{
  reset();demo.data.evidenceEvents=[{id:"legacy",claim:"Legacy work",supports:[],status:"AMBIGUOUS",strength:"INSUFFICIENT",confidence:"LOW"}];
  demo.data.reviewHistory=[{decision:"override",note:"Historical decision",findings:[],at:"2026-09-20T10:00:00Z"}];
  const r=await route.GET();assert.equal(r.status,200);const saved=(await r.json()).demonstrations[0];
  assert.equal(saved.data.evidenceEvents[0].id,"legacy");assert.equal(saved.data.reviewHistory[0].note,"Historical decision");
});
test("legacy JSONB observations coexist with newly normalized attempts",async()=>{
  reset();role="student";demo.status="followup";
  demo.data.evidenceEvents=[{id:"legacy",claim:"Historical observation",supports:[],status:"AMBIGUOUS",strength:"INSUFFICIENT",confidence:"LOW",expected:"",criterion:""}];
  assert.equal((await post({action:"submit",id:did,version:demo.version})).status,200);
  assert.equal(demo.data.evidenceEvents.length,1);assert.equal(evidenceRows.some(e=>e.id==="legacy"),false);
  const loaded=(await(await route.GET()).json()).demonstrations[0];
  assert.ok(loaded.data.evidenceEvents.some(e=>e.id==="legacy"));
  assert.ok(loaded.data.evidenceEvents.some(e=>e.id!=="legacy"));
});
test("migration keeps evidence private and makes writes atomic and version checked",async()=>{
  const sql=await fs.readFile("supabase/004-evidence-history.sql","utf8");
  for(const table of ["nova_evidence_runs","nova_evidence_events","nova_evidence_reviews"]){
    assert.match(sql,new RegExp(`create table if not exists public\\.${table}`));
    assert.match(sql,new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(sql,/revoke all on public\.nova_evidence_runs,public\.nova_evidence_events,public\.nova_evidence_reviews from public,anon,authenticated/);
  assert.match(sql,/security invoker/);assert.match(sql,/for update/);assert.match(sql,/d\.version<>p_version/);
  assert.match(sql,/grant execute on function public\.nova_save_evidence[^\n]* to service_role/);
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
