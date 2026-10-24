// Lets `node --test` import server modules: Next.js supplies "server-only" itself, so
// outside Next it is mapped to an empty module.
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "server-only") return { url: "data:text/javascript,export {};", shortCircuit: true };
    return next(specifier, context);
  },
});
