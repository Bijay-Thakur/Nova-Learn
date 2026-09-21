import { z } from "zod";
import { compilerInputSchema, compilerSchema, graphSchema, materialSchema, checkpointSchema, courseDataSchema, validateGraph, validateCheckpoint, retrieve, type CourseData } from "./course-domain";
import { activitySchema, learningConfig, validateLearning } from "./learning-domain";

export type CompilerInputs = z.infer<typeof compilerInputSchema>;
export type CompilerJob = {key:string;name:string;group:string};
export type CompilerModel = (system:string,input:unknown)=>Promise<{value:any;routing:string}>;
export function reviewFingerprint(d:CourseData){return JSON.stringify([d.modules,d.objectives,d.sources,d.materials,d.checkpoints,d.learning?.activities,d.learning?.concepts,d.compiler?.inputs]);}
export function defaultInputs(data:CourseData):CompilerInputs {
  const l=learningConfig(data);
  return {code:"",level:"Introductory",weeks:l.weeks,hoursPerWeek:3,moduleCount:data.modules.length||6,checkpointCount:3,intent:l.teachingIntent||"",prerequisites:"",breakWeeks:[],startDate:"",assessmentWeights:{assignments:40,checkpoints:30,final:30}};
}
export function validateInputs(raw:unknown) {
  const i=compilerInputSchema.parse(raw);
  if(new Set(i.breakWeeks).size!==i.breakWeeks.length || i.breakWeeks.some(w=>w>i.weeks))throw new Error("Break weeks must be unique and inside the semester.");
  if(i.moduleCount>i.weeks-i.breakWeeks.length)throw new Error("Each module needs at least one teaching week. Reduce modules or break weeks.");
  if(i.checkpointCount>i.moduleCount)throw new Error("Checkpoint count (including final) cannot exceed module count.");
  if(Object.values(i.assessmentWeights).reduce((a,b)=>a+b,0)!==100)throw new Error("Assessment category weights must total 100%.");
  if(i.checkpointCount===1 && i.assessmentWeights.checkpoints!==0)throw new Error("With only a final checkpoint, set other checkpoint weight to 0%.");
  if(i.startDate && (Number.isNaN(Date.parse(i.startDate))||new Date(i.startDate).toISOString().slice(0,10)!==i.startDate))throw new Error("Enter a valid semester start date.");
  return i;
}
export function compilerJobs(d:CourseData):CompilerJob[] {
  return [{key:"intent",name:"Intent interpreter",group:"Blueprint"},{key:"sources",name:"Material parser",group:"Blueprint"},{key:"constraints",name:"Constraint engine",group:"Blueprint"},{key:"graph",name:"Concept graph builder",group:"Blueprint"},{key:"planner",name:"Weekly planner",group:"Modules"},...d.modules.map(m=>({key:`module:${m.id}`,name:m.title,group:"Modules"})),{key:"assessments",name:"Assessment mapper",group:"Assessments"},{key:"validator",name:"Course validator",group:"Review"}];
}
export function nextCompilerJob(d:CourseData) {
  return compilerJobs(d).find(j=>!d.compiler?.log.some(l=>l.key===j.key&&l.status==="complete"));
}
export function planSemester(d:CourseData,i:CompilerInputs) {
  validateInputs(i);validateGraph(d);
  if(d.modules.length!==i.moduleCount)throw new Error(`The graph has ${d.modules.length} modules; your input requests ${i.moduleCount}. Edit the graph or input count before planning.`);
  const ordered:CourseData["modules"]=[], seen=new Set<string>();
  const visit=(id:string)=>{if(seen.has(id))return;const m=d.modules.find(x=>x.id===id)!;m.prerequisites.forEach(visit);seen.add(id);ordered.push(m);};
  d.modules.forEach(m=>visit(m.id));
  const weeks=Array.from({length:i.weeks},(_,n)=>n+1).filter(w=>!i.breakWeeks.includes(w));
  const base=Math.floor(weeks.length/ordered.length),extra=weeks.length%ordered.length;
  let cursor=0;
  return ordered.map((m,index)=>{const count=base+(index<extra?1:0),slot=weeks.slice(cursor,cursor+count);cursor+=count;return {moduleId:m.id,weeks:slot,hours:Math.round(slot.length*i.hoursPerWeek*100)/100,checkpoint:Array.from({length:i.checkpointCount},(_,n)=>Math.ceil((n+1)*ordered.length/i.checkpointCount)-1).includes(index)};});
}
export type CompilerIssue={level:"error"|"warning";text:string};
export function compilerIssues(d:CourseData):CompilerIssue[] {
  const out:CompilerIssue[]=[], error=(text:string)=>out.push({level:"error",text});
  if(!d.compiler)return [{level:"error",text:"Save professor inputs first."}];
  const i=d.compiler.inputs;
  try{validateInputs(i);validateGraph(d);validateLearning(d);}catch(e){error((e as Error).message);}
  if(d.modules.length!==i.moduleCount)error("Module count does not match professor inputs.");
  try{const expected=planSemester(d,i);if(JSON.stringify(expected)!==JSON.stringify(d.compiler.schedule))error("Schedule is stale. Re-run the weekly planner after graph or time-budget edits.");}catch(e){error((e as Error).message);}
  if(!d.graphApproved)error("Professor approval of the course graph is required.");
  const l=learningConfig(d);
  for(const concept of l.concepts)for(const prerequisiteId of concept.prerequisites){
    const p=l.concepts.find(x=>x.id===prerequisiteId),m=d.modules.find(x=>x.id===concept.moduleId),pm=d.modules.find(x=>x.id===p?.moduleId);
    if(p&&m&&pm&&p.moduleId!==concept.moduleId&&pm.week>=m.week)error(`${concept.name}: its prerequisite ${p.name} is not scheduled earlier. Add the corresponding module prerequisite and recalculate the schedule.`);
  }
  for(const m of d.modules){
    for(const kind of ["Lecture notes","Practice","Worked example"]){if(!d.materials.some(x=>x.moduleId===m.id&&x.kind===kind&&x.approved))error(`${m.title}: review and approve ${kind.toLowerCase()}.`);}
    if(!l.activities.some(x=>x.moduleId===m.id&&x.approved))error(`${m.title}: approve a mini-quiz.`);
    for(const category of ["Assignment","Teach Nova"]){if(!d.checkpoints.some(x=>x.moduleId===m.id&&x.category===category&&x.published))error(`${m.title}: review the ${category} activity.`);}
  }
  const summative=d.checkpoints.filter(x=>x.category==="Checkpoint"||x.category==="Final project");
  if(summative.length!==i.checkpointCount)error("Summative checkpoint count does not match professor inputs (the final is included).");
  if(!summative.some(x=>x.category==="Final project"))error("An integrated final project is required.");
  for(const cp of d.checkpoints){try{validateCheckpoint(cp,{...d,graphApproved:true});}catch(e){error(`${cp.title}: ${(e as Error).message}`);}if(!cp.published)error(`${cp.title}: assessment still needs professor approval.`);}
  if(d.objectives.some(o=>!d.checkpoints.some(cp=>cp.objectiveIds.includes(o.id))))error("Some learning outcomes have no assessment evidence.");
  if(!d.compiler.reviewed)error("Complete the final professor review acknowledgment.");
  if(!d.sources.some(s=>s.approved))out.push({level:"warning",text:"No approved reference material. Content is an ungrounded draft until independently checked by the professor."});
  if(d.materials.some(m=>!m.sourceIds.length))out.push({level:"warning",text:"Some teaching materials have no source citations. Verify their factual accuracy before releasing."});
  return out;
}

function templateGraph(d:CourseData,i:CompilerInputs){
  const topics=d.syllabus.split(/\n+/).map(s=>s.replace(/^\s*[\d.)-]+\s*/,"").trim()).filter(s=>s.length>2);
  return {objectives:Array.from({length:Math.min(i.moduleCount,5)},(_,n)=>({id:`co${n+1}`,title:`Analyze and apply ${topics[n]?.slice(0,130)||`course topic ${n+1}`} using evidence and explanation`,level:"Apply"})),modules:Array.from({length:i.moduleCount},(_,n)=>({id:`cm${n+1}`,title:topics[n]?.slice(0,180)||`Module ${n+1} — refine this topic`,week:n+1,concepts:[topics[n]?.slice(0,100)||`Concept ${n+1}`],objectiveIds:[`co${n%Math.min(i.moduleCount,5)+1}`],prerequisites:n?[`cm${n}`]:[]}))};
}
function assessmentTemplate(d:CourseData,moduleId:string,category:"Assignment"|"Teach Nova"|"Checkpoint"|"Final project",n:number){
  const m=d.modules.find(m=>m.id===moduleId)!;
  const objectiveIds=category==="Final project"?d.objectives.slice(0,10).map(o=>o.id):m.objectiveIds.slice(0,10);
  const base=Math.floor(100/objectiveIds.length);
  return {id:`compiler-${category.replaceAll(" ","-").toLowerCase()}-${n}`,moduleId,category,title:`${category}: ${m.title}`.slice(0,200),objectiveIds,points:100,prompt:`${category==="Teach Nova"?"Teach Nova in your own words. Explain":"Build a worked response to a realistic problem involving"} ${m.title}. Include a concrete example, your reasoning, supporting evidence, and a reflection on limitations. ${category==="Final project"?"Integrate the course outcomes into one real-world project and prepare to defend your choices orally.":"Adapt the example to a new situation."}`,rubric:objectiveIds.map((id,k)=>({objectiveId:id,criterion:d.objectives.find(o=>o.id===id)!.title,weight:base+(k===0?100-base*objectiveIds.length:0),descriptor:"Excellent (4): accurate, independently justified application with evidence and limitations. Proficient (3): sound application with minor gaps. Developing (2): partial reasoning or weak evidence. Beginning (1): unsupported claims or substantial conceptual gaps."})),followupStrategy:"Ask one question about an assumption and one about a changed scenario. Require explanation rather than recall.",transferPrompt:"Change an important condition in your submitted case. Explain how your solution changes and justify what remains valid.",dueAt:"",published:false};
}
function dueDate(d:CourseData,moduleId:string){const i=d.compiler!.inputs,s=d.compiler!.schedule.find(s=>s.moduleId===moduleId);if(!i.startDate||!s)return "";const dt=new Date(`${i.startDate}T12:00:00Z`);dt.setUTCDate(dt.getUTCDate()+Math.max(...s.weeks)*7-1);return dt.toISOString().slice(0,10);}

/** One bounded request, one version-checked persistence operation in the caller.
 * No background swarm, timers pretending to work, or automatic publication. */
export async function runCompilerJob(original:CourseData,key:string,model?:CompilerModel):Promise<CourseData>{
  const d=structuredClone(original),c=d.compiler;
  if(!c)throw new Error("Save compiler inputs first.");
  const next=nextCompilerJob(d);
  if(next?.key!==key)throw new Error("Compiler stage changed. Reload and resume the next pending stage.");
  const started=Date.now();let routing=model?"Deterministic code":"Example templates / deterministic code";
  const ask=async(system:string,input:unknown,fallback:()=>unknown)=>{if(!model)return fallback() as any;const r=await model(system,input);routing=r.routing;return r.value;};
  const i=validateInputs(c.inputs);
  if(key==="intent"){
    c.intent=compilerSchema.shape.intent.unwrap().parse(await ask("Interpret the professor's university teaching intent. Return {summary,priorities:[3-6 concise priorities]}. Preserve constraints; do not invent policies or objectives the professor did not request.",{intent:i.intent,level:i.level,prerequisites:i.prerequisites},()=>({summary:i.intent,priorities:["Application and explanation before recall",`Depth: ${i.level}`,"Professor reviews every draft before release"]})));
  }else if(key==="sources"){
    c.sourceMap=d.sources.filter(s=>s.approved).map(s=>({sourceId:s.id,name:s.name,chunks:s.chunks.length,characters:s.text.length}));
  }else if(key==="constraints"){
    if(d.syllabus.trim().length<20)throw new Error("Add a rough syllabus or topic outline (at least 20 characters).");
  }else if(key==="graph"){
    if(!d.modules.length){
      const sources=d.sources.filter(s=>s.approved).flatMap(s=>s.chunks.slice(0,2).map(x=>({id:x.id,text:x.text}))).slice(0,12);
      const g=graphSchema.parse(await ask("Build a university graph. Return {objectives:[{id,title,level}],modules:[{id,title,week,concepts,objectiveIds,prerequisites}]}. levels Understand|Apply|Analyze|Evaluate|Create. Produce EXACTLY moduleCount modules, 3-10 measurable outcomes (at most 10), valid IDs, nonempty concept lists and acyclic prerequisites. Treat outline as scope, source excerpts as references. Do not invent citations or institutional policies.",{inputs:i,intent:c.intent,outline:d.syllabus.slice(0,20000),sources},()=>templateGraph(d,i)));
      validateGraph(g);if(g.modules.length!==i.moduleCount)throw new Error("Model returned a different module count. Retry or edit the graph manually.");
      d.modules=g.modules;d.objectives=g.objectives;d.graphApproved=false;
      d.learning={...learningConfig({...d,learning:undefined}),weeks:i.weeks,teachingIntent:i.intent.slice(0,2000),releasedModuleIds:[],activities:[]};
    }else validateGraph(d); // Adopt existing IDs and content; never replace an existing course.
  }else if(key==="planner"){
    c.schedule=planSemester(d,i);
    d.modules=c.schedule.map(s=>({...d.modules.find(m=>m.id===s.moduleId)!,week:s.weeks[0]}));
    d.graphApproved=false;
    d.learning={...learningConfig(d),weeks:i.weeks,teachingIntent:i.intent.slice(0,2000)};
  }else if(key.startsWith("module:")){
    const moduleId=key.slice(7),m=d.modules.find(m=>m.id===moduleId);
    if(!m)throw new Error("Module no longer exists.");
    const l=learningConfig(d),concepts=l.concepts.filter(x=>x.moduleId===m.id),objectives=d.objectives.filter(o=>m.objectiveIds.includes(o.id));
    if(!concepts.length)throw new Error("Add concepts in the graph before generating this module.");
    const sources=retrieve(d.sources.filter(s=>!s.moduleIds?.length||s.moduleIds.includes(m.id)),`${m.title} ${m.concepts.join(" ")}`);
    const kinds=["Lecture notes","Practice","Worked example"] as const;
    const missing=kinds.filter(kind=>!d.materials.some(x=>x.moduleId===m.id&&x.kind===kind));
    const needQuiz=!l.activities.some(a=>a.moduleId===m.id),categories=(["Assignment","Teach Nova"] as const).filter(category=>!d.checkpoints.some(a=>a.moduleId===m.id&&a.category===category));
    if(missing.length||needQuiz||categories.length){
      const value=await ask("Draft ONE compact university module packet. Return {materials:[{title,kind,content,sourceIds}],quiz:{title,question,options:[3 strings],answer:0-based-index,explanation,conceptIds,difficulty:'Core',sourceIds},assessments:[{category,title,prompt,rubric:[{objectiveId,criterion,weight,descriptor}],followupStrategy,transferPrompt}]}. Generate only requested missing kinds/categories; quiz can be null if not needed. Materials ~300 words each, include teach, guided practice and application. Assessment rubric integer weights sum100; cover every supplied objective; descriptors have Excellent4/Proficient3/Developing2/Beginning1. Teach Nova asks explanation-back plus example, assignment applied artifact plus reflection. Cite only supplied chunk IDs inline and sourceIds; if no sources, clearly prefix content 'Ungrounded draft — professor verification required' and do not invent references. Mini-quiz diagnoses a concept with explanatory distractors.",{module:m,objectives,concepts,sources,missingKinds:missing,needQuiz,categories,intent:c.intent},()=>({materials:missing.map(kind=>({kind,title:`${kind}: ${m.title}`,content:`Example template — professor editing required\n\n${m.title}\n\nLearning goals: ${objectives.map(o=>o.title).join("; ")}\n\n${sources.length?sources.map(s=>`${s.text}\n[${s.id}]`).join("\n"):"Ungrounded draft — professor verification required. Add an explanation and a concrete subject-specific example here."}\n\n${kind==="Practice"?"Compare two solutions, justify the stronger one, then solve a similar case with one changed assumption.":kind==="Worked example"?"Apply this concept to a realistic case. Show your steps, assumptions, evidence and limitations.":"Explain the key concepts, connect them to prior knowledge, and ask students to explain them back."}`,sourceIds:sources.map(s=>s.id)})),quiz:needQuiz?{title:`Example mini-quiz: ${m.title}`,question:`When applying ${m.concepts[0]}, which approach best demonstrates understanding? Refine this template into a subject-specific diagnostic.`,options:["Repeat a definition without an example","Explain a relevant example and justify the reasoning","Give an answer without showing evidence"],answer:1,explanation:"Explanation and justified application provide more evidence than recall alone. This is a template for professor refinement.",conceptIds:[concepts[0].id],difficulty:"Core",sourceIds:[]}:null,assessments:categories.map((cat,n)=>assessmentTemplate(d,m.id,cat,d.modules.indexOf(m)*2+n))}));
      const packet=z.object({materials:z.array(z.unknown()).max(3),quiz:z.unknown().nullable(),assessments:z.array(z.unknown()).max(2)}).parse(value);
      const materialDrafts=packet.materials.map((x:any)=>materialSchema.parse({...x,id:`compiler-material-${m.id}-${String(x.kind).replaceAll(" ","-")}`,moduleId:m.id,approved:false}));
      if(materialDrafts.length!==missing.length||missing.some(kind=>materialDrafts.filter(x=>x.kind===kind).length!==1))throw new Error("Module packet did not include the requested material kinds.");
      for(const x of materialDrafts)if(x.sourceIds.some(id=>!sources.some(s=>s.id===id)))throw new Error("Module packet cited an unknown source.");
      d.materials.push(...materialDrafts);
      if(needQuiz){const q=activitySchema.parse({...packet.quiz as any,id:`compiler-quiz-${m.id}`,moduleId:m.id,kind:"Diagnostic",approved:false});if(q.answer===undefined||q.answer>=q.options.length||q.conceptIds.some(id=>!concepts.some(c=>c.id===id))||q.sourceIds.some(id=>!sources.some(s=>s.id===id)))throw new Error("Mini-quiz failed answer, concept or citation validation.");l.activities.push(q);}
      const assessments=packet.assessments.map((x:any)=>checkpointSchema.parse({...x,id:`compiler-activity-${m.id}-${String(x.category).replaceAll(" ","-")}`,moduleId:m.id,objectiveIds:m.objectiveIds,points:100,published:false,dueAt:dueDate(d,m.id)}));
      if(assessments.length!==categories.length||categories.some(cat=>assessments.filter(x=>x.category===cat).length!==1))throw new Error("Module packet omitted an assignment or Teach Nova activity.");
      assessments.forEach(cp=>validateCheckpoint(cp,{...d,graphApproved:true}));d.checkpoints.push(...assessments);d.learning=l;
    }
  }else if(key==="assessments"){
    if(d.objectives.length>10)throw new Error("The integrated final currently supports up to 10 course outcomes. Consolidate outcomes before mapping assessments.");
    const slots=c.schedule.filter(s=>s.checkpoint),missing=slots.map((s,n)=>({s,n,category:n===slots.length-1?"Final project" as const:"Checkpoint" as const})).filter(({s,category})=>!d.checkpoints.some(cp=>cp.moduleId===s.moduleId&&cp.category===category));
    if(missing.length){
      const templates=missing.map(({s,n,category})=>({...assessmentTemplate(d,s.moduleId,category,n),dueAt:dueDate(d,s.moduleId)}));
      const result=await ask("Design compact authentic summative assessments from the supplied template mappings. Return {assessments:[{id,title,prompt,rubric:[{objectiveId,criterion,weight,descriptor}],followupStrategy,transferPrompt}]}. Preserve exact IDs and objective coverage of each template; weights integer sum100. Include four performance levels in descriptors. Checkpoints compare, diagnose and explain; final integrates real-world project plus oral defense. Professor intent controls scope. Do not claim unsupported source grounding.",{intent:c.intent,objectives:d.objectives,modules:d.modules,templates},()=>({assessments:templates}));
      if(!Array.isArray(result.assessments)||result.assessments.length!==templates.length)throw new Error("Assessment mapper returned an incomplete set.");
      for(const t of templates){const matching=result.assessments.filter((x:any)=>x.id===t.id);if(matching.length!==1)throw new Error("Assessment mapper returned invalid IDs.");const cp=checkpointSchema.parse({...matching[0],id:t.id,moduleId:t.moduleId,category:t.category,objectiveIds:t.objectiveIds,points:100,published:false,dueAt:t.dueAt});validateCheckpoint(cp,{...d,graphApproved:true});d.checkpoints.push(cp);}
    }
  }else if(key==="validator"){
    validateGraph(d);validateLearning(d);d.checkpoints.forEach(cp=>validateCheckpoint(cp,{...d,graphApproved:true}));
    if(JSON.stringify(planSemester(d,i))!==JSON.stringify(c.schedule))throw new Error("Schedule no longer matches the course graph. Re-run the planner.");
  }else throw new Error("Unknown compiler stage.");
  c.reviewed=false;
  if(new Set(d.materials.map(x=>x.id)).size!==d.materials.length||new Set(d.checkpoints.map(x=>x.id)).size!==d.checkpoints.length)throw new Error("Generated IDs conflict with existing content. Review obsolete generated assessments in the editor before resuming; existing content was preserved.");
  c.log=[...c.log.filter(l=>l.key!==key),{key,status:"complete",at:new Date().toISOString(),ms:Date.now()-started,routing,detail:key==="sources"?`${c.sourceMap.length} approved documents indexed; existing chunks reused.`:key==="constraints"?`${i.weeks-i.breakWeeks.length} teaching weeks × ${i.hoursPerWeek} hours = ${(i.weeks-i.breakWeeks.length)*i.hoursPerWeek} contact hours.`:key==="graph"&&original.modules.length?"Existing graph adopted; IDs and authored content preserved.":"Structured output validated and saved."}];
  d.audit=[...d.audit.slice(-99),{at:new Date().toISOString(),action:`Compiler v1: ${key}`}];d.revision++;
  return courseDataSchema.parse(d);
}
