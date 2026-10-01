export type MidiMessage = readonly [status: number, data1: number, data2: number];

export interface NativeMidiPort {
  listInputs(): string[];
  listOutputs(): string[];
  open(
    inputName: string,
    outputName: string,
    onMessage: (message: number[]) => void,
    onError: (error: Error) => void,
  ): void;
  send(message: MidiMessage): void;
  close(): void;
}

export async function createNodeMidiPort(): Promise<NativeMidiPort> {
  const module = await import("midi");
  const midi = module.default ?? module;
  let input: InstanceType<typeof midi.Input> | undefined;
  let output: InstanceType<typeof midi.Output> | undefined;
  return {
    listInputs: () => {
      const probe = new midi.Input();
      const names = Array.from({ length: probe.getPortCount() }, (_, index) =>
        probe.getPortName(index),
      );
      probe.closePort();
      return names;
    },
    listOutputs: () => {
      const probe = new midi.Output();
      const names = Array.from({ length: probe.getPortCount() }, (_, index) =>
        probe.getPortName(index),
      );
      probe.closePort();
      return names;
    },
    open: (inputName, outputName, onMessage, onError) => {
      input = new midi.Input();
      output = new midi.Output();
      const inputIndex = findPort(input, inputName);
      const outputIndex = findPort(output, outputName);
      input.ignoreTypes(false, false, false);
      input.on("message", (_deltaTime, message) => onMessage(message));
      input.on("error", onError);
      input.openPort(inputIndex);
      output.openPort(outputIndex);
    },
    send: (message) => output?.sendMessage([...message]),
    close: () => {
      input?.closePort();
      output?.closePort();
      input = undefined;
      output = undefined;
    },
  };
}

function findPort(
  port: { getPortCount(): number; getPortName(index: number): string },
  name: string,
): number {
  const index = Array.from({ length: port.getPortCount() }, (_, candidate) => candidate).find(
    (candidate) => port.getPortName(candidate) === name,
  );
  if (index === undefined) throw new Error(`MIDI port not found: ${name}`);
  return index;
}
