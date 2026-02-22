# Screenshots of the HAPI Web UI

## Always use the sandbox — never screenshot the live app

The user runs a live HAPI hub on port 3006 with real data. Agents must **never**
take screenshots against that instance. Always use the sandbox.

## Feature state requirement

Screenshots MUST show the specific UI state introduced by the PR. A screenshot
that only shows the default/offline state does NOT demonstrate a status feature,
a team feature, or any state-dependent UI.

**Not acceptable — these are blockers, not disclaimers:**
- "Sandbox sessions appear offline, so status labels aren't visible"
- "Seed fixtures don't include teams, so screenshots show directory groups only"
- "The indicator only appears during live sessions"

The sandbox seeds teams, parent-child sessions, and diverse session states. The
warm-sandbox script keeps active sessions alive with specific states (thinking,
permission-pending, compacting). If the warm states don't cover your feature,
**flag it as a blocker** and request seed data changes — do not ship a screenshot
that doesn't show the feature.

## Seeded session reference

When the sandbox starts with `--seed`, these sessions and states are available.
The warm-sandbox script (auto-started with `--seed`) keeps active sessions alive.

| # | Name | Status | Dot | Team | Notes |
|---|------|--------|-----|------|-------|
| 1 | Refactor auth middleware | thinking | Blue pulse | api-redesign (parent) | acceptAllMessages, DoorOpenIcon, todos 1/4 |
| 2 | S3 export for datasets | offline | Gray | — | Has image message for modal testing |
| 3 | Staging DB cluster | waiting-for-permission | Amber pulse | api-redesign (child of 1) | Pending terraform apply |
| 4 | Fix broken image paths | offline | Gray | — | Completed/idle |
| 5 | Convert class components to hooks | thinking + compacting | Blue pulse + subtitle | always-on | Codex flavor, worktree branch chip |

**Team aggregate statuses:**
- **api-redesign** (indigo `#6366F1`, temporary): **needs-input** (amber) — session 3 has pending requests
- **always-on** (green `#10B981`, persistent): **thinking** (blue) — session 5 is thinking

**Ungrouped sessions** (directory groups):
- Session 2: `projects/data-pipeline`
- Session 4: `projects/blog`

### Disabling warm states

Use `--no-warm` to skip the warm-sandbox script. Sessions will go offline after
30 seconds (useful for testing offline-only views):

```bash
bun scripts/sandbox-hub.ts start --seed --dev --no-warm
```

## Screenshot checklist

Before attaching screenshots to a PR, verify:

- [ ] Screenshot shows the NEW behavior introduced by this PR, not just existing UI
- [ ] Specific visual elements from acceptance criteria are visible
- [ ] If state-dependent (status dots, indicators, modals), the required state is active
- [ ] If the feature requires interaction, `--steps` were used to trigger it
- [ ] Both desktop and mobile viewports included (if layout differs)
- [ ] No "feature not visible" disclaimers — these are blockers, not disclaimers

## Workflow

### 1. Start the sandbox (with seed data)

**Always use `--dev`** when screenshotting changes from the current branch. This
runs the hub from TypeScript source and serves `web/dist` from disk, so a
`bun run build:web` is all you need — no `bun run rebuild` required.

```bash
bun run build:web
bun scripts/sandbox-hub.ts start --seed --dev
```

Without `--dev`, the sandbox uses the globally-installed `hapi` binary (which
has web assets embedded at compile time). Only omit `--dev` if you specifically
need to test the compiled binary.

The script prints:

```
SANDBOX_URL=http://127.0.0.1:<port>
SANDBOX_HOME=/tmp/hapi-sandbox-XXXXX
SANDBOX_TOKEN=<token>
```

Parse `SANDBOX_URL` and `SANDBOX_HOME` from the output.

### 2. Take screenshots

Set `HAPI_HOME` to the sandbox home so `ui-preview.ts` reads the sandbox token:

```bash
HAPI_HOME=<SANDBOX_HOME> bun scripts/ui-preview.ts --hub <SANDBOX_URL> /sessions
```

Mobile viewport:

```bash
HAPI_HOME=<SANDBOX_HOME> bun scripts/ui-preview.ts --hub <SANDBOX_URL> --viewport mobile /sessions
```

### 3. Stop the sandbox when done

```bash
bun scripts/sandbox-hub.ts stop
```

### 4. Check sandbox status at any time

```bash
bun scripts/sandbox-hub.ts status
```

## Interaction steps (`--steps`)

Use `--steps '<json>'` to interact with the page before capturing. Steps run
in order after the page hydrates. This is required for anything that needs a
click, hover, or text input — like opening a session from the list.

| Step | Format | Description |
|---|---|---|
| click | `{"click": "<selector>"}` | Click an element (CSS or Playwright text selector) |
| wait | `{"wait": "<selector>"}` | Wait for element to appear |
| wait | `{"wait": 500}` | Wait N milliseconds |
| type | `{"type": "text"}` | Type into the currently focused element |
| hover | `{"hover": "<selector>"}` | Hover to reveal tooltips or menus |
| scroll | `{"scroll": "<selector>"}` | Scroll element into view |

Example — expand a team group, then open a session:

```bash
HAPI_HOME=$SANDBOX_HOME bun scripts/ui-preview.ts --hub $SANDBOX_URL \
    --steps '[{"click":"text=api-redesign"},{"click":"text=Refactor auth"},{"wait":1500}]' \
    --output /tmp/session-detail.png \
    /sessions
```

Note: seeded sessions are grouped by team (api-redesign, always-on) and by
directory path (for ungrouped sessions). Click the team/group name first to
expand it before the session name becomes clickable.

## Full example

```bash
# Build web assets and start sandbox from source
bun run build:web
bun scripts/sandbox-hub.ts start --seed --dev
# Parse output for SANDBOX_URL and SANDBOX_HOME

# Sessions list (shows team groups + status dots)
HAPI_HOME=$SANDBOX_HOME bun scripts/ui-preview.ts \
    --hub $SANDBOX_URL \
    --output /tmp/hapi-sessions.png \
    /sessions

# Open a session via interaction (shows IntroCard, StatusBar, chat)
HAPI_HOME=$SANDBOX_HOME bun scripts/ui-preview.ts \
    --hub $SANDBOX_URL \
    --steps '[{"click":"text=api-redesign"},{"click":"text=Refactor auth"},{"wait":1500}]' \
    --output /tmp/hapi-session-detail.png \
    /sessions

# Mobile viewport
HAPI_HOME=$SANDBOX_HOME bun scripts/ui-preview.ts \
    --hub $SANDBOX_URL \
    --viewport mobile \
    --output /tmp/hapi-sessions-mobile.png \
    /sessions

# Session with image message (for image modal / pinch-to-zoom testing)
HAPI_HOME=$SANDBOX_HOME bun scripts/ui-preview.ts \
    --hub $SANDBOX_URL \
    --steps '[{"click":"text=data-pipeline"},{"click":"text=S3 export"},{"wait":1000}]' \
    --output /tmp/hapi-image-message.png \
    /sessions

# Stop
bun scripts/sandbox-hub.ts stop
```

## Seeding without starting the hub

To seed a specific database directly:

```bash
bun scripts/seed-fixtures.ts --db /path/to/hapi.db
```

## Adding screenshots to PRs

**Never commit screenshot files to the repository.** Instead, upload them as
GitHub release assets and reference the public URLs inline in the PR body.

### Upload workflow

```bash
# 1. Create a release with the screenshots as assets
gh release create pr<NUMBER>-screenshots \
    --title "PR #<NUMBER> Screenshots" \
    --notes "Auto-generated screenshots for PR review. Safe to delete after merge." \
    /tmp/screenshot-desktop.png \
    /tmp/screenshot-mobile.png

# 2. Get the public download URLs
gh api repos/<OWNER>/<REPO>/releases/tags/pr<NUMBER>-screenshots \
    --jq '.assets[] | .browser_download_url'

# 3. Reference them in the PR body markdown
#    ![Description](https://github.com/<OWNER>/<REPO>/releases/download/pr<NUMBER>-screenshots/screenshot.png)

# 4. Clean up after merge (optional)
gh release delete pr<NUMBER>-screenshots --yes
```

### Why not commit screenshots?

- Screenshot files bloat the git history permanently
- They get merged into main and stay there forever
- Release assets are ephemeral and can be cleaned up after merge

### PR screenshot policy CI check

The `ui-screenshot-policy` check requires one of:
- An image in the PR body (markdown `![...]()`, `<img>` tag, or image URL)
- A checked `- [x] no visual/UI changes` checkbox (only if truly non-visual)

If your PR changes `web/` files, always add screenshots unless the changes are
purely non-visual (e.g., API client refactoring with no UI impact).

## Why this matters

Screenshots taken against the live hub capture the user's real sessions and
personal data. The sandbox is ephemeral, fully isolated (separate `HAPI_HOME`,
separate port, separate DB), and seeded with known fixture data.
