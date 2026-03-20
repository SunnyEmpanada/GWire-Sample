/**
 * Copy repo /spec into dist/spec so production bundles (e.g. Vercel serverless)
 * can load the OpenAPI file next to compiled JS without relying on monorepo layout.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(__dirname, "..");
const distSpec = path.join(serverRoot, "dist/spec");
const repoSpec = path.join(serverRoot, "../../spec");

fs.mkdirSync(distSpec, { recursive: true });
fs.cpSync(repoSpec, distSpec, { recursive: true });
console.log(`[copy-spec] ${repoSpec} -> ${distSpec}`);
