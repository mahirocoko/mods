import { createVoice, isSubagent } from "./mahiro-voice-runtime.js";

export function activateWith(letta, voiceFactory = createVoice) {
  if (letta.signal?.aborted || isSubagent()) return;
  if (!letta.capabilities?.events?.turns || typeof letta.events?.on !== "function") return;
  // Audio belongs to the mod generation, never a transient turn scope.
  const voice = voiceFactory({ text: "ลาเต้ ทำงานเสร็จแล้วค่ะ", signal: letta.signal, report: (value) => letta.diagnostics?.report?.(value) });
  let dispose;
  try {
    dispose = letta.events.on("turn_end", (event, ctx) => {
      if (ctx?.signal?.aborted || event.stopReason !== "end_turn") return;
      // Notification-only: never return a continuation or delay completion for speech.
      void voice.play();
    });
  } catch {
    voice.dispose();
    letta.diagnostics?.report?.({ severity: "warning", message: "Finish voice inactive: this host lacks turn_end; retain the Stop hook." });
    return;
  }
  return () => { voice.dispose(); if (!letta.signal?.aborted) dispose(); };
}

export default function activate(letta) { return activateWith(letta); }
