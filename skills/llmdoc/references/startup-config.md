+# Startup Configuration

Read this reference when a user asks to configure SessionStart guidance or preload documents, or when a workflow creates, renames, merges, or deletes a document named in startup preload.

## File and schema

Place the optional `llmdoc.config.json` at the llmdoc workspace root. In a Git repository this is the nearest Git root that owns `llmdoc/`; the no-Git fallback is the directory that owns `llmdoc/`.

```json
{
  "$schema": "https://llmdoc.tokenroll.ai/schemas/config.schema.json",
  "schema": "llmdoc.config/v1",
  "startup": {
    "remindSkill": true,
    "preload": [
      "architecture.mdx",
      "api-client/contracts.mdx"
    ]
  }
}
```

- `startup.remindSkill` defaults to `true`. Set it to `false` only when the repository deliberately supplies equivalent operating guidance elsewhere or wants no proactive reminder.
- `startup.preload` contains exact `.mdx` document IDs in declaration order. An entry may include the `llmdoc/` prefix.
- Cold SessionStart injects configured bodies directly and has no llmdoc character or token budget. A final completion marker distinguishes a complete preload from host-side truncation; if it is absent, retrieve only the missing body with `show`.
- Compact re-entry lists configured document IDs without injecting the bodies again. Use the compacted `LLMDOC_STATE` first and retrieve a body only when needed.

## Validation and degradation

Run `validate` after creating or editing the file. Invalid JSON or schema cannot preserve field intent, so hooks use the default reminder and skip preload. When the schema is valid but a preload path is invalid or missing, hooks preserve the valid `remindSkill` choice and skip the preload field. Entries that normalize to the same document are deduplicated with a warning.

## Structural changes

A preload entry is a persistent reference and must stay synchronized with document identity:

- `llmdoc mv` rewrites matching preload entries transactionally with document references and the ledger.
- Before a prune workflow manually merges or deletes documents, inspect the report's startup preload references and update or remove affected entries in the same write set.
- After any manual path change, run `validate` before `commit`. A missing preload target is an error and intentionally blocks finalization.

Do not create this file during init unless the user or repository requirements call for non-default startup behavior or deliberate document preload.
