import { spawn } from "node:child_process";

// Preserve the local hook's Python/shlex policy in this single packaged entry.
// No installed hook import, shell execution, target-file reads, or argument logs.
// CCC helpers come only from the Letta global skill. The ensure helper owns the scanner pin.
const POLICY = String.raw`
import json, os, re, select, shlex, stat, subprocess, sys, time
from pathlib import Path, PurePosixPath

SENSITIVE_BASENAMES = {'.env', '.npmrc', '.pypirc', 'auth.json', 'credentials.json',
    'id_dsa', 'id_ecdsa', 'id_ecdsa_sk', 'id_ed25519', 'id_ed25519_sk', 'id_rsa', 'id_xmss', 'identity'}
SAFE_DOTENV_TEMPLATE_BASENAMES = {'.env.example', '.env.sample', '.env.template'}
SSH_SAFE_BASENAMES = {'authorized_keys', 'config', 'known_hosts', 'known_hosts.old'}
READ_COMMAND_BASENAMES = {'awk', 'base64', 'bat', 'cat', 'grep', 'head', 'hexdump',
    'less', 'more', 'openssl', 'rg', 'sed', 'strings', 'tail', 'xxd'}
SAFE_METADATA_COMMAND_BASENAMES = {'[', 'find', 'ls', 'stat', 'test'}
CCC_SKILL_DIR = Path(os.path.expanduser('~/.letta/skills/ccc'))
CCC_SYNC_SCRIPT = CCC_SKILL_DIR / 'scripts/sync-project-excludes.py'
CCC_PREFLIGHT_SCRIPT = CCC_SKILL_DIR / 'scripts/preflight.py'
CCC_ENSURE_SCRIPT = CCC_SKILL_DIR / 'scripts/ensure-gitleaks.py'
CCC_STRICT_SCRIPT = CCC_SKILL_DIR / 'scripts/strict-gitleaks-scan.py'
CCC_LOCAL_POLICY = Path('.cocoindex_code/ccc-security/local-deny-patterns.txt')
CCC_ALLOWLIST = Path('.cocoindex_code/ccc-security/allowlist.json')
CCC_PIN_SCHEMA = 'mahiro-ccc-gitleaks-pin-v1'
CCC_PIN_SUCCESS_KEYS = {'schema', 'action', 'status', 'version', 'target', 'path',
    'archive_name', 'archive_sha256', 'binary_sha256', 'repaired', 'network'}
CCC_PIN_ERROR_KEYS = {'schema', 'action', 'status', 'error_code', 'version', 'repaired', 'network'}
MAX_METADATA_STDOUT = 4096
CCC_SETTINGS_TIMEOUT = 30
CCC_PREFLIGHT_TIMEOUT = 30
CCC_PIN_CHECK_TIMEOUT = 30
CCC_PIN_ENSURE_TIMEOUT = 120
CCC_STRICT_TIMEOUT = 180
# Initial settings/preflight/check, one ensure, then the same three stages plus strict, plus slack.
CCC_GUARD_BUDGET = (
    (CCC_SETTINGS_TIMEOUT + CCC_PREFLIGHT_TIMEOUT + CCC_PIN_CHECK_TIMEOUT) * 2
    + CCC_PIN_ENSURE_TIMEOUT + CCC_STRICT_TIMEOUT + 5)
CCC_HELPER_UNAVAILABLE = 'CCC portable security helper is unavailable'
CCC_SETTINGS_FAILED = 'CCC project settings are missing or drifted from the portable V2 policy'
CCC_PREFLIGHT_FAILED = 'CCC filename-only project preflight did not pass'
CCC_PIN_METADATA_INVALID = 'CCC pinned scanner metadata is invalid'
CCC_PIN_UNSAFE = 'CCC pinned scanner is unavailable or unsafe'
CCC_PIN_PROVISION_FAILED = 'CCC pinned scanner is missing and could not be provisioned'
CCC_STRICT_FAILED = 'CCC strict receipt is missing, stale, unsafe, or records findings'
CCC_TIMED_OUT = 'CCC security check timed out'

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

def _stage_timeout(deadline, cap):
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        return None
    return min(float(cap), remaining)

def _run_status(command, deadline, cap):
    timeout = _stage_timeout(deadline, cap)
    if timeout is None:
        return 'timeout'
    try:
        completed = subprocess.run(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            timeout=timeout, check=False)
    except subprocess.TimeoutExpired:
        return 'timeout'
    except OSError:
        return 'error'
    return completed.returncode

def _run_capture(command, deadline, cap):
    timeout = _stage_timeout(deadline, cap)
    if timeout is None:
        return 'timeout'
    try:
        proc = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    except OSError:
        return None
    data = bytearray()
    end = time.monotonic() + timeout
    timed_out = False
    try:
        fd = proc.stdout.fileno()
        while len(data) <= MAX_METADATA_STDOUT:
            remaining = end - time.monotonic()
            if remaining <= 0:
                timed_out = True
                break
            ready, _, _ = select.select([fd], [], [], min(0.25, remaining))
            if ready:
                chunk = os.read(fd, 4096)
                if not chunk:
                    break
                data.extend(chunk)
                continue
            if proc.poll() is not None:
                while len(data) <= MAX_METADATA_STDOUT:
                    ready, _, _ = select.select([fd], [], [], 0)
                    if not ready:
                        break
                    chunk = os.read(fd, 4096)
                    if not chunk:
                        break
                    data.extend(chunk)
                break
        if proc.poll() is None:
            proc.kill()
        proc.wait(timeout=1)
    except (OSError, subprocess.TimeoutExpired):
        if proc.poll() is None:
            proc.kill()
            try:
                proc.wait(timeout=1)
            except (OSError, subprocess.TimeoutExpired):
                pass
        return None
    finally:
        try:
            proc.stdout.close()
        except OSError:
            pass
    if timed_out:
        return 'timeout'
    if len(data) > MAX_METADATA_STDOUT:
        return None
    return proc.returncode, bytes(data)

def _parse_metadata(raw):
    if not isinstance(raw, (bytes, bytearray)) or len(raw) > MAX_METADATA_STDOUT:
        return None
    try:
        text = raw.decode('utf-8')
    except UnicodeDecodeError:
        return None
    stripped = text.strip()
    if not stripped or len(stripped) > MAX_METADATA_STDOUT:
        return None
    try:
        value = json.loads(stripped)
    except json.JSONDecodeError:
        return None
    if not isinstance(value, dict):
        return None
    return value

def _valid_version(value):
    return isinstance(value, str) and re.fullmatch(r'[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}', value) is not None

def _valid_sha256(value):
    return isinstance(value, str) and re.fullmatch(r'[0-9a-f]{64}', value) is not None

def _accept_pin_success(payload, action):
    if set(payload) != CCC_PIN_SUCCESS_KEYS:
        return 'invalid'
    target = payload.get('target')
    archive_name = payload.get('archive_name')
    path_text = payload.get('path')
    repaired = payload.get('repaired')
    network = payload.get('network')
    if (payload.get('schema') != CCC_PIN_SCHEMA or payload.get('action') != action
            or payload.get('status') != 'ok' or not _valid_version(payload.get('version'))
            or not isinstance(target, str) or re.fullmatch(r'[a-z0-9_]{1,32}', target) is None
            or not isinstance(archive_name, str) or '..' in archive_name
            or re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]{0,127}', archive_name) is None
            or not _valid_sha256(payload.get('archive_sha256'))
            or not _valid_sha256(payload.get('binary_sha256'))
            or not isinstance(repaired, bool) or not isinstance(network, bool)
            or repaired != network or (action == 'check' and (repaired or network))):
        return 'invalid'
    if (not isinstance(path_text, str) or not path_text or len(path_text) > 1024
            or '\x00' in path_text or '\n' in path_text or '\r' in path_text):
        return 'invalid'
    path = Path(path_text)
    if not path.is_absolute():
        return 'invalid'
    try:
        info = os.lstat(path)
    except OSError:
        return 'unsafe'
    if stat.S_ISLNK(info.st_mode) or not stat.S_ISREG(info.st_mode) or (info.st_mode & 0o111) == 0 or info.st_size <= 0:
        return 'unsafe'
    return str(path), payload['binary_sha256']

def _is_exact_missing(payload):
    return (set(payload) == CCC_PIN_ERROR_KEYS and payload.get('schema') == CCC_PIN_SCHEMA
        and payload.get('action') == 'check' and payload.get('status') == 'error'
        and payload.get('error_code') == 'missing-binary' and payload.get('repaired') is False
        and payload.get('network') is False and _valid_version(payload.get('version')))

def _is_well_formed_error(payload, action):
    code = payload.get('error_code')
    return (set(payload) == CCC_PIN_ERROR_KEYS and payload.get('schema') == CCC_PIN_SCHEMA
        and payload.get('action') == action and payload.get('status') == 'error'
        and isinstance(code, str) and re.fullmatch(r'[a-z0-9-]{1,64}', code) is not None
        and payload.get('repaired') is False and isinstance(payload.get('network'), bool)
        and _valid_version(payload.get('version')))

def _classify_pin(captured, action):
    if captured == 'timeout':
        return 'timeout'
    if not isinstance(captured, tuple) or len(captured) != 2:
        return 'invalid'
    code, raw = captured
    payload = _parse_metadata(raw)
    if not isinstance(payload, dict):
        return 'invalid'
    if code == 0:
        return _accept_pin_success(payload, action)
    if code == 2 and action == 'check' and _is_exact_missing(payload):
        return 'missing'
    if code == 2 and _is_well_formed_error(payload, action):
        return 'unsafe'
    return 'invalid'

def _run_pin_ensure(deadline):
    classified = _classify_pin(_run_capture(
        ['/usr/bin/python3', str(CCC_ENSURE_SCRIPT), 'ensure', '--json'], deadline, CCC_PIN_ENSURE_TIMEOUT), 'ensure')
    if classified == 'timeout':
        return 'timeout'
    if isinstance(classified, tuple):
        return 'ok'
    return 'fail'

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

def _ccc_security_gate(root, deadline, allow_repair):
    helpers = (CCC_SYNC_SCRIPT, CCC_PREFLIGHT_SCRIPT, CCC_ENSURE_SCRIPT, CCC_STRICT_SCRIPT)
    if any(not _real_regular_file(path) for path in helpers):
        return CCC_HELPER_UNAVAILABLE
    local_policy, issue = _optional_control_path(root, CCC_LOCAL_POLICY)
    if issue:
        return issue
    allowlist, issue = _optional_control_path(root, CCC_ALLOWLIST)
    if issue:
        return issue
    shared = ['--project-root', str(root)]
    policy = ['--local-policy', str(local_policy)] if local_policy else []
    settings = _run_status(
        ['/usr/bin/python3', str(CCC_SYNC_SCRIPT), *shared, *policy, '--check'], deadline, CCC_SETTINGS_TIMEOUT)
    if settings == 'timeout':
        return CCC_TIMED_OUT
    if settings != 0:
        return CCC_SETTINGS_FAILED
    preflight = _run_status(
        ['/usr/bin/python3', str(CCC_PREFLIGHT_SCRIPT), *shared, *policy, '--check-settings'],
        deadline, CCC_PREFLIGHT_TIMEOUT)
    if preflight == 'timeout':
        return CCC_TIMED_OUT
    if preflight != 0:
        return CCC_PREFLIGHT_FAILED
    pin = _classify_pin(_run_capture(
        ['/usr/bin/python3', str(CCC_ENSURE_SCRIPT), 'check', '--json'], deadline, CCC_PIN_CHECK_TIMEOUT), 'check')
    if pin == 'timeout':
        return CCC_TIMED_OUT
    if pin == 'missing':
        if not allow_repair:
            return CCC_PIN_PROVISION_FAILED
        ensured = _run_pin_ensure(deadline)
        if ensured == 'timeout':
            return CCC_TIMED_OUT
        if ensured != 'ok':
            return CCC_PIN_PROVISION_FAILED
        return _ccc_security_gate(root, deadline, False)
    if pin == 'invalid':
        return CCC_PIN_METADATA_INVALID
    if not isinstance(pin, tuple):
        return CCC_PIN_UNSAFE
    command = ['/usr/bin/python3', str(CCC_STRICT_SCRIPT), 'check', *shared, *policy,
        '--gitleaks', pin[0], '--expected-binary-sha256', pin[1]]
    if allowlist:
        command.extend(['--allowlist', str(allowlist)])
    strict = _run_status(command, deadline, CCC_STRICT_TIMEOUT)
    if strict == 'timeout':
        return CCC_TIMED_OUT
    if strict != 0:
        return CCC_STRICT_FAILED
    return None

def ccc_portable_security_issue(root):
    return _ccc_security_gate(root, time.monotonic() + CCC_GUARD_BUDGET, True)

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

// 5s Git root resolve + 485s shared CCC budget + 10s interpreter slack.
const CHECKER_TIMEOUT_MS = 500_000;

function createChecker({ signal, python = "/usr/bin/python3", timeoutMs = CHECKER_TIMEOUT_MS, env } = {}) {
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
            env: env ?? process.env,
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

export const __testing = { POLICY, createChecker, CHECKER_TIMEOUT_MS };
