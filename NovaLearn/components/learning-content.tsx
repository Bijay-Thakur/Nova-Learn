"use client";
import { useState } from "react";
import { BookOpen, Check, Lock, Sparkles } from "lucide-react";
import { Panel, Badge, ModuleSelect, SourceLinks, useWorkspace, uid } from "./course-ui";
import { chapterSchema, type Chapter, type ContentBlock } from "@/lib/novalearn/course-domain";
import { contentIssues } from "@/lib/novalearn/learning-content";
import { currentChapter } from "@/lib/novalearn/content-integrity";
import { isReleased } from "@/lib/novalearn/learning-domain";

function Block({block:b}:{block:ContentBlock}){
  return <section className="learning-block" aria-label={b.title}>
    <Badge>{b.kind.replaceAll("-"," ")}</Badge><h4>{b.title}</h4>
    {b.kind==="code"||b.kind==="equation"?<pre><code>{b.text}</code></pre>:<div className="course-prose">{b.text}</div>}
    {b.kind==="table"&&b.rows&&<div className="learning-table-scroll"><table><tbody>{b.rows.map((row,n)=><tr key={n}>{row.map((cell,k)=>n===0?<th scope="col" key={k}>{cell}</th>:<td key={k}>{cell}</td>)}</tr>)}</tbody></table></div>}
    {b.kind==="diagram"&&b.nodes&&<figure><svg role="img" aria-label={b.alt||b.title} viewBox={`0 0 600 ${b.nodes.length*75+20}`} style={{width:"100%",maxHeight:600}}>
      {(b.edges||[]).map((e,n)=>{const from=b.nodes!.findIndex(x=>x.id===e.from),to=b.nodes!.findIndex(x=>x.id===e.to);return <path key={n} d={`M 300 ${from*75+58} L 300 ${to*75+12}`} stroke="currentColor" fill="none"/>;})}
      {b.nodes.map((node,n)=><g key={node.id}><rect x={75} y={n*75+12} width={450} height={46} rx={12} fill="#eeeaff" stroke="#9380e8"/><text x={300} y={n*75+41} textAnchor="middle" fill="#202044" fontSize={14}>{node.label.slice(0,65)}</text></g>)}
    </svg><figcaption>{b.alt}</figcaption><ul className="fine">{b.edges?.map((e,n)=><li key={n}>{b.nodes?.find(x=>x.id===e.from)?.label} → {b.nodes?.find(x=>x.id===e.to)?.label}</li>)}</ul></figure>}
    {b.kind==="image"&&<p className="fine">Figure reference: {b.alt}. Open the cited source to view the original figure.</p>}
    <SourceLinks ids={b.sourceIds}/>
  </section>;
}
function ChapterView({chapter,teaching=false}:{chapter:Chapter;teaching?:boolean}){
  const [mode,setMode]=useState("book"),[topic,setTopic]=useState("");
  const topics=chapter.topics.filter(t=>!topic||t.id===topic);
  const brief=["definition","worked-example","question","callout","reference","deeper-reading"];
  return <>
    <p>{chapter.purpose}</p><p className="fine">{chapter.minutes} minutes · {chapter.depth} · Outcomes: {chapter.objectiveIds.join(", ")}</p>
    <div className="learning-view-controls" role="group" aria-label="Reading representation">{["book","study","slides",...(teaching?["teaching notes"]:[])].map(v=><button key={v} className={mode===v?"primary":"secondary"} aria-pressed={mode===v} onClick={()=>setMode(v)}>{v}</button>)}</div>
    <label>Chapter topic<select value={topic} onChange={e=>setTopic(e.target.value)}><option value="">All topics</option>{chapter.topics.map(t=><option key={t.id} value={t.id}>{t.title}</option>)}</select></label>
    {mode==="study"&&<p className="fine">Study mode highlights definitions, examples, questions and references from the same chapter. Use book mode for the complete explanation.</p>}
    {topics.map(t=><section key={t.id} className={mode==="slides"?"learning-slide":""}><h3>{t.title}</h3>{t.subtopics.length>0&&<p className="fine">{t.subtopics.map(s=>s.title).join(" · ")}</p>}{chapter.blocks.filter(b=>b.topicId===t.id&&(mode!=="study"||brief.includes(b.kind))).map(b=><Block key={b.id} block={b}/>)}{mode==="teaching notes"&&<p className="fine">Teaching cue: ask students to explain and apply {t.title}; use the linked outcomes to select a checkpoint.</p>}</section>)}
    {!chapter.blocks.length&&<p>No content has been generated for this outline yet.</p>}
  </>;
}
function ChapterEditor({chapter}:{chapter:Chapter}){
  const w=useWorkspace(),[draft,setDraft]=useState(chapter),[error,setError]=useState("");
  const sources=w.course.data.sources.filter(s=>s.approved&&(!s.moduleIds?.length||s.moduleIds.includes(chapter.moduleId))).flatMap(s=>s.chunks.map(c=>({id:c.id,label:`${s.name}: ${c.text.slice(0,90)}…`})));
  const changeBlock=(id:string,patch:Partial<ContentBlock>)=>setDraft(old=>({...old,blocks:old.blocks.map(b=>b.id===id?{...b,...patch}:b)}));
  const move=(index:number,offset:number)=>setDraft(old=>{const blocks=[...old.blocks];[blocks[index],blocks[index+offset]]=[blocks[index+offset],blocks[index]];return {...old,blocks};});
  return <details><summary>Edit chapter structure and blocks</summary><p className="fine">Edit the teaching material, then save and review it. Changes require renewed approval before a student release.</p><fieldset disabled={chapter.locked||w.busy} className="course-content-fieldset">
    <label>Chapter title<input value={draft.title} maxLength={200} onChange={e=>setDraft({...draft,title:e.target.value})}/></label>
    <label>Purpose<textarea rows={2} maxLength={1000} value={draft.purpose} onChange={e=>setDraft({...draft,purpose:e.target.value})}/></label>
    <div className="course-form-grid"><label>Teaching minutes<input type="number" min={1} max={10000} value={draft.minutes} onChange={e=>setDraft({...draft,minutes:Number(e.target.value)})}/></label><label>Required depth<input value={draft.depth} maxLength={120} onChange={e=>setDraft({...draft,depth:e.target.value})}/></label></div>
    {draft.topics.map(t=><label key={t.id}>Topic title<input value={t.title} maxLength={200} onChange={e=>setDraft({...draft,topics:draft.topics.map(x=>x.id===t.id?{...x,title:e.target.value}:x)})}/></label>)}
    {draft.blocks.map((b,index)=><details className="learning-chapter" key={b.id}><summary>{index+1}. {b.title} · {b.kind}</summary>
      <label>Block title<input value={b.title} maxLength={200} onChange={e=>changeBlock(b.id,{title:e.target.value})}/></label>
      <label>Topic<select value={b.topicId} onChange={e=>{const t=draft.topics.find(t=>t.id===e.target.value)!;changeBlock(b.id,{topicId:t.id,subtopicId:undefined,objectiveIds:t.objectiveIds});}}>{draft.topics.map(t=><option key={t.id} value={t.id}>{t.title}</option>)}</select></label>
      <label>Teaching content<textarea rows={7} value={b.text} maxLength={6000} onChange={e=>changeBlock(b.id,{text:e.target.value})}/></label>
      {b.alt!==undefined&&<label>Text alternative<textarea rows={2} value={b.alt} maxLength={1000} onChange={e=>changeBlock(b.id,{alt:e.target.value})}/></label>}
      <details><summary>Supporting references ({b.sourceIds.length})</summary>{sources.map(s=><label className="compiler-check" key={s.id}><input type="checkbox" checked={b.sourceIds.includes(s.id)} onChange={e=>changeBlock(b.id,{sourceIds:e.target.checked?[...b.sourceIds,s.id]:b.sourceIds.filter(id=>id!==s.id)})}/>{s.label}</label>)}</details>
      <div className="learning-view-controls"><button className="secondary" disabled={index===0} onClick={()=>move(index,-1)}>Move up</button><button className="secondary" disabled={index===draft.blocks.length-1} onClick={()=>move(index,1)}>Move down</button><button className="secondary" onClick={()=>setDraft({...draft,blocks:draft.blocks.filter(x=>x.id!==b.id)})}>Remove block</button></div>
    </details>)}
    <div className="learning-view-controls">{(["explanation","worked-example","question"] as const).map(kind=><button key={kind} className="secondary" disabled={draft.blocks.length>=60} onClick={()=>setDraft({...draft,blocks:[...draft.blocks,{id:uid(),topicId:draft.topics[0].id,objectiveIds:draft.topics[0].objectiveIds,kind,title:`New ${kind.replaceAll("-"," ")}`,text:"Write the teaching material here, then select its supporting references.",sourceIds:[]}]})}>Add {kind.replaceAll("-"," ")}</button>)}</div>
    {error&&<p role="alert">{error}</p>}<button className="primary" onClick={()=>w.run(async()=>{try{const edited=chapterSchema.parse({...draft,sourceIds:[...new Set(draft.blocks.flatMap(b=>b.sourceIds))]});await w.save({...w.course,data:{...w.course.data,chapters:w.course.data.chapters!.map(c=>c.id===chapter.id?edited:c)}});setError("");w.notice("Chapter edits saved for review.");}catch(e){setError((e as Error).message);}})}>Save chapter edits</button>
  </fieldset></details>;
}
export function ContentStudio(){
  const w=useWorkspace(),d=w.course.data,chapters=(d.chapters||[]).filter(c=>c.moduleId===w.moduleId);
  const action=(name:string,id?:string)=>w.run(async()=>{const saved=await w.save();const updated=await w.call(name,{courseId:saved.id,version:saved.version,chapterId:id});w.setCourse(updated);w.notice(name==="content-approve"?"Chapter approved. Publish a course version to make it available to students.":"Structured learning content saved. Review it before approval.");});
  return <Panel><div className="section-title"><div><span className="eyebrow">LEARNING CONTENT ENGINE</span><h2>Teach the approved blueprint</h2><p>Chapters share your module IDs, outcomes and source references. Existing teaching materials remain below.</p></div><BookOpen/></div><ModuleSelect/>
    <p className="fine">{w.preview?"Explore mode creates source extracts and practice templates, not a live AI textbook.":"Generate one grounded chapter at a time from approved sources. Each result remains a draft until you review it."}</p>
    <button className="secondary" disabled={w.busy||!d.graphApproved} onClick={()=>action("content-outline")}>Derive missing chapter outlines</button>{!d.graphApproved&&<p className="fine">Approve your course graph in the Course Compiler first.</p>}
    {chapters.map(ch=>{const issues=contentIssues(d,ch);return <details className="learning-chapter" key={ch.id} open={chapters.length===1}><summary>{ch.title} · <Badge>{currentChapter(d,ch)?ch.status:"stale"}</Badge>{ch.locked&&<Lock size={14}/>}</summary>
      {ch.generation&&<p className="fine">{ch.generation.mode} · {ch.generation.provider} · {ch.generation.promptVersion} · v{ch.version}</p>}
      {ch.quality?.map((q,n)=><p key={n} className="fine">Review note: {q}</p>)}
      <ChapterView chapter={ch} teaching/>
      <div className="learning-view-controls"><button className="primary" disabled={w.busy||ch.locked||!d.graphApproved} onClick={()=>{if(ch.blocks.length&&!window.confirm("Regenerate this chapter? Its current draft content will be replaced and require review. Published student versions stay unchanged."))return;action("content-generate",ch.id);}}><Sparkles size={15}/> {ch.blocks.length?"Regenerate chapter":"Generate chapter"}</button><button className="secondary" disabled={w.busy||issues.length>0||ch.status==="approved"} onClick={()=>action("content-approve",ch.id)}><Check size={15}/> Review & approve</button><button className="secondary" disabled={w.busy} onClick={()=>w.run(async()=>{await w.save({...w.course,data:{...d,chapters:d.chapters!.map(c=>c.id===ch.id?{...c,locked:!c.locked}:c)}});})}>{ch.locked?"Unlock":"Lock"}</button></div>
      {!!issues.length&&<details><summary>{issues.length} checks before approval</summary><ul>{issues.map(i=><li key={i}>{i}</li>)}</ul></details>}
      {!currentChapter(d,ch)&&<button className="secondary" disabled={w.busy||ch.locked} onClick={()=>{if(window.confirm("Replace this stale chapter draft with an outline derived from the current module? Its draft blocks and local structural edits will be replaced. Published versions stay unchanged."))action("content-refresh",ch.id);}}>Refresh outline from blueprint</button>}
      <ChapterEditor key={`${ch.id}-${ch.version}`} chapter={ch}/>
    </details>;})}
  </Panel>;
}
export function ContentReader(){
  const w=useWorkspace();if(!isReleased(w.course.data,w.moduleId))return null;
  const chapters=(w.course.data.chapters||[]).filter(c=>c.moduleId===w.moduleId&&c.status==="approved");
  return <>{chapters.map(ch=><Panel key={ch.id}><Badge>Chapter</Badge><h2>{ch.title}</h2><ChapterView key={`${ch.id}-${ch.version}`} chapter={ch}/></Panel>)}</>;
}
