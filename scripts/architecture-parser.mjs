import { registerHooks } from "node:module";

// Only loaded by the architecture-check subprocess. Builds continue using TypeScript 7.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "typescript" || specifier.startsWith("typescript/"))
      return nextResolve(specifier.replace(/^typescript/, "typescript-parser"), context);
    return nextResolve(specifier, context);
  },
});
