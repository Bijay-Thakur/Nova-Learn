import type { CourseData, Chapter } from "./course-domain";

/** Deterministic cache/version identity, NOT a cryptographic signature or authorization token. */
export function fingerprint(value:unknown):string {
  const text=JSON.stringify(value);let a=2166136261,b=5381;
  for(let i=0;i<text.length;i++){a=Math.imul(a^text.charCodeAt(i),16777619);b=Math.imul(b,33)^text.charCodeAt(i);}
  return `v1-${(a>>>0).toString(16)}-${(b>>>0).toString(16)}-${text.length}`;
}
export function chapterContext(data:CourseData,moduleId:string){
  const courseModule=data.modules.find(m=>m.id===moduleId);
  return {module:courseModule,objectives:data.objectives.filter(o=>courseModule?.objectiveIds.includes(o.id)),
    concepts:data.learning?.concepts.filter(c=>c.moduleId===moduleId),
    constraints:data.compiler?.inputs, schedule:data.compiler?.schedule.find(s=>s.moduleId===moduleId),
    sources:data.sources.filter(s=>s.approved&&(!s.moduleIds?.length||s.moduleIds.includes(moduleId))).map(s=>({id:s.id,name:s.name,chunks:s.chunks.map(({id,text,page})=>({id,text,page}))}))};
}
export const chapterContextFingerprint=(data:CourseData,moduleId:string)=>fingerprint(chapterContext(data,moduleId));
export function chapterFingerprint(ch:Chapter){
  return fingerprint({id:ch.id,moduleId:ch.moduleId,title:ch.title,purpose:ch.purpose,objectiveIds:ch.objectiveIds,prerequisiteModuleIds:ch.prerequisiteModuleIds,minutes:ch.minutes,depth:ch.depth,topics:ch.topics,blocks:ch.blocks,sourceIds:ch.sourceIds,contextFingerprint:ch.contextFingerprint,generation:ch.generation});
}
export function currentChapter(data:CourseData,ch:Chapter){return ch.contextFingerprint===chapterContextFingerprint(data,ch.moduleId);}
export function approvedChapter(data:CourseData,ch:Chapter){return data.graphApproved&&ch.status==="approved"&&currentChapter(data,ch)&&ch.approvedFingerprint===chapterFingerprint(ch);}
/** Approval is granted by a dedicated server action, never by a client-supplied flag. */
export function reconcileContent(data:CourseData,old:CourseData){
  // Legacy teaching assets keep working, but changed citations require renewed review.
  const chunks=new Map(data.sources.filter(s=>s.approved).flatMap(s=>s.chunks.map(c=>[c.id,c.text] as const)));
  const beforeChunks=new Map(old.sources.filter(s=>s.approved).flatMap(s=>s.chunks.map(c=>[c.id,c.text] as const)));
  for(const material of data.materials){
    const before=old.materials.find(m=>m.id===material.id);
    if(before?.sourceIds.some(id=>beforeChunks.get(id)!==chunks.get(id)))material.approved=false;
  }
  if(old.chapters?.some(c=>c.locked&&!data.chapters?.some(n=>n.id===c.id)))throw new Error("Unlock the chapter and save before removing it.");
  if(new Set(data.chapters?.map(c=>c.id)).size!==(data.chapters?.length||0))throw new Error("Chapter IDs must be unique.");
  data.chapters=data.chapters?.map(ch=>{
    const before=old.chapters?.find(c=>c.id===ch.id);
    if(before?.locked && chapterFingerprint(ch)!==chapterFingerprint(before))throw new Error("Unlock the chapter and save before editing or regenerating it.");
    if(!data.modules.some(m=>m.id===ch.moduleId))throw new Error("Remove a chapter explicitly before removing its parent module.");
    const same=before&&chapterFingerprint(ch)===chapterFingerprint(before);
    const approved=same&&approvedChapter(data,before);
    return {...ch,version:before?before.version+(same?0:1):1,updatedAt:same?before.updatedAt:new Date().toISOString(),
      status:!currentChapter(data,ch)?"stale":approved?"approved":ch.blocks.length?"draft":"outline",
      approvedFingerprint:approved?before.approvedFingerprint:undefined};
  });
}
