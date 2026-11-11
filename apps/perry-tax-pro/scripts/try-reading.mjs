// Local check of the document reader against a real model, with a fictional document.
// Usage: SERVICE_ACCESS_TOKEN=$(gcloud auth print-access-token) node --import ./test/node-hooks.mjs scripts/try-reading.mjs file.pdf [provider]
import { readFileSync } from "node:fs";
import { detectFormType, readFormFile } from "../lib/document-reading.js";

const [file, provider = "vertex"] = process.argv.slice(2);
const bytes = readFileSync(file);
const mime = file.endsWith(".pdf") ? "application/pdf" : file.endsWith(".png") ? "image/png" : "image/jpeg";
const token = process.env.SERVICE_ACCESS_TOKEN;
const type = await detectFormType({ mime, bytes }, { provider, token });
console.log("detected:", type);
if (type !== "UNKNOWN") console.log(JSON.stringify(await readFormFile({ type, mime, bytes }, { provider, token }), null, 2));
