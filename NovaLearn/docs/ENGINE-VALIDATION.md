# Connected-engine validation

Validated on an isolated local copy of baseline `f3055e0`. Validation did not modify any live Supabase project, provider credentials or deployment; the user subsequently authorized a tested Git commit and push. No browser automation runtime was available.

## Results

| Check | Result |
|---|---|
| `npm test` | Pass: 136/136 tests across six suites, including new connected-engine and authenticated API coverage. |
| `npm run typecheck` | Pass. |
| `npm run build:local` | Pass: Next.js compiled the page and all five API routes. |
| `npm run build` | Pass: bounded Vinext build; fixed the inherited non-executable shell-wrapper invocation by invoking the helper with Bash. Vinext warns about existing large chunks and its route-classification limitation. |
| `git diff --check` | Pass. |
| `npm run lint` | Fails on inherited lint debt: untouched baseline has 101 errors and 1,498 warnings; patched source has 101 errors and 1,497 warnings. Generated temporary test modules are excluded from lint. No new source-file diagnostics. |
| `npm run test:ui` after `npm run build` | Pass: 5/5 tests. Two inherited starter assertions were updated to verify NovaLearn's actual production metadata and learning/Nova styles instead of a nonexistent development tag and unused starter utilities. No application behavior changed for these assertions. |

The `npm test` suite exercises professor graph approval, citation and private-source boundaries, stale-context revocation, model/critique failure atomicity, assessment context from approved chapters, adaptive defense limits and edits, API roles/version conflicts, and a demo path into professor insight. A local production HTTP smoke check previously returned 200 for `/`, 200 for `/api/auth` in unconfigured preview, and 401 for unauthenticated `/api/course`.

## Not claimed as verified

- No live credentialed Supabase database, RLS multi-tenant account test, or AI/voice provider call was available for this local acceptance run. The authenticated API tests use mocked transport; the new optional course fields use the existing JSONB aggregate and require no SQL migration.
- No browser visual automation was available. The app compiled and served, but new editor interactions should be checked by a professor/student pilot in Chrome/Firefox before institutional use.
- Lexical source matching, deterministic grounding checks and model critique are not a substitute for disciplinary or accessibility review. Automated research is intentionally disabled; proposed bounded questions await professor judgment and approved sources.
- Existing lint debt remains separate cleanup work. `npm test` does not include the five build-artifact UI tests; run `npm run build && npm run test:ui` to check them.

## Reproduce locally

From the extracted `NovaLearn` directory with Node.js 22.13 or later:

```bash
npm ci
npm test
npm run typecheck
npm run build:local
npm run build && npm run test:ui  # optional Bash/Vinext build-artifact checks
npm run dev:local
```

For the optional hosting build, run `npm run build` in a Bash-capable environment. Preview requires no credentials; persistent classes and real model generation require the documented Supabase and provider setup.
