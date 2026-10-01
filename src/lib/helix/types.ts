export type HostId =
  | "logic"
  | "cubase"
  | "protools"
  | "reaper"
  | "studioone"
  | "ableton"
  | "flstudio"
  | "bitwig"
  | "helix";

export type Protocol = "MCU" | "HUI" | "native";
export type Precision = "EXACT" | "HIGH" | "NORMAL" | "COARSE" | "UNKNOWN";
export type CapLevel = 0 | 1 | 2 | 3;
export type Mechanism =
  | "native"
  | "plugin_bridge"
  | "control_surface"
  | "file"
  | "human";
export type AutonomyLevel = 0 | 1 | 2 | 3 | 4 | 5;
export type TransportCommand = "play" | "stop" | "return" | "record";
export type TrackKind = "audio" | "bus" | "master" | "midi";
export type MarkerType = "intro" | "verse" | "chorus" | "bridge" | "outro";
export type FindingSeverity = "critical" | "warn" | "info";
export type OpPhase =
  | "propose"
  | "validate"
  | "approve"
  | "snapshot"
  | "execute"
  | "observe"
  | "verify"
  | "commit"
  | "rollback"
  | "refused"
  | "skipped";
export type VerifyClass = "V0" | "V1" | "V2" | "V3";

export interface Take {
  id: string;
  name: string;
  snrDb: number;
  clippingEvents: number;
  pitchStability: number;
  timingStability: number;
  noiseFloorDb: number;
  selected: boolean;
  archived: boolean;
}

export interface AutomationPoint {
  time: number;
  db: number;
}

export interface Clip {
  id: string;
  start: number;
  duration: number;
  silent?: boolean;
  missing?: boolean;
}

export interface Send {
  dest: string;
  db: number;
}

export interface Track {
  id: string;
  index: number;
  name: string;
  tint: number;
  kind: TrackKind;
  volumeDb: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  arm: boolean;
  peakDb: number;
  truePeakDb: number;
  lufsIntegrated: number;
  rmsDb: number;
  clippingEvents: number;
  dcOffset: number;
  missingMedia: boolean;
  unusedSilenceSec: number;
  unused: boolean;
  plugins: string[];
  sends: Send[];
  automation: AutomationPoint[];
  takes: Take[];
  clips: Clip[];
  waveformSeed: number;
  targetDb?: number;
}

export interface Marker {
  id: string;
  name: string;
  time: number;
  duration: number;
  type: MarkerType;
}

export interface MixTargets {
  guitarBusDb: number;
  masterTruePeakDb: number;
}

export interface SessionState {
  name: string;
  artist: string;
  tempo: number;
  sampleRate: number;
  duration: number;
  playhead: number;
  playing: boolean;
  tracks: Track[];
  markers: Marker[];
  targets: MixTargets;
}

export interface SurfaceCaps {
  mixer: boolean;
  transport: boolean;
  banking: boolean;
  metering: boolean;
  parameter_feedback: boolean;
}

export interface NativeCaps {
  track_creation: boolean;
  clip_editing: boolean;
  parameter_exact: boolean;
  automation: boolean;
  rename: boolean;
  take_lanes: boolean;
}

export interface PluginCaps {
  audio_analysis: boolean;
  track_state: boolean;
  parameter_state: boolean;
  clip_ops: boolean;
}

export interface FileCaps {
  read: boolean;
  write: boolean;
}

export interface CapabilityGraph {
  host: HostId;
  label: string;
  vendor: string;
  protocol: Protocol;
  surface: SurfaceCaps;
  native: NativeCaps;
  plugin_bridge: PluginCaps;
  file: FileCaps;
  precision: {
    volume: Precision;
    pan: Precision;
    mute: Precision;
  };
  notes: string;
  agentFirst: boolean;
}

export interface Constraints {
  maxGainChangeDb: number;
  allowTrackDeletion: boolean;
  allowRoutingChanges: boolean;
  allowPluginInsertion: boolean;
  allowAutomationChanges: boolean;
  requireBackup: boolean;
}

export const DEFAULT_CONSTRAINTS: Constraints = {
  maxGainChangeDb: 3,
  allowTrackDeletion: false,
  allowRoutingChanges: false,
  allowPluginInsertion: false,
  allowAutomationChanges: true,
  requireBackup: true,
};

export type Change =
  | { kind: "volume"; trackId: string; absDb?: number; deltaDb?: number }
  | { kind: "pan"; trackId: string; value: number }
  | { kind: "mute"; trackId: string; enabled: boolean }
  | { kind: "solo"; trackId: string; enabled: boolean }
  | { kind: "arm"; trackId: string; enabled: boolean }
  | { kind: "rename"; trackId: string; name: string }
  | { kind: "trim_silence"; trackId: string }
  | { kind: "archive_takes"; trackId: string; keepIds: string[] }
  | { kind: "automation_delta"; trackId: string; region: MarkerType; deltaDb: number }
  | { kind: "flatten_chorus"; trackId: string; chorusDb: number }
  | { kind: "transport"; command: TransportCommand };

export interface Operation {
  id: string;
  intent: string;
  summary: string;
  trackId?: string;
  findingId?: string;
  mechanism: Mechanism;
  cap: CapLevel;
  precision: Precision;
  verifyClass: VerifyClass;
  changes: Change[];
  preconditions: string[];
  toleranceDb: number;
  reversibility: boolean;
  approval: "user" | "auto" | "none";
  autoSafe: boolean;
  phase: OpPhase;
  refusedReason?: string;
  verifyNote?: string;
}

export interface Snapshot {
  id: string;
  operationId: string;
  session: SessionState;
  bankOffset: number;
}

export interface DiffLine {
  label: string;
  before: string;
  after: string;
  positive?: boolean;
}

export interface LedgerEntry {
  id: string;
  operationId: string;
  timestamp: number;
  intent: string;
  summary: string;
  target: string;
  mechanism: Mechanism;
  diffs: DiffLine[];
  human: string;
  verification: "PASS" | "FAIL" | "REFUSED" | "SKIPPED";
  verifyClass: VerifyClass;
  rollbackAvailable: boolean;
  rolledBack?: boolean;
}

export interface Finding {
  id: string;
  severity: FindingSeverity;
  trackId?: string;
  title: string;
  detail: string;
  evidence: string[];
  autoSafe: boolean;
  fixable: boolean;
  intentKind: string;
}

export type Intent =
  | { kind: "inspect_session" }
  | { kind: "inspect_takes"; trackId?: string }
  | { kind: "inspect_routing" }
  | { kind: "fix_safe" }
  | { kind: "approve_all" }
  | { kind: "undo_last" }
  | {
      kind: "set_gain";
      trackId: string;
      mode: "abs" | "rel";
      db: number;
      exact?: boolean;
    }
  | { kind: "set_pan"; trackId: string; value: number }
  | { kind: "mute"; trackId: string; enabled: boolean }
  | { kind: "solo"; trackId: string; enabled: boolean }
  | { kind: "arm"; trackId: string; enabled: boolean }
  | { kind: "transport"; command: TransportCommand }
  | { kind: "bank"; delta: number }
  | { kind: "write_automation"; trackId: string; region: "chorus"; deltaDb: number }
  | { kind: "organize_takes"; trackId: string; keep: number }
  | { kind: "trim_silence"; trackId?: string }
  | { kind: "rename"; trackId: string; name: string }
  | { kind: "reset_session" }
  | { kind: "unknown"; text: string };

export interface AgentMessage {
  id: string;
  role: "user" | "agent" | "system";
  text: string;
  findingIds?: string[];
  operationIds?: string[];
  timestamp: number;
}

export interface CompileResult {
  intent: Intent;
  source: "local" | "model";
  confidence: number;
}
