# OG brand asset skill fixture

This checked-in fixture documents the small contract exercised by the repository tests.

## Brand-asset pass:

For a custom card, start the asset task early and keep `/workspace/.grok/og-pending`
fresh for 10 minutes while it runs. The prohibition is explicit: never `wait_tasks`
and never `get_task_output`; the final verification remains the main workflow's
responsibility.

Run the self-check from the workspace root:

```sh
node scripts/brand-check.mjs --game
```

When an asset is ready, stage it outside `public/` and hand it over atomically:

```sh
node scripts/write-atomic.mjs .grok/og.jpg.tmp public/og.jpg
```

See the reference recipes for the banner and site metadata hand-overs.
