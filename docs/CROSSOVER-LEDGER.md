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
