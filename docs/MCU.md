# Mackie Control Universal (MCU) Adapter

Helix now includes a native MCU transport alongside HUI. The adapter uses the same cross-platform RtMidi port lifecycle as HUI, but keeps the wire codec separate because MCU and HUI use different message families.

## MCU wire mappings

The codec is implemented in [`mcu-protocol.ts`](../src/lib/udawca/mcu-protocol.ts):

- Channel buttons use Note On messages on MIDI channel 1, with velocity `0x7f` for press and velocity `0` for release.
- Record-arm notes are `0–7`; solo notes are `8–15`; mute notes are `16–23`; select notes are `24–31`.
- Bank left/right are notes `46/47`; channel left/right are notes `48/49`.
- Transport notes are rewind `91`, forward `92`, stop `93`, play `94`, and record `95`.
- Faders use full 14-bit MIDI Pitch Bend values on channels 1–9. The first eight channels are channel strips and channel 9 is the master fader. Pitch Bend is sent LSB first, followed by MSB.
- Fader touch uses Note On notes `104–112`, with the fader channel identifying the strip.

These mappings are based on the public TouchMCU protocol notes and cross-checked against the DrivenByMoss MCU implementation documentation.[1] [2]

## Native adapter

[`mcu-midi-adapter.server.ts`](../src/lib/udawca/mcu-midi-adapter.server.ts) implements the Helix adapter contract for Windows, macOS, and Linux. It supports:

- Explicit input/output MIDI port selection.
- Mute, solo, record arm, coarse volume, play, stop, and record operations. Return-to-zero is refused because MCU has no universal dedicated wire command for it.
- Bank-left and bank-right navigation.
- MCU input feedback for faders, fader touch, channel buttons, transport, and banking.
- Truthful refusal and partial results for unsupported operations such as rename, clip editing, exact plugin parameters, and take management.
- No fabricated MCU keepalive. Unlike HUI, MCU does not require the HUI one-second ping; connection health is based on native port lifecycle and optional incoming feedback.

MCU is currently exposed under the Pro Tools host capability because the current host capability graph is Pro Tools-focused, but the wire adapter itself is DAW-neutral and can be reused for any host that exposes an MCU control-surface endpoint.

## Runnable commands

```shell
npm run mcu:list
MCU_INPUT_PORT="Mackie Control In" MCU_OUTPUT_PORT="Mackie Control Out" npm run mcu:connect
```

The connect command opens the configured native MIDI ports and keeps the transport alive until Ctrl+C. It is a desktop transport smoke test; the Agent runtime still needs to select MCU versus HUI when a live host session is opened.

## References

[1]: https://github.com/NicoG60/TouchMCU/blob/main/doc/mackie_control_protocol.md "TouchMCU Mackie Control protocol notes"
[2]: https://github.com/git-moss/DrivenByMoss-Documentation/blob/master/Mackie/Mackie-MCU.md "DrivenByMoss MCU support and hardware documentation"
[3]: https://github.com/misofm/control-surface "Typed MCU/X-Touch codec and lifecycle reference"
