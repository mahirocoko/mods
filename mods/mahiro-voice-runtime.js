import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Shared only by the two voice entries. No shell, transcript speech, Halo relay,
// persistent log, queue, or startup audio. Tests inject a silent runner.
export function runAudio(file, args, signal) {
  return new Promise((resolve, reject) => {
    execFile(file, args, {
      signal, timeout: 10_000, killSignal: "SIGKILL", maxBuffer: 4096,
      windowsHide: true,
    }, (error) => error ? reject(error) : resolve());
  });
}

export function createVoice({ text, signal, report, runner = runAudio, platform = process.platform, now = Date.now }) {
  let active = null;
  let disposed = false;
  let lastStarted = -Infinity;
  let warned = false;
  function warn() {
    if (warned || disposed || signal?.aborted) return;
    warned = true;
    report?.({ severity: "warning", message: "Mahiro voice could not play; requires macOS say/afplay and the Kanya voice." });
  }
  async function play() {
    if (disposed || signal?.aborted || active || now() - lastStarted < 3000) return;
    if (platform !== "darwin") { warn(); return; }
    lastStarted = now();
    const controller = new AbortController();
    active = controller;
    const abort = () => controller.abort();
    signal?.addEventListener?.("abort", abort, { once: true });
    let directory;
    const timer = setTimeout(abort, 20_000);
    timer.unref?.();
    try {
      directory = await mkdtemp(join(tmpdir(), "mahiro-voice-"));
      const audio = join(directory, "speech.aiff");
      if (controller.signal.aborted) return;
      await runner("/usr/bin/say", ["-v", "Kanya", "-r", "300", text, "-o", audio], controller.signal);
      if (!controller.signal.aborted) await runner("/usr/bin/afplay", ["-v", "0.4", audio], controller.signal);
    } catch { if (!controller.signal.aborted) warn(); }
    finally {
      clearTimeout(timer);
      signal?.removeEventListener?.("abort", abort);
      if (directory) await rm(directory, { recursive: true, force: true }).catch(() => {});
      if (active === controller) active = null;
    }
  }
  return {
    play,
    dispose() { disposed = true; active?.abort(); },
  };
}

export function isSubagent() {
  // Same process-role marker used by the public host's headless/subagent path.
  return process.env.LETTA_CODE_AGENT_ROLE === "subagent";
}
