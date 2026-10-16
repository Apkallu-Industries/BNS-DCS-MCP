# Frontline source crossover ledger

This ledger records source copied or adapted from the sibling repository
`Apkallu-Industries/DCS-AI-Frontline` into the independent
`Apkallu-Industries/BNS-DCS-MCP` repository.

## First migration batch

The following files were copied from `packages/mcp-server/src` on the Frontline
`master` branch and relocated into the standalone repository's `src/` tree:

- `miz/LuaParser.ts` → `src/miz/LuaParser.ts`
- `miz/LuaSerializer.ts` → `src/miz/LuaSerializer.ts`
- `miz/MizSession.ts` → `src/miz/MizSession.ts`
- `miz/SessionStore.ts` → `src/miz/SessionStore.ts`
- `types/dcs.ts` → `src/types/dcs.ts`
- `tools/index.ts` → `src/tools/index.ts`
- `tools/mission.ts` → `src/tools/mission.ts`
- `tools/groups.ts` → `src/tools/groups.ts`
- `tools/waypoints.ts` → `src/tools/waypoints.ts`
- `tools/coordinates.ts` → `src/tools/coordinates.ts`
- `tools/dcs_helpers.ts` → `src/tools/dcs_helpers.ts`
- `tools/constraint_gate.ts` → `src/tools/constraint_gate.ts`

The standalone host and package configuration are new, BNS-specific files. The
initial host intentionally registers only the migrated mission, group, waypoint,
and coordinate tool families; it does not import Frontline's campaign, database,
HTTP/JOC, bridge, or runtime systems.

## Safety and verification status

- The source migration is a separate feature branch; it does not alter Frontline.
- The initial test suite checks parser behaviour, tool-name uniqueness, and
  validation of a new mission skeleton.
- CI is configured to run the TypeScript build and smoke tests.
- Do not describe this batch as release-ready until the CI run passes and the
  Windows executable/Claude Desktop launch path is verified.
- Keep this ledger updated as additional modules and their dependencies are
  crossed over. Review each module for external dependencies, filesystem side
  effects, database access, and Frontline-specific assumptions before enabling it.


## Second migration batch — mission editing and validation

Added the following additional modules from the same Frontline source revision:

- `tools/triggers.ts` — mission trigger listing, creation and deletion
- `tools/zones.ts` — mission zone listing and editing
- `tools/weather.ts` — weather and mission start-time editing
- `tools/payload.ts` — unit payload inspection and changes
- `tools/raw.ts` — controlled raw Lua and ZIP-entry inspection/editing
- `tools/geometry.ts` — point/zone geometry helpers
- `tools/briefing.ts` — mission briefing read/write
- `tools/historical.ts` — historical constraints and era validation
- `tools/mission_authoring.ts` — map drawings, client slots, liveries, media inventory, release-readiness checks and warehouse summary
- `tools/mission_integrity.ts` and `validation/MissionIntegrityChecks.ts` — spawn, script, resource, combat-readiness, slot and route integrity checks
- `tools/dcs_export.ts` — local DCS export-status inspection
- `tools/sam_sites.ts` — SAM-site authoring helpers

The standalone server registers these tool families directly. Frontline-only campaign and database imports remain excluded.

## CI evidence

GitHub Actions completed a successful TypeScript build and smoke-test run for commit
`850f2b4cbb91b8dcb23a01612188f55c3c6f80da`, which includes the first and second
mission-editing batches through mission-authoring and mission-integrity registration.
Subsequent SAM-site and DCS-export registration commits are running through CI and
must be checked separately before declaring the latest branch state green.


## Third migration batch — new standalone tools

The branch now also includes two new BNS-side tool implementations:

- `mission_options.ts`: `get_mission_options`, `get_mission_option`, and `set_mission_option` operate on the .miz package's separate `options` Lua table. Dotted paths reject prototype-related segments; changes mark the session dirty and are persisted through the existing `save_miz` flow.
- `weapon_settings.ts`: `list_weapon_settings` inventories the current mission's aircraft loadouts, including pylon station, configured CLSID, fuel, countermeasures, and gun ammunition. It explicitly does not claim to be a complete database of all weapons installed in DCS.

Smoke tests cover nested mission-option writes, dirty-state marking, rejection of unsafe option paths, tool registration and the existing mission validation path. GitHub Actions successfully built and tested commit
`8df7d8ce9aa6808d372374971ebf843d2a4456a9`. The later docs-only ledger update is also expected to pass CI; check its run before merging.
