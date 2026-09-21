"use client";
import { useEffect, useState } from "react";
import { Plus, RefreshCw, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { previewActive } from "@/lib/novalearn/preview";
import { coursePreview } from "@/lib/novalearn/course-preview";
import {
  type Course,
  type Demonstration,
  type CourseData,
} from "@/lib/novalearn/course-domain";
import { WorkspaceContext, Select, Empty, Badge } from "./course-ui";
import { Architect, ModuleStudio, AssessmentStudio } from "./course-architect";
import { Learn, Demonstrate, StudentProgress } from "./course-student";
import { ProfessorHome, EvidenceReview, ClassInsights } from "./course-review";
import { LearningProvider } from "./learning-context";
import { BlueprintControls, QuickCheckStudio } from "./learning-studio";
import { AdaptivePath, MasteryProgress } from "./adaptive-student";
import { ConceptInsights } from "./concept-insights";
import { CourseCompiler } from "./course-compiler";
import { AuthenticAssessmentStudio } from "./assessment-engine";
import { reviewFingerprint } from "@/lib/novalearn/course-compiler";
export function CourseWorkspace({
  page,
  profile,
  provider,
  classes,
  profiles,
  enrollments,
  navigate,
  search,
}: {
  page: string;
  profile: any;
  provider: string;
  classes: any[];
  profiles: any[];
  enrollments: any[];
  navigate: (p: string) => void;
  search: string;
}) {
  const [courses, setCourses] = useState<Course[]>([]),
    [course, setCourse] = useState<Course | null>(null),
    [demonstrations, setDemonstrations] = useState<Demonstration[]>([]),
    [moduleId, setModuleId] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [create, setCreate] = useState(false),
    [title, setTitle] = useState(""),
    [classId, setClassId] = useState(""),
    [routes, setRoutes] = useState<any>(null);
  const teacher = profile?.role === "teacher",
    preview = typeof window !== "undefined" && previewActive();
  const notice = (m: string) => {
    setMessage(m);
    toast.success(m);
  };
  async function call(action: string, body: any = {}) {
    if (previewActive()) return coursePreview(action, { ...body, provider });
    const r = await fetch("/api/course", {
      method: action === "load" ? "GET" : "POST",
      headers: { "Content-Type": "application/json" },
      ...(action === "load"
        ? {}
        : { body: JSON.stringify({ action, ...body, provider }) }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || "Course request failed.");
    return d;
  }
  async function reload() {
    const d = await call("load");
    setCourses(d.courses);
    setDemonstrations(d.demonstrations);
    setRoutes(d.routing);
    setCourse((old) => {
      const current =
        d.courses.find((c: Course) => c.id === old?.id) || d.courses[0] || null;
      setModuleId((id) =>
        current?.data.modules.some((m: any) => m.id === id)
          ? id
          : current?.data.modules[0]?.id || "",
      );
      return current;
    });
  }
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setMessage("");
    if (profile)
      call("load")
        .then((d) => {
          if (!active) return;
          setCourses(d.courses);
          setCourse(d.courses[0] || null);
          setModuleId(d.courses[0]?.data.modules[0]?.id || "");
          setDemonstrations(d.demonstrations);
          setRoutes(d.routing);
        })
        .catch((e) => active && setError(e.message))
        .finally(() => active && setLoading(false));
    else setLoading(false);
    return () => {
      active = false;
    };
  }, [profile?.id, preview]);
  async function run(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save(next = course!, approveGraph = false) {
    const saved = await call("save", {
      courseId: next.id,
      version: next.version,
      title: next.title,
      classId: next.class_id,
      data: next.data,
      approveGraph,
    });
    setCourse(saved);
    setCourses(courses.map((c) => (c.id === saved.id ? saved : c)));
    return saved as Course;
  }
  function change(patch: Partial<CourseData>) {
    setCourse(old=>{if(!old)return old;const data={...old.data,...patch};if(data.compiler&&reviewFingerprint(data)!==reviewFingerprint(old.data))data.compiler={...data.compiler,reviewed:false};return {...old,data};});
  }
  const dirty =
    course &&
    JSON.stringify(course) !==
      JSON.stringify(courses.find((c) => c.id === course.id));
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  if (!profile)
    return (
      <Empty
        title="Your NovaLearn workspace"
        text="Sign in to open your courses, or choose Explore to try the professor and student workflow."
      />
    );
  if (loading)
    return (
      <div className="empty">
        <BookOpen />
        <h3>Opening your learning workspace…</h3>
      </div>
    );
  return (
    <div className="course-workspace">
      {error && (
        <div className="course-error" role="alert">
          {error}
          <button className="link" disabled={busy} onClick={() => run(reload)}>
            Reload saved data
          </button>
        </div>
      )}
      {message && (
        <div className="course-notice" role="status">
          {message}
        </div>
      )}
      <fieldset className="course-toolbar course-content-fieldset" disabled={busy}>
        {courses.length > 0 && (
          <Select
            label={teacher ? "Active course" : "Your course"}
            value={course?.id || ""}
            onChange={(id) => {
              if (
                dirty &&
                !window.confirm(
                  "Switch courses and discard unsaved draft changes?",
                )
              )
                return;
              const c = courses.find((c) => c.id === id)!;
              setCourse(c);
              setModuleId(c.data.modules[0]?.id || "");
              setMessage("");
            }}
            options={courses.map((c) => ({ value: c.id, label: c.title }))}
          />
        )}
        <div className="course-actions">
          {dirty && <Badge tone="amber">Unsaved draft</Badge>}
          {teacher && (
            <button
              className="primary"
              disabled={busy}
              onClick={() => setCreate(!create)}
            >
              <Plus size={16} /> New course
            </button>
          )}
          {teacher && course && <button className="secondary" disabled={busy || !!dirty} onClick={()=>run(async()=>{await call("duplicate",{courseId:course.id});await reload();notice("Course template copied for a new semester. Select it above, link a class, and approve the graph. Student records were not copied.");})}>Reuse for next semester</button>}
          <button
            className="secondary"
            aria-label="Reload saved course"
            disabled={busy}
            onClick={() => {
              if (
                dirty &&
                !window.confirm("Discard unsaved changes and reload?")
              )
                return;
              run(reload);
            }}
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </fieldset>
      {create && teacher && (
        <section className="panel">
          <h3>Create a course</h3>
          <div className="course-form-grid">
            <label>
              Course title
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Introduction to Data Science"
                maxLength={200}
              />
            </label>
            <Select
              label="Class · optional until release"
              value={classId}
              onChange={setClassId}
              options={[
                { value: "", label: "Link later" },
                ...classes.map((c) => ({ value: c.id, label: c.name })),
              ]}
            />
          </div>
          <div className="course-actions">
            <button
              className="primary"
              disabled={busy || title.trim().length < 3}
              onClick={() =>
                run(async () => {
                  if (
                    dirty &&
                    !window.confirm(
                      "Create a new course and discard current unsaved edits?",
                    )
                  )
                    return;
                  const c = await call("create", { title, classId });
                  setCourses([c, ...courses]);
                  setCourse(c);
                  setModuleId("");
                  setTitle("");
                  setCreate(false);
                  navigate("architect");
                  notice(
                    "Course created. Start with your syllabus and objectives.",
                  );
                })
              }
            >
              Create course
            </button>
            <button className="secondary" onClick={() => setCreate(false)}>
              Cancel
            </button>
          </div>
        </section>
      )}
      {course ? (
        <WorkspaceContext.Provider
          value={{
            course,
            courses,
            demonstrations,
            profile,
            classes,
            profiles,
            enrollments,
            preview,
            busy,
            provider,
            moduleId,
            setModuleId,
            setCourse,
            change,
            call,
            run,
            save,
            reload,
            navigate,
            notice,
          }}
        >
          <LearningProvider><fieldset className="course-content-fieldset" disabled={busy && page !== "architect"}>
            {search && (
              <section className="panel course-search-results">
                <h3>Matching modules</h3>
                {course.data.modules
                  .filter((m) =>
                    `${m.title} ${m.concepts.join(" ")}`
                      .toLowerCase()
                      .includes(search.toLowerCase()),
                  )
                  .map((m) => (
                    <button
                      className="secondary"
                      key={m.id}
                      onClick={() => {
                        setModuleId(m.id);
                        navigate(teacher ? "modules" : "learn");
                      }}
                    >
                      {m.title}
                    </button>
                  ))}
                {!course.data.modules.some((m) =>
                  `${m.title} ${m.concepts.join(" ")}`
                    .toLowerCase()
                    .includes(search.toLowerCase()),
                ) && <p>No matching modules in this course.</p>}
              </section>
            )}
            {teacher ? (
              page === "architect" ? (
                <CourseCompiler key={course.id}/>
              ) : page === "modules" ? (
                <><QuickCheckStudio /><ModuleStudio /></>
              ) : page === "assessments" ? (
                <AuthenticAssessmentStudio />
              ) : page === "evidence" ? (
                <EvidenceReview />
              ) : page === "insights" ? (
                <><ConceptInsights /><ClassInsights /></>
              ) : (
                <ProfessorHome />
              )
            ) : page === "demonstrate" ? (
              <Demonstrate />
            ) : page === "progress" ? (
              <><MasteryProgress /><StudentProgress /></>
            ) : (
              <><AdaptivePath /><Learn /></>
            )}
          </fieldset></LearningProvider>
          {teacher && routes && (
            <details className="course-routing">
              <summary>AI routing & grounding</summary>
              <p className="fine">
                Server configuration selects the provider and model for each
                task. No provider keys are stored in this browser.
              </p>
              {Object.entries(routes).map(([key, value]) => (
                <p key={key}>
                  <b>{key}:</b>{" "}
                  {typeof value === "string"
                    ? value
                    : `${(value as any).provider} / ${(value as any).model}`}
                </p>
              ))}
            </details>
          )}
        </WorkspaceContext.Provider>
      ) : (
        !error && (
          <Empty
            title={
              teacher
                ? "Start your first course"
                : "Your courses will appear here"
            }
            text={
              teacher
                ? "Create a class, add a course, and turn your learning objectives into a connected plan."
                : "Join your professor’s class using the code they shared. Released course materials and checkpoints will appear here."
            }
            action={() => (teacher ? setCreate(true) : navigate("classes"))}
            label={teacher ? "Create course" : "Join a class"}
          />
        )
      )}
      {busy && (
        <div className="course-busy" role="status">
          <Sparkle /> Working… your saved work is safe.
        </div>
      )}
    </div>
  );
}
function Sparkle() {
  return <span aria-hidden="true">✦</span>;
}
