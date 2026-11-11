// Wraps the rules snippets in their service blocks so the emulators can load them.
// The output mirrors how the snippets sit inside the deployed SYGEPEC rules files.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, ".generated");
const indent = (text, pad) => text.split(/\r?\n/).map((line) => (line.trim() ? pad + line : "")).join("\n");
const snippet = (name) => readFileSync(join(here, "..", name), "utf8");

mkdirSync(out, { recursive: true });
writeFileSync(join(out, "firestore.rules"), `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
${indent(snippet("firestore.rules.snippet"), "    ")}

    match /{document=**} {
      allow read, write: if false;
    }
  }
}
`);
writeFileSync(join(out, "storage.rules"), `rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
${indent(snippet("storage.rules.snippet"), "    ")}

    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
`);
