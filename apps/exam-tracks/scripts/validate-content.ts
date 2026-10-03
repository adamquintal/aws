// Fails (exit 1) on any content error: missing source, no correct answer,
// missing option notes, terms used before they are taught, bad source hosts.
// --strict also fails on warnings (e.g. topics with no content yet).
import { validateAll } from "../lib/content/validate";

const strict = process.argv.includes("--strict");
const issues = validateAll();
const errors = issues.filter((i) => i.level === "error");
const warnings = issues.filter((i) => i.level === "warning");

for (const i of issues) console.log(`${i.level === "error" ? "✖" : "⚠"} ${i.where}: ${i.message}`);
console.log(`\n${errors.length} error(s), ${warnings.length} warning(s)`);
if (errors.length || (strict && warnings.length)) process.exit(1);
