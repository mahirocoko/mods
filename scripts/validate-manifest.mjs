import {
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from "node:fs";
import {
  isAbsolute,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const packagePath = resolve(repoRoot, "package.json");
const errors = [];

const EXPECTED_MODS = [
  "./mods/mahiro-user-timestamps.ts",
  "./mods/mahiro-herdr-lifecycle.ts",
  "./mods/mahiro-goal.ts",
  "./mods/mahiro-code-evidence.ts",
  "./mods/mahiro-ux-workflow.ts",
  "./mods/mahiro-code-map.ts",
  "./mods/mahiro-execution-run.ts",
  "./mods/rtk-control.ts",
  "./mods/statusline.tsx",
  "./mods/mahiro-mcp-proxy.js",
];
const KNOWN_CAPABILITIES = new Set([
  "tools",
  "commands",
  "providers",
  "permissions",
  "events.lifecycle",
  "events.turns",
  "events.tools",
  "events.llm",
  "events.compact",
  "ui.panels",
]);
const EXPECTED_CAPABILITIES = new Set([
  "commands",
  "tools",
  "permissions",
  "events.lifecycle",
  "events.turns",
  "events.tools",
  "events.llm",
  "events.compact",
  "ui.panels",
]);
const SKIPPED_DIRECTORIES = new Set([
  ".git",
  ".agent-state",
  ".letta",
  "node_modules",
  "dist",
  "coverage",
]);
const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const SAFE_MOD_PATH = /^\.\/(?:[A-Za-z0-9][A-Za-z0-9._-]*\/)*[A-Za-z0-9][A-Za-z0-9._-]*\.(?:js|mjs|ts|tsx)$/;

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function addError(message) {
  errors.push(message);
}

function hasDuplicates(values) {
  return new Set(values).size !== values.length;
}

function sameArray(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameSet(left, right) {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

function isInsideRepo(filePath) {
  const pathFromRoot = relative(repoRoot, filePath);
  return pathFromRoot !== ".." && !pathFromRoot.startsWith(`..${sep}`) && !isAbsolute(pathFromRoot);
}

function validateModPath(modPath) {
  if (typeof modPath !== "string" || !SAFE_MOD_PATH.test(modPath)) {
    addError(`letta.mods entry ${JSON.stringify(modPath)} must be an exact safe ./ relative .js, .mjs, .ts, or .tsx path.`);
    return;
  }

  const absolutePath = resolve(repoRoot, modPath);
  if (!isInsideRepo(absolutePath)) {
    addError(`letta.mods entry ${JSON.stringify(modPath)} resolves outside the repository.`);
    return;
  }

  try {
    const segments = modPath.slice(2).split("/");
    let currentPath = repoRoot;
    for (const segment of segments) {
      currentPath = resolve(currentPath, segment);
      if (lstatSync(currentPath).isSymbolicLink()) {
        addError(`letta.mods entry ${JSON.stringify(modPath)} must not contain symlinks.`);
        return;
      }
    }

    const stat = lstatSync(absolutePath);
    if (!stat.isFile()) {
      addError(`letta.mods entry ${JSON.stringify(modPath)} must exist as a regular file.`);
      return;
    }

    if (!isInsideRepo(realpathSync(absolutePath))) {
      addError(`letta.mods entry ${JSON.stringify(modPath)} resolves outside the repository.`);
    }
  } catch (error) {
    addError(`letta.mods entry ${JSON.stringify(modPath)} is not an accessible regular file: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function readRequiredFile(relativePath) {
  const absolutePath = resolve(repoRoot, relativePath);
  try {
    const stat = lstatSync(absolutePath);
    if (!stat.isFile()) {
      addError(`${relativePath} must exist as a file.`);
      return null;
    }
    return readFileSync(absolutePath, "utf8");
  } catch {
    addError(`${relativePath} must exist.`);
    return null;
  }
}

function unquoteFrontmatterValue(value) {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2
    && ((trimmed.startsWith('"') && trimmed.endsWith('"'))
      || (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function validateModFrontmatter(contents) {
  if (contents === null) return;
  const match = contents.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) {
    addError("MOD.md must start with YAML frontmatter.");
    return;
  }

  const fields = new Map();
  for (const line of match[1].split(/\r?\n/)) {
    const field = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*?)\s*$/);
    if (field) fields.set(field[1], unquoteFrontmatterValue(field[2]));
  }

  if (!isNonEmptyString(fields.get("name"))) {
    addError("MOD.md frontmatter name must be non-empty.");
  }
  if (!isNonEmptyString(fields.get("description"))) {
    addError("MOD.md frontmatter description must be non-empty.");
  }
}

function isForbiddenSourcePath(relativePath) {
  const normalized = relativePath.replaceAll("\\", "/");
  const segments = normalized.split("/");
  const lowerSegments = segments.map((segment) => segment.toLowerCase());
  const basename = lowerSegments.at(-1) ?? "";

  if (lowerSegments.includes("backups")) return "files under backups/ are runtime-only";
  if (basename.startsWith(".env") && basename !== ".env.example") return ".env files other than .env.example are forbidden";
  if (basename === ".mcp.json") return ".mcp.json is runtime-only";
  if (basename === "settings.json" || basename === "settings.local.json") return `${basename} is runtime-only`;
  if (basename.endsWith(".state.json")) return "*.state.json files are runtime-only";
  if (basename.endsWith(".events.ndjson")) return "*.events.ndjson files are runtime-only";
  if (basename === "cache.json") return "cache.json is runtime-only";
  if (basename === "packages.json") return "packages.json is runtime-only";
  if (
    lowerSegments.length >= 2
    && lowerSegments.at(-2) === "diagnostics"
    && basename === "latest.json"
  ) {
    return "diagnostics/latest.json is runtime-only";
  }

  const timestamp = /(?:19|20)\d{2}[-_]?\d{2}[-_]?\d{2}(?:[T._-]?\d{2}(?:[-_:]?\d{2}){1,2})?|\d{10,13}/i;
  if (basename.includes(".bak") && timestamp.test(basename)) {
    return "timestamped *.bak* files are runtime-only";
  }

  return null;
}

function inspectSourceCandidates(directory = repoRoot, prefix = "") {
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch (error) {
    addError(`Could not inspect repository path ${prefix || "."}: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }

  for (const entry of entries) {
    if (entry.isDirectory() && SKIPPED_DIRECTORIES.has(entry.name)) continue;

    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const forbiddenReason = isForbiddenSourcePath(relativePath);
    if (forbiddenReason) {
      addError(`Forbidden source path ${JSON.stringify(relativePath)}: ${forbiddenReason}.`);
    }

    if (entry.isDirectory()) {
      inspectSourceCandidates(resolve(directory, entry.name), relativePath);
    }
  }
}

let packageJson = null;
try {
  packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
  if (!isObject(packageJson)) {
    addError("package.json root must be a JSON object.");
    packageJson = null;
  }
} catch (error) {
  addError(`package.json must contain valid JSON: ${error instanceof Error ? error.message : String(error)}`);
}

let modCount = 0;
let capabilityCount = 0;

if (packageJson) {
  if (!isNonEmptyString(packageJson.name)) addError("package.json name must be non-empty.");
  if (!isNonEmptyString(packageJson.version)) addError("package.json version must be non-empty.");
  if (packageJson.type !== "module") addError('package.json type must equal "module".');

  if (!Array.isArray(packageJson.keywords)) {
    addError("package.json keywords must be an array.");
  } else {
    for (const keyword of ["letta-package", "letta-mod"]) {
      if (!packageJson.keywords.includes(keyword)) addError(`package.json keywords must include ${JSON.stringify(keyword)}.`);
    }
  }

  if (!Array.isArray(packageJson.files)) {
    addError("package.json files must be an allowlist array.");
  } else {
    for (const allowedPath of ["README.md", "MOD.md", "docs/usage-th.md", "THIRD_PARTY_NOTICES.md", "LICENSES", "mods"]) {
      if (!packageJson.files.includes(allowedPath)) addError(`package.json files must include ${JSON.stringify(allowedPath)}.`);
    }
  }

  const letta = packageJson.letta;
  if (!isObject(letta)) {
    addError("package.json#letta must be an object.");
  } else {
    if (letta.manifestVersion !== 1) addError("letta.manifestVersion must equal 1.");

    if (!Array.isArray(letta.mods) || letta.mods.length === 0) {
      addError("letta.mods must be a non-empty array.");
    } else {
      modCount = letta.mods.length;
      if (hasDuplicates(letta.mods)) addError("letta.mods entries must be unique.");
      for (const modPath of letta.mods) validateModPath(modPath);
      if (!sameArray(letta.mods, EXPECTED_MODS)) {
        addError(`letta.mods must exactly match the current bundle entries: ${EXPECTED_MODS.join(", ")}.`);
      }
    }

    if (!Array.isArray(letta.capabilities)) {
      addError("letta.capabilities must be an array.");
    } else {
      capabilityCount = letta.capabilities.length;
      if (hasDuplicates(letta.capabilities)) addError("letta.capabilities entries must be unique.");
      for (const capability of letta.capabilities) {
        if (typeof capability !== "string" || !KNOWN_CAPABILITIES.has(capability)) {
          addError(`Unknown letta capability ${JSON.stringify(capability)}.`);
        }
      }
      if (!sameSet(new Set(letta.capabilities), EXPECTED_CAPABILITIES)) {
        addError(`letta.capabilities must exactly match the current bundle capability union: ${[...EXPECTED_CAPABILITIES].join(", ")}.`);
      }
    }

    if (!isObject(letta.engines) || letta.engines.lettaCodeCli !== ">=0.28.18") {
      addError('letta.engines.lettaCodeCli must equal ">=0.28.18".');
    }
  }

  if (!isObject(packageJson.dependencies)) {
    addError("package.json dependencies must be an object.");
  } else {
    if (packageJson.dependencies["@modelcontextprotocol/sdk"] !== "1.29.0") {
      addError("@modelcontextprotocol/sdk must be pinned exactly to 1.29.0.");
    }
    for (const [dependency, spec] of Object.entries(packageJson.dependencies)) {
      if (typeof spec !== "string" || !EXACT_VERSION.test(spec)) {
        addError(`Dependency ${JSON.stringify(dependency)} must use an exact version; received ${JSON.stringify(spec)}.`);
      }
    }
  }

  if (!isObject(packageJson.devDependencies)) {
    addError("package.json devDependencies must be an object.");
  } else {
    if (packageJson.devDependencies.esbuild !== "0.28.1") {
      addError("esbuild must be pinned exactly to 0.28.1.");
    }
    for (const [dependency, spec] of Object.entries(packageJson.devDependencies)) {
      if (typeof spec !== "string" || !EXACT_VERSION.test(spec)) {
        addError(`Dev dependency ${JSON.stringify(dependency)} must use an exact version; received ${JSON.stringify(spec)}.`);
      }
    }
  }
}

readRequiredFile("README.md");
readRequiredFile("docs/usage-th.md");
validateModFrontmatter(readRequiredFile("MOD.md"));
inspectSourceCandidates();

if (errors.length > 0) {
  console.error("Manifest validation failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Manifest valid: ${modCount} mods, ${capabilityCount} capabilities.`);
}
