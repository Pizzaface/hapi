# Screenshots of the HAPI Web UI

## Always use the sandbox — never screenshot the live app

The user runs a live HAPI hub on port 3006 with real data. Agents must **never**
take screenshots against that instance. Always use the sandbox.

## Workflow

### 1. Start the sandbox (with seed data)

```bash
bun scripts/sandbox-hub.ts start --seed
```

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

## Full example

```bash
# Start
bun scripts/sandbox-hub.ts start --seed
# Parse output for SANDBOX_URL and SANDBOX_HOME

# Desktop screenshot
HAPI_HOME=$SANDBOX_HOME bun scripts/ui-preview.ts \
    --hub $SANDBOX_URL \
    --output /tmp/hapi-sessions.png \
    /sessions

# Mobile screenshot
HAPI_HOME=$SANDBOX_HOME bun scripts/ui-preview.ts \
    --hub $SANDBOX_URL \
    --viewport mobile \
    --output /tmp/hapi-sessions-mobile.png \
    /sessions

# Stop
bun scripts/sandbox-hub.ts stop
```

## Seeding without starting the hub

To seed a specific database directly:

```bash
bun scripts/seed-fixtures.ts --db /path/to/hapi.db
```

## Why this matters

Screenshots taken against the live hub capture the user's real sessions and
personal data. The sandbox is ephemeral, fully isolated (separate `HAPI_HOME`,
separate port, separate DB), and seeded with known fixture data.
