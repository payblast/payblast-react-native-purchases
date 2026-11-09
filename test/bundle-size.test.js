import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("shipped JS stays under the size budget without inlined TypeScript helpers", () => {
  const result = spawnSync(process.execPath, ["scripts/check-bundle-size.js"], {
    cwd: join(dirname(fileURLToPath(import.meta.url)), ".."),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /no inlined TypeScript helpers/);
});

test("src is native ESM async/await with helpers imported once", () => {
  const srcDir = join(dirname(fileURLToPath(import.meta.url)), "../src");
  const files = readdirSync(srcDir).filter((name) => name.endsWith(".js"));
  const helperImports = files.filter((name) => readFileSync(join(srcDir, name), "utf8").includes('from "./prices.js"'));
  assert.ok(files.includes("prices.js"));
  assert.ok(helperImports.length >= 1);
  for (const name of files) {
    const source = readFileSync(join(srcDir, name), "utf8");
    assert.equal(/function __awaiter/.test(source), false, `${name} inlines TypeScript helpers`);
    assert.equal(/function __generator/.test(source), false, `${name} inlines TypeScript helpers`);
  }
});
