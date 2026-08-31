import fs from "node:fs";

import { CliError } from "../lib/errors.js";
import { findProjectRoot } from "../lib/fs.js";
import { isUnbornHead } from "../lib/git.js";
import { readWorkspaceGitState } from "../lib/state.js";
import { loadWorkspace } from "../lib/workspace.js";
import { MetaLedger } from "../types.js";

interface InitStateOptions {
  cwd: string;
  json?: boolean;
}

// init/upgrade 场景的 meta.json 骨架生成:
// 全部文档登记为 validatedRevision: null(未验证,delta 会如实标 impacted),
// convergence 用当前实测统计。真正的 revision 烙印仍由 fingerprint 完成。
export function runInitState(options: InitStateOptions): unknown {
  const rootDir = findProjectRoot(options.cwd);
  const workspace = loadWorkspace(rootDir);
  if (workspace.meta) {
    throw new CliError("llmdoc/meta.json already exists; init-state creates only the initial ledger and never overwrites it.");
  }
  const git = readWorkspaceGitState(workspace);
  if (!git.available) {
    throw new CliError("init-state requires a Git repository. Run `git init` and create a real initial commit first.");
  }
  if (!git.headRevision) {
    if (isUnbornHead(rootDir)) {
      throw new CliError(
        "HEAD has no commit (the current branch is unborn). Create a real initial commit first; an empty repository can run `git commit --allow-empty -m \"chore: initial commit\"`."
      );
    }
    throw new CliError(`${git.degradedReason ?? "Unable to resolve the HEAD commit."} Repair Git HEAD before running init-state.`);
  }

  const now = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  const meta: MetaLedger = {
    schema: "llmdoc.meta/v3",
    baseline: {
      revision: git.headRevision,
      verifiedAt: now
    },
    documents: Object.fromEntries(workspace.documents.map((document) => [document.llmdocPath, { validatedRevision: null }])),
    convergence: {
      capturedAt: now,
      source: "init",
      documentCount: workspace.documents.length,
      totalEstimatedTokens: workspace.documents.reduce((sum, document) => sum + document.estimatedTokens, 0)
    }
  };
  fs.writeFileSync(workspace.metaPath, `${JSON.stringify(meta, null, 2)}\n`);

  if (options.json) {
    return {
      status: "success",
      documents: workspace.documents.length,
      baselineRevision: git.headRevision,
      next:
        "npx -y @tokenroll/llmdoc validate && npx -y @tokenroll/llmdoc commit --all -m \"docs: bootstrap llmdoc\""
    };
  }
  return `initialized llmdoc/meta.json: ${workspace.documents.length} documents (validatedRevision: null), baseline ${git.headRevision.slice(0, 7)}\nnext: Run \`npx -y @tokenroll/llmdoc validate\` first. After it passes, finish with \`npx -y @tokenroll/llmdoc commit --all -m "docs: bootstrap llmdoc"\`.`;
}
