# Embedded extension SDK

`nova-ext-sdk.js` is a hand-maintained ES5-compatible bundle of the
TypeScript SDK in `src/extension-sdk/`. It is served to extension authors
at `nova-ext://__sdk__/nova-ext-sdk.js` so their background pages can call
`defineExtension(...)` without a build step.

**Whenever `src/extension-sdk/` changes**, this file must be updated to
match. It is not generated automatically. The two must stay in sync — if
they diverge, extensions written against the documented SDK will silently
get old behavior.