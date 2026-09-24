"use client";
import { useEffect, useState } from "react";
import { NovaAvatar } from "./nova-avatar";
import {
  ArrowRight,
  Download,
  CheckCircle2,
  Lightbulb,
  FileText,
  Users,
  Target,
} from "lucide-react";
import {
  Panel,
  Nova,
  Badge,
  Select,
  Empty,
  exportJson,
  useWorkspace,
} from "./course-ui";
import {
  courseInsights,
  type Demonstration,
  type Finding,
} from "@/lib/novalearn/course-domain";
export function ProfessorHome() {
  const w = useWorkspace(),
    c = w.course;
  const evidence = w.demonstrations.filter((d) => d.course_id === c.id);
  const waiting = evidence.filter((d) => d.status === "submitted");
  return (
    <>
      <section className="welcome course-welcome">
        <div>
          <p className="eyebrow">
            Your course. Your expertise. Nova alongside.
          </p>
          <h1>
            Hello, {w.profile.name?.split(" ")[0] || "Professor"} <span>✦</span>
          </h1>
          <p>Turn learning goals into understanding you can see.</p>
          <div className="welcome-stats">
            <span>
              <BookIcon />
              {w.courses.length} courses
            </span>
            <span>
              <Target size={16} />
              {c.data.objectives.length} objectives
            </span>
            <span>
              <FileText size={16} />
              {waiting.length} ready for review
            </span>
          </div>
        </div>
        <NovaAvatar mode={w.busy ? "thinking" : "idle"} compact />
      </section>
      <div className="stats">
        <Panel className="stat">
          <span className="stat-icon">
            <Target />
          </span>
          <div>
            <strong>{c.data.modules.length}</strong>
            <span>Connected learning modules</span>
          </div>
        </Panel>
        <Panel className="stat">
          <span className="stat-icon">
            <CheckCircle2 />
          </span>
          <div>
            <strong>
              {c.data.checkpoints.filter((a) => a.published).length}
            </strong>
            <span>Published checkpoints</span>
          </div>
        </Panel>
        <Panel className="stat">
          <span className="stat-icon">
            <Users />
          </span>
          <div>
            <strong>{waiting.length}</strong>
            <span>Evidence bundles to review</span>
          </div>
        </Panel>
      </div>
      <div className="main-grid">
        <div>
          <Panel className="course-featured">
            <img
              src="/art/lake.png"
              alt="Mountain lake, a landscape for discovery"
            />
            <div>
              <Badge>Continue building</Badge>
              <h2>{c.title}</h2>
              <p>
                A connected path from measurable objectives to evidence of
                understanding.
              </p>
              <button
                className="primary"
                onClick={() => w.navigate("architect")}
              >
                Open Course Architect <ArrowRight size={16} />
              </button>
            </div>
          </Panel>
          <Panel>
            <div className="section-title">
              <h3>Your course workflow</h3>
              <Badge tone={c.data.graphApproved ? "green" : "amber"}>
                {c.data.graphApproved ? "Graph approved" : "Graph needs review"}
              </Badge>
            </div>
            <div className="course-workflow">
              {[
                [
                  "architect",
                  "01",
                  "Shape the course",
                  `${c.data.objectives.length} objectives · ${c.data.modules.length} modules`,
                ],
                [
                  "modules",
                  "02",
                  "Prepare learning",
                  `${c.data.materials.filter((m) => m.approved).length} approved materials`,
                ],
                [
                  "assessments",
                  "03",
                  "Design evidence",
                  `${c.data.checkpoints.length} assessment blueprints`,
                ],
                [
                  "evidence",
                  "04",
                  "Review understanding",
                  `${evidence.filter((d) => d.status === "reviewed").length} professor-reviewed bundles`,
                ],
              ].map(([page, n, title, detail]) => (
                <button key={page} onClick={() => w.navigate(page)}>
                  <span className="number">{n}</span>
                  <span>
                    <b>{title}</b>
                    <small>{detail}</small>
                  </span>
                  <ArrowRight size={16} />
                </button>
              ))}
            </div>
          </Panel>
          <Panel>
            <div className="section-title">
              <h3>Needs your attention</h3>
              <button className="link" onClick={() => w.navigate("evidence")}>
                Evidence Review <ArrowRight size={15} />
              </button>
            </div>
            {waiting.length ? (
              waiting.slice(0, 4).map((d) => (
                <div className="course-list-row" key={d.id}>
                  <span className="round-icon">
                    <FileText size={18} />
                  </span>
                  <div>
                    <b>
                      {w.profiles.find((p) => p.id === d.student_id)?.name ||
                        "Student"}
                    </b>
                    <p>{d.snapshot.checkpoint.title}</p>
                  </div>
                  <Badge tone="amber">Review needed</Badge>
                </div>
              ))
            ) : (
              <p>
                No evidence is waiting for review. Publish a checkpoint to begin
                the learning loop.
              </p>
            )}
          </Panel>
        </div>
        <aside>
          <Nova text="Start in Course Compiler to shape your course, then review materials and assessments. Use Evidence Review for submitted work and Class Insights to plan support. You approve every release and final judgment." />
          <Panel className="tinted">
            <h3>Professor-led, evidence-centered</h3>
            <p>
              No cheating scores. No hidden verdicts. Every finding should point
              to a learning objective and the work that supports it.
            </p>
            <button
              className="secondary"
              onClick={() => w.navigate("insights")}
            >
              Explore class insights <ArrowRight size={16} />
            </button>
          </Panel>
        </aside>
      </div>
    </>
  );
}
function BookIcon() {
  return <FileText size={16} />;
}
export function EvidenceReview() {
  const w = useWorkspace(),
    items = w.demonstrations.filter(
      (d) =>
        d.course_id === w.course.id &&
        ["submitted", "reviewed", "revision_requested"].includes(d.status),
    );
  const [selected, setSelected] = useState(""),
    [note, setNote] = useState(""),
    [decision, setDecision] = useState("override"),
    [findings, setFindings] = useState<Finding[]>([]);
  const d = items.find((d) => d.id === selected) || items[0];
  useEffect(() => {
    if (!d) return;
    setNote(d.data.review?.note || "");
    setDecision(d.data.evaluation ? "confirm" : "override");
    setFindings(
      structuredClone(
        d.data.review?.findings ||
          d.data.evaluation?.findings ||
          d.snapshot.objectives.map((o) => ({
            objectiveId: o.id,
            level: "Needs verification" as const,
            confidence: "Low" as const,
            rationale: "Evidence needs professor review.",
            evidenceIds: d.data.evidence
              .filter((e) => e.objectiveIds.includes(o.id))
              .map((e) => e.id),
            uncertainty: "No automated synthesis available.",
          })),
      ),
    );
  }, [d?.id, d?.version]);
  if (!d)
    return (
      <Empty
        title="The evidence desk is clear"
        text="Submitted student bundles will appear here with their original work, reasoning, and objective-linked findings."
        action={() => w.navigate("assessments")}
        label="Open Assessment Studio"
      />
    );
  const patch = (id: string, p: Partial<Finding>) => {
    setFindings(
      findings.map((f) => (f.objectiveId === id ? { ...f, ...p } : f)),
    );
    setDecision("override");
  };
  return (
    <>
      <div className="section-title">
        <div>
          <h1>Evidence Review</h1>
          <p>Read the work. Inspect the reasoning. Make the decision.</p>
        </div>
        <button
          className="secondary"
          onClick={() => exportJson("novalearn-evidence.json", d)}
        >
          <Download size={16} /> Export bundle
        </button>
      </div>
      <details className="compiler-log"><summary>Ask Nova how to review evidence</summary><Nova small text="Select a student bundle and read the original work before its AI suggestion. For each outcome, check the cited evidence, uncertainty and explanation. Confirm or override the finding, or request a revision. Your judgment—not an AI authorship score—controls feedback and the mastery signal."/></details>
      <div className="course-review-layout">
        <Panel className="course-evidence-list">
          <h3>Evidence inbox</h3>
          {items.map((item) => (
            <button
              key={item.id}
              className={
                "course-inbox-item " + (item.id === d.id ? "active" : "")
              }
              onClick={() => setSelected(item.id)}
            >
              <b>
                {w.profiles.find((p) => p.id === item.student_id)?.name ||
                  "Student"}
              </b>
              <span>{item.snapshot.checkpoint.title}</span>
              <Badge tone={item.status === "reviewed" ? "green" : "amber"}>
                {item.status.replaceAll("_", " ")}
              </Badge>
            </button>
          ))}
        </Panel>
        <div>
          <Panel>
            <div className="section-title">
              <div>
                <h2>{d.snapshot.checkpoint.title}</h2>
                <p>
                  {w.profiles.find((p) => p.id === d.student_id)?.name ||
                    "Student"}{" "}
                  · Course revision {d.snapshot.revision}
                </p>
              </div>
              <Badge>
                {d.data.evaluation?.source || "Original evidence only"}
              </Badge>
            </div>
            <p>
              {d.data.evaluation?.summary ||
                "Automated synthesis was unavailable. You can make a decision from the original evidence below."}
            </p>
            <div className="tinted-box">
              <b>Evidence confidence is not an integrity judgment.</b>
              <p>
                Uncertainty means the evidence needs interpretation or further
                verification. Nova does not detect cheating or infer who
                authored the work.
              </p>
            </div>
            <h3>Original evidence</h3>
            {d.data.evidence.map((e, i) => (
              <details
                className="course-evidence-detail"
                key={e.id}
                open={i === 0}
              >
                <summary>
                  <Badge>{e.kind}</Badge>
                  <b>{e.prompt}</b>
                </summary>
                <div id={"evidence-" + e.id}>
                  <p className="course-prose">{e.answer}</p>
                  <p className="fine">
                    Evidence ID: {e.id} · {new Date(e.at).toLocaleString()}
                  </p>
                </div>
              </details>
            ))}
            {d.data.evidenceBundle&&<details className="course-source" open>
              <summary>Evidence observations · {d.data.evidenceBundle.status.replaceAll("_"," ")}</summary>
              <p className="fine">These observations are provisional. Strength describes the submitted work; confidence describes how certain the interpretation is. Neither is a grade or mastery decision.</p>
              {d.data.evidenceBundle.notice&&<p>{d.data.evidenceBundle.notice}</p>}
              {d.data.evidenceBundle.escalationReason&&<p className="fine">Additional review: {d.data.evidenceBundle.escalationReason}</p>}
              {(d.data.evidenceEvents||[]).filter(e=>d.data.evidenceBundle!.eventIds.includes(e.id)).map(e=><div className="course-finding" key={e.id}>
                <b>{d.snapshot.objectives.find(o=>o.id===e.objectiveId)?.title||e.objectiveId} · {e.type.replaceAll("_"," ")}</b>
                <div className="course-actions"><Badge>{e.status.replaceAll("_"," ")}</Badge><Badge>{e.strength.toLowerCase()} evidence</Badge><Badge>{e.confidence.toLowerCase()} confidence</Badge></div>
                <p>Expected: {e.expected}</p><p className="fine">Rubric: {e.criterion} · Target: {e.targetId} · Item: {e.assessmentItemId}</p>
                <p>{e.claim}</p>
                {e.supports.map((s,i)=><p className="fine" key={i}>Exact support in <a href={`#evidence-${s.evidenceId}`}>{s.evidenceId}</a> [{s.start}–{s.end}]: “{s.quote}”</p>)}
                {e.misconception&&<p className="fine">Possible misconception ({e.misconception.conceptId}): {e.misconception.statement} · “{e.misconception.support.quote}”</p>}
                <p className="fine">{e.scaffolding.replaceAll("_"," ")} · {e.evaluator}{e.routing?` (${e.routing})`:""}</p>
              </div>)}
              {d.data.evidenceBundle.followupTargetIds.length>0&&<p className="fine">Possible follow-up targets: {d.data.evidenceBundle.followupTargetIds.join(", ")}. Use a professor revision request when more evidence is needed.</p>}
            </details>}
            {!d.data.evidenceBundle&&<p className="fine">Legacy bundle: findings cite response IDs only; exact passage observations are unavailable. Check the original work before confirming.</p>}
            <details className="course-source">
              <summary>Tool use & support disclosed by the student</summary>
              <h4>Tools</h4>
              <p>{d.data.disclosure || "Not provided"}</p>
              <h4>Other help</h4>
              <p>{d.data.helpUsed || "Not provided"}</p>
            </details>
            <details className="course-source">
              <summary>Frozen assessment rubric</summary>
              {d.snapshot.checkpoint.rubric.map((r) => (
                <p key={r.objectiveId}>
                  <b>
                    {r.criterion} · {r.weight}%
                  </b>
                  <br />
                  {r.descriptor}
                </p>
              ))}
            </details>
          </Panel>
          <Panel>
            <h2>Objective-linked findings</h2>
            <p>
              AI suggestions remain visible in the exported bundle. Your review
              is a separate, attributable decision.
            </p>
            {findings.map((f) => (
              <div className="course-finding" key={f.objectiveId}>
                <h3>
                  {
                    d.snapshot.objectives.find((o) => o.id === f.objectiveId)
                      ?.title
                  }
                </h3>
                <div className="course-form-grid">
                  <Select
                    label="Understanding supported by evidence"
                    value={f.level}
                    onChange={(v) => patch(f.objectiveId, { level: v as any })}
                    options={["Strong", "Developing", "Needs verification"].map(
                      (v) => ({ value: v, label: v }),
                    )}
                  />
                  <Select
                    label="Evidence confidence"
                    value={f.confidence}
                    onChange={(v) =>
                      patch(f.objectiveId, { confidence: v as any })
                    }
                    options={["Low", "Medium", "High"].map((v) => ({
                      value: v,
                      label: v,
                    }))}
                  />
                </div>
                <label>
                  Reason for this finding
                  <textarea
                    rows={3}
                    value={f.rationale}
                    onChange={(e) =>
                      patch(f.objectiveId, { rationale: e.target.value })
                    }
                    maxLength={2500}
                  />
                </label>
                <label>
                  Uncertainty or missing evidence
                  <textarea
                    rows={2}
                    value={f.uncertainty}
                    onChange={(e) =>
                      patch(f.objectiveId, { uncertainty: e.target.value })
                    }
                    maxLength={1500}
                  />
                </label>
                <fieldset>
                  <legend>Evidence supporting this finding</legend>
                  <div className="course-actions">
                    {d.data.evidence.map((e) => (
                      <label className="course-check" key={e.id}>
                        <input
                          type="checkbox"
                          checked={f.evidenceIds.includes(e.id)}
                          onChange={(event) =>
                            patch(f.objectiveId, {
                              evidenceIds: event.target.checked
                                ? [...f.evidenceIds, e.id]
                                : f.evidenceIds.filter((x) => x !== e.id),
                            })
                          }
                        />
                        {e.id}
                      </label>
                    ))}
                  </div>
                </fieldset>
              </div>
            ))}
            <Select
              label="Professor decision"
              value={decision}
              onChange={setDecision}
              options={[
                ...(d.data.evaluation
                  ? [{ value: "confirm", label: "Confirm AI suggestions" }]
                  : []),
                {
                  value: "override",
                  label: "Record professor decision / override",
                },
                {
                  value: "request_revision",
                  label: "Request further evidence from student",
                },
              ]}
            />
            <label>
              Feedback to the student · required
              <textarea
                rows={4}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={6000}
                placeholder="Explain the decision and the most useful next step…"
              />
            </label>
            <button
              className="primary"
              disabled={w.busy || note.trim().length < 10}
              onClick={() =>
                w.run(async () => {
                  const chosen =
                    decision === "confirm"
                      ? d.data.evaluation!.findings
                      : findings;
                  await w.call("review", {
                    id: d.id,
                    version: d.version,
                    review: { decision, note, findings: chosen },
                  });
                  await w.reload();
                  w.notice(
                    decision === "request_revision"
                      ? "Revision requested. The student can update this bundle."
                      : "Professor review saved and visible to the student.",
                  );
                })
              }
            >
              <CheckCircle2 size={16} /> Save professor review
            </button>
          </Panel>
          <Panel>
            <h3>Evidence trail</h3>
            {!!d.data.reviewHistory?.length&&<details><summary>Professor decision history · {d.data.reviewHistory.length}</summary>{d.data.reviewHistory.map((review,i)=><div className="course-trail" key={`${review.at}-${i}`}><span/><div><b>{review.decision.replaceAll("_"," ")}</b><p>{review.note}</p><small>{new Date(review.at).toLocaleString()} · {review.findings.map(f=>`${f.objectiveId}: ${f.level}`).join("; ")}</small></div></div>)}</details>}
            {!!d.data.evidenceArchive?.length&&<details><summary>Saved student work · {d.data.evidenceArchive.length} attempt(s)</summary>{d.data.evidenceArchive.map(run=><details key={run.runId}><summary>{new Date(run.at).toLocaleString()} · {run.bundle.status.replaceAll("_"," ")}</summary>{run.artifacts.map(a=><div className="course-trail" key={`${run.runId}-${a.id}`}><span/><div><b>{a.kind} · {a.id}</b><p className="fine">{a.prompt}</p><p>{a.answer}</p></div></div>)}</details>)}</details>}
            {d.data.dialogue&&<details><summary>Socratic defense · {d.data.dialogue.mode} · {d.data.dialogue.status}</summary><p>{d.data.dialogue.reason}</p>{d.data.dialogue.turns.map(t=><p key={t.questionId}><b>{t.questionId}</b>: {t.uncertainty}</p>)}<p className="fine">Probe reasons are suggestions, not established misconceptions or grades. Review the student’s actual responses above.</p></details>}
            {d.data.events.map((e, i) => (
              <div className="course-trail" key={i}>
                <span />
                <div>
                  <b>{e.action}</b>
                  <small>{new Date(e.at).toLocaleString()}</small>
                </div>
              </div>
            ))}
            <p className="fine">
              This records explicit learning and review events—not keystrokes,
              private browsing, or hidden monitoring.
            </p>
          </Panel>
        </div>
      </div>
    </>
  );
}
export function ClassInsights() {
  const w = useWorkspace(),
    items = w.demonstrations.filter((d) => d.course_id === w.course.id),
    rows = courseInsights(w.course, items),
    misconceptions = Array.from(
      new Set(
        items
          .filter((d) => d.status === "submitted" || d.status === "reviewed")
          .flatMap((d) => d.data.evaluation?.misconceptions || []),
      ),
    );
  return (
    <>
      <div className="section-title">
        <div>
          <h1>Class Insights</h1>
          <p>Find the teaching decision behind the evidence.</p>
        </div>
        <button
          className="secondary"
          onClick={() =>
            exportJson("novalearn-class-insights.json", {
              course: w.course.title,
              objectives: rows,
              evidenceBundles: items,
            })
          }
        >
          <Download size={16} /> Export insights
        </button>
      </div>
      <div className="main-grid">
        <div>
          <Panel>
            <h2>Understanding across objectives</h2>
            <p>
              Counts represent evidence findings, not unique students. Professor
              decisions replace provisional suggestions in this view.
            </p>
            {rows.map((r) => (
              <div className="course-finding" key={r.objective.id}>
                <div className="section-title">
                  <b>{r.objective.title}</b>
                  <Badge>
                    {r.reviewed} / {r.total} reviewed
                  </Badge>
                </div>
                {r.total ? (
                  <>
                    <div
                      className="course-evidence-bar"
                      aria-label={`${r.Strong} strong, ${r.Developing} developing, ${r["Needs verification"]} need verification`}
                    >
                      <span
                        className="strong"
                        style={{ width: (100 * r.Strong) / r.total + "%" }}
                      />
                      <span
                        className="developing"
                        style={{ width: (100 * r.Developing) / r.total + "%" }}
                      />
                      <span
                        className="verify"
                        style={{
                          width:
                            (100 * r["Needs verification"]) / r.total + "%",
                        }}
                      />
                    </div>
                    <div className="course-actions">
                      <Badge tone="green">{r.Strong} strong</Badge>
                      <Badge>{r.Developing} developing</Badge>
                      <Badge tone="amber">
                        {r["Needs verification"]} need verification
                      </Badge>
                    </div>
                  </>
                ) : (
                  <p className="fine">
                    No submitted evidence for this objective yet.
                  </p>
                )}
                {r.Developing + r["Needs verification"] > 0 && (
                  <button
                    className="link"
                    onClick={() => {
                      w.setModuleId(
                        w.course.data.modules.find((m) =>
                          m.objectiveIds.includes(r.objective.id),
                        )?.id || "",
                      );
                      w.navigate("modules");
                    }}
                  >
                    Prepare targeted practice <ArrowRight size={15} />
                  </button>
                )}
              </div>
            ))}
          </Panel>
          <Panel>
            <h3>Evidence coverage</h3>
            <div className="course-form-grid">
              <div>
                <strong className="course-big">
                  {items.filter((d) => d.status === "submitted").length}
                </strong>
                <p>Bundles awaiting review</p>
              </div>
              <div>
                <strong className="course-big">
                  {items.filter((d) => d.status === "reviewed").length}
                </strong>
                <p>Reviewed by the professor</p>
              </div>
              <div>
                <strong className="course-big">
                  {
                    items.filter((d) => d.status === "revision_requested")
                      .length
                  }
                </strong>
                <p>Further evidence requested</p>
              </div>
              <div>
                <strong className="course-big">
                  {
                    new Set(
                      items
                        .filter((d) =>
                          [
                            "submitted",
                            "reviewed",
                            "revision_requested",
                          ].includes(d.status),
                        )
                        .map((d) => d.student_id),
                    ).size
                  }
                </strong>
                <p>Students with submitted evidence</p>
              </div>
            </div>
          </Panel>
        </div>
        <aside>
          <Nova text="Select a concept cell to inspect the evidence behind its estimate. Review low-confidence findings, assign targeted practice or office-hour support, and refresh after new submissions. Missing evidence does not mean a student has failed." />
          <Panel className="tinted">
            <h3>Possible misconceptions</h3>
            <p className="fine">
              AI-suggested themes to inspect, not established facts about your
              students.
            </p>
            {misconceptions.length ? (
              misconceptions.map((m) => (
                <p className="insight" key={m}>
                  <Lightbulb size={18} />
                  {m}
                </p>
              ))
            ) : (
              <p>
                No themes yet. Review evidence bundles before drawing
                conclusions.
              </p>
            )}
            <button
              className="secondary"
              onClick={() => w.navigate("evidence")}
            >
              Inspect the evidence <ArrowRight size={16} />
            </button>
          </Panel>
        </aside>
      </div>
    </>
  );
}
