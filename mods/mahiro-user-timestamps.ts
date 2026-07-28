/**
 * Mahiro User Timestamps — local time metadata for each real user turn.
 */

interface TimestampMetadata {
  local: string;
  timeZone: string;
}

function timestampMetadata(date = new Date()): TimestampMetadata {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "local";
  return {
    local: new Intl.DateTimeFormat(undefined, {
      dateStyle: "full",
      timeStyle: "long",
    }).format(date),
    timeZone,
  };
}

function timestampBlock(meta: TimestampMetadata): string {
  return [
    "<user_timestamp>",
    `local: ${meta.local}`,
    `timezone: ${meta.timeZone}`,
    "</user_timestamp>",
    "",
  ].join("\n");
}

function textParts(content: unknown): Array<Record<string, any>> {
  return Array.isArray(content)
    ? content.filter((part) => part && typeof part === "object" && !Array.isArray(part))
    : [];
}

function hasTextMarker(content: unknown, marker: string): boolean {
  if (typeof content === "string") return content.includes(marker);
  return textParts(content).some(
    (part) => part.type === "text" && typeof part.text === "string" && part.text.includes(marker),
  );
}

function isSyntheticTextPart(part: unknown): boolean {
  return Boolean(
    part
    && typeof part === "object"
    && !Array.isArray(part)
    && (part as Record<string, any>).type === "text"
    && typeof (part as Record<string, any>).text === "string"
    && (part as Record<string, any>).text.trimStart().startsWith("<system-reminder>"),
  );
}

function hasRealUserContent(content: unknown): boolean {
  if (typeof content === "string") return !content.trimStart().startsWith("<system-reminder>");
  if (!Array.isArray(content)) return false;
  return content.some((part) => {
    if (!part || typeof part !== "object" || Array.isArray(part)) return false;
    if ((part as Record<string, any>).type === "text") return !isSyntheticTextPart(part);
    return true;
  });
}

function prependTimestampContent(content: unknown, block: string): unknown {
  if (typeof content === "string") return block + content;
  if (!Array.isArray(content)) return block;

  let inserted = false;
  const next = content.map((part) => {
    if (!inserted && part?.type === "text" && typeof part.text === "string" && !isSyntheticTextPart(part)) {
      inserted = true;
      return { ...part, text: block + part.text };
    }
    return part;
  });
  if (!inserted) {
    const firstRealPart = next.findIndex((part) => !isSyntheticTextPart(part));
    next.splice(firstRealPart < 0 ? next.length : firstRealPart, 0, { type: "text", text: block });
  }
  return next;
}

function transformUserInput(input: unknown, date = new Date()): unknown[] | null {
  if (!Array.isArray(input)) return null;
  const meta = timestampMetadata(date);
  const block = timestampBlock(meta);
  return input.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return item;
    const record = item as Record<string, any>;
    if (record.type === "approval" || record.role !== "user" || !hasRealUserContent(record.content)) return item;

    const existingMetadata = record.metadata && typeof record.metadata === "object" && !Array.isArray(record.metadata)
      ? record.metadata
      : {};
    return {
      ...record,
      metadata: {
        ...existingMetadata,
        user_timestamp: meta,
      },
      content: hasTextMarker(record.content, "<user_timestamp>")
        ? record.content
        : prependTimestampContent(record.content, block),
    };
  });
}

// Isolated repository smoke seam; normal packaged runtimes export null.
export const __testing = process.env.MAHIRO_TIMESTAMPS_TESTING === "1"
  ? Object.freeze({ timestampMetadata, timestampBlock, transformUserInput })
  : null;

export default function activate(letta: any) {
  if (!letta.capabilities?.events?.turns || !letta.events?.on) {
    letta.diagnostics?.report?.({
      severity: "warning",
      message: "Mahiro User Timestamps requires turn events, but this host does not expose them.",
    });
    return;
  }

  const dispose = letta.events.on("turn_start", (event: any) => {
    const input = transformUserInput(event?.input);
    return input ? { input } : undefined;
  });

  return () => {
    if (letta.signal?.aborted) return;
    dispose();
  };
}
