---
name: update
description: Explicit V3 sync of existing llmdoc knowledge against the current repository.
argument-hint: '[summary] [--scope <topic|path...>] [--reflection [<candidate...>]]'
---

# /llmdoc:update

Use this command when repository knowledge has changed and tracked `llmdoc/` must be synchronized.

Load the `llmdoc` skill before broad exploration. CLI commands below run as `npx -y @tokenroll/llmdoc <cmd>`.

## Authorization

An explicit `/llmdoc:update` invocation authorizes this run to:

- read repository state and existing llmdoc docs
- write impacted `llmdoc/` documents and `llmdoc/meta.json`
- write temporary investigation reports under `.llmdoc-tmp/investigations/`
- read and resolve declared reflection candidates under `.llmdoc-tmp/reflections/`

This command does not authorize source-code edits.

## Preconditions

- `git status -- llmdoc/` must be clean before the first formal write.
- Rollback means `git checkout -- llmdoc/` (plus deleting any newly created files under `llmdoc/`); never hand-edit files back.
- If `validate` fails after writes and cannot be repaired in-run, roll back the doc write-set before reporting failure.

## Workflow

1. Measure the current doc state.
   - Run `status`.
   - Run `delta` with any explicit scope flags.
   - Read each explicitly declared `--reflection` candidate. When the flag has no paths, read all Markdown candidates directly under `.llmdoc-tmp/reflections/pending/`. A pending candidate is an update signal even when code delta is empty.

2. Gate reflection candidates before promotion.
   - Require trigger evidence, the wrong assumption or action, root cause, a preventive rule, scope, confidence, and any existing-doc match.
   - Verify factual claims against current code, tests, or stable docs. A user correction is strong evidence of user intent, but not automatic proof of a repository fact.
   - Reject transient tool failures, one-task preferences, and unverified speculation. Use `search` and targeted `show` to find an existing owner before creating a document.

3. Choose the lightest sufficient path from delta plus any qualified candidates.
   - Light: impacted docs or a candidate's owner are already mapped and facts are straightforward.
   - Deep: unmapped files, an unclear lesson owner or root cause, boundary changes, conflicting facts, or broad impact.

4. Execute the update.
   - Light: `recorder` updates the impacted docs directly from `delta`, qualified reflection candidates, `context`, `search`, and targeted `show` reads.
   - Deep: `investigator` writes a scoped report first, then `recorder` rewrites the affected docs using that report plus the CLI evidence.

5. Finalize.
   - Run `commit -m "<message>"` (add `--all` for a full-repository verification, `--no-verify` in repos with heavy git hooks). It gates on validate, commits the `llmdoc/` write-set, refreshes fingerprints, and lands the `meta.json` change as a follow-up commit — never hand-roll this sequence out of `validate` plus `fingerprint`, and never `--amend` (that rewrites the hash fingerprints just recorded).
   - Re-check `status` when you need a final stale/clean signal.

6. Fold durable lessons into stable docs directly.
   - Put reusable cautions, invariants, and workflow fixes into the relevant architecture or guide docs.
   - Reflection candidates are a temporary evidence queue, not a tracked reflection kind or a second knowledge tree.
   - After `success`, move consumed candidates to `.llmdoc-tmp/reflections/resolved/YYYY-MM-DD/`. After `no_change`, resolve them only when the rule is already covered or the candidate failed the quality gate. Leave candidates pending after `incomplete` or `failed`.

## State Invariants

- Full successful updates may advance the repository baseline.
- Scoped updates must update only per-document fingerprints, not the global baseline.
- Update never changes convergence state. If growth requires convergence, finish update and ask once before running the separate prune workflow.

## Result Contract

- `success`: docs updated, validated, and state advanced according to scope.
- `no_change`: the declared scope was fully verified and no write was needed.
- `dry_run`: the user asked for a dry run, or only status/delta/investigation/planning output was produced without writing `llmdoc/`; do not advance state.
- `incomplete`: evidence was insufficient, user input is required, or the scope belongs to a different explicit maintenance workflow; roll back writes and do not advance state.
- `failed`: update failed and doc writes were rolled back.

Always report:

- the chosen path (`light` or `deep`) and why
- the `status` and `delta` signals used
- any investigation report path
- each reflection candidate and its disposition (`promoted`, `already_covered`, `dismissed`, or `pending`)
- the stable docs changed by `recorder`
- the `commit` result — validate gate, fingerprint refresh, and the meta follow-up commit — or why finalization was skipped
