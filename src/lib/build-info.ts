import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import pkg from "../../package.json";

function readCommitSha(): string {
  const fromEnv =
    process.env.RAILWAY_GIT_COMMIT_SHA ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.GIT_COMMIT_SHA;
  if (fromEnv) return fromEnv;

  try {
    const gitDir = join(process.cwd(), ".git");
    const head = readFileSync(join(gitDir, "HEAD"), "utf8").trim();
    const refMatch = head.match(/^ref: (.+)$/);
    if (!refMatch) return head;
    return readFileSync(join(gitDir, refMatch[1]), "utf8").trim();
  } catch {
    return "unknown";
  }
}

const fullCommit = readCommitSha();

export const buildInfo = {
  version: pkg.version,
  commit: fullCommit === "unknown" ? "unknown" : fullCommit.slice(0, 7),
  commitFull: fullCommit,
};
