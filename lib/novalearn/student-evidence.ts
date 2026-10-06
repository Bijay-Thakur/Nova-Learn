import { z } from "zod";
import { learningConfig } from "./learning-domain";
import { validateEvaluation, type Checkpoint, type CourseData, type Demonstration, type EvidenceBundle, type EvidenceEvent, type EvidenceItem, type EvidenceSupport, type Evaluation } from "./course-domain";

type Target = { id:string; objectiveId:string; itemId:string; type:EvidenceEvent["type"]; kinds:EvidenceItem["kind"][]; expected:string; criterion:string };
type Model = (tier:"draft"|"judge",system:string,input:unknown)=>Promise<{value:unknown;routing:string}>;
const supportSchema=z.object({evidenceId:z.string(),quote:z.string().min(1).max(600),start:z.number().int().min(0),end:z.number().int().min(1)});
const observationSchema=z.object({targetId:z.string(),status:z.enum(["SUPPORTED","PARTIALLY_SUPPORTED","CONTRADICTED","NOT_OBSERVED","AMBIGUOUS"]),claim:z.string().max(700),strength:z.enum(["STRONG","MODERATE","WEAK","CONTRADICTORY","INSUFFICIENT"]),confidence:z.enum(["HIGH","MEDIUM","LOW"]),supports:z.array(supportSchema).max(3),misconception:z.object({conceptId:z.string(),statement:z.string().min(10).max(500),support:supportSchema}).optional()});
const resultSchema=z.object({observations:z.array(observationSchema).max(32)});
export const EVIDENCE_PROMPT_VERSION="student-evidence-v1";

export function evidenceLinks(data:CourseData,cp:Checkpoint){
  const concepts=learningConfig(data).concepts.filter(c=>c.moduleId===cp.moduleId);
  const chapters=(data.chapters||[]).filter(c=>c.moduleId===cp.moduleId&&c.status==="approved");
  return cp.objectiveIds.map(objectiveId=>({objectiveId,moduleId:cp.moduleId,chapterIds:chapters.filter(c=>c.objectiveIds.includes(objectiveId)).map(c=>c.id),topicIds:chapters.flatMap(c=>c.topics.filter(t=>t.objectiveIds.includes(objectiveId)).map(t=>t.id)),conceptIds:concepts.filter(c=>c.objectiveIds.includes(objectiveId)).map(c=>c.id)}));
}
export function evidenceTargets(d:Demonstration):Target[]{
  const cp=d.snapshot.checkpoint;
  return cp.objectiveIds.flatMap(objectiveId=>{
    const spec=cp.authentic?.evidence.find(e=>e.objectiveId===objectiveId);
    const rubric=cp.rubric.find(r=>r.objectiveId===objectiveId);
    if(!rubric)throw new Error(`Assessment rubric is missing objective ${objectiveId}.`);
    const targets:[string,EvidenceEvent["type"],EvidenceItem["kind"][],string][]=[
      ["application","APPLICATION",["artifact"],spec?`${spec.observable} ${spec.artifact}`:rubric.descriptor],
      ["reasoning","EXPLANATION",["explanation","followup"],spec?.reasoning||rubric.descriptor],
      ["transfer","TRANSFER",["transfer"],spec?.transfer||cp.transferPrompt],
    ];
    if(d.data.evidence.some(e=>e.modality==="code"&&e.execution?.source==="server"&&e.objectiveIds.includes(objectiveId)))targets.push(["code-tests","DIRECT_CORRECTNESS",["artifact"],"Server-executed code checks (not a conceptual reasoning judgment)."]);
    return targets.map(([key,type,kinds,expected])=>({id:`${objectiveId}-${key}`,objectiveId,itemId:cp.authentic?.tasks.find(t=>t.objectiveIds.includes(objectiveId)&&((key==="transfer"&&t.kind==="Application")||(key==="reasoning"&&t.kind==="Explanation")||(key!=="reasoning"&&key!=="transfer"&&t.kind==="Application")))?.id||cp.id,type,kinds,expected,criterion:rubric.criterion}));
  });
}
const relevant=(d:Demonstration,t:Target)=>d.data.evidence.filter(e=>t.kinds.includes(e.kind)&&e.objectiveIds.includes(t.objectiveId)&&e.answer.trim());
function exactSupport(d:Demonstration,t:Target,s:EvidenceSupport){
  const artifact=relevant(d,t).find(e=>e.id===s.evidenceId);
  if(!artifact||s.end<=s.start||artifact.answer.slice(s.start,s.end)!==s.quote)throw new Error("Evaluator cited an unsupported or inexact passage.");
  return s;
}
function event(d:Demonstration,t:Target,part:Pick<EvidenceEvent,"status"|"strength"|"confidence"|"claim"|"supports"|"evaluator">,at:string):EvidenceEvent{
  const links=d.snapshot.evidenceLinks?.find(l=>l.objectiveId===t.objectiveId);
  return {id:`evidence-${d.id}-${d.version}-${t.id}`,submissionId:d.id,studentId:d.student_id,courseId:d.course_id,assessmentId:d.checkpoint_id,assessmentItemId:t.itemId,targetId:t.id,moduleId:links?.moduleId||d.snapshot.checkpoint.moduleId,chapterIds:links?.chapterIds||[],topicIds:links?.topicIds||[],conceptIds:links?.conceptIds||[],objectiveId:t.objectiveId,expected:t.expected,criterion:t.criterion,attemptNumber:(d.data.revisions?.length||0)+1,variantId:d.snapshot.checkpoint.authentic?.assignedVariant?.id,type:t.type,...part,scaffolding:d.status==="revision_requested"?"REVISED_AFTER_FEEDBACK":part.supports.some(s=>d.data.evidence.find(e=>e.id===s.evidenceId)?.kind==="followup")?"FOLLOW_UP_DEFENDED":d.data.helpUsed.trim()?"SUPPORT_DISCLOSED":"INDEPENDENT",at};
}
function codeSignal(d:Demonstration,t:Target,at:string):EvidenceEvent|undefined{
  if(t.type!=="DIRECT_CORRECTNESS")return;
  const a=relevant(d,t).find(e=>e.modality==="code"&&e.execution?.source==="server");
  if(!a)return;
  const {passed,failed}=a.execution!;
  if(!Number.isInteger(passed)||!Number.isInteger(failed)||passed<0||failed<0)throw new Error("Invalid server code-test result.");
  const supported=passed>0;
  return event(d,t,{status:supported?failed?"PARTIALLY_SUPPORTED":"SUPPORTED":"AMBIGUOUS",strength:supported?failed?"MODERATE":"STRONG":"INSUFFICIENT",confidence:"HIGH",claim:`Server execution: ${passed} checks passed; ${failed} failed. This does not establish the student's reasoning.`,supports:supported?[{evidenceId:a.id,start:0,end:Math.min(a.answer.length,120),quote:a.answer.slice(0,120)}]:[],evaluator:"deterministic"},at);
}
function modelEvents(d:Demonstration,targets:Target[],value:unknown,routing:string,at:string){
  const parsed=resultSchema.parse(value);
  if(parsed.observations.length!==targets.length||new Set(parsed.observations.map(o=>o.targetId)).size!==targets.length)throw new Error("Evaluator omitted or duplicated an evidence target.");
  return parsed.observations.map(o=>{
    const t=targets.find(t=>t.id===o.targetId);if(!t)throw new Error("Evaluator invented an evidence target.");
    const positive=["SUPPORTED","PARTIALLY_SUPPORTED","CONTRADICTED"].includes(o.status);
    if(positive&&(!o.supports.length||o.supports.some(s=>s.quote.trim().length<8)))throw new Error("Evaluator offered a claim without substantive student-work provenance.");
    if(o.status==="SUPPORTED"&&!(["STRONG","MODERATE"].includes(o.strength))||o.status==="PARTIALLY_SUPPORTED"&&!(["MODERATE","WEAK"].includes(o.strength))||o.status==="CONTRADICTED"&&o.strength!=="CONTRADICTORY"||["NOT_OBSERVED","AMBIGUOUS"].includes(o.status)&&o.strength!=="INSUFFICIENT")throw new Error("Evaluator status and strength disagree.");
    const supports=o.supports.map(s=>exactSupport(d,t,s));
    const found=event(d,t,{status:o.status,strength:o.strength,confidence:o.confidence,claim:o.claim,supports,evaluator:"model"},at);found.routing=routing;found.promptVersion=EVIDENCE_PROMPT_VERSION;
    if(o.misconception){if(!found.conceptIds.includes(o.misconception.conceptId)||!["CONTRADICTED","PARTIALLY_SUPPORTED"].includes(o.status))throw new Error("Unmapped or ungrounded misconception.");found.misconception={conceptId:o.misconception.conceptId,statement:o.misconception.statement,support:exactSupport(d,t,o.misconception.support)};}
    return found;
  });
}
function project(d:Demonstration,events:EvidenceEvent[],routing:string):Evaluation{
  const findings=d.snapshot.checkpoint.objectiveIds.map(objectiveId=>{
    const rows=events.filter(e=>e.objectiveId===objectiveId&&e.type!=="DIRECT_CORRECTNESS");
    const reasoning=rows.find(e=>e.type==="EXPLANATION"),application=rows.find(e=>e.type==="APPLICATION"),transfer=rows.find(e=>e.type==="TRANSFER");
    const strength=reasoning?.status==="SUPPORTED"&&application?.status==="SUPPORTED"&&transfer?.status==="SUPPORTED"?"Strong":reasoning&&["SUPPORTED","PARTIALLY_SUPPORTED"].includes(reasoning.status)&&rows.some(e=>["SUPPORTED","PARTIALLY_SUPPORTED"].includes(e.status))?"Developing":"Needs verification";
    const positives=rows.filter(e=>["SUPPORTED","PARTIALLY_SUPPORTED"].includes(e.status));
    return {objectiveId,level:strength as "Strong"|"Developing"|"Needs verification",confidence:(rows.some(e=>e.confidence==="LOW"||e.status==="AMBIGUOUS")?"Low":rows.every(e=>e.confidence==="HIGH")?"High":"Medium") as "Low"|"Medium"|"High",rationale:positives.length?`Provisional evidence: ${positives.map(e=>`${e.type.toLowerCase()} (${e.supports[0]?.quote.slice(0,90)})`).join("; ")}. Professor review required.`:"Evidence needs professor review; no supported reasoning was established.",evidenceIds:[...new Set(positives.flatMap(e=>e.supports.map(s=>s.evidenceId)))],uncertainty:rows.filter(e=>["AMBIGUOUS","NOT_OBSERVED","CONTRADICTED"].includes(e.status)).map(e=>`${e.type.toLowerCase()}: ${e.status.toLowerCase().replace("_"," ")}`).join("; ")};
  });
  return {...validateEvaluation({summary:"Provisional observations grounded in cited student passages; professor judgment required.",findings,misconceptions:events.flatMap(e=>e.misconception?[`${e.misconception.statement} (student passage: ${e.misconception.support.quote.slice(0,90)})`]:[]).slice(0,10),nextSteps:events.some(e=>e.status==="AMBIGUOUS"||e.status==="NOT_OBSERVED")?["Review uncertain targets and use a targeted Socratic probe or request more evidence."]:[]},d),routing};
}
const instruction="Extract evidence only for the supplied targets from the supplied student passages and approved course context. Return JSON {observations:[{targetId,status,claim,strength,confidence,supports:[{evidenceId,quote,start,end}],misconception?:{conceptId,statement,support}}]}. One per target. Every SUPPORTED, PARTIALLY_SUPPORTED or CONTRADICTED claim needs an exact quote with offsets into the original response. Misconceptions need a supported quote and supplied concept ID. No invented quotes, criteria, reasoning, mastery, grades, cheating or personality judgments. A correct artifact alone cannot establish reasoning. Use NOT_OBSERVED for missing proof; AMBIGUOUS for unclear interpretation. Strength describes the work; confidence describes your interpretation. Do not reward writing style unrelated to the rubric.";
export async function evaluateStudentEvidence(d:Demonstration,data?:CourseData,model?:Model){
  const started=Date.now();let retryCount=0;
  const at=new Date().toISOString(),targets=evidenceTargets(d),fixed:EvidenceEvent[]=[],pending:Target[]=[];
  for(const t of targets){const code=codeSignal(d,t,at);if(code){fixed.push(code);continue;}if(!relevant(d,t).length){fixed.push(event(d,t,{status:"NOT_OBSERVED",strength:"INSUFFICIENT",confidence:"HIGH",claim:"No response was submitted for this evidence target.",supports:[],evaluator:"deterministic"},at));continue;}pending.push(t);}
  const fallback=()=>pending.map(t=>event(d,t,{status:"AMBIGUOUS",strength:"INSUFFICIENT",confidence:"LOW",claim:"Automated interpretation unavailable; original student work awaits professor review.",supports:[],evaluator:"deterministic"},at));
  let extracted:EvidenceEvent[]=[],status:EvidenceBundle["status"]=model?"evaluated":"demo",notice="",escalationReason="";const routes:string[]=[];
  if(model&&pending.length){
    const excerpts=(data?.chapters||[]).filter(c=>c.status==="approved"&&d.snapshot.evidenceLinks?.some(l=>l.chapterIds.includes(c.id))).flatMap(c=>c.blocks.filter(b=>pending.some(t=>b.objectiveIds.includes(t.objectiveId))).slice(0,2).map(b=>({chapterId:c.id,blockId:b.id,objectiveIds:b.objectiveIds,text:b.text.slice(0,1000),sourceIds:b.sourceIds}))).slice(0,8);
    const input=(scope:Target[])=>({promptVersion:EVIDENCE_PROMPT_VERSION,assessment:{id:d.checkpoint_id,variant:d.snapshot.checkpoint.authentic?.assignedVariant?.id,criterion:scope.map(t=>({id:t.id,objectiveId:t.objectiveId,itemId:t.itemId,expected:t.expected,rubric:t.criterion,conceptIds:d.snapshot.evidenceLinks?.find(l=>l.objectiveId===t.objectiveId)?.conceptIds||[]}))},passages:d.data.evidence.filter(e=>scope.some(t=>t.kinds.includes(e.kind)&&e.objectiveIds.includes(t.objectiveId))).map(e=>({id:e.id,kind:e.kind,answer:e.answer})),approvedContent:excerpts,helpUsed:d.data.helpUsed});
    try{
      let out=await model("draft",instruction,input(pending));
      try{extracted=modelEvents(d,pending,out.value,out.routing,at);}catch{retryCount++;out=await model("draft",instruction,input(pending));extracted=modelEvents(d,pending,out.value,out.routing,at);}
      routes.push(out.routing);
      const uncertain=extracted.filter(e=>e.status==="AMBIGUOUS"||e.status==="CONTRADICTED"||e.confidence==="LOW");
      if(uncertain.length||d.snapshot.checkpoint.category==="Final project"){
        const scope=d.snapshot.checkpoint.category==="Final project"?pending:pending.filter(t=>uncertain.some(e=>e.targetId===t.id));
        escalationReason=d.snapshot.checkpoint.category==="Final project"?"Final project requires strong-model review.":"Ambiguous, contradictory or low-confidence observation.";
        try{const review=await model("judge",instruction+" Independently reconsider these uncertain targets. Do not copy prior claims unless their exact spans support them.",input(scope));const revised=modelEvents(d,scope,review.value,review.routing,at);extracted=extracted.map(e=>revised.find(x=>x.targetId===e.targetId)||e);routes.push(review.routing);}catch{status="needs_review";notice="Strong-model review was unavailable. The initial observations need professor review.";}
      }
    }catch{status="unavailable";notice="Evidence submitted. Automated evaluation unavailable; original work and deterministic signals are preserved.";extracted=fallback();}
  }else extracted=fallback();
  const events=targets.map(t=>[...fixed,...extracted].find(e=>e.targetId===t.id)!);
  // Preserve each answered probe independently of the consolidated reasoning
  // interpretation. This observation records the response, not mastery.
  for(const response of d.data.evidence.filter(e=>e.kind==="followup"&&e.answer.trim())){
    for(const objectiveId of response.objectiveIds){
      const target=targets.find(t=>t.objectiveId===objectiveId&&t.type==="EXPLANATION");if(!target)continue;
      const quote=response.answer.slice(0,600);
      const observed=event(d,target,{status:"AMBIGUOUS",strength:"INSUFFICIENT",confidence:"HIGH",claim:"A follow-up response was submitted; inspect the linked reasoning observation for its interpretation.",supports:[{evidenceId:response.id,quote,start:0,end:quote.length}],evaluator:"deterministic"},at);
      observed.id=`${observed.id}-probe-${response.id}`;observed.targetId=`${target.id}-probe-${response.id}`;observed.assessmentItemId=response.id;observed.at=response.at;observed.type="SOCRATIC_RESPONSE";observed.scaffolding="FOLLOW_UP_DEFENDED";
      events.push(observed);
    }
  }
  const bundle:EvidenceBundle={id:`bundle-${d.id}-${d.version}`,at,status,eventIds:events.map(e=>e.id),followupTargetIds:events.filter(e=>e.status==="AMBIGUOUS"||e.status==="NOT_OBSERVED").map(e=>e.targetId),routing:routes,latencyMs:Date.now()-started,retryCount,...(escalationReason?{escalationReason}:{}),...(notice?{notice}:{})};
  const evaluation=status==="evaluated"||status==="needs_review"?project(d,events,routes.join(" → ")):null;
  return {events,bundle,evaluation};
}
