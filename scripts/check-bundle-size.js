import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const srcDir = join(root, "src");
const budgetBytes = 48 * 1024;
const tsHelpers = /function __(?:awaiter|generator|createBinding|exportStar|importDefault|importStar)\b/;

const files = readdirSync(srcDir).filter((name) => name.endsWith(".js"));
let total = 0;
const duplicatedHelpers = [];

for (const name of files) {
  const path = join(srcDir, name);
  const source = readFileSync(path, "utf8");
  total += statSync(path).size;
  if (tsHelpers.test(source)) duplicatedHelpers.push(name);
}

if (duplicatedHelpers.length) {
  console.error(`TypeScript helpers are inlined in: ${duplicatedHelpers.join(", ")}`);
  process.exit(1);
}

if (total > budgetBytes) {
  console.error(`src JS is ${total} bytes; budget is ${budgetBytes}`);
  process.exit(1);
}

console.log(`src JS ${total} bytes (budget ${budgetBytes}); no inlined TypeScript helpers`);
