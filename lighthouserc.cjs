const desktop = process.env.LH_PROFILE === "desktop";
module.exports = {
  ci: {
    collect: {
      url: ["http://127.0.0.1:4173/site/test-farm", "http://127.0.0.1:4173/login"],
      numberOfRuns: 5,
      settings: desktop ? { preset: "desktop" } : {},
    },
    assert: {
      assertions: {
        "categories:performance": ["error", { minScore: 1, aggregationMethod: "median" }],
        "categories:accessibility": ["error", { minScore: 1, aggregationMethod: "median" }],
        "categories:best-practices": ["error", { minScore: 1, aggregationMethod: "median" }],
        "categories:seo": ["error", { minScore: 1, aggregationMethod: "median" }],
      },
    },
    upload: {
      target: "filesystem",
      outputDir: `artifacts/lighthouse-${desktop ? "desktop" : "mobile"}`,
    },
  },
};
