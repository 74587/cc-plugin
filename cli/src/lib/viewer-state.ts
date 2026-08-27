import path from "node:path";

import { resolveDocLink } from "./markdown.js";
import { readRepositoryRevisionHealth } from "./repository-health.js";
import {
  analyzeDelta,
  computeGrowthState,
  type DeltaState,
  type GrowthState
} from "./state.js";
import { loadWorkspace, validateWorkspace } from "./workspace.js";
import type { DocumentKind, ParsedDocument, ValidationIssue, WorkspaceData } from "../types.js";

export type ViewerNodeStatus = "fresh" | "needs-review" | "impacted" | "dirty";
export type ViewerEdgeType = "requires" | "related" | "link";

export interface ViewerNodeDto {
  path: string;
  topic: string | null;
  title: string | null;
  kind: DocumentKind | "unknown";
  description: string;
  estimatedTokens: number;
  lineCount: number;
  codePaths: string[];
  status: ViewerNodeStatus;
}

export interface ViewerEdgeDto {
  from: string;
  to: string;
  type: ViewerEdgeType;
}

export interface ViewerRevisionHealth {
  relevantCommitsBehindHead: number | null;
  metadataOnlyBehind: boolean;
}

export interface ViewerStateDto {
  repository: string;
  generatedAt: string;
  baseline: {
    revision: string | null;
    headRevision: string | null;
    /** 原始 git commit 落后数，保留既有 API 语义。 */
    behindHead: number | null;
    /** 只统计触碰 implementation surface 的 commit，供健康度展示。 */
    relevantBehindHead: number | null;
    metadataOnlyBehind: boolean;
    degradedReason: string | null;
  };
  growth: GrowthState;
  validate: {
    ok: boolean;
    errors: number;
    warnings: number;
    issues: ValidationIssue[];
  };
  delta: {
    suggestedMode: "light" | "deep";
    reasons: string[];
    unmappedCommittedPaths: string[];
    unmappedDirtyPaths: string[];
  };
  nodes: ViewerNodeDto[];
  edges: ViewerEdgeDto[];
}

export interface ViewerStateProjectionInput {
  workspace: WorkspaceData;
  delta: DeltaState;
  growth: GrowthState;
  issues: ValidationIssue[];
  revisionHealth: ViewerRevisionHealth;
  generatedAt: string;
}

const EDGE_PRIORITY: Readonly<Record<ViewerEdgeType, number>> = {
  requires: 3,
  related: 2,
  link: 1
};

export function loadViewerState(rootDir: string, generatedAt = new Date().toISOString()): ViewerStateDto {
  const workspace = loadWorkspace(rootDir);
  const delta = analyzeDelta(workspace);
  return projectViewerState({
    workspace,
    delta,
    growth: computeGrowthState(workspace),
    issues: validateWorkspace(workspace),
    revisionHealth: readViewerRevisionHealth(workspace, delta),
    generatedAt
  });
}

/**
 * 把已读取的工作区事实投影成稳定、可序列化的 Viewer DTO。
 * 此函数不读文件、不调用 git，便于独立验证状态优先级和 API 契约。
 */
export function projectViewerState(input: ViewerStateProjectionInput): ViewerStateDto {
  const { workspace, delta, growth, issues, revisionHealth, generatedAt } = input;
  const impactedPaths = new Set(delta.impacts.map((impact) => impact.document.llmdocPath));
  const dirtyPaths = new Set(delta.dirtyDocuments.map((document) => document.llmdocPath));
  const needsReviewPaths = new Set(delta.needsReview.map((document) => document.llmdocPath));

  const nodes = workspace.documents
    .map((document): ViewerNodeDto => {
      const documentPath = document.llmdocPath;
      return {
        path: documentPath,
        topic: document.topic,
        title: document.title,
        kind: normalizeDocumentKind(document.frontmatter.kind),
        description:
          typeof document.frontmatter.description === "string" ? document.frontmatter.description : "",
        estimatedTokens: document.estimatedTokens,
        lineCount: document.lineCount,
        codePaths: stringList(document.frontmatter.code?.paths),
        status: dirtyPaths.has(documentPath)
          ? "dirty"
          : impactedPaths.has(documentPath)
            ? "impacted"
            : needsReviewPaths.has(documentPath)
              ? "needs-review"
              : "fresh"
      };
    })
    .sort((left, right) => compareText(left.path, right.path));

  return {
    repository: path.basename(workspace.rootDir),
    generatedAt,
    baseline: {
      revision: workspace.meta?.baseline.revision ?? null,
      headRevision: delta.git.headRevision,
      behindHead: delta.git.baselineBehindHead,
      relevantBehindHead: revisionHealth.relevantCommitsBehindHead,
      metadataOnlyBehind: revisionHealth.metadataOnlyBehind,
      degradedReason: delta.git.degradedReason
    },
    growth,
    validate: {
      ok: issues.every((issue) => issue.severity !== "error"),
      errors: issues.filter((issue) => issue.severity === "error").length,
      warnings: issues.filter((issue) => issue.severity === "warning").length,
      issues: issues.map((issue) => ({ ...issue }))
    },
    delta: {
      suggestedMode: delta.suggestedMode,
      reasons: [...delta.reasons],
      unmappedCommittedPaths: [...delta.unmappedCommittedPaths],
      unmappedDirtyPaths: [...delta.unmappedDirtyPaths]
    },
    nodes,
    edges: buildViewerEdges(workspace.documents, workspace.documentsByLlmdocPath)
  };
}

/**
 * 构建有向关系图。同一有向文档对只保留最强关系，反向关系保留为独立边。
 * Map 替换与最终排序让结果不依赖扫描和 frontmatter 中的声明顺序。
 */
export function buildViewerEdges(
  documents: readonly ParsedDocument[],
  knownDocuments: ReadonlyMap<string, ParsedDocument>
): ViewerEdgeDto[] {
  const edgesByDirection = new Map<string, ViewerEdgeDto>();

  const addEdge = (from: string, to: string, type: ViewerEdgeType): void => {
    if (from === to || !knownDocuments.has(to)) {
      return;
    }
    const key = `${from}\u0000${to}`;
    const current = edgesByDirection.get(key);
    if (!current || EDGE_PRIORITY[type] > EDGE_PRIORITY[current.type]) {
      edgesByDirection.set(key, { from, to, type });
    }
  };

  for (const document of documents) {
    const from = document.llmdocPath;
    for (const target of stringList(document.frontmatter.relations?.requires)) {
      addEdge(from, target, "requires");
    }
    for (const target of stringList(document.frontmatter.relations?.related)) {
      addEdge(from, target, "related");
    }
    for (const target of document.links) {
      addEdge(from, resolveDocLink(from, target), "link");
    }
  }

  return [...edgesByDirection.values()].sort(
    (left, right) =>
      compareText(left.from, right.from) || compareText(left.to, right.to) || EDGE_PRIORITY[right.type] - EDGE_PRIORITY[left.type]
  );
}

/**
 * 与 status 命令一致，只把实际触碰 implementation surface 的 commit 计入知识落后。
 * 纯 llmdoc/meta.json follow-up 会保留原始 behindHead，但 relevant 为 0。
 */
export function readViewerRevisionHealth(workspace: WorkspaceData, delta: DeltaState): ViewerRevisionHealth {
  const health = readRepositoryRevisionHealth(
    workspace.rootDir,
    workspace.meta?.baseline.revision ?? null,
    delta.git
  );
  return {
    relevantCommitsBehindHead: health.relevantCommitsBehindHead,
    metadataOnlyBehind: health.metadataOnlyBehind
  };
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizeDocumentKind(value: unknown): DocumentKind | "unknown" {
  return value === "architecture" || value === "guide" || value === "reference" ? value : "unknown";
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
