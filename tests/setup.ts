// Vitest setup: one shared CHANGELOG_CONFIG for the whole run so parallel
// suites that call loadConfig()/rewriteBody() don't race on process.env.
import { resetConfigCache } from "../src/lib/config.js";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const directory = mkdtempSync(join(tmpdir(), "changelog-core-vitest-"));
const configPath = join(directory, "config.json");
writeFileSync(
  configPath,
  JSON.stringify({
    issueKeys: ["A"],
    linearWorkspaceSlug: "rheged-studio",
  }),
);
process.env.CHANGELOG_CONFIG = configPath;
resetConfigCache();
