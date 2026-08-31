import path from "node:path";

import { CliError } from "./errors.js";
import { DocumentKind } from "../types.js";

const DOCUMENT_KINDS: DocumentKind[] = ["architecture", "guide", "reference"];

export interface DocTargetShape {
  repoRelativePath: string;
  llmdocPath: string;
  segments: string[];
  basename: string;
  topic: string | null;
  isRootSingleton: boolean;
}

export function parseDocTargetShape(repoRelativePath: string): DocTargetShape {
  if (!repoRelativePath.startsWith("llmdoc/")) {
    throw new CliError("The target must be under llmdoc/.");
  }
  if (!repoRelativePath.endsWith(".mdx")) {
    throw new CliError("The target must be an .mdx document.");
  }
  const llmdocPath = repoRelativePath.slice("llmdoc/".length);
  const segments = llmdocPath.split("/");
  if (segments.length !== 1 && segments.length !== 2) {
    throw new CliError("V3 document paths allow only a root singleton or topic/file depth.");
  }
  const basename = path.posix.basename(llmdocPath);
  const topic = segments.length === 2 ? (segments[0] ?? null) : null;
  const isRootSingleton = segments.length === 1;
  return {
    repoRelativePath,
    llmdocPath,
    segments,
    basename,
    topic,
    isRootSingleton
  };
}

export function assertDocKindMatchesShape(shape: DocTargetShape): void {
  // V3 不设入口节点:topic 即纯目录,描述由 CLI 从文档 front matter 聚合。
  if (shape.basename === "index.mdx") {
    throw new CliError("V3 does not use index.mdx entry nodes. Use a regular name; llmdoc tree derives topic descriptions.");
  }
}

export function validateMoveTargetShape(shape: DocTargetShape): void {
  assertDocKindMatchesShape(shape);
}

export function isDirectTopicDirectory(repoRelativePath: string): boolean {
  if (!repoRelativePath.startsWith("llmdoc/")) {
    return false;
  }
  const llmdocPath = repoRelativePath.slice("llmdoc/".length).replace(/\/+$/, "");
  const segments = llmdocPath.split("/").filter(Boolean);
  return segments.length === 1;
}

export function assertDocumentKind(input: string): DocumentKind {
  if ((DOCUMENT_KINDS as string[]).includes(input)) {
    return input as DocumentKind;
  }
  throw new CliError(`Invalid kind: ${input}. Allowed values: ${DOCUMENT_KINDS.join(", ")}`);
}
