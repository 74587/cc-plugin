import { readCommitsWithChangedPathsSince } from "./git.js";
import { isImplementationSurfacePath, loadIgnorePatterns } from "./state.js";
import type { GitState } from "../types.js";

export interface RepositoryRevisionHealth {
  commitsBehindHead: number | null;
  relevantCommitsBehindHead: number | null;
  metadataOnlyBehind: boolean;
}

/**
 * 将原始 Git 落后与真正触碰 implementation surface 的落后分开。
 * 只改 llmdoc/** 的收尾 commit 仍属于 Git 历史，但不代表知识过期。
 */
export function readRepositoryRevisionHealth(
  rootDir: string,
  baselineRevision: string | null,
  git: GitState
): RepositoryRevisionHealth {
  const commitsBehindHead = git.baselineBehindHead;
  if (!baselineRevision || !git.headRevision || commitsBehindHead === null) {
    return { commitsBehindHead, relevantCommitsBehindHead: null, metadataOnlyBehind: false };
  }
  if (commitsBehindHead === 0) {
    return { commitsBehindHead, relevantCommitsBehindHead: 0, metadataOnlyBehind: false };
  }

  const commits = readCommitsWithChangedPathsSince(rootDir, baselineRevision, git.headRevision);
  if (commits === null) {
    return { commitsBehindHead, relevantCommitsBehindHead: null, metadataOnlyBehind: false };
  }
  const ignorePatterns = loadIgnorePatterns(rootDir);
  const relevantCommitsBehindHead = commits.filter((commit) =>
    commit.paths.some((filePath) => isImplementationSurfacePath(filePath, ignorePatterns))
  ).length;
  return {
    commitsBehindHead,
    relevantCommitsBehindHead,
    metadataOnlyBehind: commitsBehindHead > 0 && relevantCommitsBehindHead === 0
  };
}
