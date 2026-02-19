# HAPI Project Instructions

## Dev Build & Hub Management

Use `bun run rebuild` to build from source and restart the local hub. This compiles the CLI binary, replaces the globally-installed `hapi`, and restarts the hub process with a health check.

```
bun run rebuild            # full: stop → build → install binary → start
bun run rebuild restart    # restart hub without rebuilding
bun run rebuild stop       # stop the hub
bun run rebuild status     # check if hub is running
bun run rebuild logs       # tail hub.log
```

After editing hub or shared code, run `bun run rebuild` to pick up changes. After editing only web code, `bun run rebuild` also works (it rebuilds everything), or use `bun run dev:web` for faster iteration with HMR.

## Project Structure

- `shared/` — `@hapi/protocol`: types, schemas, and utilities shared across packages
- `hub/` — local hub server (Fastify + Socket.io + SQLite)
- `cli/` — CLI client that connects to the hub
- `web/` — React SPA served by the hub

## Testing

```
bun run test               # all packages
bun run test:hub           # hub only
bun run test:web           # web only
bun run test:cli           # cli only
bun run typecheck          # tsc --noEmit across all packages
```
