import { spawn } from "node:child_process";

// Preserve the local hook's Python/shlex policy in this single packaged entry.
// No installed hook import, shell execution, target-file reads, or argument logs.
// CCC retains its existing external portable helpers and strict receipt contract.
const POLICY = String.raw`
import json, os, re, shlex, stat, subprocess, sys
from pathlib import Path, PurePosixPath

SENSITIVE_BASENAMES = {'.env', '.npmrc', '.pypirc', 'auth.json', 'credentials.json',
    'id_dsa', 'id_ecdsa', 'id_ecdsa_sk', 'id_ed25519', 'id_ed25519_sk', 'id_rsa', 'id_xmss', 'identity'}
SAFE_DOTENV_TEMPLATE_BASENAMES = {'.env.example', '.env.sample', '.env.template'}
SSH_SAFE_BASENAMES = {'authorized_keys', 'config', 'known_hosts', 'known_hosts.old'}
READ_COMMAND_BASENAMES = {'awk', 'base64', 'bat', 'cat', 'grep', 'head', 'hexdump',
    'less', 'more', 'openssl', 'rg', 'sed', 'strings', 'tail', 'xxd'}
SAFE_METADATA_COMMAND_BASENAMES = {'[', 'find', 'ls', 'stat', 'test'}
CCC_SKILL_DIR = Path(os.path.expanduser('~/.agents/skills/ccc'))
CCC_SYNC_SCRIPT = CCC_SKILL_DIR / 'scripts/sync-project-excludes.py'
CCC_PREFLIGHT_SCRIPT = CCC_SKILL_DIR / 'scripts/preflight.py'
CCC_STRICT_SCRIPT = CCC_SKILL_DIR / 'scripts/strict-gitleaks-scan.py'
CCC_GITLEAKS = Path(os.path.expanduser('~/.local/share/mahiro-ccc/gitleaks/8.30.1/gitleaks'))
CCC_GITLEAKS_SHA256 = 'ba52fb1bfabbcde42f032afad3d6e0b19dff8ed105229a16e7caa338bbc0e84f'
CCC_LOCAL_POLICY = Path('.cocoindex_code/ccc-security/local-deny-patterns.txt')
CCC_ALLOWLIST = Path('.cocoindex_code/ccc-security/allowlist.json')

def basename(value):
    normalized = value.replace('\\', '/').rstrip('/')
    return PurePosixPath(normalized).name if normalized else ''

def is_sensitive_path(value):
    normalized = value.replace('\\', '/')
    name = basename(value).lower()
    if not name or name in SAFE_DOTENV_TEMPLATE_BASENAMES:
        return False
    lower_path = normalized.lower()
    if (lower_path.startswith(('~/.ssh/', '.ssh/')) or '/.ssh/' in lower_path):
        if name not in SSH_SAFE_BASENAMES and not name.endswith('.pub'):
            return True
    if any(fragment in lower_path for fragment in ('/.letta/lc-local-backend/providers/', '/lc-local-backend/providers/')):
        return True
    return (name == '.env' or name.startswith('.env.') or name in SENSITIVE_BASENAMES
        or name.lower().endswith(('.key', '.pem', '.p12', '.pfx'))
        or name.lower().startswith(('credentials.', 'secret.', 'secrets.')))

def iter_strings(value):
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for child in value.values():
            yield from iter_strings(child)
    elif isinstance(value, list):
        for child in value:
            yield from iter_strings(child)

ENV_DUMP_PATTERNS = [re.compile(pattern) for pattern in (
    r'(^|[;&|()\s])printenv(\s|$)', r'(^|[;&|()\s])export\s+-p(\s|$)',
    r'(^|[;&|()\s])declare\s+-x(\s|$)', r'(^|[;&|()\s])set\s*($|[;&|()])',
    r'/proc/[^\s;&|()]+/environ')]

def strip_heredoc_bodies(command):
    lines, kept, i = command.splitlines(), [], 0
    marker_re = re.compile(r'''<<-?\s*['"]?([A-Za-z_][A-Za-z0-9_]*)['"]?''')
    while i < len(lines):
        line = lines[i]
        kept.append(line)
        match = marker_re.search(line)
        i += 1
        if not match:
            continue
        while i < len(lines) and lines[i].strip() != match.group(1):
            i += 1
        if i < len(lines):
            kept.append(lines[i])
            i += 1
    return '\n'.join(kept)

def shell_segments(command):
    try:
        lexer = shlex.shlex(command, posix=True, punctuation_chars=';&|()')
        lexer.whitespace_split = True
        lexer.commenters = ''
        tokens = list(lexer)
    except ValueError:
        return []
    segments, current = [], []
    for token in tokens:
        if token and all(char in ';|&()' for char in token):
            if current:
                segments.append(current)
                current = []
        else:
            current.append(token)
    if current:
        segments.append(current)
    return segments

def env_segment_dumps_environment(segment):
    if not segment or basename(segment[0]) != 'env':
        return False
    index = 1
    while index < len(segment):
        token = segment[index]
        if token in {'-u', '--unset', '-C', '--chdir', '-S', '--split-string'}:
            index += 2
            continue
        if token.startswith('-') or ('=' in token and not token.startswith(('/', './', '../', '~'))):
            index += 1
            continue
        return False
    return True

def command_dumps_environment(command):
    text = strip_heredoc_bodies(command)
    return any(p.search(text) for p in ENV_DUMP_PATTERNS) or any(
        env_segment_dumps_environment(s) for s in shell_segments(text))

CCC_READ_OR_INDEX_PATTERN = re.compile(
    r'''(^|[;&|()\s])["']?(?:[^\s;&|()"']*/)?ccc["']?\s+(?:index\b|grep\b|mcp\b|search\b[^\n;&|]*--refresh\b)''')
CCC_GATED_ACTION_PATTERN = re.compile(r'\b(?:index|grep|mcp)\b|\bsearch\b[^\n;&|]*--refresh\b', re.I)
# chr(96) keeps the shell backtick out of the enclosing JavaScript literal.
CCC_INDIRECTION_PATTERN = re.compile(
    r'\$\(|' + chr(96) + r'|\$(?:\{)?ccc(?:\})?|\beval\b|\balias\b|\bfunction\b|'
    r'\b(?:sh|bash|zsh|dash|fish)\b[^\n;&|]*\s-c\b|'
    r'\b(?:python|python3|node|ruby|perl)\b[^\n;&|]*\s(?:-c|-e)\b|'
    r'\b(?:command|type|which)\b[^\n;&|]*\bccc\b|'
    r'\b[A-Za-z_][A-Za-z0-9_]*\s*\(\s*\)\s*\{|'
    r'\b[A-Za-z_][A-Za-z0-9_]*\s*=\s*[^\n;&|]*\bccc\b', re.I)

def command_uses_ccc_file_access(command):
    text = strip_heredoc_bodies(command)
    if CCC_READ_OR_INDEX_PATTERN.search(text):
        return True
    for segment in shell_segments(text):
        for index, token in enumerate(segment):
            if basename(token) != 'ccc':
                continue
            expanded = os.path.expanduser(os.path.expandvars(token))
            if os.path.isabs(expanded) and os.path.isdir(expanded):
                continue
            index += 1
            while index < len(segment) and segment[index].startswith('-'):
                index += 1
            if index >= len(segment):
                continue
            subcommand = segment[index]
            if subcommand.startswith('$') or chr(96) in subcommand or subcommand in {'index', 'grep', 'mcp'}:
                return True
            if subcommand == 'search':
                args = segment[index + 1:]
                if '--refresh' in args or any(arg.startswith('$') or chr(96) in arg for arg in args):
                    return True
    return bool(re.search(r'(?<![A-Za-z0-9_./-])ccc(?![A-Za-z0-9_/-])', text, re.I)
        and CCC_INDIRECTION_PATTERN.search(text)
        and (CCC_GATED_ACTION_PATTERN.search(text)
            or re.search(r'\$(?:\{)?[A-Za-z_][A-Za-z0-9_]*(?:\})?', text)))

def tool_uses_ccc_mcp_indexing(tool_name, tool_input):
    lower = tool_name.lower()
    if 'mcp' not in lower:
        return False
    route = [lower]
    if isinstance(tool_input, dict):
        route += [tool_input[key].lower() for key in ('server', 'tool', 'name', 'action', 'operation', 'method')
            if isinstance(tool_input.get(key), str)]
    text = re.sub(r'[^a-z0-9]+', ' ', ' '.join(route))
    identifies_ccc = bool(re.search(r'\b(?:cocoindex|ccc)\b', text))
    indexing_action = bool(re.search(r'\b(?:index|indexing|refresh|grep)\b', text))
    if not indexing_action:
        candidates = [tool_input]
        if isinstance(tool_input, dict) and isinstance(tool_input.get('args'), str):
            try:
                candidates.append(json.loads(tool_input['args']))
            except json.JSONDecodeError:
                pass
        for candidate in candidates:
            if not isinstance(candidate, dict):
                continue
            for key in ('refresh', 'reindex', 'index'):
                value = candidate.get(key)
                if value is True or value == 1 or (isinstance(value, str) and value.lower() == 'true'):
                    indexing_action = True
    return bool(identifies_ccc and indexing_action)

def _real_regular_file(path):
    try:
        info = os.lstat(path)
        return stat.S_ISREG(info.st_mode) and not stat.S_ISLNK(info.st_mode)
    except OSError:
        return False

def _optional_control_path(root, relative):
    path = root / relative
    try:
        info = os.lstat(path)
    except FileNotFoundError:
        return None, None
    except OSError:
        return None, 'CCC control path cannot be inspected'
    if stat.S_ISLNK(info.st_mode) or not stat.S_ISREG(info.st_mode):
        return None, 'CCC control path is unsafe'
    return path, None

def _run_ccc_guard(command, timeout):
    try:
        return subprocess.run(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            timeout=timeout, check=False).returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        return False

def resolve_ccc_project_root(tool_input):
    raw = tool_input.get('workdir') or tool_input.get('cwd') if isinstance(tool_input, dict) else None
    start = Path(str(raw)).expanduser() if raw else Path.cwd()
    if not start.is_absolute():
        start = Path.cwd() / start
    try:
        result = subprocess.run(['git', '-C', str(start), 'rev-parse', '--show-toplevel'],
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=5, check=False)
    except (OSError, subprocess.TimeoutExpired):
        return None, 'CCC project root cannot be resolved'
    if result.returncode != 0:
        return None, 'CCC command must run inside a Git worktree'
    try:
        root = Path(result.stdout.decode('utf-8').strip())
        info = os.lstat(root)
    except (OSError, UnicodeDecodeError):
        return None, 'CCC project root metadata is malformed'
    if stat.S_ISLNK(info.st_mode) or not stat.S_ISDIR(info.st_mode):
        return None, 'CCC project root is unsafe'
    return root, None

def ccc_portable_security_issue(root):
    if any(not _real_regular_file(p) for p in (CCC_SYNC_SCRIPT, CCC_PREFLIGHT_SCRIPT, CCC_STRICT_SCRIPT, CCC_GITLEAKS)):
        return 'CCC portable security helper or pinned scanner is unavailable'
    local_policy, issue = _optional_control_path(root, CCC_LOCAL_POLICY)
    if issue:
        return issue
    allowlist, issue = _optional_control_path(root, CCC_ALLOWLIST)
    if issue:
        return issue
    shared = ['--project-root', str(root)]
    policy = ['--local-policy', str(local_policy)] if local_policy else []
    if not _run_ccc_guard(['/usr/bin/python3', str(CCC_SYNC_SCRIPT), *shared, *policy, '--check'], 30):
        return 'CCC project settings are missing or drifted from the portable V2 policy'
    if not _run_ccc_guard(['/usr/bin/python3', str(CCC_PREFLIGHT_SCRIPT), *shared, *policy, '--check-settings'], 30):
        return 'CCC filename-only project preflight did not pass'
    command = ['/usr/bin/python3', str(CCC_STRICT_SCRIPT), 'check', *shared, *policy,
        '--gitleaks', str(CCC_GITLEAKS), '--expected-binary-sha256', CCC_GITLEAKS_SHA256]
    if allowlist:
        command.extend(['--allowlist', str(allowlist)])
    if not _run_ccc_guard(command, 180):
        return 'CCC strict receipt is missing, stale, unsafe, or records findings'
    return None

def command_reads_sensitive_path(command):
    text = strip_heredoc_bodies(command)
    try:
        lexer = shlex.shlex(text, posix=True, punctuation_chars=';&|()')
        lexer.whitespace_split = True
        lexer.commenters = ''
        tokens = list(lexer)
    except ValueError:
        tokens = re.split(r'\s+', text)
    strip_chars = "'\" ,;|&(){}[]<>" + chr(96)
    stripped_tokens = [token.strip(strip_chars) for token in tokens]
    if '-exec' in stripped_tokens:
        sensitive = next((t for t in stripped_tokens if is_sensitive_path(t)), None)
        index = stripped_tokens.index('-exec')
        if sensitive and any(basename(t) in READ_COMMAND_BASENAMES for t in stripped_tokens[index + 1:]):
            return sensitive
    in_read, in_metadata, expect_command = False, False, True
    for token in tokens:
        # Unlike the hook's stripped-token check, recognize separators before
        # stripping punctuation so metadata exceptions cannot leak past &&/|/;.
        if token in {';', '&&', '||', '|'}:
            in_read, in_metadata, expect_command = False, False, True
            continue
        stripped = '[' if token == '[' and expect_command else token.strip(strip_chars)
        if not stripped:
            continue
        if expect_command and '=' in stripped and not stripped.startswith(('/', './', '../', '~')):
            continue
        if expect_command:
            name = basename(stripped)
            in_read, in_metadata = name in READ_COMMAND_BASENAMES, name in SAFE_METADATA_COMMAND_BASENAMES
            expect_command = False
            continue
        if stripped.startswith('-') or not is_sensitive_path(stripped):
            continue
        pathlike = '/' in stripped or '\\' in stripped or stripped.startswith(('~', '.')) or basename(stripped).startswith('.')
        if in_read or (pathlike and not in_metadata):
            return stripped
    return None

def check(tool_name, tool_input):
    strings = list(iter_strings(tool_input))
    if tool_uses_ccc_mcp_indexing(tool_name, tool_input):
        root, issue = resolve_ccc_project_root(tool_input)
        issue = issue or ccc_portable_security_issue(root)
        if issue:
            return issue
    if tool_name.lower() in {'read', 'readfile', 'read_file'}:
        if any(is_sensitive_path(text) for text in strings):
            return 'Read tool attempted to read a sensitive file'
    if tool_name.lower() in {'bash', 'shellcommand', 'shell_command', 'exec_command'}:
        command = tool_input.get('command') or tool_input.get('cmd') if isinstance(tool_input, dict) else None
        if isinstance(command, list):
            command = ' '.join(str(part) for part in command)
        if not isinstance(command, str):
            command = '\n'.join(strings)
        if command_dumps_environment(command):
            return 'command may dump process environment'
        if command_uses_ccc_file_access(command):
            if re.search(r'(^|[;&|()]\s*)cd\s+', strip_heredoc_bodies(command)):
                return 'CCC guarded commands must use the tool workdir instead of shell cd'
            root, issue = resolve_ccc_project_root(tool_input)
            issue = issue or ccc_portable_security_issue(root)
            if issue:
                return issue
        if command_reads_sensitive_path(command):
            return 'command appears to read sensitive material'
        return None
    for text in strings:
        if (os.sep in text or '/' in text or basename(text).startswith('.')) and is_sensitive_path(text):
            return 'tool attempted to access a sensitive file'
    return None

if __name__ == '__main__':
    payload = json.load(sys.stdin)
    issue = check(payload['tool_name'], payload['tool_input'])
    sys.stdout.write(json.dumps({'issue': issue}))
`;

const FAILURE = { decision: "deny", reason: "Mahiro secret-read guard unavailable or invalid input; tool blocked." };
const MAX_INPUT = 1024 * 1024;

function createChecker({ signal, python = "/usr/bin/python3", timeoutMs = 250_000 } = {}) {
  const pending = new Set();
  let disposed = false;
  const stop = () => {
    disposed = true;
    for (const cancel of [...pending]) cancel();
  };
  signal?.addEventListener?.("abort", stop, { once: true });
  return {
    async check(event) {
      // No approval cache: evaluate each phase's final args independently.
      if (disposed || signal?.aborted) return FAILURE;
      let input;
      try {
        if (!event || !["approval", "execution"].includes(event.phase)
          || typeof event.toolName !== "string" || !event.toolName
          || !event.args || typeof event.args !== "object" || Array.isArray(event.args)) return FAILURE;
        const toolName = event.toolName.split(".").at(-1);
        input = JSON.stringify({ tool_name: toolName, tool_input: event.args });
        if (Buffer.byteLength(input) > MAX_INPUT) return FAILURE;
      } catch {
        return FAILURE;
      }
      return new Promise((resolve) => {
        let child;
        let timer;
        let settled = false;
        let output = "";
        const finish = (result) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          pending.delete(cancel);
          resolve(result);
        };
        const killGroup = () => {
          // Include CCC descendants even if their immediate helper timed out.
          if (child?.pid) {
            try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); }
          }
        };
        const cancel = () => {
          killGroup();
          finish(FAILURE);
        };
        pending.add(cancel);
        try {
          child = spawn(python, ["-I", "-c", POLICY], {
            cwd: event.cwd || event.workingDirectory || process.cwd(),
            detached: true,
            stdio: ["pipe", "pipe", "ignore"],
          });
          timer = setTimeout(cancel, timeoutMs);
          child.on("error", () => finish(FAILURE));
          child.stdin.on("error", cancel);
          child.stdout.on("data", (chunk) => {
            output += chunk.toString("utf8");
            if (output.length > 4096) cancel();
          });
          child.on("close", (code) => {
            killGroup();
            if (code !== 0) return finish(FAILURE);
            try {
              const result = JSON.parse(output);
              if (result.issue === null) finish(undefined);
              else if (typeof result.issue === "string" && result.issue.length <= 512) {
                finish({ decision: "deny", reason: `Mahiro secret-read guard: ${result.issue}.` });
              } else finish(FAILURE);
            } catch { finish(FAILURE); }
          });
          child.stdin.end(input);
        } catch { cancel(); }
      });
    },
    dispose() {
      stop();
      signal?.removeEventListener?.("abort", stop);
    },
  };
}

export default function activate(letta) {
  if (letta.signal?.aborted) return;
  if (!letta.capabilities?.permissions || typeof letta.permissions?.register !== "function") {
    letta.diagnostics?.report?.({ severity: "error", message: "Mahiro secret-read guard inactive: permissions capability unavailable. Keep the existing hook enabled." });
    return;
  }
  const checker = createChecker({ signal: letta.signal });
  let unregister;
  try {
    unregister = letta.permissions.register({
      id: "mahiro-secret-read-guard",
      description: "Deny secret reads, environment dumps, and unverified CCC file access at approval and execution.",
      check: (event) => checker.check(event),
    });
  } catch (error) {
    checker.dispose();
    throw error;
  }
  return () => {
    checker.dispose();
    if (!letta.signal?.aborted) unregister();
  };
}

export const __testing = { POLICY, createChecker };
