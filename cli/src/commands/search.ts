import { paginate, paginationMetadata } from "../lib/pagination.js";
import { assertDocumentKind } from "../lib/doc-shape.js";
import { loadWorkspace } from "../lib/workspace.js";
import { OutputOptions } from "../types.js";
import { formatPaginationSummary } from "../lib/format.js";
import { SearchResult, searchDocuments } from "../lib/search.js";
import { estimateTokens } from "../lib/markdown.js";

interface SearchOptions extends OutputOptions {
  cwd: string;
  query: string;
  topic?: string;
  kind?: string;
}

export function runSearch(options: SearchOptions): unknown {
  const workspace = loadWorkspace(options.cwd);
  const kind = options.kind ? assertDocumentKind(options.kind) : undefined;
  const search = searchDocuments(workspace, options.query, {
    topic: options.topic,
    kind
  });
  const paginated = paginate({
    items: search.results,
    estimate: (entry) => estimateTokens(JSON.stringify(toPayload(entry))),
    options
  });

  if (options.json) {
    return {
      query: options.query,
      searchMode: search.mode,
      results: paginated.items.map(toPayload),
      pagination: paginationMetadata(paginated)
    };
  }

  const lines: string[] = [];
  if (search.mode === "cjk-bigram-fallback") {
    lines.push("note: 中文分词未命中，已使用 CJK bigram 降级检索。", "");
  }
  for (const entry of paginated.items) {
    lines.push(`llmdoc/${entry.document.llmdocPath}  [${entry.document.frontmatter.kind}]`);
    lines.push(`  ${entry.document.frontmatter.description}`);
    lines.push(`  ${entry.snippet}`);
    lines.push("");
  }
  lines.push(...formatPaginationSummary(paginated));
  return lines.join("\n");
}

function toPayload(entry: SearchResult): object {
  return {
    path: `llmdoc/${entry.document.llmdocPath}`,
    kind: entry.document.frontmatter.kind,
    description: entry.document.frontmatter.description,
    snippet: entry.snippet,
    score: entry.score
  };
}
