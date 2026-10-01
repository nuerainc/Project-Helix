export type HelixSurfaceProtocol = "HUI" | "MCU" | "OSC";

export interface ProtocolDescriptor {
  id: HelixSurfaceProtocol;
  label: string;
  transport: "native-midi" | "udp";
  feedback: "bidirectional" | "input-only";
  precision: "coarse" | "14-bit" | "typed";
  platforms: readonly ["windows", "macos", "linux"];
  status: "implemented" | "experimental";
  documentation: string;
}

export const PROTOCOLS: readonly ProtocolDescriptor[] = [
  {
    id: "HUI",
    label: "Mackie HUI",
    transport: "native-midi",
    feedback: "bidirectional",
    precision: "coarse",
    platforms: ["windows", "macos", "linux"],
    status: "implemented",
    documentation: "docs/PROTOOLS-HUI.md",
  },
  {
    id: "MCU",
    label: "Mackie Control Universal",
    transport: "native-midi",
    feedback: "bidirectional",
    precision: "14-bit",
    platforms: ["windows", "macos", "linux"],
    status: "implemented",
    documentation: "docs/MCU.md",
  },
  {
    id: "OSC",
    label: "Open Sound Control",
    transport: "udp",
    feedback: "bidirectional",
    precision: "typed",
    platforms: ["windows", "macos", "linux"],
    status: "experimental",
    documentation: "docs/OSC.md",
  },
];

export function protocolById(id: HelixSurfaceProtocol): ProtocolDescriptor {
  const descriptor = PROTOCOLS.find((candidate) => candidate.id === id);
  if (!descriptor) throw new Error(`Unknown Helix surface protocol: ${id}`);
  return descriptor;
}
