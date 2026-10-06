import { retrieve, type CourseData } from "./course-domain";

/** Evidence of lexical matches, never a claim of semantic coverage or completed research. */
export function curriculumAudit(data:CourseData){
  const i=data.compiler?.inputs,issues:string[]=[];
  const coverage=data.objectives.map(o=>{
    const modules=data.modules.filter(m=>m.objectiveIds.includes(o.id));
    const sources=data.sources.filter(s=>s.approved&&(!s.moduleIds?.length||modules.some(m=>s.moduleIds!.includes(m.id))));
    return {objectiveId:o.id,moduleIds:modules.map(m=>m.id),sourceIds:retrieve(sources,o.title).map(s=>s.id)};
  });
  for(const o of coverage){
    if(!o.moduleIds.length)issues.push(`Outcome ${o.objectiveId} is not assigned to a module.`);
    if(!o.sourceIds.length)issues.push(`No lexical source match for outcome ${o.objectiveId}; inspect the reading coverage.`);
  }
  const topicText=data.modules.flatMap(m=>[m.title,...m.concepts]).join(" ").toLowerCase();
  for(const topic of i?.requiredTopics||[])if(!topicText.includes(topic.toLowerCase()))issues.push(`Required topic not explicitly represented: ${topic}`);
  for(const outcome of i?.explicitOutcomes||[])if(!data.objectives.some(o=>o.title===outcome))issues.push(`Professor outcome not preserved verbatim: ${outcome}`);
  const titles=data.modules.map(m=>m.title.trim().toLowerCase());
  if(new Set(titles).size!==titles.length)issues.push("Duplicate module titles; review overlap before generating content.");
  for(const m of data.modules){
    if(m.prerequisites.some(id=>!data.modules.some(p=>p.id===id)))issues.push(`${m.title}: missing prerequisite module.`);
    const hours=data.compiler?.schedule.find(s=>s.moduleId===m.id)?.hours;
    if(hours&&m.concepts.length>hours*2)issues.push(`${m.title}: more than two concepts per contact hour; review likely overload.`);
  }
  if(!data.sources.some(s=>s.approved))issues.push("No professor-approved sources. Add materials before grounded content generation.");
  const researchQuestions=coverage.filter(c=>!c.sourceIds.length).slice(0,5).map((c,n)=>({id:`research-${n+1}`,question:`Which professor-approved reading supports “${data.objectives.find(o=>o.id===c.objectiveId)!.title}”, including its prerequisites?`,reason:`No lexical source match for ${c.objectiveId}. Check supplied materials first; approve targeted external research only if still missing.`,status:"proposed" as const}));
  return {at:new Date().toISOString(),method:"lexical-and-structural-v1" as const,coverage,issues,researchQuestions};
}
