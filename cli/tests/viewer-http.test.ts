import fs from "node:fs";
import path from "node:path";

import { describe, expect, test } from "vitest";

import { startViewerServer } from "../src/commands/serve.js";
import type { ViewerStateDto } from "../src/lib/viewer-state.js";
import { commitAll, createFixture, writeRepoFile } from "./helpers.js";

describe("viewer HTTP API", () => {
  test("serves only the explicit local app/API surface", { timeout: 20000 }, async () => {
    const rootDir = createFixture();
    const server = await startViewerServer(rootDir, 0);
    try {
      expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);

      const home = await fetch(`${server.url}/`);
      expect(home.status).toBe(200);
      expect(home.headers.get("content-type")).toContain("text/html");
      expect(home.headers.get("content-security-policy")).toContain("script-src 'self'");
      expect(home.headers.get("referrer-policy")).toBe("no-referrer");
      expect(home.headers.get("x-content-type-options")).toBe("nosniff");
      expect(home.headers.get("x-frame-options")).toBe("DENY");
      expect(await home.text()).toContain("llmdoc viewer");

      const head = await fetch(`${server.url}/`, { method: "HEAD" });
      expect(head.status).toBe(200);
      expect(await head.text()).toBe("");

      for (const assetName of [
        "viewer.css",
        "viewer-model.js",
        "viewer-graph.js",
        "viewer-detail.js",
        "viewer-app.js",
        "marked.js"
      ]) {
        const asset = await fetch(`${server.url}/assets/${assetName}`);
        expect(asset.status, assetName).toBe(200);
        expect((await asset.text()).length, assetName).toBeGreaterThan(0);
      }

      const doc = await fetch(`${server.url}/api/doc?path=${encodeURIComponent("api-client/retry-policy.mdx")}`);
      expect(doc.status).toBe(200);
      await expect(doc.json()).resolves.toMatchObject({
        path: "api-client/retry-policy.mdx",
        frontmatter: { kind: "guide" }
      });

      for (const unsafePath of ["/assets/package.json", "/assets/%2e%2e%2fpackage.json", "/api/doc?path=../../etc/passwd"]) {
        const response = await fetch(`${server.url}${unsafePath}`);
        expect(response.status, unsafePath).toBe(404);
      }

      const post = await fetch(`${server.url}/api/state`, { method: "POST" });
      expect(post.status).toBe(405);
      expect(post.headers.get("allow")).toBe("GET, HEAD");
    } finally {
      await server.close();
    }
  });

  test("reports metadata-only follow-ups as knowledge-clean", { timeout: 20000 }, async () => {
    const rootDir = createFixture();
    fs.appendFileSync(path.join(rootDir, "llmdoc", "meta.json"), "\n");
    commitAll(rootDir, "metadata follow-up");

    const server = await startViewerServer(rootDir, 0);
    try {
      const metadataOnlyState = await readState(server.url);
      expect(metadataOnlyState.baseline.behindHead).toBe(1);
      expect(metadataOnlyState.baseline.relevantBehindHead).toBe(0);
      expect(metadataOnlyState.baseline.metadataOnlyBehind).toBe(true);
      expect(metadataOnlyState.nodes.every((node) => node.status === "fresh")).toBe(true);

      writeRepoFile(rootDir, "src/api/retry.ts", "export function isRetryable() { return false; }\n");
      commitAll(rootDir, "source change");

      const sourceChangedState = await readState(server.url);
      expect(sourceChangedState.baseline.behindHead).toBe(2);
      expect(sourceChangedState.baseline.relevantBehindHead).toBe(1);
      expect(sourceChangedState.baseline.metadataOnlyBehind).toBe(false);
      expect(sourceChangedState.nodes.some((node) => node.status === "impacted")).toBe(true);
    } finally {
      await server.close();
    }
  });
});

async function readState(serverUrl: string): Promise<ViewerStateDto> {
  const response = await fetch(`${serverUrl}/api/state`);
  expect(response.status).toBe(200);
  return (await response.json()) as ViewerStateDto;
}
