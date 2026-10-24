// Lets `node --test` import the app's server modules outside Next.js:
// - "server-only" (supplied by Next itself) becomes an empty module;
// - the "@/..." alias from jsconfig.json resolves to the app root.
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "server-only") return { url: "data:text/javascript,export {};", shortCircuit: true };
    if (specifier.startsWith("@/")) {
      const base = join(root, specifier.slice(2));
      const file = existsSync(base) && !existsSync(`${base}.js`) ? base : `${base}.js`;
      return next(pathToFileURL(file).href, context);
    }
    return next(specifier, context);
  },
});
