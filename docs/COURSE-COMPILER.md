# Course compiler: edit, do not replace

This edit preserves NovaLearn's existing course graph, Module Studio, Assessment Studio, learner evidence, mastery, releases and visual design. The six supplied images use inconsistent step captions; the application uses one consistent six-step sequence while retaining all seven engine responsibilities.

## Audit result

Before this edit, graph generation, learning materials, assessments and semester controls were separate authoring tools. There was no durable multi-stage compiler, deterministic whole-semester allocation, automatic per-module content packet, integrated final-project mapper or final compilation review gate.

## The six stages

1. **Professor inputs.** Course title/code, level, weeks, contact hours, module count, checkpoint count (including final), start date, break weeks, prior knowledge, topic outline, teaching intent and category weights. Intent supports the existing configured voice transcription route; text is always available. Inputs cannot silently replace an existing graph: match its module count or explicitly edit it.
2. **AI blueprint.** Intent interpreter; approved-material chunk inventory; deterministic constraint checks; course graph generation for an empty course, or adoption of an existing graph. Outcomes, levels, modules, concepts, prerequisites and approved sources remain editable through the retained graph editor.
3. **Module generation.** Topological prerequisite ordering and exact contact-hour allocation across non-break weeks. One bounded model call per incomplete module creates missing lecture notes, guided practice, worked application, a diagnostic mini-quiz, applied assignment and Teach Nova explanation-back activity. Existing assets are kept. The UI shows actual saved/processing/waiting stages, not timer-driven fake progress.
4. **Assessment design.** Checkpoints are distributed across module ends; the requested count includes one integrated final project. The final covers all course outcomes (maximum 10). Rubrics total 100 and cover objective IDs. Four performance bands are specified in editable criterion descriptions. Assessment categories, prompts, points, dates, follow-up and transfer tasks can be edited individually. Mini-quizzes and Teach Nova are formative; category weights are a course plan, not an automatic gradebook.
5. **Review & refine.** Structural validator, individual content/quiz/assessment approvals, graph approval and final professor acknowledgment. Content edits clear the final acknowledgment. No blanket AI approval. Factual correctness requires professor verification; structurally valid output is not proof of pedagogical or factual quality.
6. **Finalize & export.** Preview the complete professor package, select release modules, publish through the existing immutable-version mechanism, save an unlinked semester copy, download a JSON package, or use the browser's Print / Save PDF. Professor exports include answer keys and must not be handed to students. Direct LMS sync is explicitly not connected; JSON is not represented as a Canvas/Blackboard import format.

## Persistence and recovery

- `CourseData.compiler` is optional JSON metadata in the existing `nova_courses` row. No new database migration is required for this edit. The three existing SQL migrations remain required.
- `/api/course` action `compiler-step` requires an authenticated teacher, an RLS-visible owned course, the current version and the expected next stage. Each successful stage writes the complete validated draft with an optimistic version guard.
- Provider or validation failure keeps existing content and records a failed-stage message. Resume retries that stage. Invalid/stale stage requests do not spend model budget. A version conflict requires reload, not overwriting another professor session.
- Pause takes effect after the current request completes. Leaving the page stops further orchestration; a request already at the server may still finish. Reload the course to discover its saved state.
- No background worker is claimed. Stages run while the page is open. AI calls use the existing gateway, 60-second request timeout, bounded structured outputs and per-user quota. Deterministic stages do not call an LLM. Stage duration, route and result are retained; dollar/token accounting is not implemented.
- Changes to inputs reset stage checks but preserve existing teaching assets. The professor must reconcile old content and assessments with revised intent/counts. Recalculate the schedule after graph/time edits. Individual materials and assessments can be edited in their existing studios without regenerating the course.
- Published student snapshots strip the compiler, source vectors and private answer keys. Existing started assessments retain their original rubric snapshots. Compilation never changes mastery directly.

## Scope and limits

The source parser reuses approved text chunks; it is not a full textbook semantic ingestion or OCR pipeline. Graph generation receives a bounded source sample; module generation retrieves up to five approved, appropriately scoped chunks with keyword matching. Optional embeddings remain available elsewhere in the existing app; the compiler's module packet path currently uses keyword retrieval. If references are absent, live generation is asked to label an ungrounded draft and never invent citations. The professor must check every substantive claim.

Scheduling allocates equal whole teaching weeks (remainder to earlier modules), then computes contact hours. It does not estimate reading/assignment workload, optimize arbitrary institutional calendars or automatically reschedule existing assessment due dates. Due dates are initially suggested from the optional semester start date; professors can edit them. Prerequisite support is acyclic ordering, not a trained prerequisite inference model.

Bounds: 12 compiled modules, 8 summative checkpoints including final, 10 outcomes for the integrated final, existing storage limits of 80 teaching assets and 40 assessments. A legacy course larger than those bounds remains usable in the existing studios; compiler inputs must fit its supported scope. Sources accept text-layer PDF/text; scanned handwriting, slides and image evidence are not interpreted. External research, scheduled/mastery-gated releases, automatic LMS sync, verified oral identity and automatic final grading remain outside this edit.

Explore mode runs the same constraints, planner and validators with explicitly labeled templates. It does not claim live AI or server durability. Configure Supabase plus a supported model in the server environment to use real compilation. Device-voice guidance requires browser speech synthesis but no API key or microphone; actual professor-intent transcription uses the configured speech provider.

## Acceptance walkthrough

1. Open Professor → Course Compiler. Adopt the example course, or create a new course. Fill all inputs and save.
2. Review/approve source text if used; run Blueprint, then Modules, then Assessments, then Review. Check saved stage history and contact-hour totals.
3. Reload halfway through and resume. Temporarily use an invalid model in a local test environment; verify a failed stage preserves prior content and can be retried after correction.
4. In the review editors, read and approve every material, mini-quiz key and assessment; approve the graph. Complete and save the final acknowledgment last.
5. Select release modules, publish, switch to an enrolled student and follow Learn → practice → diagnostic → applied assessment → Teach Nova explanation/follow-up → reflection. Verify locked content and keys remain private.
6. Compare original module IDs/materials/evidence before and after adopting an existing course. Test a stale browser version and a different professor account.
7. Export JSON and Print / Save PDF; check the complete module content and private-key warning. Test Nova greeting, reduced motion and Explain aloud on a WebGL2-enabled browser.
