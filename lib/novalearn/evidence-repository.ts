import { identity, sb } from "./server";
import { z } from "zod";
import type { Demonstration, EvidenceBundle, EvidenceEvent, EvidenceItem, Finding, ProfessorReview } from "./course-domain";

// Only server-verified submissions reach these service-role RPCs. Each RPC holds the
// demonstration version lock and commits the snapshot + immutable rows together.
export async function appendEvidence(d:Demonstration,events:EvidenceEvent[],bundle:EvidenceBundle){
  let rows;
  try{rows=await sb("/rest/v1/rpc/nova_save_evidence",{method:"POST",body:JSON.stringify({
    p_id:d.id,p_version:d.version,p_data:d.data,p_bundle:bundle,p_events:events,
  })},undefined,true);}catch(e){
    if((e as Error).message.includes("another session"))throw e;
    throw new Error("Evidence persistence unavailable. Your work was not submitted; reload and retry.");
  }
  if(!rows?.[0])throw new Error("Evidence persistence unavailable. Reload before retrying.");
  const saved=rows[0] as Demonstration;
  saved.data.evidenceEvents=[...(d.data.evidenceEvents||[]),...events].map(forStudent);
  return saved;
}

export async function recordProfessorReview(d:Demonstration,review:ProfessorReview){
  let rows;
  try{rows=await sb("/rest/v1/rpc/nova_record_evidence_review",{method:"POST",body:JSON.stringify({
    p_id:d.id,p_version:d.version,p_data:d.data,p_status:d.status,p_review:review,
  })},undefined,true);}catch(e){
    if((e as Error).message.includes("another session"))throw e;
    throw new Error("Evidence review persistence unavailable. Reload and retry.");
  }
  if(!rows?.[0])throw new Error("Evidence review persistence unavailable. Reload before retrying.");
  const saved=rows[0] as Demonstration;
  saved.data.reviewHistory=[...(d.data.reviewHistory||[]),review];
  return saved;
}

type EventRow={
  id:string;run_id:string;demonstration_id:string;student_id:string;course_id:string;
  module_id:string;chapter_ids:string[];topic_ids:string[];concept_ids:string[];
  objective_id:string;assessment_id:string;assessment_item_id:string;target_id:string;
  evidence_type:EvidenceEvent["type"];status:EvidenceEvent["status"];
  strength:EvidenceEvent["strength"];confidence:EvidenceEvent["confidence"];
  claim:string;expected:string;criterion:string;supports:EvidenceEvent["supports"];
  misconception:EvidenceEvent["misconception"]|null;attempt_number:number;variant_id:string|null;
  scaffolding:EvidenceEvent["scaffolding"];evaluator:EvidenceEvent["evaluator"];
  routing:string|null;prompt_version:string|null;observed_at:string;
};
type RunRow={id:string;demonstration_id:string;bundle:EvidenceBundle;artifact_snapshot:EvidenceItem[];created_at:string};
type ReviewRow={demonstration_id:string;run_id:string|null;decision:ProfessorReview["decision"];previous_findings:Finding[]|null;reviewed_findings:Finding[];reviewer_id:string;note:string;created_at:string};
function fromRow(r:EventRow):EvidenceEvent{
  return {id:r.id,runId:r.run_id,submissionId:r.demonstration_id,studentId:r.student_id,courseId:r.course_id,
    moduleId:r.module_id,chapterIds:r.chapter_ids,topicIds:r.topic_ids,conceptIds:r.concept_ids,
    objectiveId:r.objective_id,assessmentId:r.assessment_id,assessmentItemId:r.assessment_item_id,targetId:r.target_id,
    type:r.evidence_type,status:r.status,strength:r.strength,confidence:r.confidence,claim:r.claim,
    expected:r.expected,criterion:r.criterion,supports:r.supports,misconception:r.misconception||undefined,
    attemptNumber:r.attempt_number,variantId:r.variant_id||undefined,scaffolding:r.scaffolding,
    evaluator:r.evaluator,routing:r.routing||undefined,promptVersion:r.prompt_version||undefined,at:r.observed_at};
}
function forStudent(e:EvidenceEvent):EvidenceEvent{
  return {...e,expected:"",criterion:"",routing:undefined,promptVersion:undefined};
}
const ids=(ds:Demonstration[])=>ds.map(d=>d.id).join(",");
export async function hydrateEvidence(demos:Demonstration[],teacher:boolean){
  if(!demos.length)return demos;
  // These IDs came from a token-scoped nova_demonstrations SELECT. Never accept IDs
  // supplied by the browser when using the privileged evidence repository.
  for(let i=0;i<demos.length;i+=40){
    const slice=demos.slice(i,i+40),filter=`demonstration_id=in.(${ids(slice)})`;
    let events,runs,reviews;
    try{[events,runs,reviews]=await Promise.all([
      sb(`/rest/v1/nova_evidence_events?${filter}&select=*&order=observed_at.asc,id.asc`,{},undefined,true),
      sb(`/rest/v1/nova_evidence_runs?${filter}&select=id,demonstration_id,bundle,artifact_snapshot,created_at`,{},undefined,true),
      sb(`/rest/v1/nova_evidence_reviews?${filter}&select=*&order=created_at.asc`,{},undefined,true),
    ]);}catch{throw new Error("Evidence records are temporarily unavailable. Check the database migration and retry.");}
    for(const d of slice){
      const rows=(events as EventRow[]).filter(r=>r.demonstration_id===d.id);
      if(d.data.evidenceStoreVersion&&!rows.length)throw new Error("Evidence records are temporarily unavailable. Please retry.");
      if(rows.length){
        const existing=d.data.evidenceEvents||[],canonical=rows.map(fromRow);
        const normalized=new Set(canonical.map(e=>e.id));
        d.data.evidenceEvents=[...existing.filter(e=>!normalized.has(e.id)),...canonical].map(e=>teacher?e:forStudent(e));
        const active=(runs as RunRow[]).find(r=>r.demonstration_id===d.id&&r.id===d.data.evidenceBundle?.id);
        if(active)d.data.evidenceBundle=active.bundle;
        if(teacher)d.data.evidenceArchive=(runs as RunRow[]).filter(r=>r.demonstration_id===d.id).map(r=>({
          runId:r.id,at:r.created_at,bundle:r.bundle,artifacts:r.artifact_snapshot,
        }));
      }else if(!teacher&&d.data.evidenceEvents){
        d.data.evidenceEvents=d.data.evidenceEvents.map(forStudent);
      }
      const canonicalReviews=(reviews as ReviewRow[]).filter(r=>r.demonstration_id===d.id).map(r=>({
        decision:r.decision,note:r.note,findings:r.reviewed_findings,at:r.created_at,reviewerId:r.reviewer_id,
      } as ProfessorReview));
      if(canonicalReviews.length){
        const known=new Set(canonicalReviews.map(r=>`${r.reviewerId}:${r.at}:${r.decision}`));
        d.data.reviewHistory=[...(d.data.reviewHistory||[]).filter(r=>!known.has(`${r.reviewerId}:${r.at}:${r.decision}`)),...canonicalReviews];
      }
    }
  }
  return demos;
}

// Server-only handoff for future mastery work; verifies course/student scope and
// reads atomic rows without parsing demonstrations.data.
export async function getEvidenceHistory(scope:{studentId:string;courseId:string;objectiveId?:string;conceptId?:string;limit?:number}){
  const {profile,token}=await identity();
  z.string().uuid().parse(scope.studentId);z.string().uuid().parse(scope.courseId);
  if(scope.objectiveId)z.string().regex(/^[\w-]{1,100}$/).parse(scope.objectiveId);
  if(scope.conceptId)z.string().regex(/^[\w-]{1,100}$/).parse(scope.conceptId);
  if(profile.role==="teacher"){
    const owner=await sb(`/rest/v1/nova_courses?id=eq.${scope.courseId}&teacher_id=eq.${profile.id}&select=id`,{},token);
    if(!owner.length)throw new Error("Action not permitted.");
  }else if(profile.role==="student"&&profile.id===scope.studentId){
    const publication=await sb(`/rest/v1/nova_publications?id=eq.${scope.courseId}&select=id`,{},token);
    if(!publication.length)throw new Error("Action not permitted.");
  }else throw new Error("Action not permitted.");
  const query=new URLSearchParams({student_id:`eq.${scope.studentId}`,course_id:`eq.${scope.courseId}`,
    order:"observed_at.asc,id.asc",limit:String(Math.min(Math.max(scope.limit||100,1),500))});
  if(scope.objectiveId)query.set("objective_id",`eq.${scope.objectiveId}`);
  if(scope.conceptId)query.set("concept_ids",`cs.{${scope.conceptId}}`);
  const events=await sb(`/rest/v1/nova_evidence_events?${query}&select=*`,{},undefined,true) as EventRow[];
  if(!events.length)return [];
  const selected=[...new Set(events.map(e=>e.demonstration_id))];
  const reviews=await sb(`/rest/v1/nova_evidence_reviews?demonstration_id=in.(${selected.join(",")})&select=demonstration_id,run_id,decision,previous_findings,reviewed_findings,reviewer_id,note,created_at&order=created_at.asc`,{},undefined,true) as ReviewRow[];
  return events.map(r=>({event:profile.role==="teacher"?fromRow(r):forStudent(fromRow(r)),reviews:reviews.filter(v=>v.demonstration_id===r.demonstration_id&&v.run_id===r.run_id)}));
}
