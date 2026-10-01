# Session Backup and Recovery

Helix supports voice-triggered local session checkpoints through the normal Agent intent path.

## Voice commands

- `Back up the session`
- `Save a checkpoint as Before vocal routing`
- `List my session backups`
- `Restore the latest backup`
- `Recover the checkpoint Before vocal routing`

Final native or browser-preview transcripts are compiled exactly like typed prompts. Interim speech is ignored.

## Safety behavior

- Creating a backup is non-destructive and immediately writes a versioned local snapshot.
- Recovery stages a named snapshot and does not replace the current session until approved.
- At the highest autonomy level, a staged recovery can be approved automatically; lower autonomy levels require the Agent's **Approve restore** action.
- Recovery verifies the schema version and checksum before replacing the active session.
- A failed integrity check refuses the restore and leaves the current session untouched.
- Existing operation-level snapshots and ledger rollback remain separate from named session backups.

## Storage boundary

The browser implementation uses `localStorage` under `helix.session.backups.v1`. Native desktop runtimes now have the durable filesystem-backed [`native-project-state.server.ts`](../src/lib/helix/native-project-state.server.ts) store, which adds atomic saves, rotating backup files, schema migration boundaries, checksum verification, and interrupted-save recovery. Raw microphone audio is never included in a session backup.
