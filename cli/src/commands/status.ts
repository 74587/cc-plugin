import { readRepositoryRevisionHealth } from "../lib/repository-health.js";
import { computeGrowthState, analyzeDelta } from "../lib/state.js";
import { loadWorkspace } from "../lib/workspace.js";

interface StatusOptions {
  cwd: string;
  json?: boolean;
}

export function runStatus(options: StatusOptions): unknown {
  const workspace = loadWorkspace(options.cwd);
  const delta = analyzeDelta(workspace);
  const growth = computeGrowthState(workspace);
  const relevantCommitsBehindHead = readRepositoryRevisionHealth(
    workspace.rootDir,
    workspace.meta?.baseline.revision ?? null,
    delta.git
  ).relevantCommitsBehindHead;

  if (options.json) {
    return {
      baseline: workspace.meta?.baseline.revision ?? null,
      head: delta.git.headRevision,
      commitsBehindHead: delta.git.baselineBehindHead,
      relevantCommitsBehindHead,
      degradedReason: delta.git.degradedReason,
      documents: {
        total: workspace.documents.length,
        impacted: delta.impacts.length,
        needsReview: delta.needsReview.length,
        dirty: delta.dirtyDocuments.length
      },
      unmapped: {
        committed: delta.unmappedCommittedPaths,
        dirty: delta.unmappedDirtyPaths
      },
      growth
    };
  }

  const baseline = workspace.meta?.baseline.revision ?? "missing";
  const behind = formatBehindLabel(delta.git.baselineBehindHead, relevantCommitsBehindHead);
  const unmapped = [...delta.unmappedCommittedPaths, ...delta.unmappedDirtyPaths];
  const growthLabel =
    growth.baselineDocumentCount === null
      ? `growth: ${growth.currentDocumentCount} docs, ~${growth.currentTotalEstimatedTokens} tokens (no convergence baseline)`
      : `growth: ${growth.currentDocumentCount} docs, ~${growth.currentTotalEstimatedTokens} tokens (baseline ${growth.baselineDocumentCount} docs, ~${growth.baselineTotalEstimatedTokens} tokens) — ${growth.exceedsGate ? "above gate" : "below gate"}`;

  const lines = [
    `baseline: ${baseline} (${behind})`,
    `documents: ${workspace.documents.length} total / ${delta.impacts.length} impacted / ${delta.needsReview.length} needs-review / ${delta.dirtyDocuments.length} dirty`
  ];
  if (unmapped.length > 0) {
    const shown = unmapped.slice(0, 5);
    const rest = unmapped.length - shown.length;
    lines.push(`unmapped changes (${unmapped.length}): ${shown.join(", ")}${rest > 0 ? ` … +${rest} more (--json 查看全部)` : ""}`);
  }
  lines.push(growthLabel);
  if (delta.git.degradedReason) {
    lines.push(`degraded: ${delta.git.degradedReason}`);
  }
  return lines.join("\n");
}

function formatBehindLabel(commitsBehindHead: number | null, relevantCommitsBehindHead: number | null): string {
  if (commitsBehindHead === null) {
    return "unknown";
  }
  if (commitsBehindHead > 0 && relevantCommitsBehindHead === 0) {
    return `${commitsBehindHead} commits behind HEAD, metadata-only; knowledge clean`;
  }
  if (commitsBehindHead > 0 && relevantCommitsBehindHead !== null) {
    return `${commitsBehindHead} commits behind HEAD, ${relevantCommitsBehindHead} relevant source commits`;
  }
  return `${commitsBehindHead} commits behind HEAD`;
}
