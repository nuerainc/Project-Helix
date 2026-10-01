# OG asset recipes

Stage generated files under `.grok/` and atomically publish only the final public asset.

```sh
node scripts/write-atomic.mjs .grok/og.jpg.tmp public/og.jpg
node scripts/write-atomic.mjs .grok/x-banner.jpg.tmp public/x-banner.jpg
node scripts/write-atomic.mjs .grok/site.json.tmp src/lib/og/site.json
```
