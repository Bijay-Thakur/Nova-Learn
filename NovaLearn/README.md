# NovaLearn

A professor-led course workspace: define objectives, build connected modules, prepare materials, design authentic assessments, and review evidence of understanding. Nova proposes and summarizes; the professor approves and decides.

The existing blue/lavender interface, cards, sidebar, lake imagery, and Nova character are retained. The main structure is now professor-first instead of a generic mission dashboard.

The September 20 blueprint upgrade adds concept-level mastery estimates, diagnostics/pulse checks/exit tickets, adaptive recommendations, spaced-review dates, versioned chapter releases, a professor support desk, reusable semester templates, reflection and spoken follow-up input, and a real Three.js Nova character. See **[Blueprint coverage](docs/BLUEPRINT-COVERAGE.md)** for exact implementation boundaries and remaining work.

The course compiler edit connects these existing features through six stages: professor inputs → AI blueprint → module generation → assessment design → review → finalize/export. Generation is resumable and never replaces existing authored content or publishes automatically. Nova explains each step, with optional device-voice narration. See **[Course compiler guide](docs/COURSE-COMPILER.md)**.

The Authentic Assessment Engine adds a saved design pipeline: objective evidence → strategy → applied scenario/tasks → rubric levels → variants/verification → alignment validation. Professor approval and course publication stay separate. Student packages exclude private evaluation guidance. See **[Authentic Assessment Engine](docs/AUTHENTIC-ASSESSMENT-ENGINE.md)** for the full workflow, model routing and limitations.

The connected-engine patch adds structured chapter/topic/content blocks, professor approval before downstream generation, a source-coverage/gap report, approved learning content in assessment context, and a bounded stateful Socratic defense. Existing materials and published versions stay usable. See **[Connected engines guide](docs/CONNECTED-ENGINES.md)**, **[Audit matrix](docs/ENGINE-AUDIT.md)** and **[validation results](docs/ENGINE-VALIDATION.md)** for real/demo boundaries and verification results. No additional database migration is required.

The Student Evidence Engine stores objective-linked observations with exact student-response spans, separate evidence-strength and interpretation-confidence labels, uncertainty and optional grounded misconceptions. It uses the existing assessment targets, bounded Socratic dialogue, professor Evidence Review and demonstration JSONB record. The preview is explicitly scripted; provider failures leave the original student work available for professor review. Code-test signals are accepted only from server-produced results; NovaLearn does not yet run submitted code in a sandbox. Evidence observations do not directly change mastery.

## Explore immediately

Without Supabase credentials, the app opens in **Professor** preview with an example course. Switch between **Professor** and **Student** in the banner. Edit course graphs, create materials/checkpoints, release content, complete evidence bundles, review them, request revisions, and inspect class insights.

Preview AI is scripted, not live assessment. Preview records stay in **this browser tab’s session storage**, are not shared, and may be cleared when the tab closes. Do not use preview for real student data. Live mode uses Supabase accounts and durable database storage.

## Run in VS Code

1. Install Node.js **22.13 or newer** and VS Code.
2. Extract the entire ZIP. Open its **NovaLearn** folder in VS Code; do not run inside the ZIP.
3. Open a terminal and run:

   ```powershell
   npm ci
   npm run dev:local
   ```

4. Open **http://localhost:3000** to explore. Windows users can also run `START_NOVALEARN.bat` after installing dependencies.

For live accounts, copy `.env.example` to `.env.local`, complete the setup below, and restart the server. Keys belong only in the server environment. Never paste them in chat, commit them, or put them in `NEXT_PUBLIC_` variables.

```powershell
Copy-Item .env.example .env.local
node scripts/check-setup.mjs
npm run dev:local
```

## Supabase setup

For a **new** Supabase project:

1. Run `supabase/schema.sql` once in its SQL editor, before registering users.
2. Run `supabase/002-course-os.sql` after it to add courses, publications, and evidence bundles.
   Then run `supabase/003-adaptive-learning.sql` to add versioned releases and adaptive-learning records. All three are required for a fresh installation.
3. Set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and server-only `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`.
4. Enable email/password auth. Set the Auth Site URL and allowed redirect URL to `http://localhost:3000` locally, or your deployed HTTPS origin.
5. Create professor and student accounts with different emails. The database role remains `teacher`; the course workspace calls it Professor. Confirm emails when enabled.
6. Choose **Use live accounts** to exit sample preview.

For an **existing NovaLearn database**, run whichever additive migrations (`002-course-os.sql`, then `003-adaptive-learning.sql`) have not yet been applied. Do not rerun the original non-idempotent `schema.sql`. Existing data is preserved. Release each existing course again to create its first immutable answer-key snapshot.

Draft courses are readable only by their professor. Published snapshots are readable by the professor and enrolled students. Students read their own evidence; the course professor can read submitted evidence. New-table browser writes are denied; the authenticated API checks roles/ownership and uses the service role for writes. Keep that key private. Test live policies using `docs/VERIFICATION.md` before real student use.

Faculty verification, institution SSO, organization administration, and LMS integrations are not included. A self-registered professor does not gain access to another professor’s classes.

## Professor workflow

1. **Classes & Students:** create a class and share its invitation code.
2. **Course Compiler:** select an existing course or create one. Save course code, level, weeks, contact hours, module count, checkpoints, grading weights, prerequisites, outline and intent. Run each stage and review results. The original graph/source editor remains inside the blueprint stage.
3. Add course sources, review the extracted text, and approve them. Text-based PDF, TXT, and Markdown are supported. Scanned PDFs require external OCR; the app reports missing text rather than pretending to read images.
4. **Module Studio:** derive chapters from the approved blueprint, generate grounded blocks, review/edit and approve. Book/Study/Slides reuse those blocks. The existing lecture notes, worked examples, practice and discussion editors remain available below.
5. **Assessment Studio → Design engine:** select objectives and constraints, run six saved stages, edit the tasks/rubric/verification package, validate and approve. Release separately. **Existing assessments** retains the original manual editor.
6. **Release approved content:** update the student course. Unapproved materials and unpublished checkpoints stay private. Removing content from a draft changes the student view only after another release.
7. **Evidence Review:** inspect work, explanation, follow-ups, transfer, tool disclosure, and evidence trail. Confirm suggestions, record your own findings, or request more evidence. Students see professor feedback.
8. **Class Insights:** inspect objective coverage, reviewed versus provisional findings, and possible misconception themes. Jump to Module Studio to prepare targeted practice.

### New closed-loop workflow

1. **Course Architect → Semester blueprint:** set workload and checkpoint rhythm, inspect concept prerequisites, select released modules, and scope sources. A source is exposed only when all its assigned modules are open; unscoped sources require all modules to be open. Split documents containing future topics before scoping them.
2. **Module Studio → Quick checks:** author or draft a diagnostic, pulse check, exit ticket, or review. Verify the answer, feedback, and concept mapping; save, then release from Course Architect.
3. **Student → Learn:** complete a check with an explanation, confidence, and optional reflection. The server grades the selected answer against the immutable release, not a browser-supplied score. Explanations await professor review.
4. **Professor → Class Insights:** inspect the concept heatmap, evidence timeline, answer distributions, confidence mismatches, and explanation. A professor's judgment replaces the automatic signal instead of double counting it. Use Refresh to retrieve new student activity; there is no push subscription.
5. Assign practice, reteaching, or office-hour support to one or several enrolled students. **Student → Progress** shows this support plan and accepts completion/reflection. Students can also request help; professors respond in the Support desk.
6. Use **Reuse for next semester** to copy your course content into a new unlinked draft. No student evidence is copied. Link the new class and approve/release it separately.

Mastery uses deterministic weighted Bayesian Knowledge Tracing (`weighted-bkt-1`), with visible evidence history and conservative insufficient-evidence labels. It is an **uncalibrated pilot model, not a validated probability of ability or a grade**. AI findings alone never change the statistical estimate. Repeating a question after seeing its key does not add mastery credit. Review dates are rules-based (1/3/7 days), not a trained forgetting model. The pilot stores up to 500 attempts and 100 support actions per student/course.

Nova's 3D character uses locally generated geometry, with blinking, floating, pointer attention, greeting, and tutor-state animations. Motion can be paused and follows reduced-motion preferences. Browsers without WebGL2 use the original illustrated character with a gentle optional animation. No camera or face tracking is used.

Save buttons persist drafts. Unsaved changes are labeled. Version checks prevent silent overwrites across sessions. Each started assessment retains its original rubric/objectives even if the professor edits the course later.

## Student workflow

- **My Classes:** join using the professor’s code.
- **Learn:** navigate released chapters/topics in Book, Study or Slides mode, read legacy materials and Teach Nova in text or voice using course-source citations. Practice chat is not assessment evidence and lasts only while that panel stays open.
- **Demonstrate:** provide a written artifact or import its text, explain the reasoning, disclose tools/help, answer adaptive follow-ups (type or transcribe speech), apply the idea to a changed scenario, and reflect on what changed. Save drafts and resume later. Extracted text is stored, not original binary uploads. Spoken answers are editable transcripts, not identity-verified oral exams.
- **Progress:** see objective-linked findings, evidence confidence, professor feedback, and next steps.

Submission locks evidence. A professor can reopen it by requesting a revision. Changing initial work resets its follow-ups. Optional Socratic defense stores sequential probes; editing an earlier answer removes dependent probes and reopens review. Requested-revision snapshots are retained in the exported bundle (up to ten). An evaluation-provider outage does not block an otherwise complete submission: the professor receives original evidence without fabricated AI findings.

There is **no cheating score, authorship detector, hidden monitoring, or automatic final grade**. Low confidence means evidence needs verification—not dishonesty. Optional legacy learning labs remain available from Learn; their formative mission scores are separate from course findings.

## AI providers and routing

OpenAI, Gemini, Groq, and OpenAI-compatible local models are supported. Set server keys and choose a provider in Settings. Model names are configurable examples; use IDs available in your account. No free quota or model availability is guaranteed.

| Purpose | Optional server override |
| --- | --- |
| Course graphs/material drafts | `NOVA_DRAFT_PROVIDER`, `NOVA_DRAFT_MODEL` |
| Teach Nova/adaptive follow-ups | `NOVA_DIALOGUE_PROVIDER`, `NOVA_DIALOGUE_MODEL` |
| Assessment blueprints/evidence synthesis | `NOVA_JUDGE_PROVIDER`, `NOVA_JUDGE_MODEL` |

Blank overrides inherit the selected provider/default model. Use lower-cost draft models, fast dialogue, and stronger judgment models as appropriate. No silent cross-provider fallback occurs. Establish institutional data/provider policies before transmitting real course or student data.

Structured responses are validated. Graphs reject cycles, rubric weights are checked, unknown citation IDs are rejected, and evidence synthesis must cover every frozen objective. AI can still be mistaken; professor review is essential. The existing atomic database budget allows 12 AI operations/minute and 200/day per account; failed provider operations also consume budget.

## Knowledge grounding

Approved source text is chunked server-side. Material generation and Teach Nova retrieve relevant approved chunks with inspectable excerpts. Keyword retrieval works without embeddings.

For optional semantic retrieval, configure `EMBEDDING_BASE_URL`, `EMBEDDING_API_KEY`, and `EMBEDDING_MODEL`, then choose **Index embeddings** on an approved saved source and release again. Use an OpenAI-compatible `/embeddings` endpoint, including local models. Vectors are stored with chunks; retrieval blends cosine similarity with keyword overlap. Query embedding failure falls back to keyword retrieval. Reindex all sources when changing embedding models. This is bounded per-course retrieval, not a large vector database.

Limits: 20 sources/course; 5 MB and 50 pages/PDF import; 100,000 text characters/source; up to 100 chunks/source. Original document binaries are not retained. Verify extracted text before approval.

## Voice and open-source migration

Recording requires localhost/HTTPS and microphone permission. Review transcripts before sending. Recordings stop after two minutes. Raw audio is forwarded for transcription and is not stored by NovaLearn.

- Voice server: `VOICE_BASE_URL`, `VOICE_API_KEY`.
- Transcription: `STT_MODEL` (default `whisper-1`).
- Speech: `TTS_MODEL`, `TTS_VOICE` (defaults `tts-1`, `nova`).
- Local LLM: `LOCAL_LLM_BASE_URL`, `LOCAL_LLM_API_KEY`, `LOCAL_LLM_MODEL`, then Local in Settings or route overrides.

Open-source servers must expose compatible chat completions, JSON mode, and/or `/audio/transcriptions` and `/audio/speech`. NovaLearn does not install or host models itself. On hosted deployments, localhost means the application server, not your laptop. Preview speech can use the browser’s speech engine; live voice needs provider configuration.

## Commands

```powershell
npm run dev:local      # Next.js development, localhost:3000
npm run build:local    # Standard Next.js production build
npm run start:local    # Serve local production build
npm run typecheck     # TypeScript check
npm test              # Existing and student-evidence engine tests
```

`npm run build` retains optional Sites/Vinext hosting. VS Code on Windows uses the `:local` commands without Bash, Wrangler, or paid hosting. Hosted Supabase/AI calls need internet and may incur provider costs.

## Source structure

- `components/course-workspace.tsx`: role-specific course state.
- `components/course-architect.tsx`: graph, source, material, and assessment editors.
- `components/course-student.tsx`: Learn, Demonstrate, Progress.
- `components/course-review.tsx`: professor home, review, and insights.
- `lib/novalearn/course-domain.ts`: graph/rubric/evidence validation and aggregation.
- `lib/novalearn/course-ai.ts`: task routing, embeddings, grounded context.
- `lib/novalearn/evidence.ts`: canonical evidence assembly.
- `app/api/course/route.ts`: authenticated course/publication/evidence operations.
- `supabase/002-course-os.sql`: additive data model and read policies.
- `tests/course-os.test.mjs`: domain and route tests with mocked transport.
- `app/page.tsx`: preserved shell, accounts, classes, settings, optional legacy labs.
- `lib/novalearn/learning-domain.ts`: concept graph, deterministic BKT, release filtering, evidence weights, and recommendations.
- `app/api/learning/route.ts`: role-checked checks, explanation reviews, goals, and support actions.
- `components/learning-*.tsx`, `adaptive-student.tsx`, `concept-insights.tsx`: blueprint controls, quick checks, mastery map, and support desk.
- `components/nova-avatar.tsx`: lazy-loaded Three.js character with safe fallback and motion controls.
- `supabase/003-adaptive-learning.sql`: learning records, immutable release snapshots, and atomic publication.

## Readiness and troubleshooting

This is an explorable, working course application—not an institution-certified LMS or validated high-stakes grading system. Real authentication emails, Supabase isolation, model quality, embeddings, and voice need credentialed acceptance testing. See `docs/VERIFICATION.md` for completed and outstanding checks.

“Relation nova_courses does not exist” or “nova_learning_records does not exist” means an additive migration is missing. Provider 400/404 often means unavailable models or unsupported JSON mode; 401/429 means check keys/quotas. Never disable row-level security to bypass access errors. Restart the app after changing `.env.local`.
