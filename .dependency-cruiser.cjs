module.exports = {
  forbidden: [
    { name: "no-cycles", severity: "error", from: {}, to: { circular: true } },
    { name: "shared-does-not-import-pages", severity: "error", from: { path: "^src/(components|api|lib)/" }, to: { path: "^src/pages/" } },
    { name: "pages-do-not-import-pages", severity: "error", from: { path: "^src/pages/" }, to: { path: "^src/pages/" } },
    { name: "inventory-does-not-import-pages", severity: "error", from: { path: "^src/features/inventory/" }, to: { path: "^src/pages/" } },
    { name: "public-does-not-import-builder", severity: "error", from: { path: "^src/(pages/PublicLandingPage\\.tsx$|components/landing-page/)" }, to: { path: "^src/pages/LandingPageBuilderPage" } },
  ],
  options: { doNotFollow: { path: "node_modules" }, tsConfig: { fileName: "tsconfig.app.json" }, enhancedResolveOptions: { extensions: [".ts", ".tsx", ".js", ".jsx", ".json"], conditionNames: ["import", "default"] } },
};
