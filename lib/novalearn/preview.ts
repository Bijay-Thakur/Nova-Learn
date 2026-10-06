import {clientId} from './client-id';
import {missions,ragChecklist} from './content';

const key='novalearn-explore-v1';
let memory:any=null;
export function previewActive(){return typeof window!=='undefined'&&sessionStorage.getItem('novalearn-preview')==='on';}
function initial(){
 const now=new Date().toISOString();
 const student={id:'preview-student',name:'Sample Student',role:'student'};
 const teacher={id:'preview-teacher',name:'Sample Teacher',role:'teacher'};
 const classroom={id:'preview-class',name:'CS 381 · Applied AI',teacher_id:teacher.id,join_code:'NOVA-DEMO'};
 const report={summary:'Example report: a strong explanation connects retrieved evidence to a clear causal mechanism.',explanationScore:80,concepts:missions[1].concepts.map((name,i)=>({name,score:[85,75,90,70,80,80][i],feedback:'Example feedback: explain the mechanism and support your claim with a concrete example.'})),misconceptions:['Example misconception: a real citation does not necessarily support the associated claim.'],nextSteps:['Compare retrieval relevance with answer faithfulness.'],challengeCorrect:true,challengeExplanation:missions[1].explanation};
 return {profile:student,classes:[classroom],profiles:[student,teacher],enrollments:[{class_id:classroom.id,student_id:student.id}],assignments:[{id:'preview-assignment',teacher_id:teacher.id,class_id:classroom.id,title:'Audit the research assistant',mission_id:'rag',objectives:'Explain why retrieval alone cannot guarantee a grounded answer. Use the evidence to justify your diagnosis.',status:'published',created_at:now,due_at:null}],learning_sessions:[{id:'preview-completed-session',student_id:student.id,mission_id:'rag',topic:null,assignment_id:'preview-assignment',created_at:now,state:{stage:3,evidence:[0,1,2,3],messages:[{role:'user',content:'A retrieved document can be real but irrelevant. We should evaluate each answer claim against the actual passage, preserve chunk context, and separately measure retrieval relevance.'},{role:'assistant',content:'Preview guide: how would you test whether a citation actually supports its claim?'}]}}],attempts:[{id:'preview-report',student_id:student.id,session_id:'preview-completed-session',assignment_id:'preview-assignment',mission_id:'rag',score:84,xp:200,created_at:now,report}]};
}
export function previewData(){if(!memory){try{memory=JSON.parse(sessionStorage.getItem(key)||'null');}catch{}memory??=initial();}return structuredClone(memory);}
function persist(d:any){memory=d;sessionStorage.setItem(key,JSON.stringify(d));return structuredClone(d);}
export function enterPreview(role='student'){sessionStorage.setItem('novalearn-preview','on');const d=previewData();d.profile=d.profiles.find((p:any)=>p.role===role);return persist(d);}
export function leavePreview(){sessionStorage.setItem('novalearn-preview','off');}
export async function previewAction(action:string,b:any){
 const d=previewData(),now=new Date().toISOString(),id=()=>clientId();
 if(action==='logout'){leavePreview();return {ok:true};}
 if(action==='password'||action==='login'||action==='signup'||action==='reset')throw new Error('This is an interactive preview. Configure Supabase to use real accounts.');
 if(action==='createClass'){const row={id:id(),teacher_id:d.profile.id,name:b.name,join_code:'NOVA-'+Math.random().toString(36).slice(2,6).toUpperCase()};d.classes.push(row);persist(d);return [row];}
 if(action==='joinClass'){const c=d.classes.find((c:any)=>c.join_code.toLowerCase()===b.code.toLowerCase());if(!c)throw new Error('For this preview, use NOVA-DEMO or a code from a class you created.');if(!d.enrollments.some((e:any)=>e.class_id===c.id&&e.student_id===d.profile.id))d.enrollments.push({class_id:c.id,student_id:d.profile.id});persist(d);return {ok:true};}
 if(action==='assignment'){const row={...b,id:b.id||id(),teacher_id:d.profile.id,created_at:now};const index=d.assignments.findIndex((a:any)=>a.id===row.id);if(index<0)d.assignments.push(row);else d.assignments[index]=row;persist(d);return [row];}
 if(action==='session'){const row={id:id(),student_id:d.profile.id,mission_id:b.mission_id||null,topic:b.topic||null,assignment_id:b.assignment_id||null,created_at:now,state:{stage:0,evidence:[],messages:[]}};d.learning_sessions.push(row);persist(d);return [row];}
 if(action==='save'){const s=d.learning_sessions.find((s:any)=>s.id===b.id);if(!s)throw new Error('Preview session not found');s.state=b.state;persist(d);return [s];}
 if(action==='plan'){return {checklist:(/rag|retrieval/i.test(b.topic)?ragChecklist:['Core definition','Key mechanism','Worked example','Assumptions','Common misconception','Limitations','Application','How to evaluate it']).map(name=>({name,description:`Preview objective: explain ${name.toLowerCase()} in the context of ${b.topic}.`}))};}
 if(action==='chat'){const prompts=['What is the mechanism behind your explanation? Connect it to one piece of evidence.','What alternative explanation could fit these observations?','What assumption are you making, and how could you test it?','Give me an example, then explain a case where your explanation would not apply.'];return {reply:'Preview guide (scripted, not live AI): '+(b.hint?'Try explaining the chain from cause to mechanism to outcome. Cite one observation at each step.':prompts[Math.floor(b.messages.length/2)%prompts.length])};}
 if(action==='evaluate'){const existing=d.attempts.find((a:any)=>a.session_id===b.id);if(existing)return existing;const s=d.learning_sessions.find((s:any)=>s.id===b.id);const m=missions.find(m=>m.id===s.mission_id);const concepts=m?.concepts||s.state.checklist?.map((c:any)=>c.name)||['Explanation'];const row={id:id(),student_id:d.profile.id,session_id:s.id,assignment_id:s.assignment_id,mission_id:s.mission_id,created_at:now,score:80,xp:0,report:{summary:'Sample assessment for exploring the report screen. Your explanation has not been evaluated by an AI model. Connect a provider to receive an actual assessment.',topic:s.topic,explanationScore:80,concepts:concepts.map((name:string)=>({name,score:80,feedback:'Example rubric feedback. This value is illustrative, not an assessment of your answer.'})),misconceptions:[],nextSteps:['Connect Supabase and an AI provider for real evaluations.'],challengeCorrect:m?b.choice===m.answer:null,challengeExplanation:m?.explanation}};d.attempts.push(row);persist(d);return row;}
 if(action==='feedback'){const a=d.attempts.find((a:any)=>a.id===b.id);Object.assign(a,{teacher_feedback:b.feedback,teacher_score:b.score});persist(d);return [a];}
 throw new Error('This action requires the configured application.');
}
