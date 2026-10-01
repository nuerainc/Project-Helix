import type { HostId, TransportCommand } from "../helix/types.ts";
import type { OscArgument, OscMessage } from "./osc-protocol.ts";

export type OscTrackField = "mute" | "solo" | "arm" | "volume";
export interface OscProfile {
  readonly id: string;
  readonly label: string;
  readonly host: HostId;
  readonly namespace: string;
  readonly zones: number;
  trackAddress(zone: number, field: OscTrackField): string;
  transportAddress(command: TransportCommand): string | undefined;
  bankAddress(): string;
  playingAddress(): string;
  decodeFeedback(message: OscMessage): OscFeedback | undefined;
}
export type OscFeedback =
  | { kind: "track"; zone: number; field: OscTrackField; value: OscArgument }
  | { kind: "playing"; value: boolean };

export interface OscProfileOptions {
  id: string;
  label: string;
  host: HostId;
  namespace: string;
  zones?: number;
  transportCommands?: readonly TransportCommand[];
}

export function createOscProfile(options: OscProfileOptions): OscProfile {
  const namespace = normalizeNamespace(options.namespace);
  const zones = options.zones ?? 8;
  const transportCommands = new Set(options.transportCommands ?? ["play", "stop", "record"]);
  if (!Number.isInteger(zones) || zones < 1 || zones > 128) {
    throw new RangeError("OSC profile zones must be an integer from 1 through 128.");
  }
  const trackAddress = (zone: number, field: OscTrackField): string => {
    assertZone(zone, zones);
    return `${namespace}/track/${zone}/${field}`;
  };
  const transportAddress = (command: TransportCommand): string | undefined =>
    command === "return" || !transportCommands.has(command)
      ? undefined
      : `${namespace}/transport/${command}`;
  const bankAddress = () => `${namespace}/bank`;
  const playingAddress = () => `${namespace}/transport/playing`;
  return {
    id: options.id,
    label: options.label,
    host: options.host,
    namespace,
    zones,
    trackAddress,
    transportAddress,
    bankAddress,
    playingAddress,
    decodeFeedback(message) {
      const track = message.address.match(
        new RegExp(`^${escapeRegExp(namespace)}/track/(\\d+)/(mute|solo|arm|volume)$`),
      );
      if (track) {
        const zone = Number(track[1]);
        assertZone(zone, zones);
        const value = message.args[0];
        if (value === undefined) return undefined;
        return { kind: "track", zone, field: track[2] as OscTrackField, value };
      }
      if (message.address === playingAddress() && typeof message.args[0] === "boolean") {
        return { kind: "playing", value: message.args[0] };
      }
      return undefined;
    },
  };
}

/** Portable contract for DAWs or bridges that agree to the Helix generic OSC map. */
export const genericDawOscProfile = createOscProfile({
  id: "generic-daw-osc",
  label: "Generic DAW OSC profile",
  host: "generic",
  namespace: "/daw",
});

/** Backward-compatible Helix namespace used by the existing desktop bridge. */
export const helixOscProfile = createOscProfile({
  id: "helix-osc",
  label: "Helix OSC profile",
  host: "helix",
  namespace: "/helix",
});

function normalizeNamespace(namespace: string): string {
  const normalized = `/${namespace.replace(/^\/+|\/+$/g, "")}`;
  if (normalized === "/" || /[^\x20-\x7e]/.test(normalized)) {
    throw new TypeError("OSC profile namespace must be a non-empty printable path.");
  }
  return normalized;
}
function assertZone(zone: number, zones: number): void {
  if (!Number.isInteger(zone) || zone < 0 || zone >= zones) {
    throw new RangeError(`OSC zone must be 0 through ${zones - 1}.`);
  }
}
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
