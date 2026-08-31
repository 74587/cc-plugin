# Portable Agent Integration

[Back to the llmdoc README](../README.md)

Use this recipe when an agent host does not have a native llmdoc plugin. It
gives the agent the same retrieval, maintenance, and safety boundaries while
keeping `@tokenroll/llmdoc` outside the consumer repository's dependencies.

Copy the following block into the consumer repository's `AGENTS.md`:

```markdown
# llmdoc

This project uses llmdoc V3 as persistent engineering context.

## CLI boundary

- Treat `@tokenroll/llmdoc` as external tooling. Run it as
  `npx -y @tokenroll/llmdoc <command>`; never add it to this project's
  `package.json` or lockfile, and never call the unrelated bare package
  `npx llmdoc`. When reproducibility matters, pin the package spec:
  `npx -y @tokenroll/llmdoc@<version> <command>`.
- If the CLI is unavailable, report the degraded path and continue only with
  narrowly scoped native inspection.
- If hooks are available, keep them read-only and fail-open. They may signal
  startup context, update needs, or compact state; they must not mutate
  knowledge or source code.
- SessionStart supplies the default operating guidance. A repository may disable
  it with `startup.remindSkill: false` and may opt into exact document preloading
  through workspace-root `llmdoc.config.json`. On cold start, treat preloaded
  bodies as complete only when the final completion marker is present; otherwise
  retrieve the missing body with `show`. Compact re-entry lists configured IDs
  without injecting all bodies again.

## Retrieval gate

- Before the first broad discovery action, and again when entering a new
  subsystem, choose the one entry point that matches the intent:
  - concept, contract, term, or “where is X?” → `search <query>`
  - background or blast radius of concrete source files →
    `context --files <path...>`
  - cold start or unclear scope → `tree`
  - known topic or document kind → `index --topic <topic>` or
    `index --kind <kind>`
  - bodies of documents already identified → `show <path...>`
- These entry points are alternatives, not a fixed sequence. Stop when the task
  has enough context.
- `context --files` evaluates inputs independently and reports `unmappedFiles`;
  do not infer that all inputs are mapped merely because `impacted` is non-empty.
- Broad native discovery means recursive or cross-directory exploration outside
  the working set identified by llmdoc. After llmdoc narrows that set, use
  native tools for exact source text, line numbers, test behavior, counts, Git
  state, and other live facts.
- `status` and `delta` assess staleness and impact; they are not retrieval
  steps.

## Knowledge boundary

- Stable knowledge lives in tracked `llmdoc/`. Temporary investigations, caches,
  and reflection candidates live in local `.llmdoc-tmp/`; validate a scratch
  report before reusing it. Never hand-edit `llmdoc/meta.json`.
- Keep decisions and rationale, boundaries, invariants, cross-module contracts,
  non-obvious failure semantics, and risky repeatable workflows. Leave facts
  that are cheap to reconstruct in source, schemas, CLI help, tests, or
  generated configuration.
- A `delta` hit creates a review obligation, not a prose-edit instruction. When
  reviewed knowledge remains true, finalize it as verified unchanged instead of
  inventing a body diff.
- In agent workflows, `investigator` gathers temporary evidence, `reflector`
  writes temporary privacy-safe lesson candidates, and `recorder` is the only
  role that writes tracked `llmdoc/` knowledge.
- Use guarded CLI operations for the validity ledger and structural changes:
  `commit`, `fingerprint`, `new`, `adopt`, and `mv`.

## Workflow boundary

- `llmdoc:init`, `llmdoc:update`, `llmdoc:prune`, and `llmdoc:upgrade` are
  judgment-bearing Agent workflows, not four equivalent CLI subcommands. The
  runtime CLI supplies deterministic retrieval, diagnostics, validation, and
  guarded mutation primitives.
- On a host without the native plugin, treat those names as workflow intents in
  Agent instructions, not as slash commands or commands supplied by the runtime
  CLI. They become callable skill entry points only when the host integration
  defines them.
- Align with the user before non-trivial plans or edits. A workflow invocation
  authorizes knowledge maintenance only; it does not authorize source-code
  changes.
- Suggest `init` when no valid V3 knowledge surface exists. If V3 already
  exists, use `update` instead.
- Suggest `update` after work that changes durable architecture, contracts, or
  workflows, then wait for user confirmation. Treat source delta and pending
  reflections as review inputs, not automatic writes.
- Run `prune` only with user confirmation. Its CLI report supplies mechanical
  signals; an Agent must still judge semantic density and ownership.
- Never suggest `upgrade`. Run it only when the user explicitly asks for it by
  name; its CLI command diagnoses legacy/V2 migration needs but does not perform
  the semantic migration by itself.
- After knowledge changes, validate and close out through the workflow's commit
  protocol. If validation fails and cannot be repaired, revert only the current
  documentation write set.
- Report exactly one workflow result: `success`, `no_change`, `dry_run`,
  `incomplete`, or `failed`.

## Reflection gate

- Treat an explicit user correction, a verified approach failure, major rework,
  or an instruction violation as a reflection signal only when it exposes a
  reusable lesson. Skip transient failures, trivial mistakes, and one-task
  preferences.
- Capture a privacy-safe candidate under `.llmdoc-tmp/reflections/pending/`;
  never store the transcript.
- A pending candidate is an update signal even when source delta is empty. After
  user confirmation, verify it and apply the same stable-knowledge gate; merge
  only a durable rule into its existing architecture or guide owner.
```

The recipe intentionally delegates exact command flags and schemas to the
installed CLI. Use `npx -y @tokenroll/llmdoc --help` for the current runtime
reference.
