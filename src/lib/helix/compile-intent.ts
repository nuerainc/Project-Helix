import { createServerFn } from "@tanstack/react-start";
import type { Intent } from "./types";

const SCHEMA = `{
  "kind": "inspect_session" | "inspect_takes" | "inspect_routing" | "fix_safe" | "approve_all" | "undo_last" | "set_gain" | "set_pan" | "mute" | "solo" | "arm" | "transport" | "bank" | "write_automation" | "organize_takes" | "trim_silence" | "rename" | "reset_session" | "unknown",
  "trackId"?: string,
  "mode"?: "abs" | "rel",
  "db"?: number,
  "exact"?: boolean,
  "enabled"?: boolean,
  "value"?: number,
  "command"?: "play" | "stop" | "return" | "record",
  "delta"?: number,
  "region"?: "chorus",
  "deltaDb"?: number,
  "keep"?: number,
  "name"?: string,
  "text"?: string
}`;

export const compileIntentRemote = createServerFn({ method: "POST" })
  .validator((input: { text: string; trackIds: { id: string; name: string }[]; host: string }) => input)
  .handler(async ({ data }): Promise<{ ok: true; intent: Intent } | { ok: false; error: string }> => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return { ok: false, error: "AI is not available" };

    const catalog = data.trackIds.map((t) => `${t.id}="${t.name}"`).join(", ");
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "grok-4.5",
        temperature: 0,
        max_tokens: 280,
        messages: [
          {
            role: "system",
            content: `You compile audio-production intent into a single JSON object. No markdown. Schema: ${SCHEMA}. Use only these track ids: ${catalog}. Host: ${data.host}. If the request is not an operation, use kind unknown and echo text.`,
          },
          { role: "user", content: data.text },
        ],
      }),
    });
    if (!res.ok) return { ok: false, error: `xAI API error ${res.status}` };
    const body = (await res.json()) as { choices: { message: { content: string } }[] };
    const raw = body.choices[0]?.message.content ?? "";
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end < 0) return { ok: false, error: "No JSON" };
    try {
      const parsed = JSON.parse(raw.slice(start, end + 1)) as Intent;
      if (!parsed || typeof parsed !== "object" || !("kind" in parsed)) {
        return { ok: false, error: "Invalid intent" };
      }
      return { ok: true, intent: parsed };
    } catch {
      return { ok: false, error: "Parse failed" };
    }
  });
