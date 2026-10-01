# Native Project-State Layer

Helix now has a native filesystem-backed project-state store for desktop runtimes. It is separate from the browser `localStorage` preview store, but it uses the same semantic session, operation, ledger, and voice-macro data structures.

## File layout

For project ID `night-shift` and state directory `.helix-state`, the active document is `.helix-state/night-shift.helix.json`. Previous verified documents are rotated as `.helix-state/night-shift.<timestamp>.bak.json`. The store retains a bounded number of backups, five by default.

Each document contains a schema identifier, version, project ID, save timestamp, session state, operations, ledger entries, voice macros, optional metadata, and an integrity checksum. Unknown schema versions and checksum mismatches are refused before loading or restoring.

## Save and crash recovery

Saves write a journal before writing a private temporary file. The temporary file is flushed and synced, then atomically renamed into place. A prior active document is copied to a timestamped backup before replacement. On startup, an interrupted journal is inspected; a valid staged document is promoted, while an invalid journal is discarded without replacing the active state.

This protects the last committed project state from partial writes and makes recovery deterministic after a process or machine interruption. Backup rotation never deletes the active document.

## CLI

```bash
npm run project:state -- --root .helix-state --project night-shift
npm run project:state -- --root .helix-state --project night-shift --list
npm run project:state -- --root .helix-state --project night-shift --restore latest
```

Native desktop integration should call `createProjectStateStore()` from `native-project-state.server.ts` and provide the current session, operation list, ledger, and voice macro catalog on save. Browser preview remains intentionally local and does not claim filesystem durability.
