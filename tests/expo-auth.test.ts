import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("Expo authentication", () => {
  it("accepts the configured Expo token through EAS CLI", () => {
    if (!process.env.EXPO_TOKEN) throw new Error("EXPO_TOKEN is not configured");
    const output = execFileSync("npx", ["eas-cli", "whoami", "--non-interactive"], {
      encoding: "utf8",
      timeout: 20_000,
      env: process.env,
    });
    expect(output).toContain("authenticated using EXPO_TOKEN");
    expect(output).toContain("ertekin43s-team");
  }, 30_000);
});
