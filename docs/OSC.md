# Helix OSC Adapter

Helix now has an experimental native OSC/UDP adapter alongside HUI and MCU. OSC is intentionally modeled as a typed Helix profile rather than pretending that every DAW shares the same OSC address space.

## Profile

The codec in [`osc-protocol.ts`](../src/lib/udawca/osc-protocol.ts) supports:

- `/helix/track/{zone}/mute` with boolean or integer values.
- `/helix/track/{zone}/solo` with boolean or integer values.
- `/helix/track/{zone}/arm` with boolean or integer values.
- `/helix/track/{zone}/volume` with float dB values.
- `/helix/transport/{play|stop|record}` with a boolean trigger.
- `/helix/bank` with an integer delta.
- `/helix/transport/playing` feedback.

The adapter uses OSC type tags and big-endian OSC argument encoding. It does not claim compatibility with a DAW's proprietary OSC namespace until that host profile is explicitly added.

## Native transport

[`osc-adapter.server.ts`](../src/lib/udawca/osc-adapter.server.ts) uses Node's UDP socket implementation on Windows, macOS, and Linux. Configuration requires a local bind port plus remote host and port. Feedback is optional; the adapter reports typed messages sent and distinguishes transport connectivity from exact host verification.

The runnable bridge smoke test is:

```shell
OSC_LOCAL_PORT=9000 OSC_REMOTE_HOST=127.0.0.1 OSC_REMOTE_PORT=9001 npm run osc:connect
```

The current browser Agent UI exposes OSC as an experimental protocol selection, but does not claim a live UDP connection without desktop configuration.

## References

- [Open Sound Control 1.0 specification](https://opensoundcontrol.stanford.edu/spec-1_0.html)
- [OSC 1.0 type tag and message format](https://opensoundcontrol.stanford.edu/spec-1_0.html#toplevel)
