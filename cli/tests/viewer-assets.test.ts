import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";

import { describe, expect, test } from "vitest";

// Browser assets stay framework-free and are published as native ES modules.
// @ts-expect-error assets intentionally sit outside the TypeScript build root
import { buildDocumentGraph, buildTopicGraph, createTopicColors, matchesSearch, resolveRelativeDocumentPath } from "../assets/viewer-model.js";
// @ts-expect-error assets intentionally sit outside the TypeScript build root
import { layoutGraph } from "../assets/viewer-graph.js";

function documentNode(path: string, topic: string | null, status = "fresh") {
  return {
    path,
    title: path,
    topic,
    kind: "guide",
    description: `description for ${path}`,
    estimatedTokens: 100,
    lineCount: 20,
    codePaths: [],
    status
  };
}

describe("viewer browser models", () => {
  test("published viewer interface strings are English", () => {
    for (const fileName of ["viewer.html", "viewer-app.js", "viewer-detail.js", "viewer-graph.js"]) {
      const content = fs.readFileSync(path.resolve(__dirname, "..", "assets", fileName), "utf8");
      expect(content).not.toMatch(/[\p{Script=Han}]/u);
    }
  });

  test("topic graph deterministically aggregates cross-topic relations", () => {
    const state = {
      nodes: [
        documentNode("alpha/a.mdx", "alpha"),
        documentNode("alpha/b.mdx", "alpha", "impacted"),
        documentNode("beta/c.mdx", "beta")
      ],
      edges: [
        { from: "beta/c.mdx", to: "alpha/a.mdx", type: "related" },
        { from: "alpha/b.mdx", to: "beta/c.mdx", type: "requires" },
        { from: "alpha/a.mdx", to: "alpha/b.mdx", type: "link" }
      ]
    };
    const graph = buildTopicGraph(state, createTopicColors(state.nodes));

    expect(graph.nodes.map((node: any) => node.id)).toEqual(["topic:alpha", "topic:beta"]);
    expect(graph.nodes[0].status).toBe("impacted");
    expect(graph.edges).toEqual([
      { from: "topic:alpha", to: "topic:beta", count: 2, style: "aggregate", width: 3.6 }
    ]);
  });

  test("document graph and search keep the public state projection intact", () => {
    const nodes = [documentNode("api/retry.mdx", "api")];
    const state = {
      nodes,
      edges: [{ from: "api/retry.mdx", to: "root.mdx", type: "requires" }]
    };
    const graph = buildDocumentGraph(state, createTopicColors(nodes));

    expect(graph.nodes[0]).toMatchObject({ id: "api/retry.mdx", cluster: "api", label: "retry" });
    expect(graph.edges[0]).toMatchObject({ style: "requires" });
    expect(matchesSearch(nodes[0], "RETRY")).toBe(true);
    expect(matchesSearch(nodes[0], "missing")).toBe(false);
    expect(resolveRelativeDocumentPath("api/retry.mdx", "../architecture.mdx#contract")).toBe("architecture.mdx");
  });

  test("layout is deterministic, bounded, and remains responsive for a large graph", () => {
    const state = {
      nodes: Array.from({ length: 1000 }, (_, index) => documentNode(`topic-${index % 20}/doc-${index}.mdx`, `topic-${index % 20}`)),
      edges: Array.from({ length: 999 }, (_, index) => ({
        from: `topic-${index % 20}/doc-${index}.mdx`,
        to: `topic-${(index + 1) % 20}/doc-${index + 1}.mdx`,
        type: index % 2 ? "related" : "requires"
      }))
    };
    const graph = buildDocumentGraph(state, createTopicColors(state.nodes));
    const startedAt = performance.now();
    const first = layoutGraph(graph, 1200, 800, "docs");
    const elapsed = performance.now() - startedAt;
    const second = layoutGraph(graph, 1200, 800, "docs");

    expect(elapsed).toBeLessThan(1000);
    expect(first.nodes).toHaveLength(1000);
    expect(first.nodes.every((node: any) => Number.isFinite(node.x) && Number.isFinite(node.y))).toBe(true);
    expect(first.nodes.every((node: any) => node.x >= 54 && node.x <= 1146 && node.y >= 54 && node.y <= 746)).toBe(true);
    expect(first.nodes.map((node: any) => [node.x, node.y])).toEqual(second.nodes.map((node: any) => [node.x, node.y]));
  });
});
