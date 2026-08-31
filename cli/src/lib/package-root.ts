import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function packageRootFromImport(metaUrl: string): string {
  let current = path.dirname(fileURLToPath(metaUrl));
  while (true) {
    if (fs.existsSync(path.join(current, "package.json"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error(`Unable to locate the package root above ${metaUrl}.`);
    }
    current = parent;
  }
}
