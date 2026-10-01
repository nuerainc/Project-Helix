import { HOSTS } from "@/lib/helix/hosts";
import { PROTOCOLS } from "@/lib/udawca/protocol-registry";
import { useHelix } from "@/store/helix-store";

export function CapsPanel() {
  const caps = useHelix((s) => s.caps);
  const open = useHelix((s) => s.capsOpen);
  const toggle = useHelix((s) => s.toggleCaps);
  const adapterHealth = useHelix((s) => s.adapterHealth);
  const adapterProtocol = useHelix((s) => s.adapterProtocol);
  const setAdapterProtocol = useHelix((s) => s.setAdapterProtocol);
  const connectAdapter = useHelix((s) => s.connectAdapter);
  const disconnectAdapter = useHelix((s) => s.disconnectAdapter);
  if (!open) return null;

  const rows: { layer: string; items: { k: string; v: boolean | string }[] }[] = [
    {
      layer: "Layer 1 · Surface",
      items: Object.entries(caps.surface).map(([k, v]) => ({ k, v })),
    },
    {
      layer: "Layer 2 · Native",
      items: Object.entries(caps.native).map(([k, v]) => ({ k, v })),
    },
    {
      layer: "Layer 2 · Plugin bridge",
      items: Object.entries(caps.plugin_bridge).map(([k, v]) => ({ k, v })),
    },
    {
      layer: "Layer 3 · File",
      items: Object.entries(caps.file).map(([k, v]) => ({ k, v })),
    },
  ];

  return (
    <div className="fixed inset-0 z-40" onClick={() => toggle(false)}>
      <div
        className="absolute top-14 right-3 left-3 max-h-[min(80vh,640px)] overflow-y-auto rounded-lg bg-elevated p-4 shadow-[var(--shadow-border)] md:left-auto md:w-[420px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-subtle">
              Capability graph
            </p>
            <h2 className="text-lg font-medium tracking-tight">{caps.label}</h2>
            <p className="mt-1 text-sm text-muted">{caps.notes}</p>
          </div>
          <button type="button" className="text-xs text-muted" onClick={() => toggle(false)}>
            Close
          </button>
        </div>
        {caps.agentFirst && (
          <p className="mb-3 rounded-sm bg-ok-dim px-2.5 py-2 text-sm text-ok">
            Agent-first host. Intent compiles to native session operations — the long-term Helix
            DAW.
          </p>
        )}
        {caps.host === "protools" && (
          <section className="mb-3 rounded-sm bg-bg p-2.5">
            <p className="text-[10px] uppercase tracking-wider text-subtle">Surface protocol</p>
            <div className="mt-2 grid grid-cols-3 gap-1">
              {PROTOCOLS.map((protocol) => (
                <button
                  key={protocol.id}
                  type="button"
                  onClick={() => setAdapterProtocol(protocol.id)}
                  className={
                    adapterProtocol === protocol.id
                      ? "rounded-xs bg-fg px-2 py-1.5 text-[11px] text-bg"
                      : "rounded-xs bg-elevated px-2 py-1.5 text-[11px] text-muted hover:text-fg"
                  }
                >
                  {protocol.id}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">
              {PROTOCOLS.find((protocol) => protocol.id === adapterProtocol)?.label} ·{" "}
              {PROTOCOLS.find((protocol) => protocol.id === adapterProtocol)?.transport}
            </p>
            <p className="mt-1 text-[11px] text-subtle">
              {adapterProtocol === "HUI"
                ? "Browser fixture available; native HUI uses explicit MIDI ports."
                : adapterProtocol === "MCU"
                  ? "Native MCU uses note buttons and 14-bit Pitch Bend faders."
                  : "Experimental typed OSC uses a native UDP bridge profile."}
            </p>
          </section>
        )}
        <div className="mb-3 grid grid-cols-3 gap-2 font-mono text-[11px]">
          <Meta k="Protocol" v={caps.protocol} />
          <Meta k="Volume" v={caps.precision.volume} />
          <Meta k="Pan" v={caps.precision.pan} />
        </div>
        {caps.host === "protools" && adapterProtocol === "HUI" && adapterHealth && (
          <section className="mb-3 rounded-sm bg-bg p-2.5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-subtle">Adapter health</p>
                <p className="mt-1 text-sm font-medium">Pro Tools · HUI preview fixture</p>
                <p className="mt-1 text-xs text-muted">{adapterHealth.message}</p>
              </div>
              <span
                className={
                  adapterHealth.state === "connected"
                    ? "rounded-xs bg-ok-dim px-1.5 py-0.5 text-[10px] uppercase text-ok"
                    : "rounded-xs bg-warn-dim px-1.5 py-0.5 text-[10px] uppercase text-warn"
                }
              >
                {adapterHealth.state}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {adapterHealth.state === "connected" ? (
                <button
                  type="button"
                  onClick={() => void disconnectAdapter()}
                  className="rounded-xs bg-elevated px-2 py-1 text-[11px] text-muted hover:text-fg"
                >
                  Disconnect fixture
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void connectAdapter()}
                  className="rounded-xs bg-elevated px-2 py-1 text-[11px] text-muted hover:text-fg"
                >
                  Connect preview fixture
                </button>
              )}
            </div>
          </section>
        )}
        <div className="space-y-3">
          {rows.map((row) => (
            <section key={row.layer}>
              <p className="mb-1 text-[10px] uppercase tracking-wider text-subtle">{row.layer}</p>
              <ul className="grid grid-cols-2 gap-1">
                {row.items.map((it) => (
                  <li
                    key={it.k}
                    className="flex items-center justify-between rounded-xs bg-bg px-2 py-1 text-xs"
                  >
                    <span className="text-muted">{it.k.replaceAll("_", " ")}</span>
                    <span
                      className={
                        typeof it.v === "boolean" ? (it.v ? "text-ok" : "text-subtle") : "text-fg"
                      }
                    >
                      {typeof it.v === "boolean" ? (it.v ? "yes" : "no") : it.v}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-subtle">
          {HOSTS.length} hosts in the adapter registry.
        </p>
      </div>
    </div>
  );
}

function Meta({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-sm bg-bg px-2 py-1.5">
      <p className="text-[10px] uppercase tracking-wider text-subtle">{k}</p>
      <p>{v}</p>
    </div>
  );
}
