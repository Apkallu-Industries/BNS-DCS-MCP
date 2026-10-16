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
