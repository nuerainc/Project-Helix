declare module "midi" {
  export class Input {
    getPortCount(): number;
    getPortName(port: number): string;
    openPort(port: number): void;
    openVirtualPort(name: string): void;
    ignoreTypes(sysex: boolean, timing: boolean, activeSensing: boolean): void;
    on(event: "message", listener: (deltaTime: number, message: number[]) => void): this;
    on(event: "error", listener: (error: Error) => void): this;
    closePort(): void;
  }

  export class Output {
    getPortCount(): number;
    getPortName(port: number): string;
    openPort(port: number): void;
    openVirtualPort(name: string): void;
    sendMessage(message: number[]): void;
    closePort(): void;
  }
}
