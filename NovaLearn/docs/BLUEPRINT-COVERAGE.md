# NovaLearn · system blueprint implementation

Updated September 20, 2026. This is a professor-led pilot application, not a claim that every thesis feature or institutional requirement is complete. The existing visual design is preserved. The blueprint and five supplied problem–solution diagrams guided these changes.

## Problem–solution coverage

| Blueprint goal | Implemented in this build | Boundary |
| --- | --- | --- |
| See understanding before the exam | Diagnostics, pulse checks, exit tickets, concept × student heatmap, confidence mismatch signals, inspectable explanations | Data refresh is manual; misconceptions need review, not automatic diagnosis |
| Reduce professor workload | Approved-source authoring, quick-check drafts, rubric/checkpoint creation, AI evidence suggestions, reusable semester copy | Professor approval remains mandatory; no automatic grade release or unattended bulk grading |
| Assess real mastery | Artifact + reasoning + adaptive follow-ups + changed-scenario transfer + reflection; editable spoken responses; frozen rubrics; review and revision history | No identity-verified viva, plagiarism verdict, authorship detector, or automated final grade |
| Support mixed ability | Explicit concept prerequisites, evidence-based Discover/Support/Core/Challenge recommendations, review dates, confidence, goals, teach/practice/application resources | Lightweight rules, not a trained adaptive policy; content must be authored/released, and goals are recorded but do not drive ranking |
| Scale personal attention | Cohort concept map, low-evidence/practice hotspots, response distributions, support queue, multi-student interventions, student help requests | Designed for a small pilot; no load-test claim, automatic escalation, email, calendar booking, or discussion forum |

## System checklist

| Area | Status | Details |
| --- | --- | --- |
| Student/professor accounts | Implemented; live setup required | Supabase authentication, class enrollment, ownership and RLS |
| Syllabus/source ingestion | Implemented for text | PDF text layer, TXT/Markdown; source approval and inspectable chunks |
| Course compiler | Implemented staged pilot | Six-step authoring surface; typed/voice intent, optional approved sources, constrained graph, deterministic weekly planner, per-module packets, assessment mapper, validation, review and export. Existing content is adopted, not replaced. See COURSE-COMPILER.md. |
| Concept knowledge graph | Implemented MVP | Concept nodes, objective/module mapping, editable acyclic prerequisite edges; source/activity mappings |
| Course versioning | Implemented | Immutable private release snapshots and student-safe publication committed together; optimistic draft versions |
| Controlled release | Implemented | Roadmap stays visible; locked module details/checks/tutoring filtered server-side; conservative source scoping |
| External academic research | Deferred | Off by default; no external retrieval or implied professor approval |
| Learning modes | Partial | Materials support lecture/worked example/practice/discussion; Teach Nova and applied checkpoints; not separate adaptive media generators |
| Per-chapter checks | Implemented | Author/draft and approve low-stakes checks mapped to concepts, with confidence, explanation, help disclosure, elapsed time and reflection |
| Checkpoint/final project | Implemented draft compiler | Per-module applied assignment and Teach Nova; requested summative checkpoints including one integrated final; editable four-level rubric descriptions, points and dates. No automatic final grade. |
| Text/code/math evidence | Implemented as text | Code and math can be submitted as text; no sandbox execution or symbolic proof checker |
| Voice evidence | Implemented; live provider required | Record, transcribe, review/edit, save explanation or follow-up; no raw audio retained by NovaLearn |
| Images/handwriting/diagram interpretation | Deferred | No OCR, vision grading or binary evidence storage in this build |
| Structured LLM judgments | Implemented | Evidence IDs, objective coverage, rationale/uncertainty, source citations and professor override |
| Statistical mastery | Implemented experimental MVP | Deterministic weighted BKT; suggestions alone cannot set mastery; superseding teacher judgments; replayable history |
| Spaced repetition | Implemented lightweight | Rules-based due dates and retrieval recommendation, not trained forgetting curves or scheduled notifications |
| Intervention workflow | Implemented | Practice/reteach/office-hour request; multi-student assignment, response, completion/reflection |
| Routine AI TA | Implemented | Course-grounded text/voice practice; source excerpts; no discussion summarizer |
| Animated 3D assistant | Implemented | Three.js character, motion states, greeting, pause/reduced motion, offscreen render pause, illustrated fallback; actionable per-tab and compiler-step guidance with optional device-voice narration |
| Provider independence | Implemented | OpenAI/Gemini/Groq and compatible local LLM/STT/TTS routes configured on server |
| Embeddings | Implemented optional, bounded | Chunk vectors + keyword/cosine retrieval; not pgvector ANN or a large corpus engine |
| Observability | Partial | Evidence/review audit trail, saved compiler stage latency/routes/failure messages, prompt-version audit marker, request budgets; no token/cost dashboard |
| Background jobs | Deferred | Compiler advances one bounded, version-checked request at a time and resumes saved stages; closing the page stops orchestration. No unattended worker queue. |
| Institution readiness | Deferred | SSO/LMS, verified faculty, tenant administration, accessibility audit, retention/consent policies, load tests and calibration study |

## Data and statistical design

`nova_courses` stores professor drafts. `nova_course_versions` freezes the full release (including private answer keys). `nova_publications` exposes only approved, released, sanitized content. `nova_demonstrations` stores authentic-assessment evidence and review history. `nova_learning_records` stores each student/course's attempts, evidence events and interventions together in a versioned JSON aggregate so an attempt and its signals commit atomically. Mastery states/history are computed deterministically from those events; they are not independent mutable scores. This is a deliberate small-pilot simplification of the blueprint's fully normalized entity model.

Initial BKT parameters: P(L0)=0.25, P(T)=0.12, P(S)=0.12, P(G)=0.25. We blend the Bayesian update by evidence weight and apply a weighted learning transition. The parameters and thresholds are **not empirically calibrated**. Correctness comes from a professor-approved key; explanation quality is judged by a professor, not a text-length proxy. Self-confidence/time are recorded, not used to punish slower or less-confident learners. Hints reduce reliability weight. One reviewed assessment bundle contributes at most one signal per mapped concept. Repeated answer-key exposure has zero extra weight. Teacher review supersedes the selected-answer signal rather than adding correlated duplicate evidence.

Strong requires at least three evidence events, two distinct task sources and estimate ≥0.8. Fewer than two events is Insufficient evidence. Remaining estimates ≥0.45 are Developing; otherwise Needs practice. Displayed percentages are internal model estimates, not proficiency test scores. Concept-level assessment attribution follows the professor's objective mappings and is approximate: refine mappings and confirm through varied applied tasks.

Review dates use the most recent usable event plus 1, 3 or 7 days. No automatic decay is applied to the mastery probability. Recommendations prefer missing/weak released concepts and their prerequisites, with an explanation. If no fresh check exists, the app asks the learner to use materials, Teach Nova or seek another task; it does not fabricate assessment content or credit repetitions. A semester copy starts with no student evidence. Treat semantic concept changes as a new semester/course rather than relabeling old evidence.

## Suggested first-professor pilot

1. Configure a development Supabase project and apply all three SQL files in order; set server secrets locally.
2. Start with one real module and 3–5 tightly defined concepts. Review source extraction and mapping before publishing.
3. Author several different questions per concept and one applied checkpoint. Include common wrong assumptions in distractors.
4. Run the complete student check → professor explanation review → targeted support → student reflection loop.
5. Compare model labels with blind professor judgments, inspect false confidence, record overrides and ask students whether next steps help.
6. Do not use the mastery estimate for grades or consequential student decisions until a proper evaluation/calibration study and institutional review are completed.

## What is not being claimed

No live Supabase/provider credentials were supplied for this build. Preview uses local sample data and scripted AI responses; actual answer-key checks and deterministic mastery logic still run. Mock API tests do not execute real PostgreSQL policies. The cloud QA browser has WebGL disabled: fallback and motion controls can be checked there, but full GPU-rendered appearance needs a WebGL2-enabled browser. Provider quality, voice accuracy, live multi-user isolation and institutional-scale performance require acceptance testing in your configured environment.
