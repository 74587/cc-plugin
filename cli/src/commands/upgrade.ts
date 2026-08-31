import fs from "node:fs";
import path from "node:path";

import { findProjectRootOrNull, resolveInsideRoot } from "../lib/fs.js";
import { loadWorkspace, validateWorkspace } from "../lib/workspace.js";

interface UpgradeOptions {
  cwd: string;
  json?: boolean;
}

export async function runUpgrade(options: UpgradeOptions): Promise<unknown> {
  const rootDir = findProjectRootOrNull(options.cwd) ?? options.cwd;
  const configuredLlmdocDir = path.join(rootDir, "llmdoc");
  if (fs.existsSync(configuredLlmdocDir)) {
    resolveInsideRoot(rootDir, "llmdoc");
  }
  const report = fs.existsSync(configuredLlmdocDir) ? inspectLlmdocDirectory(configuredLlmdocDir) : inspectMissingLlmdoc();

  if (options.json) {
    return report;
  }

  const lines = [`status: ${report.status}`, `summary: ${report.summary}`];
  if (report.legacyPaths.length > 0) {
    lines.push(`legacy paths: ${report.legacyPaths.join(", ")}`);
  }
  if (report.targetStructure.length > 0) {
    lines.push("target structure:");
    for (const item of report.targetStructure) {
      lines.push(`  - ${item}`);
    }
  }
  lines.push(`recorder semantic migration required: ${report.requiresRecorderSemanticMigration ? "yes" : "no"}`);
  if (report.notes.length > 0) {
    lines.push("notes:");
    for (const note of report.notes) {
      lines.push(`  - ${note}`);
    }
  }
  return lines.join("\n");
}

function inspectMissingLlmdoc(): UpgradeReport {
  return {
    status: "no_change",
    summary: "The repository has no llmdoc/ directory and no V2/V3 knowledge surface to upgrade.",
    legacyPaths: [],
    targetStructure: [],
    requiresRecorderSemanticMigration: false,
    notes: ["Use init, not upgrade, to create the first knowledge surface."]
  };
}

function inspectLlmdocDirectory(llmdocDir: string): UpgradeReport {
  const allFiles = walkFiles(llmdocDir);
  const legacyMarkers = ["index.md", "startup.md", "must", "overview", "memory", "records", "state/sync.md", "architecture", "guides", "reference"];
  const legacyPaths = [
    ...legacyMarkers.filter((entry) => fs.existsSync(path.join(llmdocDir, entry))),
    ...allFiles
      .filter((filePath) => filePath.endsWith(".md"))
      .map((filePath) => path.relative(llmdocDir, filePath).replaceAll(path.sep, "/"))
  ].filter((value, index, items) => items.indexOf(value) === index);
  const hasV3Meta = fs.existsSync(path.join(llmdocDir, "meta.json"));
  const hasMdx = walkFiles(llmdocDir).some((filePath) => filePath.endsWith(".mdx"));

  if (hasV3Meta && hasMdx && legacyPaths.length === 0) {
    const rootDir = path.dirname(llmdocDir);
    try {
      const workspace = loadWorkspace(rootDir);
      const errors = validateWorkspace(workspace).filter((issue) => issue.severity === "error");
      if (errors.length > 0) {
        return {
          status: "dry_run",
          summary: "A partial V3 structure was detected, but the current knowledge surface failed V3 validation.",
          legacyPaths: [],
          targetStructure: ["Repair the existing V3 structure before deciding whether upgrade is needed"],
          requiresRecorderSemanticMigration: false,
          notes: errors.slice(0, 5).map((issue) => `${issue.path ?? "unknown"}: ${issue.message}`)
        };
      }
    } catch (error) {
      return {
        status: "dry_run",
        summary: "A partial V3 structure was detected, but the current knowledge surface cannot be loaded reliably.",
        legacyPaths: [],
        targetStructure: ["Repair the existing V3 structure before deciding whether upgrade is needed"],
        requiresRecorderSemanticMigration: false,
        notes: [(error as Error).message]
      };
    }
    return {
      status: "no_change",
      summary: "The existing knowledge surface is already V3; no upgrade is needed.",
      legacyPaths: [],
      targetStructure: [],
      requiresRecorderSemanticMigration: false,
      notes: ["upgrade currently reports an inventory only and does not rewrite V3 knowledge."]
    };
  }

  if (legacyPaths.length === 0 && !hasV3Meta && !hasMdx) {
    return {
      status: "dry_run",
      summary: "An llmdoc/ directory was found, but it has no definitive V2 or V3 structure markers.",
      legacyPaths: [],
      targetStructure: ["llmdoc/meta.json", "llmdoc/architecture.mdx", "llmdoc/<topic>/*.mdx (plain directories, no index.mdx entry nodes)"],
      requiresRecorderSemanticMigration: false,
      notes: ["A human must confirm whether this directory is a legacy knowledge surface."]
    };
  }

  return {
    status: "dry_run",
    summary: "A legacy/V2 structure was detected; Recorder must perform the semantic migration to V3.",
    legacyPaths,
    targetStructure: ["llmdoc/meta.json", "llmdoc/architecture.mdx", "llmdoc/<topic>/*.mdx (plain directories, no index.mdx entry nodes)"],
    requiresRecorderSemanticMigration: true,
    notes: [
      hasV3Meta ? "Some V3 markers exist, but legacy structure remains; reconcile the boundary before migration." : "No complete V3 ledger was found; create a new meta.json baseline.",
      legacyPaths.includes("state/sync.md") ? "Migrate state/sync.md to meta.json baseline.revision." : "No state/sync.md watermark was found."
    ]
  };
}

interface UpgradeReport {
  status: "no_change" | "dry_run";
  summary: string;
  legacyPaths: string[];
  targetStructure: string[];
  requiresRecorderSemanticMigration: boolean;
  notes: string[];
}

function walkFiles(currentDir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
    const absolutePath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(absolutePath));
    } else if (entry.isFile()) {
      results.push(absolutePath);
    }
  }
  return results;
}
