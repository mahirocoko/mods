const FORBIDDEN = [
  "Generated with [Letta Code](https://letta.com)",
  "Co-Authored-By: Letta Code <noreply@letta.com>",
];

// Deliberately preserves the hook's lexical scope, not a shell/git parser.
function check(event) {
  const toolName = event?.toolName?.split(".").at(-1);
  if (!["Bash", "bash", "Shell", "shell", "ShellCommand", "shell_command", "exec_command"].includes(toolName)) return;
  const value = event.args?.command || event.args?.cmd || "";
  const command = Array.isArray(value) ? value.map(String).join(" ") : String(value);
  if (!/(^|[;&|()\n]\s*)git\s+commit\b/.test(command)) return;
  const found = FORBIDDEN.filter((pattern) => command.includes(pattern));
  if (!found.length) return;
  return {
    decision: "deny",
    reason: "Blocked git commit: commit message contains Letta attribution trailers that Mahiro's repos should not include:\n"
      + found.map((pattern) => `- ${pattern}`).join("\n")
      + "\nCreate the commit without generated-by or Co-Authored-By Letta lines.",
  };
}

export default function activate(letta) {
  if (letta.signal?.aborted) return;
  if (!letta.capabilities?.permissions || typeof letta.permissions?.register !== "function") {
    letta.diagnostics?.report?.({ severity: "warning", message: "Commit attribution guard inactive: permissions unavailable; retain the legacy hook." });
    return;
  }
  const dispose = letta.permissions.register({
    id: "mahiro-commit-attribution-guard",
    description: "Deny the legacy hook's inline git commit attribution patterns at approval and execution.",
    check,
  });
  return () => { if (!letta.signal?.aborted) dispose(); };
}

export const __testing = { check, FORBIDDEN };
