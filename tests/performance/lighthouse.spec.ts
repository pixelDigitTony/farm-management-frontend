import { spawn } from "node:child_process";
import { chromium, expect, test } from "@playwright/test";

for (const profile of ["mobile", "desktop"]) {
  test(`Lighthouse ${profile}: five production-build runs`, async () => {
    const code = await new Promise<number | null>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        ["node_modules/@lhci/cli/src/cli.js", "autorun", "--config=lighthouserc.cjs"],
        {
          stdio: "inherit",
          env: { ...process.env, LH_PROFILE: profile, CHROME_PATH: chromium.executablePath() },
          timeout: 570_000,
        },
      );
      child.once("error", reject);
      child.once("close", resolve);
    });
    expect(code, `See artifacts/lighthouse-${profile} for scores and audit failures`).toBe(0);
  });
}
