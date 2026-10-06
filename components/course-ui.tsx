"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Activity, ArrowRight, FileText } from "lucide-react";
import { clientId } from "@/lib/novalearn/client-id";
import { NovaAvatar, type NovaMood } from "./nova-avatar";
import {
  Select as SelectRoot,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import type {
  Course,
  Demonstration,
  CourseData,
} from "@/lib/novalearn/course-domain";
export type Workspace = {
  course: Course;
  courses: Course[];
  demonstrations: Demonstration[];
  profile: any;
  classes: any[];
  profiles: any[];
  enrollments: any[];
  preview: boolean;
  busy: boolean;
  provider: string;
  moduleId: string;
  setModuleId: (id: string) => void;
  setCourse: (c: Course) => void;
  change: (patch: Partial<CourseData>) => void;
  call: (action: string, body?: any) => Promise<any>;
  run: (fn: () => Promise<void>) => Promise<void>;
  save: (course?: Course, approveGraph?: boolean) => Promise<Course>;
  reload: () => Promise<void>;
  navigate: (page: string) => void;
  notice: (message: string) => void;
};
export const WorkspaceContext = createContext<Workspace | null>(null);
export const useWorkspace = () => useContext(WorkspaceContext)!;
export function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={"panel " + className}>{children}</section>;
}
export function Nova({ text="I’m here to help you learn. Choose a course to begin.", mode, small=false }: { text?: string; mode?: NovaMood; small?:boolean }) {
  const w = useContext(WorkspaceContext);
  const [speaking,setSpeaking]=useState(false),[voiceAvailable,setVoiceAvailable]=useState(false);
  useEffect(()=>{setVoiceAvailable("speechSynthesis" in window);return()=>{if("speechSynthesis" in window)window.speechSynthesis.cancel();};},[]);
  useEffect(()=>{if("speechSynthesis" in window)window.speechSynthesis.cancel();setSpeaking(false);},[text]);
  function explain(){
    if(!voiceAvailable)return;
    window.speechSynthesis.cancel();
    if(speaking){setSpeaking(false);return;}
    const utterance=new SpeechSynthesisUtterance(text);utterance.rate=.96;utterance.onstart=()=>setSpeaking(true);utterance.onend=()=>setSpeaking(false);utterance.onerror=()=>setSpeaking(false);window.speechSynthesis.speak(utterance);
  }
  return (
    <section className={"nova-panel "+(small?"compact":"")}>
      <h3>
        Hi! I’m Nova <Activity size={18} />
      </h3>
      <NovaAvatar compact={small} mode={speaking?"speaking":mode || (w?.busy ? "thinking" : "idle")} />
      <div className="speech">{text}</div>
      <div className="nova-speech-controls"><button className="secondary" type="button" onClick={explain} disabled={!voiceAvailable}>{speaking?"Stop explanation":"Explain aloud"}</button><small className="fine">{voiceAvailable?"Uses your device’s voice. No microphone needed.":"Read the guidance above; device voice is unavailable."}</small></div>
    </section>
  );
}
export function Badge({
  children,
  tone = "",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={"course-badge " + tone}>{children}</span>;
}
export function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="course-select">
      <span>{label}</span>
      <SelectRoot
        value={value || "__none__"}
        onValueChange={(v) => onChange(v === "__none__" ? "" : v)}
      >
        <SelectTrigger aria-label={label}>
          <SelectValue placeholder={label} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem
              key={o.value || "__none__"}
              value={o.value || "__none__"}
            >
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </SelectRoot>
    </div>
  );
}
export function ModuleSelect() {
  const w = useWorkspace();
  return (
    <Select
      label="Module"
      value={w.moduleId}
      onChange={w.setModuleId}
      options={[
        { value: "", label: "Choose a module" },
        ...w.course.data.modules.map((m) => ({
          value: m.id,
          label: `Week ${m.week} · ${m.title}`,
        })),
      ]}
    />
  );
}
export function Empty({
  title,
  text,
  action,
  label,
}: {
  title: string;
  text: string;
  action?: () => void;
  label?: string;
}) {
  return (
    <Panel>
      <div className="empty">
        <FileText />
        <h3>{title}</h3>
        <p>{text}</p>
        {action && (
          <button className="primary" onClick={action}>
            {label}
            <ArrowRight size={16} />
          </button>
        )}
      </div>
    </Panel>
  );
}
export function SourceLinks({ ids }: { ids: string[] }) {
  const { course } = useWorkspace();
  return (
    <div className="course-citations">
      {ids.map((id) => {
        const s = course.data.sources.find((s) =>
          s.chunks.some((c) => c.id === id),
        );
        const c = s?.chunks.find((c) => c.id === id);
        return s && c ? (
          <details key={id}>
            <summary>
              <FileText size={14} />
              {s.name} · {id}
            </summary>
            <p className="course-prose">{c.text}</p>
          </details>
        ) : null;
      })}
    </div>
  );
}
export function exportJson(name: string, value: unknown) {
  const u = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}
export const uid = (prefix = "id") => `${prefix}-${clientId().slice(0, 8)}`;
export async function readDocument(file: File) {
  if (file.size > 5 * 1024 * 1024)
    throw new Error("Choose a document smaller than 5 MB.");
  let text = "";
  if (file.name.toLowerCase().endsWith(".pdf")) {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    const doc = await pdfjs.getDocument({
      data: await file.arrayBuffer(),
      isEvalSupported: false,
    }).promise;
    try {
      if (doc.numPages > 50)
        throw new Error("Choose a PDF with 50 pages or fewer.");
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        text +=
          `\n\n[Page ${i}]\n` +
          content.items
            .map((item) =>
              "str" in item
                ? item.str + ("hasEOL" in item && item.hasEOL ? "\n" : " ")
                : "",
            )
            .join("");
      }
    } finally {
      await doc.destroy();
    }
    if (text.replace(/\[Page \d+\]/g, "").trim().length < 20)
      throw new Error(
        "This PDF has no readable text layer. Run OCR first, or paste the text.",
      );
  } else if (/\.(txt|md|csv|json|py|js|ts)$/i.test(file.name))
    text = await file.text();
  else throw new Error("Use a text-based PDF, TXT, or Markdown file.");
  if (text.length > 100000)
    throw new Error(
      "This document is too long. Split it into sections under 100,000 characters.",
    );
  return text.trim();
}
