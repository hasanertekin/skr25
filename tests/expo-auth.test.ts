import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("Expo authentication", () => {
  it.skipIf(!process.env.EXPO_TOKEN)("accepts the configured Expo token for the linked project", () => {
    const cli = ["--yes", "eas-cli@latest"];
    const whoami = execFileSync("npx", [...cli, "whoami", "--non-interactive"], {
      encoding: "utf8",
      timeout: 20_000,
      env: process.env,
    });
    expect(whoami.trim()).not.toBe("");
    const projectInfo = execFileSync("npx", [...cli, "project:info", "--non-interactive"], {
      encoding: "utf8",
      timeout: 20_000,
      env: process.env,
    });
    expect(projectInfo).toContain("hasanertekin25s-team");
  }, 30_000);
});
