import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Enforces the feature layout described in CLAUDE.md.
const featuresDir = join(process.cwd(), "src", "features");
const requiredDirs = ["components", "api", "db", "hooks"];
const requiredFiles = ["types.ts", "index.ts"];

const features = readdirSync(featuresDir).filter((name) =>
  statSync(join(featuresDir, name)).isDirectory(),
);

describe("feature folder structure", () => {
  it("has at least one feature", () => {
    expect(features.length).toBeGreaterThan(0);
  });

  it.each(features)("%s is kebab-case", (feature) => {
    expect(feature).toMatch(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/);
  });

  it.each(features)("%s has the required subfolders and files", (feature) => {
    const root = join(featuresDir, feature);
    for (const dir of requiredDirs) {
      expect(existsSync(join(root, dir)), `${feature}/${dir}/ is missing`).toBe(true);
    }
    for (const file of requiredFiles) {
      expect(existsSync(join(root, file)), `${feature}/${file} is missing`).toBe(true);
    }
  });
});
