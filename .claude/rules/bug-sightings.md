# Bug Sighting Directive

When you notice something wrong — whether it's related to your current task or not — log it here. For minor issues, just record and move on. For serious problems (crashes, data loss, security), use your judgment: flag it to the user immediately if it's urgent, or log it if it can wait.

The goal is to capture things that would otherwise be forgotten when the session ends.

## When to log

- Unexpected error messages or warnings in command output
- Tests failing for reasons you didn't cause
- Behavior that contradicts what the code says it should do
- Stale or inconsistent data you stumble across
- Dead code paths, broken imports, or type mismatches you notice in passing
- Anything that makes you think "that's not right" even if you're not sure why

## When NOT to log

- Transient issues you see once and can't characterize (single network timeout, one-off test flake)
- Known limitations already documented in beads or TODOs
- Style issues, missing comments, or minor code quality nits
- Things you're actively fixing as part of your current task (track those in the bead instead)

## How to log

Append one JSON line to `.claude/agent-memory/bug-sightings/sightings.jsonl`:

```bash
cat >> /home/allen/_code/hapi/.claude/agent-memory/bug-sightings/sightings.jsonl <<'EOF'
{"id":"sight-NNN","ts":"ISO-8601","severity":"low|medium|high","title":"Short description","observed":"What you saw","expected":"What should have happened","location":{"file":"path/to/file.ts","line":42,"component":"web|hub|cli|shared"},"context":"What you were doing when you noticed","agent":"your-agent-type"}
EOF
```

### Fields

| Field | Required | Description |
|---|---|---|
| `id` | yes | `sight-NNN` — increment from last entry |
| `ts` | yes | ISO 8601 timestamp |
| `severity` | yes | `low` (cosmetic/minor), `medium` (wrong behavior, workaround exists), `high` (data loss risk, crash, security) |
| `title` | yes | One-line summary, imperative mood |
| `observed` | yes | What actually happened |
| `expected` | yes | What should have happened |
| `location` | no | File, line, component if known |
| `context` | no | What you were doing when you noticed |
| `agent` | no | Which agent type logged this |

### Rules

- **One line per sighting.** No multi-line JSON.
- **Be specific.** "Test failed" is useless. "SessionList.test.ts:45 — `getRelativeTime` returns 'just now' for timestamps 2 hours old" is useful.
- **Don't duplicate.** Skim the last ~10 entries before appending. If it's already logged, skip it.
- **Keep it brief.** If describing the sighting is taking a while, just log what you have. The point is a trail, not a report.
- **High severity = tell the user.** If something looks like a crash, data loss, or security issue, mention it directly in addition to logging. Don't silently log something urgent.

## Triage

Sightings are reviewed periodically by the user. They may be:
- Promoted to a bead (`bd create`) if confirmed
- Dismissed as false alarms (append `"resolved":"false-alarm"` to the entry)
- Merged with existing beads if related

Agents should not triage sightings unless explicitly asked.
