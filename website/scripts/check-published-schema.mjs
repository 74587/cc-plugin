import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const sourcePath = fileURLToPath(new URL("../../cli/schemas/config.schema.json", import.meta.url));
const publishedPath = fileURLToPath(new URL("../dist/schemas/config.schema.json", import.meta.url));
const source = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
const published = JSON.parse(fs.readFileSync(publishedPath, "utf8"));

assert.deepEqual(published, source, "Published config schema differs from the CLI source schema.");
assert.equal(
  published.$id,
  "https://llmdoc.tokenroll.ai/schemas/config.schema.json",
  "Published config schema uses an unexpected canonical URL."
);

console.log("published config schema check: ok");
