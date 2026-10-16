# Initial capability gap audit

**Status:** preliminary source inspection; not yet a complete parity audit.

## Existing Frontline capabilities observed

Source inspected in `Apkallu-Industries/DCS-AI-Frontline` at commit `21566655f390f762794795fc2b2adf8b5524c810`:

- `mission.ts`: `open_miz`, `new_miz`, `save_miz`, `close_miz`, `get_mission_info`, `list_sessions`, `validate`.
- `groups.ts`: group/unit discovery and editing, delete group, add vehicle group.
- `waypoints.ts`: get/set route and add/modify waypoint.
- `mission_integrity.ts`: spawn-conflict, script-reference, resource-integrity, combat-readiness, slot/route-integrity checks.
- `diagnostics.ts`: script linting, framework API lookup, .miz diff, mission overview rendering, DCS log analysis, script-drift audit, dry-load mission scripts, CTLD checks, bridge health.
- Payload editing exists, but the inspected files did not establish whether weapon-specific settings discovery/validation is already supported.
- Existing Windows packaging has a launcher, bundled Node runtime, and Control Centre; exact dependency coupling needs a broader packaging audit.

The source registry has historically enforced 218 unique tools, but that count should be re-measured from the current default branch before carrying it forward as a baseline.

## Candidate DCS-MCP capabilities to verify

These are audit targets, not assertions that every feature is absent.

| Capability | Initial finding | Priority | Next verification |
|---|---|---:|---|
| Read/write mission-wide options | No dedicated tool found in inspected mission module | High | Search full registry and mission serializer |
| List and place Mission Editor templates | No dedicated template tools found in inspected files | High | Search source and tests |
| Discover weapon-specific settings | Payload tools exist; discovery not confirmed | High | Inspect payload schema, weapon DB and validation |
| Validate payload weapon settings | Partial/unknown | High | Inspect set/replace payload implementation |
| Find nearby road samples | No dedicated road query found in inspected files | Medium | Inspect terrain/spatial tools and data files |
| Create train groups | No dedicated train tool found | Medium | Inspect group authoring and unit type handling |
| Per-unit terrain slope validation | Some spawn-conflict checks exist; slope parity unverified | High | Inspect terrain data and validator coverage |
| Per-unit building/structure collision checks | Some spawn-conflict checks exist; full parity unverified | High | Inspect algorithms and fixtures |
| DCS-native discovery of installed aircraft/ships/weapons/mods | Partial capabilities likely exist; scope unverified | High | Inventory catalogs, mod export, install report and tests |
| Naval/carrier-specific mission authoring | Existing unit and route tools; exact deck/FARP semantics unverified | High | Add focused ship/carrier integration tests |
| Mission Editor templates, train routes and WWII map behavior | Unknown | Medium | Verify against installed DCS version and target maps |

## DCS-MCP benchmark notes

The previous competitive check reported DCS-MCP v0.9.16 at 171 tools / 15 categories and highlighted mission options, templates, weapon settings, road lookup, train creation, and stronger placement checks. Re-fetch its current generated capability reference and changelog before implementing against that snapshot; do not treat old counts as current facts.

## Required audit deliverable

Produce a machine-readable inventory with:
- tool name and description;
- source module and schema;
- read/write/destructive classification;
- required DCS data and optional bridge dependencies;
- unit tests and integration-test coverage;
- parity mapping to benchmark capabilities;
- recommendation: reuse, improve, add, or defer.

Do not implement a second tool that duplicates an existing tool unless it materially improves semantics, validation, or reliability.

## Standalone crossover status — 2026-10-16

The BNS-DCS-MCP feature branch now registers **97 unique tools** across the initial standalone core and the first crossover batches. This is a count of the current BNS registry, not a claim of parity with the Frontline or DCS-MCP registries.

| Capability | Current BNS status | Remaining gap / caution |
|---|---|---|
| Read/write mission-wide options | Implemented: get_mission_options, get_mission_option, set_mission_option | Generic dotted-path access is available; confirm option semantics against real DCS-generated missions |
| Mission group templates | Implemented: list existing groups as templates and clone a group with fresh IDs and position offset | Templates are currently sourced from an open mission, not a separate curated template library |
| Weapon settings discovery | Implemented: inspect current mission aircraft payload and pylon CLSIDs | Not a global weapon database; installed-module availability and CLSID validity still need data-backed validation |
| Payload editing | Migrated from Frontline | No complete per-aircraft weapon-store validation yet |
| Road lookup | Not implemented | Requires a trustworthy terrain/road data source or installed DCS map data |
| Train creation | Not implemented as a dedicated tool | General group authoring may not be sufficient for train-specific DCS semantics |
| Terrain slope validation | Not implemented as a verified terrain-aware check | Do not claim slope validation until terrain data and fixtures exist |
| Building/structure collision checks | Existing spawn-conflict checks migrated | Full map-aware collision parity remains unverified |
| Installed aircraft/ship/weapon/mod discovery | Partial mission-side inspection only | Requires explicit local DCS install/catalog discovery |
| Naval/carrier authoring | General ship/group/route authoring available in migrated tools | Carrier deck spots, parking, catapult/takeoff semantics need targeted tests |
| Lua script linting | Implemented: syntax, compatibility and common hazards | Static lint is not a substitute for running mission scripts in DCS |
| Mission overview and .miz diff | Implemented | Visual inspection and integration fixtures remain outstanding |

### Current verification

- CI has passed for the migrated core, mission options, weapon inventory, templates and standalone diagnostics, including a build/test run after adding a local Fengari declaration.
- The smoke suite now asserts the registry has exactly 97 unique tool names. The latest commit that changes that contract must pass CI before the branch is considered green.
- No Windows executable has been built or tested yet; no claim of working Claude Desktop installation should be made until packaging verification is added.
- No DCS runtime integration test has been run from this repository. Real .miz fixtures and DCS Mission Editor/Simulator checks remain required.

Next priority: make the latest 97-tool contract pass, then continue the terrain-aware validators and Windows packaging. Avoid importing Frontline campaign/database/JOC dependencies into the standalone service.
