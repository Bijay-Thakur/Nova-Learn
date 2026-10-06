# Connected learning engines

This additive patch keeps the existing routes, design system, auth, source editor, legacy learning materials, quick checks, assessment studio, evidence review and dashboards. It introduces structured chapters beside the existing materials rather than replacing them.

## Use the connected workflow

1. In **Course Compiler**, enter intent, course constraints and outline. Additional constraints accept explicit professor outcomes, required/optional topics, target learners, meetings, independent study, dates and institutional guidance. Approve reference materials in the existing source editor.
2. Run the blueprint stages. Inspect the shared objectives, module prerequisites and **Source coverage & curriculum gaps** panel. Matches are lexical hints, not proof of semantic coverage. Its maximum five proposed research questions do not trigger web browsing.
3. Run the weekly planner. Generation pauses; review the course map and click **Approve planned structure**, then resume. Compiler module packets remain compatible with the existing material/quiz/assessment editors.
4. Open **Module Studio → Teach the approved blueprint**. Derive chapter outlines from the same modules. Each chapter contains topics, optional subtopics, objective references, prerequisites, minutes and depth. This initial implementation derives one chapter per module; the schema supports several. It never generates a second independent module graph.
5. Generate a chapter. Live mode retrieves up to five approved module-scoped source chunks, requests structured blocks from the draft model, runs deterministic checks and a separate judge critique. Failed generation or critique does not replace saved content. Retry or edit the chapter after correcting a source/blueprint gap.
6. Inspect citations and content, edit individual blocks or the structured chapter, and approve. Lock approved work to prevent accidental editing/regeneration. Source or blueprint changes invalidate affected chapter approvals. **Refresh outline from blueprint** is an explicit, confirmed replacement of a stale draft; published versions remain unchanged.
7. **Assessment Studio** consumes selected objectives, prerequisites, approved chapter blocks and legacy teaching assets. It creates evidence expectations, applied tasks, rubrics and verification guides, then performs alignment review. Approve the assessment and publish an approved course version separately.
8. Students open **Learn**, choose a module and chapter topic, and read in Book, Study or Slides mode. These views reuse the same blocks. Study mode filters highlights; it is not an independently generated summary. Professor Teaching notes adds instructional cues over those blocks.
9. In **Demonstrate**, preserve the existing two-question workflow or choose **Save & start Socratic defense**. The dialogue stores one probe at a time, waits for the response, adapts to the recorded reasoning trail and stops on sufficient evidence or a bounded limit (Standard: three probes; Extended: five, including any existing follow-ups). Text and editable voice transcripts use the same state machine.
10. Submit the artifact, reasoning, follow-ups, transfer and required reflection/disclosure. Existing rubric findings, professor decisions, Progress and Class Insights consume the evidence. A dialogue stop is not a grade. AI suggestions do not silently become BKT mastery updates.

## Shared data and provenance

`Course.data.objectives` and `Course.data.modules` remain authoritative identities. The additive relationship is:

`module.id → chapter.moduleId → chapter.topics[].id → blocks[].topicId/subtopicId`

Every chapter/block maps back to objective IDs and approved source chunk IDs. Assessments retain a curriculum fingerprint plus chapter/material/source references; started demonstrations freeze the assessment package and publication version. Their evidence maps to those same objectives, and professor insights aggregate the existing reviewed findings.

Chapter metadata includes status, lock, version, update time, context/approval fingerprints, generation mode, routing, prompt version and elapsed time. Fingerprints are deterministic cache/change identities, **not cryptographic authorization tokens**. Server ownership/version checks and explicit approval actions enforce authorization. Client-supplied approval flags are not accepted by general course save.

Changes to source text invalidate dependent structured chapters and existing cited legacy teaching assets. Approved-content changes invalidate dependent assessment drafts. Lock-only changes do not change factual content. Student publications omit chapter critique/generation internals and private assessment guidance. If an approved chapter cites an otherwise unreleased document, only its specifically cited excerpts are exposed; the remaining document is withheld.

## API/service boundaries

All additions use the existing authenticated `POST /api/course` action dispatcher and optimistic version checks.

| Action | Role | Behavior |
|---|---|---|
| `content-outline` | Professor | Derive missing chapter outlines; preserve existing chapters |
| `content-generate` | Professor | Generate one chapter, validate/critique, save only successful output |
| `content-approve` | Professor | Check context/citations/mappings and grant approval |
| `content-refresh` | Professor | Explicitly replace an unlocked stale chapter draft with the current module outline |
| `save` | Professor | Reconcile chapter/source/assessment edits; revoke stale approvals |
| `socratic-next` | Student owner | Advance the frozen assessment's bounded dialogue after pending evidence is saved |

Pure services are `learning-content.ts`, `content-integrity.ts`, `curriculum-audit.ts` and `socratic.ts`. They accept injected model functions, enabling testing and future background jobs without adding a queue today. Existing `course-ai.ts` routing supports OpenAI, Gemini, Groq and compatible local servers. No new environment variables or mandatory model/voice vendor are introduced. The existing request budgets, timeouts, explicit retry flows and optimistic updates remain in force.

Live chapter generation uses two role-appropriate calls (draft + judge); both count toward existing budgets. Existing saved artifacts are reused on navigation and outline derivation. Regeneration is an explicit professor action. Model usage/cost accounting remains limited to route and elapsed time; exact token costs and automatic retry/backoff remain future work.

## Database compatibility

No SQL migration is required or applied. Optional fields extend the existing `nova_courses.data`, immutable course-version/publication JSONB and `nova_demonstrations.data` aggregates. Existing migrations, RLS, ownership, enrollment rules and service-role boundaries are unchanged. Old courses without chapters or dialogue state remain valid. Existing published snapshots are not retroactively rewritten.

Older unpublished authentic-assessment drafts may need **Refresh context** and revalidation because the assessment context now includes approved teaching content. This is intentional; it prevents approval under obsolete context. Existing released assessments and student attempts continue using their frozen packages.

## Real, demo and remaining boundaries

| Area | Implemented | Remaining limitation |
|---|---|---|
| Compiler | Structured inputs, shared objectives/modules, prerequisite ordering, schedule, review gate, stored gap report | Time is allocated evenly across modules; complexity/meeting policies are review guidance, not a full scheduling solver |
| Research | Explicit bounded gap questions and professor resource approval | No automatic external researcher or crawler; matching is lexical |
| Chapter content | Real provider-backed service, schema, quality gates, professor edits/approval, saved blocks, student renderer | Live factual quality needs subject-expert evaluation; no OCR, video generation or independent multimedia service |
| Representations | Book, filtered Study, topic-based Slides, professor cues from common blocks | Slides are in-app panels, not PPTX; formulas are text/code, not a full math typesetter; image blocks reference figures in cited originals |
| Demo | Source extracts and labeled practice/assessment templates; functional persistence within the tab | Demo is not subject-specific AI teaching, semantic critique or a measured mastery result |
| Socratic dialogue | Stateful probes, pending-answer checks, limits, adaptive provider interface, edit invalidation, stored trail | Live reasoning quality and voice transcription require configured providers; no identity-verified oral exam |
| Mastery | Existing evidence findings, professor overrides, objective dashboard, separate conservative quick-check BKT | Authentic dialogue does not automatically update statistical concept mastery; professor judgment remains distinct |
| Scale | Bounded requests, reuse of stable artifacts, atomic version checks | Course aggregates retain existing payload/storage limits; large-scale retrieval/job queues need a later measured design |

## Validation

Run `npm test`, `npm run typecheck`, and `npm run build:local`. The connected-engine tests exercise approval gates, citations, stale context, privacy, model/critique failure atomicity, assessment consumption, bounded dialogue, edits and the path into professor insight. Course API tests also cover roles, ownership and concurrent-version rejection for the new actions.

See [ENGINE-AUDIT.md](ENGINE-AUDIT.md) for the initial gap matrix and [ENGINE-VALIDATION.md](ENGINE-VALIDATION.md) for results and environment limitations from this patch.
