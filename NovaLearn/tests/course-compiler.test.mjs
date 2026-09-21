import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import {pathToFileURL} from "node:url";
const temp=await fs.mkdtemp(path.join(process.cwd(),".nova-tests-compiler-"));
for(const name of ["learning-domain","course-domain","course-sample","course-compiler"]){
 let source=await fs.readFile(`lib/novalearn/${name}.ts`,"utf8");
 for(const dep of ["learning-domain","course-domain","course-sample","course-compiler"])source=source.replaceAll(`"./${dep}"`,`"./${dep}.mjs"`);
 await fs.writeFile(path.join(temp,`${name}.mjs`),ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText);
}
const load=name=>import(pathToFileURL(path.join(temp,`${name}.mjs`)).href);
const C=await load("course-compiler"),D=await load("course-domain"),L=await load("learning-domain"),{sampleCourse}=await load("course-sample");
function draft(existing=false){const d=existing?sampleCourse().data:D.blankCourse();d.syllabus="Environmental systems\nBiodiversity and ecosystems\nClimate and sustainability";d.compiler={inputs:{...C.defaultInputs(d),code:"ENVS101",intent:"Students apply concepts to evidence-based environmental solutions.",moduleCount:3,checkpointCount:2,weeks:15,hoursPerWeek:3,breakWeeks:[8]},sourceMap:[],schedule:[],log:[],reviewed:false};return d;}
async function finish(d){for(let n=0;n<30;n++){const next=C.nextCompilerJob(d);if(!next)return d;d=await C.runCompilerJob(d,next.key);}throw new Error("Pipeline did not terminate");}
test("constraints reject impossible workload, weights and checkpoint counts",()=>{const i=draft().compiler.inputs;assert.throws(()=>C.validateInputs({...i,weeks:2,breakWeeks:[]}),/teaching week/);assert.throws(()=>C.validateInputs({...i,assessmentWeights:{assignments:10,checkpoints:10,final:10}}),/100/);assert.throws(()=>C.validateInputs({...i,checkpointCount:4}),/cannot exceed/);assert.throws(()=>C.validateInputs({...i,breakWeeks:[8,8]}),/unique/);});
test("full staged compiler creates complete module packets without approving them",async()=>{const d=await finish(draft());assert.equal(d.modules.length,3);assert.equal(d.materials.length,9);assert.equal(L.learningConfig(d).activities.length,3);assert.equal(d.checkpoints.length,8);assert.equal(d.checkpoints.filter(x=>x.category==="Final project").length,1);assert.ok(d.materials.every(x=>!x.approved));assert.ok(d.checkpoints.every(x=>!x.published));assert.equal(C.nextCompilerJob(d),undefined);assert.equal(d.compiler.log.length,10);D.courseDataSchema.parse(d);});
test("planner allocates every contact hour, excludes breaks and orders prerequisites",async()=>{const d=await finish(draft()),s=d.compiler.schedule;assert.equal(s.reduce((n,s)=>n+s.hours,0),42);assert.ok(!s.flatMap(x=>x.weeks).includes(8));assert.deepEqual(s.flatMap(x=>x.weeks),Array.from({length:15},(_,n)=>n+1).filter(w=>w!==8));for(const m of d.modules)for(const id of m.prerequisites)assert.ok(d.modules.find(x=>x.id===id).week<m.week);});
test("adopting an existing course preserves module IDs, approved material and existing assessment",async()=>{const original=draft(true),ids=original.modules.map(x=>x.id),mat=structuredClone(original.materials[0]),cp=structuredClone(original.checkpoints[0]);const d=await finish(original);assert.deepEqual(d.modules.map(x=>x.id),ids);assert.deepEqual(d.materials.find(x=>x.id===mat.id),mat);assert.deepEqual(d.checkpoints.find(x=>x.id===cp.id),cp);assert.equal(original.compiler.log.length,0);});
test("completed stage cannot run twice and resume skips saved work",async()=>{const d=await C.runCompilerJob(draft(),"intent");await assert.rejects(C.runCompilerJob(d,"intent"),/stage changed/);assert.equal(C.nextCompilerJob(d).key,"sources");});
test("failed provider response leaves the original course unchanged",async()=>{const d=draft(),before=JSON.stringify(d);await assert.rejects(C.runCompilerJob(d,"intent",async()=>{throw new Error("Provider offline");}),/offline/);assert.equal(JSON.stringify(d),before);});
test("validator detects stale schedules and missing professor approvals",async()=>{const d=await finish(draft());assert.ok(C.compilerIssues(d).some(x=>x.text.includes("approval")));d.compiler.inputs.hoursPerWeek=4;assert.ok(C.compilerIssues(d).some(x=>x.text.includes("stale")));});
test("readiness passes only after content, graph and final review approval",async()=>{const d=await finish(draft());d.graphApproved=true;d.compiler.reviewed=true;d.materials.forEach(x=>x.approved=true);d.checkpoints.forEach(x=>x.published=true);d.learning.activities.forEach(x=>x.approved=true);assert.deepEqual(C.compilerIssues(d).filter(x=>x.level==="error"),[]);});
test("student publication strips compiler prompts, internal logs and answer keys",async()=>{const d=await finish(draft());d.graphApproved=true;d.learning.activities.forEach(x=>x.approved=true);d.learning.releasedModuleIds=d.modules.map(x=>x.id);const p=D.publishable({...sampleCourse(),data:d});assert.equal(p.compiler,undefined);assert.ok(p.learning.activities.every(x=>x.answer===undefined&&x.explanation===""));});
test("old course JSON remains valid without compiler metadata",()=>{assert.equal(D.courseDataSchema.parse(sampleCourse().data).compiler,undefined);});
test.after(async()=>{await fs.rm(temp,{recursive:true,force:true});});
