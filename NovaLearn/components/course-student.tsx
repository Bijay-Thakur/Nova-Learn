"use client";
import { useEffect, useRef, useState } from "react";
import { isReleased } from "@/lib/novalearn/learning-domain";
import { VoiceInput } from "./voice-input";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  FileText,
  Mic,
  Send,
  Save,
  Volume2,
  Square,
  Upload,
  Sparkles,
} from "lucide-react";
import {
  Panel,
  Nova,
  Badge,
  ModuleSelect,
  Empty,
  SourceLinks,
  readDocument,
  useWorkspace,
} from "./course-ui";
import {
  type Demonstration,
  courseInsights,
} from "@/lib/novalearn/course-domain";
export function Learn() {
  const w = useWorkspace(),
    c = w.course,
    m = c.data.modules.find((x) => x.id === w.moduleId);
  const [messages, setMessages] = useState<
      { role: "user" | "assistant"; content: string; citations?: any[] }[]
    >([]),
    [draft, setDraft] = useState(""),
    [recording, setRecording] = useState(false),
    [speaking, setSpeaking] = useState(false);
  const playing = useRef<HTMLAudioElement | null>(null);
  const recorder = useRef<MediaRecorder | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    setMessages([]);
    setDraft("");
  }, [c.id, w.moduleId]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      recorder.current?.stream.getTracks().forEach((t) => t.stop());
      playing.current?.pause();
      if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    },
    [],
  );
  async function send() {
    if (!draft.trim()) return;
    const current = draft;
    await w.run(async () => {
      const r = await w.call("chat", {
        courseId: c.id,
        moduleId: w.moduleId,
        message: current,
        history: messages
          .slice(-16)
          .map(({ role, content }) => ({ role, content })),
      });
      setMessages([
        ...messages,
        { role: "user", content: current },
        { role: "assistant", content: r.reply, citations: r.citations },
      ]);
      setDraft("");
    });
  }
  const unlocked = isReleased(c.data, w.moduleId);
  async function record() {
    if (recording) {
      recorder.current?.stop();
      return;
    }
    if (w.preview) {
      w.notice(
        "Live voice transcription requires your server provider configuration. Text practice works in this preview.",
      );
      return;
    }
    await w.run(async () => {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      recorder.current = rec;
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      rec.onstop = async () => {
        setRecording(false);
        stream.getTracks().forEach((t) => t.stop());
        if (timer.current) clearTimeout(timer.current);
        await w.run(async () => {
          const form = new FormData();
          form.append(
            "file",
            new Blob(chunks, { type: rec.mimeType }),
            "practice.webm",
          );
          const response = await fetch("/api/voice", {
            method: "POST",
            body: form,
          });
          const body = await response.json();
          if (!response.ok) throw new Error(body.error);
          setDraft((v) => (v ? v + " " : "") + body.text);
          w.notice("Transcript ready. Review it before sending.");
        });
      };
      rec.start();
      setRecording(true);
      timer.current = setTimeout(() => {
        if (rec.state === "recording") rec.stop();
      }, 120000);
    });
  }
  async function listen(text: string) {
    await w.run(async () => {
      if (w.preview) {
        if (!("speechSynthesis" in window))
          throw new Error("Speech playback is not supported by this browser.");
        speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.onstart = () => setSpeaking(true);
        utterance.onend = utterance.onerror = () => setSpeaking(false);
        speechSynthesis.speak(utterance);
        return;
      }
      const r = await fetch("/api/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.slice(0, 4000) }),
      });
      if (!r.ok) throw new Error((await r.json()).error);
      const u = URL.createObjectURL(await r.blob());
      const audio = new Audio(u);
      playing.current?.pause();
      playing.current = audio;
      audio.onplay = () => setSpeaking(true);
      audio.onended = audio.onerror = () => { URL.revokeObjectURL(u); setSpeaking(false); };
      await audio.play();
    });
  }
  return (
    <>
      <div className="main-grid">
        <div>
          <Panel>
            <h2>Learn with purpose</h2>
            <p>
              Your course materials, connected to the understanding you’re
              building.
            </p>
            <ModuleSelect />
          </Panel>
          {m && (
            <Panel>
              <div className="section-title">
                <h2>{m.title}</h2>
                <Badge>Week {m.week}</Badge>
              </div>
              <div className="tags">
                {m.concepts.map((t) => (
                  <span key={t}>{t}</span>
                ))}
              </div>
              <h3>What you’ll be able to do</h3>
              {c.data.objectives
                .filter((o) => m.objectiveIds.includes(o.id))
                .map((o) => (
                  <p className="icon-line" key={o.id}>
                    <CheckCircle2 size={18} />
                    {o.title}
                  </p>
                ))}
              {m.prerequisites.length > 0 && (
                <p className="fine">
                  Builds on:{" "}
                  {m.prerequisites
                    .map((id) => c.data.modules.find((m) => m.id === id)?.title)
                    .join(" · ")}
                </p>
              )}
            </Panel>
          )}
          {c.data.materials
            .filter((x) => x.moduleId === w.moduleId && x.approved)
            .map((x) => (
              <Panel key={x.id}>
                <Badge>{x.kind}</Badge>
                <h2>{x.title}</h2>
                <div className="course-prose">{x.content}</div>
                <SourceLinks ids={x.sourceIds} />
              </Panel>
            ))}
          {m &&
            !c.data.materials.some(
              (x) => x.moduleId === m.id && x.approved,
            ) && (
              <Empty
                title="Materials are being prepared"
                text="Your professor has not released teaching materials for this module yet."
              />
            )}
          <Panel className="tinted">
            <h3>Ready to show your understanding?</h3>
            <p>
              Build your work, explain the reasoning, and apply it in a new
              situation.
            </p>
            <button
              className="primary"
              onClick={() => w.navigate("demonstrate")}
            >
              Open checkpoints <ArrowRight size={16} />
            </button>
          </Panel>
        </div>
        <aside>
          <Nova mode={recording ? "listening" : speaking ? "speaking" : w.busy ? "thinking" : "idle"} text="Start with your recommended concept check, read this module’s notes, and try the practice and applied example. Then teach me the idea in your own words. Use Demonstrate to submit your assignment and assessed Teach Nova explanation; this practice chat is not a grade." />
          {speaking && <button className="secondary" onClick={() => { playing.current?.pause(); if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel(); setSpeaking(false); }}><Square size={15} /> Stop voice playback</button>}
          <Panel>
            <h3>Practice, not a grade</h3>
            <p>
              This conversation is a space to explore. It is not included in
              your assessed evidence bundle.
            </p>
            <p className="fine">
              Practice chat lasts while this panel stays open. Assessments are
              saved separately.
            </p>
            <button
              className="secondary"
              onClick={() => w.navigate("missions")}
            >
              <BookOpen size={16} /> Optional learning labs
            </button>
          </Panel>
        </aside>
      </div>
      {unlocked ? <Panel className="chat-panel course-practice">
        <div className="section-title">
          <div className="row">
            <img className="mini-nova" src="/art/nova.png" alt="Nova" />
            <div>
              <h2>Teach Nova</h2>
              <p>Explain. Question. Make the idea your own.</p>
            </div>
          </div>
          <Badge>
            {w.preview ? "Scripted preview" : "Course-grounded practice"}
          </Badge>
        </div>
        <div className="chat-log">
          <div className="bubble assistant">
            <b>Nova</b>
            <p>
              {m
                ? `How would you explain ${m.title.toLowerCase()} to someone new to the topic? Give me an example, too.`
                : "Choose a module to begin."}
            </p>
          </div>
          {messages.map((m, i) => (
            <div key={i} className={"bubble " + m.role}>
              <b>{m.role === "user" ? "You" : "Nova"}</b>
              <p>{m.content}</p>
              {m.citations?.map((c) => (
                <details className="course-source" key={c.id}>
                  <summary>
                    {c.name} · {c.id}
                  </summary>
                  <p>{c.text}</p>
                </details>
              ))}
              {m.role === "assistant" && (
                <button className="link" onClick={() => listen(m.content)}>
                  <Volume2 size={14} /> Listen
                </button>
              )}
            </div>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <textarea
            rows={4}
            aria-label="Teach Nova your explanation"
            placeholder="Here is how I understand this concept…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={6000}
          />
          <div className="course-actions">
            <button
              type="button"
              className="secondary"
              disabled={w.busy}
              onClick={record}
            >
              {recording ? <Square size={16} /> : <Mic size={16} />}{" "}
              {recording ? "Stop recording" : "Use voice"}
            </button>
            <button
              className="primary"
              disabled={w.busy || !draft.trim() || !m || recording}
            >
              <Send size={16} /> Send explanation
            </button>
          </div>
        </form>
      </Panel> : <Panel><h3>Nova is waiting for this chapter to open</h3><p>Your professor controls the release. You can still explore the roadmap or practice an open module.</p></Panel>}
    </>
  );
}
function answerForm(d: Demonstration) {
  return {
    artifact: d.data.evidence.find((e) => e.kind === "artifact")?.answer || "",
    explanation:
      d.data.evidence.find((e) => e.kind === "explanation")?.answer || "",
    followupAnswers: Object.fromEntries(
      d.data.questions.map((q) => [
        q.id,
        d.data.evidence.find((e) => e.id === q.id)?.answer || "",
      ]),
    ),
    transfer: d.data.evidence.find((e) => e.kind === "transfer")?.answer || "",
    reflection: d.data.evidence.find((e) => e.kind === "reflection")?.answer || "",
    disclosure: d.data.disclosure,
    helpUsed: d.data.helpUsed,
  };
}
export function Demonstrate() {
  const w = useWorkspace(),
    c = w.course;
  const [demo, setDemo] = useState<Demonstration | null>(null),
    [form, setForm] = useState<ReturnType<typeof answerForm>>({
      artifact: "",
      explanation: "",
      followupAnswers: {},
      transfer: "",
      reflection: "",
      disclosure: "",
      helpUsed: "",
    }),
    [step, setStep] = useState(0);
  useEffect(() => {
    setDemo(null);
    setStep(0);
  }, [c.id]);
  const locked = demo && ["submitted", "reviewed"].includes(demo.status);
  function setCurrent(d: Demonstration) {
    setDemo(d);
    setForm(answerForm(d));
  }
  async function save() {
    const d = await w.call("evidence", {
      id: demo!.id,
      version: demo!.version,
      ...form,
    });
    setCurrent(d);
    return d as Demonstration;
  }
  if (!demo)
    return (
      <>
        <div className="section-title">
          <div>
            <h1>Demonstrate your understanding</h1>
            <p>Your work matters. So does the thinking behind it.</p>
          </div>
          <Badge>Evidence, not surveillance</Badge>
        </div>
        <div className="main-grid">
          <div>
            {c.data.checkpoints
              .filter((a) => a.published)
              .map((a) => {
                const existing = w.demonstrations.find(
                  (d) =>
                    d.course_id === c.id &&
                    d.checkpoint_id === a.id &&
                    d.student_id === w.profile.id,
                );
                return (
                  <Panel key={a.id}>
                    <div className="section-title">
                      <Badge>
                        {c.data.modules.find((m) => m.id === a.moduleId)?.title}
                      </Badge>
                      <Badge
                        tone={existing?.status === "reviewed" ? "green" : ""}
                      >
                        {existing?.status.replaceAll("_", " ") || "Not started"}
                      </Badge>
                    </div>
                    <h2>{a.title}</h2>
                    <p>{a.prompt}</p>
                    <p className="fine">
                      {a.objectiveIds.length} objectives · Work + explanation +
                      follow-ups + transfer{a.dueAt ? ` · Due ${a.dueAt}` : ""}
                    </p>
                    <button
                      className="primary"
                      disabled={w.busy}
                      onClick={() =>
                        w.run(async () => {
                          const d = await w.call("begin", {
                            courseId: c.id,
                            checkpointId: a.id,
                          });
                          setCurrent(d);
                          setStep(
                            ["submitted", "reviewed"].includes(d.status)
                              ? 3
                              : 0,
                          );
                        })
                      }
                    >
                      {existing ? "Open evidence bundle" : "Start checkpoint"}
                      <ArrowRight size={16} />
                    </button>
                  </Panel>
                );
              })}
            {!c.data.checkpoints.length && (
              <Empty
                title="No published checkpoints yet"
                text="Your professor will release assessments when the course is ready."
              />
            )}
          </div>
          <aside>
            <Nova text="Show me your reasoning, not just your answer. You’ll see the rubric before you begin." />
            <Panel>
              <h3>What stays with your work</h3>
              <p>
                The assessment brief, objectives, and rubric are frozen when you
                start. Later course edits do not change the criteria for this
                bundle.
              </p>
            </Panel>
          </aside>
        </div>
      </>
    );
  const cp = demo.snapshot.checkpoint;
  return (
    <>
      <div className="section-title">
        <div>
          <button
            className="link"
            onClick={() => {
              if (
                !locked &&
                !window.confirm(
                  "Return to checkpoints? Unsaved changes will be lost.",
                )
              )
                return;
              setDemo(null);
              w.reload();
            }}
          >
            ← All checkpoints
          </button>
          <h1>{cp.title}</h1>
          <p>
            Course revision {demo.snapshot.revision} ·{" "}
            <Badge>{demo.status.replaceAll("_", " ")}</Badge>
          </p>
        </div>
        <button
          className="secondary"
          disabled={w.busy || !!locked}
          onClick={() =>
            w.run(async () => {
              await save();
              w.notice("Evidence draft saved.");
            })
          }
        >
          <Save size={16} /> Save draft
        </button>
      </div>
      {demo.status === "revision_requested" && (
        <div className="course-notice">
          <b>Your professor requested a revision.</b>
          <p>{demo.data.review?.note}</p>
        </div>
      )}
      <div className="stage-nav">
        {[
          "Work & explanation",
          "Follow-up",
          "Transfer",
          "Evidence & feedback",
        ].map((s, i) => (
          <button
            key={s}
            className={step === i ? "active" : ""}
            onClick={() => setStep(i)}
          >
            <span>{i + 1}</span>
            {s}
          </button>
        ))}
      </div>
      <div className="main-grid">
        <div>
          <Panel>
            {step === 0 && (
              <>
                <h2>Your work, your reasoning</h2>
                <p className="course-prose">{cp.prompt}</p>
                {cp.authentic&&<section className="assessment-student-brief"><h3>Your assessment agreement</h3><p><strong>{cp.authentic.inputs.duration} minutes</strong> · {cp.authentic.inputs.difficulty} · {cp.authentic.inputs.collaboration}</p><p><strong>AI policy:</strong> {cp.authentic.inputs.aiPolicy}</p><p><strong>Permitted resources:</strong> {cp.authentic.inputs.resources||"Ask your professor before using additional resources."}</p><p>{cp.authentic.strategy.accessibility}</p>{cp.authentic.assignedVariant&&<div><h3>Your scenario variant · {cp.authentic.assignedVariant.label}</h3><p>{cp.authentic.assignedVariant.change}</p></div>}<h3>Required work</h3><ol>{cp.authentic.tasks.map(t=><li key={t.id}><strong>{t.kind} · {t.minutes} min:</strong> {t.prompt}</li>)}</ol><p className="fine">Put your applied response in Artifact, reasoning in Explanation, and complete verification and transfer in the following tabs. {cp.authentic.inputs.verification==="Extended"?"Reflection is required.":"Reflection is encouraged."} Disclose assistance or state none was used.</p></section>}
                <label>
                  Artifact · written solution, code, analysis, or report
                  <textarea
                    rows={9}
                    value={form.artifact}
                    maxLength={25000}
                    disabled={!!locked}
                    onChange={(e) =>
                      setForm({ ...form, artifact: e.target.value })
                    }
                  />
                </label>
                <label className="secondary course-upload">
                  <Upload size={16} /> Import text artifact
                  <input
                    type="file"
                    accept=".pdf,.txt,.md,.py,.js,.ts,.csv,.json"
                    disabled={!!locked}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f)
                        w.run(async () => {
                          const text = await readDocument(f);
                          if (text.length > 25000)
                            throw new Error(
                              "Artifact text must be under 25,000 characters.",
                            );
                          setForm({ ...form, artifact: text });
                        });
                      e.target.value = "";
                    }}
                  />
                </label>
                <p className="fine">
                  The extracted text is saved, not the original binary file.
                  Verify the imported content.
                </p>
                <label>
                  Explain how and why you reached this answer
                  <textarea
                    rows={6}
                    value={form.explanation}
                    maxLength={15000}
                    disabled={!!locked}
                    onChange={(e) =>
                      setForm({ ...form, explanation: e.target.value })
                    }
                  />
                </label>
                <VoiceInput label="your explanation" disabled={!!locked} onTranscript={text=>setForm(old=>({...old,explanation:(old.explanation+"\n"+text).trim().slice(0,15000)}))}/>
                <label>
                  AI and other tools used · transparency, not a penalty
                  <textarea
                    rows={2}
                    value={form.disclosure}
                    maxLength={3000}
                    disabled={!!locked}
                    onChange={(e) =>
                      setForm({ ...form, disclosure: e.target.value })
                    }
                    placeholder="Describe any tools and what they helped with, or write “None”."
                  />
                </label>
                <label>
                  Sources, collaboration, or other help
                  <textarea
                    rows={2}
                    value={form.helpUsed}
                    maxLength={3000}
                    disabled={!!locked}
                    onChange={(e) =>
                      setForm({ ...form, helpUsed: e.target.value })
                    }
                  />
                </label>
                <p className="fine">
                  Changing the original work after questions are generated
                  resets those questions, so the follow-up stays connected to
                  your current explanation.
                </p>
                <button
                  className="primary"
                  disabled={w.busy || !!locked}
                  onClick={() =>
                    w.run(async () => {
                      const saved = await save();
                      const d = await w.call("followups", {
                        id: saved.id,
                        version: saved.version,
                      });
                      setCurrent(d);
                      setStep(1);
                    })
                  }
                >
                  <Sparkles size={16} /> Save & generate follow-ups
                </button>
              </>
            )}
            {step === 1 && (
              <>
                <h2>Let’s examine the reasoning</h2>
                <p>
                  These questions probe claims and assumptions in your
                  explanation.
                </p>
                {demo.data.questions.length ? (
                  demo.data.questions.map((q, i) => (
                    <div key={q.id}><label>
                      {i + 1}. {q.prompt}
                      <textarea
                        rows={5}
                        disabled={!!locked}
                        maxLength={8000}
                        value={form.followupAnswers[q.id] || ""}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            followupAnswers: {
                              ...form.followupAnswers,
                              [q.id]: e.target.value,
                            },
                          })
                        }
                      />
                    </label><VoiceInput label={`follow-up ${i+1}`} disabled={!!locked} onTranscript={text=>setForm(old=>({...old,followupAnswers:{...old.followupAnswers,[q.id]:((old.followupAnswers[q.id]||"")+"\n"+text).trim().slice(0,8000)}}))}/></div>
                  ))
                ) : (
                  <p>
                    Save your work in step 1 to generate your follow-up
                    questions.
                  </p>
                )}
                <button
                  className="primary"
                  disabled={w.busy || !!locked || !demo.data.questions.length}
                  onClick={() =>
                    w.run(async () => {
                      await save();
                      setStep(2);
                    })
                  }
                >
                  Save & continue <ArrowRight size={16} />
                </button>
              </>
            )}
            {step === 2 && (
              <>
                <h2>Can the idea travel?</h2>
                <p className="course-prose">{cp.transferPrompt}</p>
                <label>
                  Apply your understanding to this changed situation
                  <textarea
                    rows={10}
                    value={form.transfer}
                    maxLength={10000}
                    disabled={!!locked}
                    onChange={(e) =>
                      setForm({ ...form, transfer: e.target.value })
                    }
                  />
                </label>
                <label>Reflection · how has your understanding changed?<textarea rows={4} maxLength={5000} disabled={!!locked} value={form.reflection} onChange={e=>setForm({...form,reflection:e.target.value})} placeholder="What changed? What was difficult? What will you investigate next?"/></label>
                <p className="fine">
                  Submission locks this evidence until your professor requests a
                  revision. AI findings are provisional, never a final grade.
                </p>
                <button
                  className="primary"
                  disabled={w.busy || !!locked}
                  onClick={() =>
                    w.run(async () => {
                      const saved = await save();
                      const d = await w.call("submit", {
                        id: saved.id,
                        version: saved.version,
                      });
                      setCurrent(d);
                      setStep(3);
                      await w.reload();
                      w.notice(
                        d.notice ||
                          "Evidence submitted. Your professor can now review it.",
                      );
                    })
                  }
                >
                  <Send size={16} /> Submit evidence bundle
                </button>
              </>
            )}
            {step === 3 && (
              <>
                <h2>Evidence & feedback</h2>
                <Badge tone={demo.data.review ? "green" : "amber"}>
                  {demo.data.review
                    ? "Professor reviewed"
                    : "Awaiting professor review"}
                </Badge>
                {demo.data.review && (
                  <div className="tinted-box">
                    <h3>Professor feedback</h3>
                    <p>{demo.data.review.note}</p>
                  </div>
                )}
                <p>
                  {demo.data.evaluation?.summary ||
                    "No automated synthesis is available. Your professor can review the original evidence."}
                </p>
                {(
                  demo.data.review?.findings ||
                  demo.data.evaluation?.findings ||
                  []
                ).map((f) => (
                  <div className="course-finding" key={f.objectiveId}>
                    <b>
                      {
                        demo.snapshot.objectives.find(
                          (o) => o.id === f.objectiveId,
                        )?.title
                      }
                    </b>
                    <div className="course-actions">
                      <Badge tone={f.level === "Strong" ? "green" : "amber"}>
                        {f.level}
                      </Badge>
                      <Badge>{f.confidence} evidence confidence</Badge>
                    </div>
                    <p>{f.rationale}</p>
                    <p className="fine">{f.uncertainty}</p>
                  </div>
                ))}
                {demo.data.evaluation?.nextSteps.map((s) => (
                  <p className="icon-line" key={s}>
                    <ArrowRight size={16} />
                    {s}
                  </p>
                ))}
                <h3>Submitted evidence</h3>
                {demo.data.evidence.map((e) => (
                  <details className="course-source" key={e.id}>
                    <summary>
                      {e.kind} · {e.id}
                    </summary>
                    <b>{e.prompt}</b>
                    <p className="course-prose">{e.answer}</p>
                  </details>
                ))}
              </>
            )}
          </Panel>
        </div>
        <aside>
          <Nova text="Evidence confidence describes how much the work supports a finding. It is never a claim about your honesty." />
          <Panel>
            <h3>Your rubric</h3>
            {cp.rubric.map((r) => (
              <div className="course-rubric" key={r.objectiveId}>
                <div className="section-title">
                  <b>{r.criterion}</b>
                  <Badge>{r.weight}%</Badge>
                </div>
                <p className="fine">{r.descriptor}</p>
                {cp.authentic?.levels.filter(l=>l.objectiveId===r.objectiveId).map(l=><details key={l.objectiveId}><summary>Performance levels</summary><p><strong>Excellent:</strong> {l.excellent}</p><p><strong>Proficient:</strong> {l.proficient}</p><p><strong>Developing:</strong> {l.developing}</p><p><strong>Beginning:</strong> {l.beginning}</p></details>)}
              </div>
            ))}
          </Panel>
        </aside>
      </div>
    </>
  );
}
export function StudentProgress() {
  const w = useWorkspace(),
    items = w.demonstrations.filter(
      (d) => d.course_id === w.course.id && d.student_id === w.profile.id,
    );
  const insights = courseInsights(w.course, items);
  return (
    <>
      <div className="report-banner">
        <Badge>Objective-linked progress</Badge>
        <h1>See what your evidence supports.</h1>
        <p>
          Understanding develops through practice, explanation, and transfer.
        </p>
      </div>
      <div className="stats">
        <Panel className="stat">
          <CheckCircle2 />
          <div>
            <strong>
              {items.filter((d) => d.status === "reviewed").length}
            </strong>
            <span>Professor-reviewed bundles</span>
          </div>
        </Panel>
        <Panel className="stat">
          <FileText />
          <div>
            <strong>
              {items.filter((d) => d.status === "submitted").length}
            </strong>
            <span>Awaiting review</span>
          </div>
        </Panel>
        <Panel className="stat">
          <BookOpen />
          <div>
            <strong>
              {insights.filter((i) => i.total > 0).length} / {insights.length}
            </strong>
            <span>Objectives with evidence</span>
          </div>
        </Panel>
      </div>
      <div className="main-grid">
        <div>
          <Panel>
            <h2>Learning objective map</h2>
            {insights.map((i) => (
              <div className="course-finding" key={i.objective.id}>
                <b>{i.objective.title}</b>
                <div className="course-actions">
                  {i.total ? (
                    <>
                      <Badge tone="green">{i.Strong} strong</Badge>
                      <Badge>{i.Developing} developing</Badge>
                      <Badge tone="amber">
                        {i["Needs verification"]} need verification
                      </Badge>
                    </>
                  ) : (
                    <Badge>No submitted evidence yet</Badge>
                  )}
                </div>
                <p className="fine">
                  {i.reviewed} professor-reviewed findings. Unreviewed findings
                  are provisional AI suggestions, not final grades.
                </p>
              </div>
            ))}
          </Panel>
          {items.map((d) => (
            <Panel key={d.id}>
              <div className="section-title">
                <h3>{d.snapshot.checkpoint.title}</h3>
                <Badge>{d.status.replaceAll("_", " ")}</Badge>
              </div>
              <p>
                {d.data.review?.note ||
                  d.data.evaluation?.summary ||
                  "Continue this checkpoint to gather evidence of understanding."}
              </p>
              {d.data.evaluation?.nextSteps.map((s) => (
                <p className="fine" key={s}>
                  {s}
                </p>
              ))}
              <button
                className="link"
                onClick={() => w.navigate("demonstrate")}
              >
                Open evidence bundles <ArrowRight size={16} />
              </button>
            </Panel>
          ))}
        </div>
        <aside>
          <Nova text="Open a concept to see the evidence and uncertainty behind your progress. Follow your next practice recommendation, check professor feedback, and revisit concepts due for review. A single correct answer is not proof of mastery." />
          <Panel>
            <h3>Choose your next step</h3>
            <p>
              Use your professor’s feedback to revisit a module, strengthen an
              explanation, or test a new example.
            </p>
            <button className="primary" onClick={() => w.navigate("learn")}>
              Return to learning <ArrowRight size={16} />
            </button>
          </Panel>
        </aside>
      </div>
    </>
  );
}
