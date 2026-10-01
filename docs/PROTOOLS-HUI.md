# Pro Tools HUI Adapter

## Implementation decision

Helix now has a native HUI transport path behind the `HelixAdapter` contract. It uses the `midi` Node binding over RtMidi rather than browser MIDI. The binding exposes native MIDI input/output and supports Linux through ALSA or JACK, macOS through CoreMIDI, and Windows through the Windows multimedia backend.[1] RtMidi keeps input and output as separate connections, enumerates ports, handles hot-pluggable devices, and passes raw MIDI bytes to the application.[2]

The implementation is in [`hui-midi-adapter.server.ts`](../src/lib/udawca/hui-midi-adapter.server.ts). It is server/desktop-only and must not be imported into the browser bundle.

The runnable desktop entrypoint is `scripts/protools-hui.ts`. From the repository root, run `npm run hui:list` to enumerate native MIDI ports. Then configure Pro Tools' HUI peripheral and connect with the exact names:

```shell
HUI_INPUT_PORT="Pro Tools HUI In" HUI_OUTPUT_PORT="Pro Tools HUI Out" npm run hui:connect
```

The connect command opens both native MIDI ports, prints the adapter health, sends the HUI keepalive once per second, and closes both ports on Ctrl+C. It is a transport smoke test; the Agent UI still needs the desktop host runtime to inject the configured adapter instance rather than the browser preview fixture.

## HUI messages implemented

The codec in [`hui-protocol.ts`](../src/lib/udawca/hui-protocol.ts) implements the mappings verified against open-source HUI implementations:

- Channel button control uses a zone-select CC (`0x0C`) followed by a button-port CC (`0x2C`). The button index is divided into eight-button zones. Mute, solo, arm, select, bank, channel, and transport constants are included.[3]
- Fader positions use paired 7-bit CCs for a 14-bit value. The high byte is sent on `0x00–0x08` and the low byte on `0x20–0x28`. Fader touch uses the selected zone (`0x0F`) followed by `0x2F` with `0x40` for down and `0x00` for up.[4] [5]
- HUI keepalive is a note message with note and velocity zero. The native adapter sends it once per second by default, matching the documented HUI requirement that a ping be sent every second.[3]
- Send automation selects HUI Send A–E through the researched assignment CCs (`95–91`) and moves the selected channel’s relative knob (`0x40–0x47`). Helix converts the requested dB delta into bounded 0.5 dB relative steps and refuses a destination that is not already assigned in the host send slot.
- Polyphonic aftertouch carries the two 4-bit channel meter values; Helix decodes left/right meter feedback into `meterLeftDb`/`meterRightDb`. Knob LED feedback (`0x10–0x17`) updates the active send slot, while fader/button feedback updates track state and `feedbackAt`.

The decoder preserves HUI's selected button and touch zones, reconstructs 14-bit fader values, and updates the adapter's observable session state from feedback. The HUI fader-to-dB curve is host/device dependent, so Helix intentionally reports fader writes as coarse rather than exact.

## Pro Tools setup

The native adapter requires two MIDI port names: one input and one output. On macOS, a virtual IAC Driver port is a supported bridge. Pro Tools is configured under **Setup → Peripherals → MIDI Controllers** with **Type: HUI**, the receive and send ports set to the selected bridge, and eight channels.[6] Windows and Linux use the corresponding physical or virtual MIDI ports exposed by their native MIDI backend.

The adapter does not assume that a port named “Pro Tools” exists. It enumerates available ports and requires an explicit configured name. This avoids silently opening the wrong MIDI device.

## Supported operation path

The native adapter currently maps mute, solo, record arm, coarse volume, existing-send level automation, play, stop, return-to-zero, and record operations. It supports bank-left and bank-right commands through its adapter-level `bank()` method. HUI does not provide a portable byte-level command for creating/reassigning a Pro Tools I/O path, so route creation and destination reassignment remain explicitly refused; the send slot must already exist in Pro Tools. Unsupported operations such as rename, clip editing, exact plugin parameters, and take management return refusal or partial results instead of being represented as successful HUI commits.

The execution flow is:

```text
Agent operation → capability check → HUI byte sequence → MIDI output
                                                    ↓
                                      HUI feedback decoder → observable state
```

The existing Agent approval, operation phase, verification, and ledger path remains authoritative. HUI feedback is used for observation, but the adapter does not claim exact host state where HUI cannot provide it.

## Current validation

The protocol tests assert exact bytes for button presses, 14-bit fader gestures, send-mode/relative-knob messages, selected-zone decoding, meters, and keepalive. Native adapter tests use an injected fake MIDI port to validate port selection, send dispatch, meter/send feedback updates, unsupported-operation refusal, and lifecycle behavior without requiring a physical MIDI device.

The `midi` dependency is MIT-licensed and compiles a native addon. Linux builds require ALSA development headers; the sandbox required `libasound2-dev` before the binding compiled successfully.[1]

## References

[1]: https://github.com/justinlatimer/node-midi "node-midi RtMidi Node.js wrapper"
[2]: https://caml.music.mcgill.ca/~gary/rtmidi/ "RtMidi tutorial and platform API documentation"
[3]: https://github.com/git-moss/DrivenByMoss/blob/master/src/main/java/de/mossgrabers/controller/mackie/hui/controller/HUIControlSurface.java "DrivenByMoss HUI control-surface implementation"
[4]: https://raw.githubusercontent.com/nathancarlton/midi_cc_to_hui/main/cc_to_hui.py "MIDI CC to HUI fader encoder"
[5]: https://github.com/NicoG60/TouchMCU/blob/main/doc/mackie_control_protocol.md "TouchMCU Mackie/HUI protocol research notes"
[6]: https://github.com/nathancarlton/midi_cc_to_hui "Pro Tools HUI and IAC Driver setup notes"
[7]: https://github.com/git-moss/DrivenByMoss-Documentation/blob/master/Mackie/Mackie-HUI.md "HUI assignment, send modes, and knob controls"
[8]: https://www.avid.com/pro-tools/user-guide/aux-tracks "Avid Pro Tools aux tracks and send workflow"
