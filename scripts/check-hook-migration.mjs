import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createVoice } from "../mods/mahiro-voice-runtime.js";

const root = await mkdtemp(join(tmpdir(), "mahiro-hook-check-"));
const previousRole = process.env.LETTA_CODE_AGENT_ROLE;
delete process.env.LETTA_CODE_AGENT_ROLE;

try {
  const guard = await import("../mods/mahiro-commit-attribution-guard.js");
  const finish = await import("../mods/mahiro-finish-voice.js");
  const { check, transform, FORBIDDEN } = guard.__testing;
  // Synthetic invocations only: no git process, repository, old hook, or secret reads.
  for (const phase of ["approval", "execution"]) {
    for (const trailer of FORBIDDEN) {
      for (const command of [
        `git commit -m '${trailer}'`, `cd repo && git commit -m '${trailer}'`,
        `true;\n git commit -m '${trailer}'`, ["git", "commit", "-m", trailer],
      ]) assert.equal(check({ toolName: "Bash", phase, args: { command } })?.decision, "deny");
      assert.equal(check({ toolName: "Shell", phase, args: { cmd: `git commit -m '${trailer}'` } })?.decision, "deny");
      for (const command of [
        `rg '${trailer}'`, `git log --grep='${trailer}'`, "git commit -m 'fix bug'",
        // Known old-hook gaps intentionally retained, not silently hardened.
        ` git commit -m '${trailer}'`, `git -C repo commit -m '${trailer}'`,
        `git commit -F message.txt`,
      ]) assert.equal(check({ toolName: "Bash", phase, args: { command } }), undefined);
    }
  }
  const attributed = `git commit -m 'fix: keep subject\n\n${FORBIDDEN.join("\n\n")}' && git status --short`;
  assert.equal(check({ toolName: "exec_command", phase: "approval", args: { cmd: attributed } }, { canTransform: true }), undefined);
  assert.equal(check({ toolName: "exec_command", phase: "execution", args: { cmd: attributed } }, { canTransform: true })?.decision, "deny");
  const rewritten = transform({ toolName: "exec_command", args: { cmd: attributed, description: "commit" } });
  assert.equal(rewritten.args.description, "commit");
  assert(rewritten.args.cmd.includes("fix: keep subject"));
  assert(rewritten.args.cmd.startsWith("git commit"));
  assert(rewritten.args.cmd.endsWith("&& git status --short"));
  for (const trailer of FORBIDDEN) assert(!rewritten.args.cmd.includes(trailer));
  assert.equal(check({ toolName: "exec_command", phase: "execution", args: rewritten.args }, { canTransform: true }), undefined);
  const wrappedAttributed = `rtk git commit -m '${FORBIDDEN[0]}'`;
  assert.equal(transform({ toolName: "exec_command", args: { cmd: wrappedAttributed } }), undefined);
  assert.equal(check({ toolName: "exec_command", phase: "approval", args: { cmd: wrappedAttributed } }, { canTransform: true })?.decision, "deny");
  assert.equal(check({ toolName: "exec_command", phase: "execution", args: { cmd: `rtk ${rewritten.args.cmd}` } }, { canTransform: true }), undefined);
  const argvRewrite = transform({ toolName: "Bash", args: { command: ["git", "commit", "-m", `fix: array\n${FORBIDDEN[0]}`] } });
  assert.deepEqual(argvRewrite.args.command.slice(0, 3), ["git", "commit", "-m"]);
  assert.equal(argvRewrite.args.command[3], "fix: array\n");
  assert.equal(transform({ toolName: "Bash", args: { command: "git commit -m 'fix: clean'" } }), undefined);
  assert.equal(transform({ toolName: "Bash", args: { command: `rg '${FORBIDDEN[0]}'` } }), undefined);
  for (const ambiguous of [
    `git commit -m 'fix: clean' && printf '%s' '${FORBIDDEN[0]}'`,
    `printf '%s' 'log; git commit -m ${FORBIDDEN[0]}'`,
    `printf x <<EOF\ngit commit -m '${FORBIDDEN[0]}'\nEOF`,
    `git commit -m "subject $(printf %s '${FORBIDDEN[0]}')"`,
    `git commit -m "subject \`printf %s '${FORBIDDEN[0]}'\`"`,
    `echo $((git commit -m '${FORBIDDEN[0]}'))`,
    `cd repo && git commit -m '${FORBIDDEN[0]}'`,
    `git add file.txt && git commit -m '${FORBIDDEN[0]}'`,
    `git commit -m 'clean' # -m '${FORBIDDEN[0]}'`,
    `git commit -m 'clean' > >(printf -m '${FORBIDDEN[0]}')`,
  ]) {
    assert.equal(transform({ toolName: "Bash", args: { command: ambiguous } }), undefined);
    assert.equal(check({ toolName: "Bash", phase: "approval", args: { command: ambiguous } }, { canTransform: true })?.decision, "deny");
  }
  const nonCommit = `git commit-not-real -m '${FORBIDDEN[0]}'`;
  assert.equal(transform({ toolName: "Bash", args: { command: nonCommit } }), undefined);
  assert.equal(check({ toolName: "Bash", phase: "approval", args: { command: nonCommit } }, { canTransform: true }), undefined);
  const messageEquals = transform({ toolName: "Bash", args: { command: `git commit --message='fix: equals\n${FORBIDDEN[1]}'` } });
  assert.equal(messageEquals.args.command, "git commit --message='fix: equals\n'");
  assert.equal(check({ toolName: "Read", args: { file_path: "ordinary.txt" } }), undefined);
  assert.equal(check({ toolName: "Bash" }), undefined);

  for (const aborted of [false, true]) {
    const controller = new AbortController();
    let removed = 0;
    let overlay;
    const dispose = guard.default({ signal: controller.signal, capabilities: { permissions: true }, permissions: { register(value) { overlay = value; return () => removed++; } } });
    assert.equal(overlay.id, "mahiro-commit-attribution-guard");
    if (aborted) controller.abort();
    dispose();
    assert.equal(removed, aborted ? 0 : 1);
  }

  for (const aborted of [false, true]) {
    const controller = new AbortController();
    let removed = 0, overlay, onToolStart;
    const dispose = guard.default({
      signal: controller.signal,
      capabilities: { permissions: true, events: { tools: true } },
      permissions: { register(value) { overlay = value; return () => removed++; } },
      events: { on(name, callback) { assert.equal(name, "tool_start"); onToolStart = callback; return () => removed++; } },
    });
    assert.equal(overlay.check({ toolName: "exec_command", phase: "approval", args: { cmd: attributed } }), undefined);
    const effective = onToolStart({ toolName: "exec_command", args: { cmd: attributed } });
    assert.equal(overlay.check({ toolName: "exec_command", phase: "execution", args: effective.args }), undefined);
    assert.equal(overlay.check({ toolName: "exec_command", phase: "execution", args: { cmd: attributed } })?.decision, "deny");
    if (aborted) controller.abort();
    dispose();
    assert.equal(removed, aborted ? 0 : 2);
  }

  {
    let removed = 0;
    assert.throws(() => guard.default({
      signal: new AbortController().signal,
      capabilities: { permissions: true, events: { tools: true } },
      permissions: { register() { return () => removed++; } },
      events: { on() { throw new Error("tool event registration failed"); } },
    }), /tool event registration failed/);
    assert.equal(removed, 1, "failed tool-event registration must remove the permission overlay");
  }

  for (const [module, kind] of [[finish, "finish"]]) {
    for (const aborted of [false, true]) {
      const controller = new AbortController();
      let removed = 0, played = 0, stopped = 0;
      let callback, command;
      const host = {
        signal: controller.signal,
        capabilities: { commands: true, events: { turns: true } },
        events: { on(name, fn) { assert.equal(name, "turn_end"); callback = fn; return () => removed++; } },
        commands: { register(value) { command = value; return () => removed++; } },
      };
      const factory = ({ text }) => {
        assert.equal(text, "ลาเต้ ทำงานเสร็จแล้วค่ะ");
        return { play: async () => { played++; }, dispose: () => stopped++ };
      };
      const dispose = module.activateWith(host, factory);
      if (kind === "finish") {
        for (const stopReason of ["requires_approval", "error", "max_tokens", "tool_calls", "cancelled"]) callback({ stopReason }, {});
        assert.equal(played, 0);
        assert.equal(callback({ stopReason: "end_turn" }, {}), undefined);
      }
      assert.equal(played, 1);
      if (aborted) controller.abort();
      dispose();
      assert.equal(stopped, 1);
      assert.equal(removed, aborted ? 0 : 1);
      process.env.LETTA_CODE_AGENT_ROLE = "subagent";
      assert.equal(module.activateWith(host, () => assert.fail("subagent audio")), undefined);
      delete process.env.LETTA_CODE_AGENT_ROLE;
      assert.equal(module.activateWith({ capabilities: {} }, () => assert.fail("unsupported host audio")), undefined);
    }
  }

  // Playback survives callback return and a separate turn-scope abort; only the
  // mod generation owns audio lifetime. No actual audio processes are spawned.
  const generation = new AbortController(), turn = new AbortController();
  let onEnd, resolvePlayback;
  const playback = new Promise((resolve) => { resolvePlayback = resolve; });
  const eventCalls = [];
  const stopVoice = finish.activateWith({ signal: generation.signal, capabilities: { events: { turns: true } }, events: { on(_name, fn) { onEnd = fn; return () => {}; } } }, (options) => {
    assert.equal(options.signal, generation.signal);
    const audio = createVoice({ ...options, platform: "darwin", runner: async (file, _args, signal) => { assert.equal(signal.aborted, false); eventCalls.push(file); } });
    return { play: () => audio.play().finally(resolvePlayback), dispose: audio.dispose };
  });
  onEnd({ stopReason: "end_turn" }, { signal: turn.signal });
  turn.abort();
  await playback;
  assert.deepEqual(eventCalls, ["/usr/bin/say", "/usr/bin/afplay"]);
  stopVoice();

  let calls = [], clock = 10_000;
  const voice = createVoice({ text: "fixed cue", platform: "darwin", now: () => clock, runner: async (file, args) => calls.push([file, args]) });
  await voice.play();
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0][1].slice(0, 5), ["-v", "Kanya", "-r", "300", "fixed cue"]);
  assert.equal(calls[1][0], "/usr/bin/afplay");
  assert.deepEqual(calls[1][1].slice(0, 2), ["-v", "0.4"]);
  const firstDirectory = dirname(calls[0][1].at(-1));
  assert(!existsSync(firstDirectory));
  await voice.play();
  assert.equal(calls.length, 2, "cooldown must drop repeated cues");
  clock += 3001;
  await voice.play();
  assert.notEqual(dirname(calls[2][1].at(-1)), firstDirectory);
  voice.dispose();
  clock += 3001;
  await voice.play();
  assert.equal(calls.length, 4);

  for (const useAbort of [false, true]) {
    let ready;
    const started = new Promise((resolve) => { ready = resolve; });
    const controller = new AbortController();
    let invocations = 0, audioPath;
    const pending = createVoice({ text: "silent", platform: "darwin", signal: controller.signal, runner: async (_file, args, signal) => {
      invocations++; audioPath = args.at(-1); ready();
      await new Promise((resolve, reject) => signal.addEventListener("abort", () => reject(new Error("cancelled")), { once: true }));
    } });
    const playing = pending.play();
    await started;
    await pending.play();
    if (useAbort) controller.abort(); else pending.dispose();
    await playing;
    assert.equal(invocations, 1, "busy audio must not queue or play afplay after abort");
    assert(!existsSync(dirname(audioPath)));
  }
  let warnings = 0;
  const broken = createVoice({ text: "silent", platform: "darwin", now: () => clock += 4000, report: () => warnings++, runner: async () => { throw new Error("missing say"); } });
  await broken.play(); await broken.play(); broken.dispose();
  assert.equal(warnings, 1);
  const unsupported = createVoice({ platform: "linux", report: () => {}, runner: () => assert.fail("non-macOS spawn") });
  await unsupported.play(); unsupported.dispose();
  console.log("Hook migration checks passed: synthetic commit sanitization/fail-closed policy, public registrations, silent audio args/cleanup/abort/cooldown, subagent gates and automatic-only finish voice.");
} finally {
  if (previousRole === undefined) delete process.env.LETTA_CODE_AGENT_ROLE;
  else process.env.LETTA_CODE_AGENT_ROLE = previousRole;
  await rm(root, { recursive: true, force: true });
}
