#!/usr/bin/env node
/**
 * Warns when a commit both deletes a significant number of lines from
 * src/app/api/** or prisma/schema.prisma AND touches files unrelated to
 * that deletion (e.g. a different feature area, UI components, docs).
 *
 * This does not block the commit — it prints a warning and exits 0, unless
 * BLOCK_ON_BUNDLED_DELETE=1 is set, in which case it exits 1 so a git hook
 * can refuse the commit.
 *
 * Usage:
 *   node scripts/check-bundled-deletion.js          # check staged changes
 *   node scripts/check-bundled-deletion.js <ref>     # check changes vs <ref>, e.g. HEAD~1
 *
 * To wire this in as a real pre-commit hook (manual — not installed by
 * default, see AGENTS.md §11 discussion):
 *   cp scripts/check-bundled-deletion.js .git/hooks/pre-commit
 *   chmod +x .git/hooks/pre-commit
 * (On Windows/Git Bash, .git/hooks/pre-commit must have a shebang line and
 * be executable via Git Bash; the shebang above already covers that.)
 */

const { execSync } = require("child_process");

const DELETION_LINE_THRESHOLD = 30; // lines deleted from a sensitive path to trigger the check
const SENSITIVE_PATH_PATTERNS = [/^src\/app\/api\//, /^prisma\/schema\.prisma$/];

// Paths that count as "related" to a deletion in a sensitive path even
// though they aren't inside src/app/api/ themselves — docs describing the
// same change, and tests for the same route, are expected to move together.
function isRelated(sensitiveFile, otherFile) {
  if (otherFile.startsWith("docs/")) return true;
  if (otherFile === "AGENTS.md" || otherFile === "CLAUDE.md") return true;

  // e.g. src/app/api/tenders/upload/route.ts <-> src/app/api/tenders/upload/route.test.ts
  const sensitiveDir = sensitiveFile.replace(/\/[^/]+$/, "");
  if (otherFile.startsWith(sensitiveDir + "/")) return true;

  return false;
}

function getRawDiff(ref) {
  const args = ref
    ? ["diff", "--numstat", `${ref}..HEAD`]
    : ["diff", "--cached", "--numstat"];
  return execSync(`git ${args.join(" ")}`, { encoding: "utf8" });
}

function parseNumstat(raw) {
  return raw
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [added, deleted, file] = line.split("\t");
      return {
        file,
        added: added === "-" ? 0 : parseInt(added, 10),
        deleted: deleted === "-" ? 0 : parseInt(deleted, 10),
      };
    });
}

function main() {
  const ref = process.argv[2];
  const raw = getRawDiff(ref);
  if (!raw.trim()) {
    process.exit(0);
  }

  const changes = parseNumstat(raw);

  const bigDeletions = changes.filter(
    (c) =>
      c.deleted >= DELETION_LINE_THRESHOLD &&
      SENSITIVE_PATH_PATTERNS.some((p) => p.test(c.file))
  );

  if (bigDeletions.length === 0) {
    process.exit(0);
  }

  const unrelated = changes.filter(
    (c) =>
      !bigDeletions.some((d) => d.file === c.file) &&
      !bigDeletions.some((d) => isRelated(d.file, c.file))
  );

  if (unrelated.length === 0) {
    process.exit(0);
  }

  console.warn("");
  console.warn("⚠️  Possible bundled destructive commit detected.");
  console.warn("");
  console.warn("This commit deletes a significant number of lines from a sensitive path:");
  for (const d of bigDeletions) {
    console.warn(`  - ${d.file} (-${d.deleted} lines)`);
  }
  console.warn("");
  console.warn("...and also touches files that don't look related to that deletion:");
  for (const u of unrelated.slice(0, 20)) {
    console.warn(`  - ${u.file} (+${u.added}/-${u.deleted})`);
  }
  if (unrelated.length > 20) {
    console.warn(`  ...and ${unrelated.length - 20} more`);
  }
  console.warn("");
  console.warn("If this deletion and the other changes are genuinely one logical change,");
  console.warn("ignore this. If not, consider splitting into separate commits — see");
  console.warn("AGENTS.md §11 (Agent operating constraints).");
  console.warn("");

  if (process.env.BLOCK_ON_BUNDLED_DELETE === "1") {
    console.error("BLOCK_ON_BUNDLED_DELETE=1 is set — refusing this commit.");
    console.error("Split the commit, or re-run without that env var to bypass.");
    process.exit(1);
  }

  process.exit(0);
}

main();
