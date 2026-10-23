# Architecture (proposed)

## Process boundary

- **MCP host:** Claude Desktop or another MCP client.
- **BNS DCS MCP process:** local stdio MCP server. Keep stdout reserved for protocol messages; send diagnostics to stderr/log files.
- **DCS adapters:** isolated modules for mission archive read/write, installed DCS data discovery, optional runtime bridge, and terrain/placement analysis.
- **BNS factory adapters:** optional, explicitly configured access to project workspaces and asset manifests. Keep these separate from mission authoring.
- **Packaging:** self-contained Windows distribution with pinned runtime/dependencies, launcher, configuration example, health check, and uninstall/upgrade guidance.

## Module boundaries

1. `server/`: process startup, MCP transport, tool registration, lifecycle.
2. `dcs/discovery/`: DCS install detection, version, map/unit/weapon/airfield catalogs, mod export state.
3. `dcs/mission/`: safe .miz read/write, mission options, groups, routes, tasks, triggers, templates.
4. `dcs/terrain/`: coordinate systems, elevation, road samples, slope, building/structure and unit-spacing checks.
5. `dcs/payload/`: payload catalogs, weapon settings, loadout validation.
6. `validation/`: schema checks, referential integrity, spawn conflicts, route/readiness reports.
7. `factory/`: optional BNS project discovery and manifest/provenance reads; no implicit write access to source masters.
8. `packaging/windows/`: build, smoke-test, installer and release verification.

## Safety and correctness

- Read-only operations should be the default.
- Writes must validate arguments and target paths, preserve backups or write to a new output path, and return structured diagnostics.
- Never edit live DCS installation files as part of ordinary mission authoring.
- Runtime bridge support must be optional and clearly separated from static .miz editing.
- Distinguish: schema-valid, mission-file-valid, DCS-load-tested, and in-simulator behavior verified.
- Use a disposable mission and isolated output directory in automated integration tests.
- Record DCS version, data provenance, and tool version in diagnostic reports where available.

## Transport and host integration

Use MCP stdio for Claude Desktop's local process launch. Do not require a permanent HTTP daemon for ordinary desktop use. If a future local HTTP bridge is added, bind to loopback by default and document authentication and port ownership.

### Session argument resilience

Every tool that takes `session_id` also accepts `sessionId` or `miz_id` (MCP boundary only, `src/tools/session_alias.ts`).
A remote-device MCP relay was seen to strip an argument named `session_id` before it reached the server, so every
session tool failed with "Required at session_id" even though the client sent it.

Resolution order:
1. `session_id`.
2. An alias.
3. For tools that require a session only: the single open session.

Otherwise the call fails with an error naming the open sessions. Tools where the session is optional (`session_id` or
`path`) are never auto-filled. Handlers still receive `session_id` unchanged.

## Reuse strategy

Audit existing Frontline modules individually. Reuse only components that have clear boundaries and acceptable dependencies. The new server must not require Frontline campaign databases, campaign daemons, or Frontline-specific runtime services to start or author a mission.
