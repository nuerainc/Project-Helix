import type { SessionState } from "../helix/types.ts";
import {
  createNodeProToolsHuiAdapter,
  type ProToolsHuiConfig,
  type ProToolsHuiAdapter,
} from "./hui-midi-adapter.server.ts";
import {
  createNodeMcuAdapter,
  type McuAdapter,
  type McuConfig,
} from "./mcu-midi-adapter.server.ts";
import { createNodeOscAdapter, type OscAdapter, type OscConfig } from "./osc-adapter.server.ts";
import {
  PROTOCOLS,
  protocolById,
  type HelixSurfaceProtocol,
  type ProtocolDescriptor,
} from "./protocol-registry.ts";

export type NativeAdapter = ProToolsHuiAdapter | McuAdapter | OscAdapter;

export interface AdapterRegistryEntry extends ProtocolDescriptor {
  adapterId: string;
}

export function listAdapterRegistry(): AdapterRegistryEntry[] {
  return PROTOCOLS.map((protocol) => ({
    ...protocol,
    adapterId:
      protocol.id === "HUI"
        ? "protools-hui-native"
        : protocol.id === "MCU"
          ? "mackie-mcu-native"
          : "helix-osc-native",
  }));
}

export async function createNativeAdapter(
  protocol: HelixSurfaceProtocol,
  config: ProToolsHuiConfig | McuConfig | OscConfig,
  initial?: SessionState,
): Promise<NativeAdapter> {
  protocolById(protocol);
  if (protocol === "HUI") return createNodeProToolsHuiAdapter(config as ProToolsHuiConfig, initial);
  if (protocol === "MCU") return createNodeMcuAdapter(config as McuConfig, initial);
  return createNodeOscAdapter(config as OscConfig, initial);
}
