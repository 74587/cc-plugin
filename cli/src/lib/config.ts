import fs from "node:fs";
import path from "node:path";

import type { LlmdocConfig, LoadedLlmdocConfig, ParsedDocument, ValidationIssue } from "../types.js";
import { normalizeRepoRelativePath, resolveInsideRoot } from "./fs.js";
import { validateLlmdocConfig } from "./schema.js";

export const LLMDOC_CONFIG_FILENAME = "llmdoc.config.json";

export function loadLlmdocConfig(
  rootDir: string,
  documentsByLlmdocPath?: ReadonlyMap<string, ParsedDocument>
): LoadedLlmdocConfig {
  const configPath = path.join(rootDir, LLMDOC_CONFIG_FILENAME);
  if (!fs.existsSync(configPath)) {
    return { exists: false, config: null, preloadPaths: [], issues: [] };
  }

  let safeConfigPath: string;
  try {
    safeConfigPath = resolveInsideRoot(rootDir, LLMDOC_CONFIG_FILENAME);
  } catch (error) {
    return invalidConfig(`The config file must remain inside the repository: ${(error as Error).message}`);
  }

  let input: unknown;
  try {
    input = JSON.parse(fs.readFileSync(safeConfigPath, "utf8"));
  } catch (error) {
    return invalidConfig(`JSON parse failed: ${(error as Error).message}`);
  }

  const schemaErrors = validateLlmdocConfig(input);
  if (schemaErrors.length > 0) {
    return {
      exists: true,
      config: null,
      preloadPaths: [],
      issues: schemaErrors.map((message) => configIssue("config.invalid", `Invalid config: ${message}`))
    };
  }

  const config = input as LlmdocConfig;
  const preloadPaths: string[] = [];
  const issues: ValidationIssue[] = [];
  const seen = new Set<string>();
  for (const rawPath of config.startup?.preload ?? []) {
    let normalized: string;
    try {
      normalized = normalizePreloadPath(rawPath);
    } catch (error) {
      issues.push(configIssue("config.startup.preload.path", (error as Error).message));
      continue;
    }
    if (seen.has(normalized)) {
      issues.push(
        configIssue(
          "config.startup.preload.duplicate",
          `startup.preload contains the same normalized document more than once; duplicate ignored: llmdoc/${normalized}`,
          "warning"
        )
      );
      continue;
    }
    seen.add(normalized);
    preloadPaths.push(normalized);
    if (documentsByLlmdocPath && !documentsByLlmdocPath.has(normalized)) {
      issues.push(configIssue("config.startup.preload.missing", `startup.preload document does not exist: llmdoc/${normalized}`));
    }
  }

  return {
    exists: true,
    config,
    preloadPaths: issues.some((issue) => issue.severity === "error") ? [] : preloadPaths,
    issues
  };
}

export function formatStartupPreloadDocuments(documents: readonly ParsedDocument[]): string {
  if (documents.length === 0) {
    return "";
  }
  const lines = [
    `llmdoc startup preload begins (${documents.length} document(s)). The configured bodies are provided directly below. If the final completion marker is visible, these bodies are complete and do not need another search/show; otherwise retrieve any missing document with npx @tokenroll/llmdoc show.`
  ];
  for (const document of documents) {
    lines.push("", `=== llmdoc/${document.llmdocPath} [${document.frontmatter.kind}] (startup preload) ===`, document.body);
  }
  lines.push("", "=== llmdoc startup preload complete ===");
  return lines.join("\n");
}

export function formatCompactPreloadIndex(preloadPaths: readonly string[]): string {
  if (preloadPaths.length === 0) {
    return "";
  }
  return `Configured startup preload bodies were not re-injected after compaction. Document IDs: ${preloadPaths
    .map((preloadPath) => `llmdoc/${preloadPath}`)
    .join(", ")}. Retrieve a body with npx @tokenroll/llmdoc show only when the compacted context no longer contains what the task needs.`;
}

export function rewriteStartupPreloadForMove(
  config: LlmdocConfig,
  mapping: ReadonlyArray<{ oldLlmdocPath: string; newLlmdocPath: string }>
): { config: LlmdocConfig; changed: boolean } {
  const preload = config.startup?.preload;
  if (!preload || preload.length === 0) {
    return { config, changed: false };
  }

  const moveByPath = new Map(mapping.map((item) => [item.oldLlmdocPath, item.newLlmdocPath]));
  let changed = false;
  const rewritten = preload.map((rawPath) => {
    let normalized: string;
    try {
      normalized = normalizePreloadPath(rawPath);
    } catch {
      return rawPath;
    }
    const nextPath = moveByPath.get(normalized);
    if (!nextPath) {
      return rawPath;
    }
    changed = true;
    const normalizedRaw = rawPath.trim().replaceAll("\\", "/");
    return normalizedRaw.startsWith("llmdoc/") ? `llmdoc/${nextPath}` : nextPath;
  });

  return {
    changed,
    config: changed
      ? {
          ...config,
          startup: {
            ...config.startup,
            preload: rewritten
          }
        }
      : config
  };
}

function normalizePreloadPath(rawPath: string): string {
  const trimmed = rawPath.trim().replaceAll("\\", "/");
  const withoutPrefix = trimmed.startsWith("llmdoc/") ? trimmed.slice("llmdoc/".length) : trimmed;
  const normalized = normalizeRepoRelativePath(withoutPrefix);
  if (!normalized.endsWith(".mdx")) {
    throw new Error(`startup.preload accepts only .mdx documents: ${rawPath}`);
  }
  return normalized;
}

function invalidConfig(message: string): LoadedLlmdocConfig {
  return {
    exists: true,
    config: null,
    preloadPaths: [],
    issues: [configIssue("config.read", message)]
  };
}

function configIssue(code: string, message: string, severity: ValidationIssue["severity"] = "error"): ValidationIssue {
  return {
    severity,
    code,
    path: LLMDOC_CONFIG_FILENAME,
    message
  };
}
