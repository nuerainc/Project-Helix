export type OscArgument = number | string | boolean;

export interface OscMessage {
  address: string;
  args: OscArgument[];
}

export function encodeOscMessage(message: OscMessage): Uint8Array {
  if (!message.address.startsWith("/")) throw new Error("OSC address must start with '/'.");
  const tags = `,${message.args.map(typeTag).join("")}`;
  const chunks = [encodeString(message.address), encodeString(tags)];
  for (const arg of message.args) chunks.push(encodeArgument(arg));
  return concat(chunks);
}

export function decodeOscMessage(packet: Uint8Array): OscMessage {
  let offset = 0;
  const address = readString(packet, () => offset++);
  offset = address.next;
  const tags = readString(packet, () => offset++);
  offset = tags.next;
  if (!tags.value.startsWith(",")) throw new Error("OSC type tag string must start with ','.");
  const args: OscArgument[] = [];
  for (const tag of tags.value.slice(1)) {
    if (tag === "i" || tag === "f") {
      assertAvailable(packet, offset, 4);
      const view = new DataView(packet.buffer, packet.byteOffset + offset, 4);
      args.push(tag === "i" ? view.getInt32(0, false) : view.getFloat32(0, false));
      offset += 4;
    } else if (tag === "s") {
      const value = readString(packet, () => offset++);
      args.push(value.value);
      offset = value.next;
    } else if (tag === "T") {
      args.push(true);
    } else if (tag === "F") {
      args.push(false);
    } else {
      throw new Error(`Unsupported OSC type tag: ${tag}`);
    }
  }
  return { address: address.value, args };
}

export function oscTrackAddress(zone: number, field: "mute" | "solo" | "arm" | "volume"): string {
  assertZone(zone);
  return `/helix/track/${zone}/${field}`;
}

export function oscTransportAddress(command: "play" | "stop" | "return" | "record"): string {
  return `/helix/transport/${command}`;
}

export function oscBankAddress(): string {
  return "/helix/bank";
}

function typeTag(value: OscArgument): string {
  if (typeof value === "string") return "s";
  if (typeof value === "boolean") return value ? "T" : "F";
  return Number.isInteger(value) ? "i" : "f";
}

function encodeArgument(value: OscArgument): Uint8Array {
  if (typeof value === "string") return encodeString(value);
  if (typeof value === "boolean") return new Uint8Array();
  const bytes = new Uint8Array(4);
  const view = new DataView(bytes.buffer);
  if (Number.isInteger(value)) view.setInt32(0, value, false);
  else view.setFloat32(0, value, false);
  return bytes;
}

function encodeString(value: string): Uint8Array {
  const bytes = new TextEncoder().encode(`${value}\0`);
  const paddedLength = Math.ceil(bytes.length / 4) * 4;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  return padded;
}

function readString(packet: Uint8Array, increment: () => number): { value: string; next: number } {
  const start = increment();
  let end = start;
  while (end < packet.length && packet[end] !== 0) end += 1;
  if (end >= packet.length) throw new Error("Unterminated OSC string.");
  const value = new TextDecoder().decode(packet.slice(start, end));
  let next = end + 1;
  while (next % 4 !== 0) next += 1;
  if (next > packet.length) throw new Error("Truncated OSC padding.");
  return { value, next };
}

function assertAvailable(packet: Uint8Array, offset: number, size: number): void {
  if (offset + size > packet.length) throw new Error("Truncated OSC argument.");
}

function assertZone(zone: number): void {
  if (!Number.isInteger(zone) || zone < 0 || zone > 7)
    throw new RangeError("OSC track zone must be 0 through 7.");
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}
