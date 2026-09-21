"use client";
import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { useWorkspace } from "./course-ui";
export function VoiceInput({onTranscript,label,disabled=false}:{onTranscript:(text:string)=>void;label:string;disabled?:boolean}){
  const w=useWorkspace(),[recording,setRecording]=useState(false),[sending,setSending]=useState(false),recorder=useRef<MediaRecorder|null>(null),timer=useRef<ReturnType<typeof setTimeout>|null>(null),active=useRef(true);
  useEffect(()=>{active.current=true;return()=>{active.current=false;if(timer.current)clearTimeout(timer.current);if(recorder.current){recorder.current.onstop=null;recorder.current.stream.getTracks().forEach(t=>t.stop());}};},[]);
  async function start(){
    if(recording){recorder.current?.stop();return;}
    if(w.preview){w.notice("Voice transcription needs a configured provider in live mode. You can type your response in this preview.");return;}
    await w.run(async()=>{
      if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==="undefined")throw new Error("Voice requires microphone support and HTTPS (or localhost). Use the text response instead.");
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});
      let rec:MediaRecorder;try{rec=new MediaRecorder(stream);}catch(e){stream.getTracks().forEach(t=>t.stop());throw e;}
      recorder.current=rec;const chunks:Blob[]=[];rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
      rec.onstop=async()=>{stream.getTracks().forEach(t=>t.stop());if(timer.current)clearTimeout(timer.current);if(!active.current)return;setRecording(false);setSending(true);await w.run(async()=>{const form=new FormData();form.append("file",new Blob(chunks,{type:rec.mimeType}),"defense.webm");const r=await fetch("/api/voice",{method:"POST",body:form});const d=await r.json();if(!r.ok)throw new Error(d.error||"Transcription failed.");if(active.current){onTranscript(String(d.text||""));w.notice("Transcript inserted. Correct any transcription errors, then save your changes.");}});if(active.current)setSending(false);};
      rec.start();setRecording(true);timer.current=setTimeout(()=>{if(rec.state==="recording")rec.stop();},120000);
    });
  }
  return <div className="course-actions"><button type="button" className="secondary" disabled={disabled||sending||w.busy} onClick={start}>{recording?<Square size={15}/>:<Mic size={15}/>} {recording?"Stop recording":sending?"Transcribing…":`Speak ${label}`}</button><small className="fine">Up to 2 minutes. Review the transcript before saving. Raw audio is not retained by NovaLearn.</small></div>;
}
