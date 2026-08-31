import { describe, expect, test } from "vitest";

import { runCli } from "../src/cli.js";
import { createFixture, writeRepoFile } from "./helpers.js";

interface SearchPayload {
  searchMode: "lexical" | "cjk-bigram-fallback";
  results: Array<{ path: string; score: number }>;
}

describe("CJK search", () => {
  test("segments natural Chinese queries without requiring manual spaces", async () => {
    const rootDir = createFixture();
    writeRepoFile(
      rootDir,
      "llmdoc/mock-world/traffic-control.mdx",
      `---
description: 终端流量按权重分摊，限速由令牌桶生效。
kind: guide
---

# 流量控制

终端流量按权重分摊。系统通过令牌桶实施限速，配置保存后立即生效。
`
    );

    const naturalQuestion = await runCli(["--json", "search", "限速是怎么生效的"], rootDir);
    const naturalPayload = JSON.parse(naturalQuestion.stdout) as SearchPayload;
    expect(naturalQuestion.exitCode).toBe(0);
    expect(naturalPayload.searchMode).toBe("lexical");
    expect(naturalPayload.results[0]?.path).toBe("llmdoc/mock-world/traffic-control.mdx");

    const conceptQuery = await runCli(["--json", "search", "终端速率分摊"], rootDir);
    const conceptPayload = JSON.parse(conceptQuery.stdout) as SearchPayload;
    expect(conceptQuery.exitCode).toBe(0);
    expect(conceptPayload.searchMode).toBe("lexical");
    expect(conceptPayload.results[0]?.path).toBe("llmdoc/mock-world/traffic-control.mdx");
  });

  test("prefers exact phrases over partial lexical matches", async () => {
    const rootDir = createFixture();
    writeRepoFile(
      rootDir,
      "llmdoc/ranking/exact.mdx",
      `---
description: 终端速率分摊的精确说明。
kind: reference
---

# 精确命中

终端速率分摊。
`
    );
    writeRepoFile(
      rootDir,
      "llmdoc/ranking/partial.mdx",
      `---
description: 终端流量的分摊说明。
kind: reference
---

# 部分命中

终端流量按权重分摊。
`
    );

    const result = await runCli(["--json", "search", "终端速率分摊"], rootDir);
    const payload = JSON.parse(result.stdout) as SearchPayload;
    expect(payload.results[0]?.path).toBe("llmdoc/ranking/exact.mdx");
    expect(payload.results[0]!.score).toBeGreaterThan(payload.results[1]!.score);
  });

  test("uses an annotated bigram fallback when lexical terms have no hits", async () => {
    const rootDir = createFixture();
    writeRepoFile(
      rootDir,
      "llmdoc/devices/throughput.mdx",
      `---
description: 吞吐限制的配置规则。
kind: reference
---

# 吞吐限制

系统通过配额设置吞吐限制。
`
    );

    const jsonResult = await runCli(["--json", "search", "吞吐量"], rootDir);
    const payload = JSON.parse(jsonResult.stdout) as SearchPayload;
    expect(jsonResult.exitCode).toBe(0);
    expect(payload.searchMode).toBe("cjk-bigram-fallback");
    expect(payload.results[0]?.path).toBe("llmdoc/devices/throughput.mdx");

    const textResult = await runCli(["search", "吞吐量"], rootDir);
    expect(textResult.stdout).toContain("CJK bigram fallback was used");

    const noisyLongQuery = await runCli(["--json", "search", "吞吐量完全未知"], rootDir);
    const noisyPayload = JSON.parse(noisyLongQuery.stdout) as SearchPayload;
    expect(noisyPayload.searchMode).toBe("cjk-bigram-fallback");
    expect(noisyPayload.results).toEqual([]);
  });

  test("keeps existing single-term Chinese and Latin search behavior", async () => {
    const rootDir = createFixture();

    const chinese = await runCli(["--json", "search", "重试"], rootDir);
    const chinesePayload = JSON.parse(chinese.stdout) as SearchPayload;
    expect(chinesePayload.searchMode).toBe("lexical");
    expect(chinesePayload.results.some((entry) => entry.path === "llmdoc/api-client/retry-policy.mdx")).toBe(true);

    const latin = await runCli(["--json", "search", "retry"], rootDir);
    const latinPayload = JSON.parse(latin.stdout) as SearchPayload;
    expect(latinPayload.searchMode).toBe("lexical");
    expect(latinPayload.results.some((entry) => entry.path === "llmdoc/api-client/retry-policy.mdx")).toBe(true);
  });
});
