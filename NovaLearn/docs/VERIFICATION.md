# NovaLearn course workspace verification

## September 21 Authentic Assessment Engine edit

- 111 automated tests: 17 legacy, 36 course/API, 29 adaptive, 10 compiler and 19 assessment-engine tests.
- New checks cover staged generation, model routing, provider failures, role/ownership/version boundaries, approval requirements, rubric totals, applied-objective coverage, workload, citations, recall limits, downstream regeneration, stale context, private-guide filtering, stable variants, required reflection/disclosure, and unchanged legacy course behavior.
- No schema migration or dependency upgrade. Private evaluation guidance uses the existing immutable private release snapshot; it is removed from student publication.
- Browser preview completed all six design stages, verified approval disabled before validation and release disabled before approval, approved/released the sample package, and opened it as a student. The frozen student brief displayed the assigned variant, AI policy, time/resources, required tasks and rubric levels without the private guide.
- Standard Next.js build and Sites/Vinext build passed. The preserved design and Nova's illustrated fallback were inspected; this QA browser does not support WebGL.
- Live provider/Supabase credentials remain unconfigured. Automated HTTP tests use mocked transport; they do not execute real PostgreSQL RLS or assess model quality. Preview exercises scripted templates only.
- Additional acceptance: generate a real subject-specific package, have a professor independently check factual grounding/variant equivalence/time/accessibility, publish with two separate student accounts, confirm stable variants and hidden guides, start an attempt, change the professor draft, and verify synthesis uses the old private release guide.

## September 20 adaptive-learning upgrade

- TypeScript, standard Next.js production build, and Sites/Vinext production build pass with `/api/learning` and the lazy-loaded 3D renderer.
- 71 automated tests pass: 17 legacy, 25 course/evidence, and 29 adaptive-learning/domain/route checks.
- Added tests cover sanitized answer keys, chapter/source access, concept cycles, deterministic and bounded BKT, duplicate/superseded events, missing evidence, confidence/time handling, repeated practice, stale releases, role boundaries, atomic attempt/evidence writes, optimistic conflicts and teacher intervention targeting.
- Browser check: a student submits a diagnostic with an explanation; the professor sees its concept estimate and underlying response; a targeted support action is assigned; the student receives it and marks it complete with a reflection. Nova's greeting and illustrated fallback were also exercised.
- The browser renders the preserved blue/lavender UI and fallback character. This QA browser disables WebGL, so full 3D GPU appearance still needs verification on a normal WebGL2-enabled browser. No claim of live microphone/provider testing is made.
- Full feature and limitation mapping is in `BLUEPRINT-COVERAGE.md`.

Before live use, also run `003-adaptive-learning.sql`, re-release courses, verify private answer-key snapshots with separate accounts, submit checks against a saved release while editing the draft in another tab, and verify support isolation. Confirm that an unscoped source containing future topics stays hidden until every module is released. Test a normal WebGL2 browser and reduced-motion settings.

## Completed in the build environment

### Course compiler edit

- 86 tests: 17 legacy, 30 course/API, 29 adaptive-learning, and 10 compiler-domain tests.
- Compiler tests cover full draft generation, adoption without replacing existing IDs/content, exact hour totals, break exclusion, prerequisite order, impossible constraints, retries/resume, provider-failure preservation, stale versions, teacher authorization, readiness checks and student-safe publication filtering.
- Browser preview: adopted the existing CS 381 course; ran blueprint, planner/module packets, summative mapper and validator; inspected the 12-week / 36-contact-hour timeline and final review issues; confirmed Publish to course remains disabled for unapproved drafts.
- Nova guidance changes with the current step and provides an opt-in device-voice control. WebGL is disabled in the QA browser, so the illustrated fallback was inspected; actual GPU appearance and audible playback need local device acceptance testing.
- These compiler browser checks used sample data, not live provider calls. Live Supabase, speech and model-provider credentials have not been supplied.

### Retained earlier checks

- Standard Next.js production build and TypeScript validation.
- Sites/Vinext production build with the course API and PDF worker asset.
- 17 retained authentication, authorization, provider-budget, and legacy assessment tests.
- 25 course-domain and actual-route tests using mocked Supabase/provider HTTP transport: graph cycles and references, objective coverage, rubric weights, draft publication filtering, approved-source retrieval, evidence completeness, citation validation, uncertainty normalization, professor overrides, identity/role boundaries, cross-origin rejection, optimistic concurrency, approval invalidation, provider budget rejection, submission during AI outage, and revision evidence retention.
- Browser inspection of the preserved blue/lavender design and professor dashboard.
- Browser workflow: manually create an objective-linked checkpoint, publish it, switch to Student, start it, save an artifact and explanation, generate follow-ups, answer both, complete the transfer task, and submit the evidence bundle.
- Browser workflow: switch back to Professor, open the evidence inbox, inspect the new bundle, and open the review decision controls. Revision mutation/retention is additionally covered by route tests.
- ZIP packaging extracts every included file into a temporary directory and compares its bytes with the source. Dependencies, caches, build output, secrets, and the ZIP itself are excluded.

These are meaningful implementation checks, not evidence that a real institution's deployment has been configured. Transport mocks do not execute PostgreSQL row-level policies or test actual AI model quality.

## Live acceptance checks after adding credentials

1. New database: run `schema.sql`, then `002-course-os.sql`, `003-adaptive-learning.sql`, and `004-evidence-history.sql`. Existing NovaLearn database: run only unapplied additive migrations in order before starting the new API.
2. Create Professor A, Professor B, and a Student in separate browser profiles. Verify confirmation, login, recovery, and logout.
3. A creates a class/course. Student joins by code. B must not read or mutate A's drafts, sources, publications, students, or evidence. Anonymous users must not read them.
4. Save an unapproved source/material/checkpoint. Student must not see them. Approve and release; verify only the approved snapshot appears.
5. Import a text-based PDF and verify extracted text. Import a scanned PDF and confirm it reports that OCR is needed. Check source citations against original documents.
6. Generate a graph from a real syllabus. Edit objectives and prerequisites; confirm cycles fail and graph edits invalidate approval. Confirm course edits do not silently overwrite another tab's newer version.
7. Configure each intended draft/dialogue/judge route. Confirm source grounding, valid citations, useful follow-up questions, and appropriate uncertainty. Check quota and invalid-model behavior.
8. If using embeddings, index saved sources, release, and verify retrieval with the configured model. Reindex when changing models.
9. Student starts a checkpoint; professor changes the blueprint. Confirm the student's started bundle retains its frozen original objectives/rubric.
10. Save/resume student work across login sessions. Submit all four evidence kinds. Confirm a model outage still submits original evidence with no invented findings.
11. Professor confirms or overrides findings; Student sees the feedback. Request a revision, update work, regenerate follow-ups when needed, and resubmit. Verify two immutable evidence runs/artifact snapshots and separate review records exist; a retry creates no duplicate rows. Verify direct browser reads/writes of private evidence tables fail, while authorized course API views work. Historical JSONB-only records remain readable.
12. Confirm Class Insights uses professor-reviewed findings in preference to AI suggestions and labels remaining suggestions as provisional. Missing evidence must not imply dishonesty.
13. Test voice recording/transcription/playback on localhost or HTTPS with microphone permission. Deny permission and confirm text remains available. Practice chat must not enter assessed evidence automatically.
14. Check responsive layout, keyboard navigation, 200% text enlargement, actual email delivery, provider billing controls, and your institution's data-retention/access policies before inviting real students.

No live Supabase, model, embedding, or voice credentials were supplied in this build session. Those integrations are implemented and configurable but their credentialed operation is not claimed as already verified. The published application defaults to a labeled, browser-tab-local example preview until live services are configured.
