"use client";
import { useState } from "react";
import { learningConfig } from "@/lib/novalearn/learning-domain";
import {
  Plus,
  ArrowUp,
  ArrowDown,
  Trash2,
  Sparkles,
  CheckCircle2,
  Upload,
  Save,
  Send,
  BookOpen,
} from "lucide-react";
import {
  Panel,
  Nova,
  Badge,
  Select,
  ModuleSelect,
  Empty,
  SourceLinks,
  uid,
  readDocument,
  useWorkspace,
} from "./course-ui";
import {
  chunkText,
  validateGraph,
  validateCheckpoint,
  type Course,
  type Material,
  type Checkpoint,
} from "@/lib/novalearn/course-domain";
export function Architect() {
  const w = useWorkspace(),
    { course: c, change, run, busy } = w;
  const [sourceName, setSourceName] = useState(""),
    [sourceText, setSourceText] = useState("");
  const patchModule = (id: string, p: any) =>
    change({
      modules: c.data.modules.map((m) => (m.id === id ? { ...m, ...p } : m)),
      graphApproved: false,
    });
  const move = (index: number, delta: number) => {
    const modules = [...c.data.modules];
    [modules[index], modules[index + delta]] = [
      modules[index + delta],
      modules[index],
    ];
    change({ modules, graphApproved: false });
  };
  return (
    <div className="main-grid course-editor">
      <div>
        <Panel>
          <div className="section-title">
            <div>
              <h2>Course Architect</h2>
              <p>Your objectives. A connected plan. Always yours to approve.</p>
            </div>
            <Badge tone={c.data.graphApproved ? "green" : "amber"}>
              {c.data.graphApproved ? "Graph approved" : "Draft graph"}
            </Badge>
          </div>
          <div className="course-form-grid">
            <label>
              Course title
              <input
                value={c.title}
                maxLength={200}
                onChange={(e) => w.setCourse({ ...c, title: e.target.value })}
              />
            </label>
            <Select
              label="Linked class"
              value={c.class_id || ""}
              onChange={(v) => w.setCourse({ ...c, class_id: v || null })}
              options={[
                { value: "", label: "Choose a class" },
                ...w.classes.map((c) => ({ value: c.id, label: c.name })),
              ]}
            />
          </div>
          <label>
            Rough syllabus or course outline
            <textarea
              rows={7}
              value={c.data.syllabus}
              maxLength={100000}
              placeholder="Paste your topics, intended learning outcomes, weekly schedule, and assessment expectations…"
              onChange={(e) => change({ syllabus: e.target.value })}
            />
          </label>
          <div className="course-actions">
            <label className="secondary course-upload">
              <Upload size={16} /> Import syllabus
              <input
                type="file"
                accept=".pdf,.txt,.md"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f)
                    run(async () => {
                      change({ syllabus: await readDocument(f) });
                      w.notice(
                        "Syllabus imported. Review the extracted text before generating.",
                      );
                    });
                  e.target.value = "";
                }}
              />
            </label>
            <button
              className="primary"
              disabled={busy || c.data.syllabus.length < 40}
              onClick={() =>
                run(async () => {
                  if (
                    c.data.modules.length &&
                    !window.confirm(
                      "Replace the current graph? Teaching materials and assessments will be cleared in this draft. The released course stays unchanged.",
                    )
                  )
                    return;
                  const g = await w.call("graph", {
                    syllabus: c.data.syllabus,
                    constraints: learningConfig(c.data),
                  });
                  change({
                    objectives: g.objectives,
                    modules: g.modules,
                    graphApproved: false,
                    materials: [],
                    checkpoints: [],
                    learning: undefined,
                  });
                  w.setModuleId(g.modules[0]?.id || "");
                  w.notice(
                    g.notice || "Graph proposal ready. Edit it, then approve.",
                  );
                })
              }
            >
              <Sparkles size={16} /> Propose course graph
            </button>
          </div>
          <p className="fine">
            PDF imports use the text layer; scanned pages need OCR. AI proposals
            remain drafts until you approve them.
          </p>
        </Panel>
        <Panel>
          <div className="section-title">
            <div>
              <h3>Learning objectives</h3>
              <p>Measurable outcomes connect every module and checkpoint.</p>
            </div>
            <button
              className="secondary"
              disabled={busy}
              onClick={() =>
                change({
                  objectives: [
                    ...c.data.objectives,
                    {
                      id: uid("o"),
                      title: "Explain the central concept with evidence",
                      level: "Apply",
                    },
                  ],
                  graphApproved: false,
                })
              }
            >
              <Plus size={15} /> Objective
            </button>
          </div>
          {c.data.objectives.map((o, i) => (
            <div className="objective-editor" key={o.id}>
              <span className="number">{i + 1}</span>
              <label className="grow">
                <span className="sr-only">Objective {i + 1}</span>
                <input
                  value={o.title}
                  maxLength={500}
                  onChange={(e) =>
                    change({
                      objectives: c.data.objectives.map((x) =>
                        x.id === o.id ? { ...x, title: e.target.value } : x,
                      ),
                      graphApproved: false,
                    })
                  }
                />
              </label>
              <Select
                label="Cognitive level"
                value={o.level}
                onChange={(v) =>
                  change({
                    objectives: c.data.objectives.map((x) =>
                      x.id === o.id ? { ...x, level: v as any } : x,
                    ),
                    graphApproved: false,
                  })
                }
                options={[
                  "Understand",
                  "Apply",
                  "Analyze",
                  "Evaluate",
                  "Create",
                ].map((v) => ({ value: v, label: v }))}
              />
              <button
                className="course-icon"
                aria-label={"Remove objective " + (i + 1)}
                onClick={() => {
                  if (
                    c.data.checkpoints.some((a) =>
                      a.objectiveIds.includes(o.id),
                    )
                  ) {
                    w.notice(
                      "Remove this objective from its assessments before deleting it.",
                    );
                    return;
                  }
                  change({
                    objectives: c.data.objectives.filter((x) => x.id !== o.id),
                    modules: c.data.modules.map((m) => ({
                      ...m,
                      objectiveIds: m.objectiveIds.filter((x) => x !== o.id),
                    })),
                    graphApproved: false,
                  });
                }}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </Panel>
        <Panel>
          <div className="section-title">
            <h3>Module & prerequisite map</h3>
            <button
              className="secondary"
              disabled={!c.data.objectives.length || busy}
              onClick={() =>
                change({
                  modules: [
                    ...c.data.modules,
                    {
                      id: uid("m"),
                      title: "New module",
                      week: c.data.modules.length + 1,
                      concepts: [],
                      objectiveIds: [c.data.objectives[0].id],
                      prerequisites: [],
                    },
                  ],
                  graphApproved: false,
                })
              }
            >
              <Plus size={15} /> Module
            </button>
          </div>
          {c.data.modules.map((m, i) => (
            <details className="course-module-editor" key={m.id} open>
              <summary>
                <span className="number">{i + 1}</span>
                <b>{m.title}</b>
                <Badge>Week {m.week}</Badge>
              </summary>
              <div className="course-form-grid">
                <label>
                  Module title
                  <input
                    value={m.title}
                    maxLength={200}
                    onChange={(e) =>
                      patchModule(m.id, { title: e.target.value })
                    }
                  />
                </label>
                <label>
                  Teaching week
                  <input
                    type="number"
                    min={1}
                    max={52}
                    value={m.week}
                    onChange={(e) =>
                      patchModule(m.id, { week: Number(e.target.value) })
                    }
                  />
                </label>
              </div>
              <label>
                Concepts · comma separated
                <input
                  value={m.concepts.join(", ")}
                  onChange={(e) =>
                    patchModule(m.id, {
                      concepts: e.target.value.split(",").map((x) => x.trim()),
                    })
                  }
                />
              </label>
              <fieldset>
                <legend>Objectives in this module</legend>
                {c.data.objectives.map((o) => (
                  <label className="course-check" key={o.id}>
                    <input
                      type="checkbox"
                      checked={m.objectiveIds.includes(o.id)}
                      onChange={(e) =>
                        patchModule(m.id, {
                          objectiveIds: e.target.checked
                            ? [...m.objectiveIds, o.id]
                            : m.objectiveIds.filter((x) => x !== o.id),
                        })
                      }
                    />
                    {o.title}
                  </label>
                ))}
              </fieldset>
              <fieldset>
                <legend>Prerequisites</legend>
                {c.data.modules
                  .filter((x) => x.id !== m.id)
                  .map((x) => (
                    <label className="course-check" key={x.id}>
                      <input
                        type="checkbox"
                        checked={m.prerequisites.includes(x.id)}
                        onChange={(e) =>
                          patchModule(m.id, {
                            prerequisites: e.target.checked
                              ? [...m.prerequisites, x.id]
                              : m.prerequisites.filter((id) => id !== x.id),
                          })
                        }
                      />
                      {x.title}
                    </label>
                  ))}
              </fieldset>
              <div className="course-actions">
                <button
                  className="secondary"
                  aria-label="Move module up"
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                >
                  <ArrowUp size={15} />
                </button>
                <button
                  className="secondary"
                  aria-label="Move module down"
                  disabled={i === c.data.modules.length - 1}
                  onClick={() => move(i, 1)}
                >
                  <ArrowDown size={15} />
                </button>
                <button
                  className="link"
                  onClick={() => {
                    if (
                      c.data.materials.some((x) => x.moduleId === m.id) ||
                      c.data.checkpoints.some((x) => x.moduleId === m.id)
                    ) {
                      w.notice(
                        "Remove this module’s materials and assessments before deleting it.",
                      );
                      return;
                    }
                    change({
                      modules: c.data.modules
                        .filter((x) => x.id !== m.id)
                        .map((x) => ({
                          ...x,
                          prerequisites: x.prerequisites.filter(
                            (id) => id !== m.id,
                          ),
                        })),
                      graphApproved: false,
                    });
                  }}
                >
                  <Trash2 size={15} /> Remove
                </button>
              </div>
            </details>
          ))}
        </Panel>
        <Panel>
          <div className="section-title">
            <h3>Approved knowledge sources</h3>
            <Badge>{c.data.sources.length} sources</Badge>
          </div>
          <p>
            Nova grounds course materials and practice in sources you approve.
            Nothing is fetched from the open web.
          </p>
          {c.data.sources.map((s) => (
            <details className="course-source" key={s.id}>
              <summary>
                <BookOpen size={17} />
                <b>{s.name}</b>
                <Badge tone={s.approved ? "green" : "amber"}>
                  {s.approved ? "Approved" : "Draft"}
                </Badge>
              </summary>
              <p className="course-prose">{s.text}</p>
              <div className="course-actions">
                <label className="course-check">
                  <input
                    type="checkbox"
                    checked={s.approved}
                    onChange={(e) =>
                      change({
                        sources: c.data.sources.map((x) =>
                          x.id === s.id
                            ? { ...x, approved: e.target.checked }
                            : x,
                        ),
                      })
                    }
                  />
                  Approve for student learning & grounding
                </label>
                <button
                  className="secondary"
                  disabled={busy || !s.approved || w.preview}
                  onClick={() =>
                    run(async () => {
                      const saved = await w.save();
                      const indexed = await w.call("index", {
                        courseId: saved.id,
                        sourceId: s.id,
                      });
                      w.setCourse(indexed);
                      w.notice(
                        "Semantic index saved. Release again to update student retrieval.",
                      );
                    })
                  }
                >
                  Index embeddings
                </button>
                <button
                  className="link"
                  onClick={() =>
                    change({
                      sources: c.data.sources.filter((x) => x.id !== s.id),
                      materials: c.data.materials.map((m) =>
                        m.sourceIds.some((id) =>
                          s.chunks.some((c) => c.id === id),
                        )
                          ? {
                              ...m,
                              approved: false,
                              sourceIds: m.sourceIds.filter(
                                (id) => !s.chunks.some((c) => c.id === id),
                              ),
                            }
                          : m,
                      ),
                    })
                  }
                >
                  Remove source
                </button>
              </div>
            </details>
          ))}
          <label>
            Source name
            <input
              value={sourceName}
              onChange={(e) => setSourceName(e.target.value)}
              placeholder="Week 1 lecture notes"
              maxLength={180}
            />
          </label>
          <label>
            Source text
            <textarea
              rows={5}
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
              maxLength={100000}
              placeholder="Paste the course material students may use…"
            />
          </label>
          <div className="course-actions">
            <label className="secondary course-upload">
              <Upload size={16} /> Import PDF / text
              <input
                type="file"
                accept=".pdf,.txt,.md"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f)
                    run(async () => {
                      setSourceText(await readDocument(f));
                      setSourceName(f.name);
                    });
                  e.target.value = "";
                }}
              />
            </label>
            <button
              className="primary"
              disabled={busy || !sourceName.trim() || sourceText.length < 10}
              onClick={() => {
                const id = uid("source");
                change({
                  sources: [
                    ...c.data.sources,
                    {
                      id,
                      name: sourceName,
                      text: sourceText,
                      approved: false,
                      chunks: chunkText(sourceText, id),
                    },
                  ],
                });
                setSourceName("");
                setSourceText("");
              }}
            >
              <Plus size={16} /> Add source draft
            </button>
          </div>
        </Panel>
        <div className="course-savebar">
          <button
            className="secondary"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await w.save();
                w.notice("Course draft saved.");
              })
            }
          >
            <Save size={16} /> Save draft
          </button>
          <button
            className="primary"
            disabled={busy || !c.data.modules.length}
            onClick={() =>
              run(async () => {
                validateGraph(c.data);
                await w.save(
                  { ...c, data: { ...c.data, graphApproved: true } },
                  true,
                );
                w.notice(
                  "Graph approved. Build your materials and assessments next.",
                );
              })
            }
          >
            <CheckCircle2 size={16} /> Approve graph
          </button>
        </div>
      </div>
      <aside>
        <Nova text="You set the learning destination. I’ll help connect the objectives, concepts, and evidence—but you approve the route." />
        <Panel className="tinted">
          <h3>From plan to practice</h3>
          <ol className="map-list">
            {[
              "Define measurable objectives",
              "Review module prerequisites",
              "Approve course sources",
              "Build materials & checkpoints",
              "Release to your class",
            ].map((s, i) => (
              <li key={s}>
                <span>{i + 1}</span>
                {s}
              </li>
            ))}
          </ol>
          <button
            className="primary full"
            disabled={busy || !c.data.graphApproved}
            onClick={() =>
              run(async () => {
                const saved = await w.save();
                await w.call("release", { courseId: saved.id });
                w.notice(
                  "Approved content released to enrolled students. Drafts remain private.",
                );
              })
            }
          >
            <Send size={16} /> Release approved content
          </button>
          <p className="fine">
            Releasing updates the student course. Existing evidence retains its
            original rubric.
          </p>
        </Panel>
        <Panel>
          <h3>Decision history</h3>
          {c.data.audit.length ? (
            c.data.audit
              .slice(-5)
              .reverse()
              .map((a, i) => (
                <p className="fine" key={i}>
                  {a.action}
                  <br />
                  {new Date(a.at).toLocaleString()}
                </p>
              ))
          ) : (
            <p className="fine">Saved professor decisions appear here.</p>
          )}
        </Panel>
      </aside>
    </div>
  );
}
export function ModuleStudio() {
  const w = useWorkspace(),
    c = w.course,
    m = c.data.modules.find((m) => m.id === w.moduleId);
  const [kind, setKind] = useState<Material["kind"]>("Lecture notes");
  if (!c.data.modules.length)
    return (
      <Empty
        title="Start with your course graph"
        text="Add modules and objectives in Course Architect."
        action={() => w.navigate("architect")}
        label="Open Course Architect"
      />
    );
  const update = (id: string, p: Partial<Material>) =>
    w.change({
      materials: c.data.materials.map((m) =>
        m.id === id ? { ...m, ...p } : m,
      ),
    });
  return (
    <div className="main-grid">
      <div>
        <Panel>
          <h2>Module Studio</h2>
          <p>
            Turn objectives into clear explanations, examples, and purposeful
            practice.
          </p>
          <ModuleSelect />
          <Select
            label="Material type"
            value={kind}
            onChange={(v) => setKind(v as any)}
            options={[
              "Lecture notes",
              "Worked example",
              "Practice",
              "Discussion",
            ].map((v) => ({ value: v, label: v }))}
          />
          <div className="course-actions">
            <button
              className="primary"
              disabled={w.busy || !m}
              onClick={() =>
                w.run(async () => {
                  await w.save();
                  const d = await w.call("material", {
                    courseId: c.id,
                    moduleId: m!.id,
                    kind,
                    objectiveIds: m!.objectiveIds,
                    objectives: c.data.objectives.filter((o) =>
                      m!.objectiveIds.includes(o.id),
                    ),
                  });
                  w.change({
                    materials: [
                      ...c.data.materials,
                      {
                        id: uid("mat"),
                        moduleId: m!.id,
                        kind,
                        title: d.title,
                        content: d.content,
                        sourceIds: d.sourceIds,
                        approved: false,
                      },
                    ],
                  });
                  w.notice(
                    "Draft ready. Review the source citations and approve when ready.",
                  );
                })
              }
            >
              <Sparkles size={16} /> Draft from course sources
            </button>
            <button
              className="secondary"
              disabled={!m}
              onClick={() =>
                w.change({
                  materials: [
                    ...c.data.materials,
                    {
                      id: uid("mat"),
                      moduleId: m!.id,
                      kind,
                      title: "New " + kind.toLowerCase(),
                      content: "Write your teaching material here.",
                      sourceIds: [],
                      approved: false,
                    },
                  ],
                })
              }
            >
              <Plus size={16} /> Write manually
            </button>
          </div>
        </Panel>
        {c.data.materials
          .filter((x) => x.moduleId === w.moduleId)
          .map((x) => (
            <Panel key={x.id}>
              <div className="section-title">
                <Badge>{x.kind}</Badge>
                <Badge tone={x.approved ? "green" : "amber"}>
                  {x.approved ? "Approved" : "Draft"}
                </Badge>
              </div>
              <label>
                Material title
                <input
                  value={x.title}
                  onChange={(e) =>
                    update(x.id, { title: e.target.value, approved: false })
                  }
                />
              </label>
              <label>
                Teaching material
                <textarea
                  rows={15}
                  value={x.content}
                  maxLength={25000}
                  onChange={(e) =>
                    update(x.id, { content: e.target.value, approved: false })
                  }
                />
              </label>
              <SourceLinks ids={x.sourceIds} />
              <div className="course-actions">
                <label className="course-check">
                  <input
                    type="checkbox"
                    checked={x.approved}
                    onChange={(e) =>
                      update(x.id, { approved: e.target.checked })
                    }
                  />
                  I reviewed this material and approve it
                </label>
                <button
                  className="link"
                  onClick={() =>
                    w.change({
                      materials: c.data.materials.filter((m) => m.id !== x.id),
                    })
                  }
                >
                  Remove
                </button>
              </div>
            </Panel>
          ))}
        <div className="course-savebar">
          <button
            className="secondary"
            disabled={w.busy}
            onClick={() =>
              w.run(async () => {
                await w.save();
                w.notice("Teaching materials saved.");
              })
            }
          >
            <Save size={16} /> Save materials
          </button>
          <button
            className="primary"
            disabled={w.busy || !c.data.graphApproved}
            onClick={() =>
              w.run(async () => {
                const saved = await w.save();
                await w.call("release", { courseId: saved.id });
                w.notice("Approved materials released to students.");
              })
            }
          >
            <Send size={16} /> Release approved content
          </button>
        </div>
      </div>
      <aside>
        <Nova text="Choose a module, review its notes, practice and worked examples, then edit and approve each asset. At the top, select a quick check and verify its answer key. Save your changes; they reach students only after a course release." />
        <Panel>
          <h3>Module objectives</h3>
          {c.data.objectives
            .filter((o) => m?.objectiveIds.includes(o.id))
            .map((o) => (
              <p className="icon-line" key={o.id}>
                <CheckCircle2 size={17} />
                {o.title}
              </p>
            ))}
          <p className="fine">
            Generated content is a draft. Source citations let you check the
            foundation.
          </p>
        </Panel>
      </aside>
    </div>
  );
}
export function AssessmentStudio() {
  const w = useWorkspace(),
    c = w.course,
    m = c.data.modules.find((m) => m.id === w.moduleId);
  const [selected, setSelected] = useState<string[]>([]);
  const objectives = c.data.objectives.filter((o) =>
    m?.objectiveIds.includes(o.id),
  );
  const chosen = selected.filter((id) => objectives.some((o) => o.id === id));
  const ids = chosen.length ? chosen : objectives.map((o) => o.id);
  const update = (id: string, p: Partial<Checkpoint>) =>
    w.change({
      checkpoints: c.data.checkpoints.map((a) =>
        a.id === id ? { ...a, ...p, published: false } : a,
      ),
    });
  async function add(ai: boolean) {
    if (!m) return;
    let d: any;
    if (ai) {
      await w.save();
      d = await w.call("checkpoint", {
        courseId: c.id,
        moduleId: m.id,
        objectiveIds: ids,
        objectives: objectives.filter((o) => ids.includes(o.id)),
      });
    } else {
      const weight = Math.floor(100 / ids.length);
      d = {
        title: "Explain, defend, transfer",
        prompt:
          "Submit a worked response demonstrating the selected objectives. Include your evidence, assumptions, and reasoning.",
        rubric: ids.map((id, i) => ({
          objectiveId: id,
          criterion: c.data.objectives.find((o) => o.id === id)!.title,
          weight: i === 0 ? 100 - weight * (ids.length - 1) : weight,
          descriptor:
            "Accurate reasoning, relevant evidence, and awareness of limitations.",
        })),
        followupStrategy:
          "Ask about one specific claim and one assumption in the submitted explanation.",
        transferPrompt:
          "Change one key assumption in your original example. Explain how the solution changes and why.",
      };
    }
    w.change({
      checkpoints: [
        ...c.data.checkpoints,
        {
          ...d,
          id: uid("cp"),
          moduleId: m.id,
          objectiveIds: ids,
          dueAt: "",
          published: false,
        },
      ],
    });
    w.notice(
      "Assessment blueprint added. Review each criterion before publishing.",
    );
  }
  if (!c.data.graphApproved)
    return (
      <Empty
        title="Approve the course graph first"
        text="An assessment needs a stable set of professor-approved learning objectives."
        action={() => w.navigate("architect")}
        label="Review course graph"
      />
    );
  return (
    <div className="main-grid">
      <div>
        <Panel>
          <h2>Assessment Studio</h2>
          <p>Design evidence of understanding—not just a finished answer.</p>
          <p className="fine">This editor retains your existing assessments. New Authentic Assessment Engine packages are edited and approved in the Design engine tab.</p>
          <ModuleSelect />
          <fieldset>
            <legend>
              Assessed objectives · all module objectives selected by default
            </legend>
            {objectives.map((o) => (
              <label className="course-check" key={o.id}>
                <input
                  type="checkbox"
                  checked={ids.includes(o.id)}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? [...ids, o.id]
                        : ids.filter((x) => x !== o.id),
                    )
                  }
                />
                {o.title}
              </label>
            ))}
          </fieldset>
          <div className="course-actions">
            <button
              className="primary"
              disabled={w.busy || !m || !ids.length}
              onClick={() => w.run(() => add(true))}
            >
              <Sparkles size={16} /> Generate blueprint
            </button>
            <button
              className="secondary"
              disabled={w.busy || !m || !ids.length}
              onClick={() => w.run(() => add(false))}
            >
              <Plus size={16} /> Build manually
            </button>
          </div>
        </Panel>
        {c.data.checkpoints
          .filter((a) => a.moduleId === w.moduleId && !a.authentic)
          .map((a) => (
            <Panel key={a.id}>
              <div className="section-title">
                <h3>Checkpoint blueprint</h3>
                <Badge tone={a.published ? "green" : "amber"}>
                  {a.published ? "Included in next release" : "Draft"}
                </Badge>
              </div>
              <div className="course-form-grid">
                <Select label="Assessment category" value={a.category || "Checkpoint"} onChange={value=>update(a.id,{category:value as Checkpoint["category"]})} options={["Assignment","Checkpoint","Final project","Teach Nova"].map(value=>({value,label:value}))}/>
                <label>Points<input type="number" min={1} max={1000} value={a.points||100} onChange={e=>update(a.id,{points:Number(e.target.value)})}/></label>
              </div>
              <label>
                Title
                <input
                  value={a.title}
                  onChange={(e) => update(a.id, { title: e.target.value })}
                />
              </label>
              <label>
                Student artifact brief
                <textarea
                  rows={4}
                  value={a.prompt}
                  onChange={(e) => update(a.id, { prompt: e.target.value })}
                />
              </label>
              <h3>Objective-linked rubric</h3>
              {a.rubric.map((r, i) => (
                <div className="course-rubric" key={r.objectiveId}>
                  <p className="eyebrow">
                    {
                      c.data.objectives.find((o) => o.id === r.objectiveId)
                        ?.title
                    }
                  </p>
                  <div className="course-form-grid">
                    <label>
                      Criterion
                      <input
                        value={r.criterion}
                        onChange={(e) =>
                          update(a.id, {
                            rubric: a.rubric.map((r, j) =>
                              j === i ? { ...r, criterion: e.target.value } : r,
                            ),
                          })
                        }
                      />
                    </label>
                    <label>
                      Weight %
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={r.weight}
                        onChange={(e) =>
                          update(a.id, {
                            rubric: a.rubric.map((r, j) =>
                              j === i
                                ? { ...r, weight: Number(e.target.value) }
                                : r,
                            ),
                          })
                        }
                      />
                    </label>
                  </div>
                  <label>
                    Evidence descriptor
                    <textarea
                      rows={2}
                      value={r.descriptor}
                      onChange={(e) =>
                        update(a.id, {
                          rubric: a.rubric.map((r, j) =>
                            j === i ? { ...r, descriptor: e.target.value } : r,
                          ),
                        })
                      }
                    />
                  </label>
                </div>
              ))}
              <p
                className={
                  a.rubric.reduce((s, r) => s + r.weight, 0) === 100
                    ? "success"
                    : "course-warning"
                }
              >
                Total weight: {a.rubric.reduce((s, r) => s + r.weight, 0)} /
                100%
              </p>
              <label>
                Adaptive follow-up strategy
                <textarea
                  rows={3}
                  value={a.followupStrategy}
                  onChange={(e) =>
                    update(a.id, { followupStrategy: e.target.value })
                  }
                />
              </label>
              <label>
                Changed-scenario transfer task
                <textarea
                  rows={3}
                  value={a.transferPrompt}
                  onChange={(e) =>
                    update(a.id, { transferPrompt: e.target.value })
                  }
                />
              </label>
              <label>
                Suggested due date · optional
                <input
                  type="date"
                  value={a.dueAt}
                  onChange={(e) => update(a.id, { dueAt: e.target.value })}
                />
              </label>
              <div className="course-actions">
                <button
                  className="primary"
                  disabled={w.busy}
                  onClick={() =>
                    w.run(async () => {
                      validateCheckpoint(a, c.data);
                      const next = {
                        ...c,
                        data: {
                          ...c.data,
                          checkpoints: c.data.checkpoints.map((cp) =>
                            cp.id === a.id ? { ...cp, published: true } : cp,
                          ),
                        },
                      };
                      const saved = await w.save(next);
                      await w.call("release", { courseId: saved.id });
                      w.notice("Checkpoint published to the linked class.");
                    })
                  }
                >
                  <Send size={16} /> Publish checkpoint
                </button>
                <button
                  className="secondary"
                  disabled={w.busy}
                  onClick={() =>
                    w.run(async () => {
                      await w.save();
                      w.notice("Assessment drafts saved.");
                    })
                  }
                >
                  <Save size={16} /> Save draft
                </button>
                <button
                  className="link"
                  onClick={() =>
                    w.change({
                      checkpoints: c.data.checkpoints.filter(
                        (x) => x.id !== a.id,
                      ),
                    })
                  }
                >
                  Remove from draft
                </button>
              </div>
            </Panel>
          ))}
      </div>
      <aside>
        <Nova text="Select a module and assessment. Edit the applied task, points, due date and objective-linked rubric; criterion weights must total 100. Review the oral follow-up and transfer scenario, then approve the assessment for the next release." />
        <Panel>
          <h3>One evidence bundle</h3>
          <ol className="map-list">
            {[
              "Original work or artifact",
              "Reasoning & explanation",
              "Adaptive verification questions",
              "Changed-scenario application",
              "Professor-reviewed findings",
            ].map((s, i) => (
              <li key={s}>
                <span>{i + 1}</span>
                {s}
              </li>
            ))}
          </ol>
          <p className="fine">
            Rubric weights describe emphasis. Nova reports evidence-linked
            findings and uncertainty, not a cheating score.
          </p>
        </Panel>
      </aside>
    </div>
  );
}
