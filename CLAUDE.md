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

After editing hub or shared code, run `bun run rebuild` to pick up changes. After editing only web code, use `bun run dev:web` for faster iteration with HMR.

## Project Structure

- `shared/` — `@hapi/protocol`: Zod schemas, types, and utilities shared across packages
- `hub/` — local hub server (Hono + Socket.IO + Bun SQLite)
- `cli/` — CLI client that connects to the hub
- `web/` — React 19 SPA (TanStack Router + Query, Tailwind CSS)

## Testing

```
bun run test               # all packages
bun run test:hub           # hub only
bun run test:web           # web only
bun run test:cli           # cli only
bun run typecheck          # tsc --noEmit across all packages
```

## Pull Requests

A reviewer should be able to understand, evaluate, and approve a PR from its description alone — without reading the diff first. Every PR opened by an agent MUST use the format below with `gh pr create --body`.

### Required PR body format

```markdown
## Summary

<2-4 sentences: what user-facing problem this solves and how. Not "added files" — describe the behavior change.>

Closes #<issue> <!-- or: Resolves hapi-xxx -->

## What changed

<File-by-file walkthrough grouped by package. For each file, one line explaining what changed and why.>

**shared/**
- `sessionStatus.ts` (new) — pure function to derive status key from session state
- `index.ts` — re-export new module

**web/**
- `SessionList.tsx` — replaced hardcoded status dot with registry-driven lookup
- `locales/en.ts`, `locales/zh-CN.ts` — added i18n keys for status labels

**hub/**
- (no changes)

## How it works

<1-2 paragraphs or a short list explaining the design/architecture. Key decisions, trade-offs, patterns used. What would a new contributor need to know?>

## Test evidence

<Paste actual test + typecheck output (abbreviated if long). Show what you ran and that it passes.>

```
$ bun run test:web
 ✓ 42 tests passed (3 skipped)
$ bun run typecheck
 ✓ no errors
```

## Acceptance criteria

<Copy from the bead and check off each item. Leave unchecked items with a note if intentionally deferred.>

- [x] Each session row shows colored status dot derived via deriveSessionStatus()
- [x] Permission status shows amber pulsing dot with "needs input · N"
- [ ] ~Collapsed group attention badge~ (deferred to follow-up — needs design review)

## Screenshots

<Required for any UI change. Use the sandbox — never the live hub.>

<!--
bun scripts/sandbox-hub.ts start --seed
HAPI_HOME=$SANDBOX_HOME bun scripts/ui-preview.ts --hub $SANDBOX_URL --output /tmp/pr-screenshot.png /sessions
bun scripts/sandbox-hub.ts stop
-->

<If no UI changes, write: "No visual changes.">
```

### Rules

- **Title format**: `type(scope): description` — e.g., `feat(web): add session status indicators`
  - Types: `feat`, `fix`, `refactor`, `test`, `chore`, `docs`
  - Scope: `web`, `hub`, `cli`, `shared`, or omit for cross-cutting
- **Link the bead**: Always reference the bead ID (`hapi-xxx`) in the summary
- **File walkthrough is mandatory**: Reviewers scan this first. Group by package, one line per file
- **Test evidence is mandatory**: Paste real output, not "tests pass". Show the command and result
- **Acceptance criteria from bead**: Copy verbatim and check off. If criteria were adjusted during implementation, note why
- **Screenshots for UI work**: Use the sandbox (see `.claude/rules/screenshots.md`). Include desktop; add mobile if layout differs
- **No empty sections**: If a section doesn't apply, write why (e.g., "No UI changes" or "No acceptance criteria — bug fix")
- **Keep it scannable**: Use bullets and short lines. The description should take <60 seconds to read

## Agent Context

- `.claude/rules/` — path-scoped rules auto-loaded when working in hub/, web/, shared/, or test files
- `.claude/agents/` — specialized agents (bug-detective, test-runner, git-ops, code-reviewer)
- `.claude/shared/` — shared workflows and architecture docs referenced by agents
  - `permission-system.md` — permission lifecycle, enforcement, modes, hooks, and local vs remote differences
