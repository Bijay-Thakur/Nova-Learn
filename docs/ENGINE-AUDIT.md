# Connected-engine audit

Scope: additive changes to the existing NovaLearn build. Baseline: repository main at f3055e0. No deployment or remote database operation was performed. The user subsequently authorized a tested commit and push to the existing GitHub repository.

## Reconnaissance and gap matrix

| Requirement | Existing implementation | Classification | Files | Risk / smallest action |
|---|---|---|---|---|
| Professor input and scheduling | Zod constraints, staged compiler, topological ordering, exact contact-hour allocation | Real; topic complexity estimates partial | course-domain.ts, course-compiler.ts | Preserve IDs; extend optional inputs |
| Shared objectives and modules | First-class objectives, module references, concept prerequisites; existing graphs adopted | Real | course-domain.ts, learning-domain.ts | Reuse these identities |
| Grounding and gaps | Approved source chunks and citations; source inventory, not semantic gap analysis | Partial | course-compiler.ts, course-ai.ts | Add explicit heuristic gap report and bounded research questions; no crawler |
| Structure approval | Final review and publication checks; packet generation precedes graph approval | Partial | course-compiler.ts, components/course-compiler.tsx | Gate expensive generation after schedule review |
| Learning content | Approved plain-text notes/examples/practice, module cards | Real legacy content; structured chapter engine missing | course-architect.tsx, course-student.tsx | Add optional chapters/topics/blocks alongside existing materials |
| Assessment design | Six stages, objective evidence, applied tasks, rubrics, private guide, validation fingerprints | Real with explicit preview templates | assessment-engine.ts | Include approved learning material in context and invalidate stale designs |
| Socratic evidence | Stored initial work, two once-only follow-ups, transfer, reflection, rubric evaluation | Partial adaptive dialogue | evidence.ts, course API | Add opt-in bounded multi-round state machine over same evidence |
| Mastery and professor insight | Objective findings, professor decisions, concept quick-check BKT and interventions | Real; demo seed is preset | learning-domain.ts, learning API, course-review.tsx | Feed existing findings, do not invent automatic high-stakes grades |
| Model abstraction | Role routing for draft/dialogue/judge; OpenAI/Gemini/Groq/local; retrieval and embeddings | Real when configured; demo explicit | course-ai.ts, server.ts | Reuse provider boundary; track chapter generation metadata |
| Persistence/auth | Supabase JSONB aggregates, immutable publication versions, optimistic updates, owner/enrollment RLS | Real when configured | course API, schema.sql, 002/003 migrations | Optional JSON fields; no destructive migration or auth changes |
| Preview | Session storage and explicitly scripted example generators | Mock by design | course-preview.ts, course-sample.ts | Maintain parity for new pure-domain actions |

## Change sequence

1. P0: additive content schema, shared curriculum audit/provenance, context freshness and publication filtering.
2. P1: bounded per-chapter generation, professor approval, stateful evidence dialogue; preserve provider injection.
3. P2: integrate into existing Modules/Learn/compiler/demonstration panels without replacing routes or styling.
4. P3: regression tests, API contract tests, typecheck, lint and production build; document limitations honestly.

External research will remain a professor-reviewed question queue, not automatic browsing. Lexical coverage is a diagnostic, not proof of semantic grounding. Legacy materials remain readable and usable. AI quality checks remain advisory with human approval; deterministic checks cannot prove factual correctness, accessibility, or assessment validity.
