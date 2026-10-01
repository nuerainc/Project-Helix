// Retained for the UDAWCA adapter path; provider JSON is runtime-validated.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  text: z.string().max(500),
  tracks: z.array(z.string()).max(40),
  host: z.string().max(40),
});

export const compileIntentRemote = createServerFn({ method: "POST" })
  .validator((input: unknown) => Input.parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return { ok: false as const, error: "unavailable" };

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
            content:
              "Compile a DAW production or UDAWCA control request into JSON. Keys: kind (inspect_session|inspect_takes|fix_safe|undo_last|set_gain|mute|solo|arm|transport|bank|write_automation|organize_takes|trim_silence|repair_clipping|repair_true_peak|flatten_chorus|rename|reset_session|show_settings|set_host|set_autonomy|show_capabilities|show_mixer|show_ledger|show_surface|unknown), trackName, host, mode (abs|rel), db, exact, enabled, command (play|stop|return), delta, keep, name, level (0-5). Omit unused keys. JSON only.",
          },
          {
            role: "user",
            content: `HOST: ${data.host}\nTRACKS: ${data.tracks.join(", ")}\nREQUEST: ${data.text}`,
          },
        ],
      }),
    });
    if (!res.ok) return { ok: false as const, error: `xAI ${res.status}` };
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const raw = body.choices?.[0]?.message?.content ?? "";
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end <= start) return { ok: false as const, error: "parse" };
    try {
      return { ok: true as const, parsed: JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown> };
    } catch {
      return { ok: false as const, error: "parse" };
    }
  });
