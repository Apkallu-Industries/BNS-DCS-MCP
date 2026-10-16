# BNS DCS MCP

Standalone, local Model Context Protocol (MCP) service for Blacknet Systems' DCS World development factory.

The goal is to give Claude and other authorized MCP clients a stable DCS integration layer for aircraft, ships, carriers, weapons, ground units, mission authoring, asset integration, and validation—without making the service depend on DCS AI Frontline's campaign/runtime architecture.

## Status

**Active implementation. Core crossover merged; terrain/road reference tools are in the next validation PR. Not yet a DCS-tested release.**

The standalone TypeScript MCP host and first migrated capability batches have been merged to main. The validated baseline exposes 97 unique tools; a follow-on branch adds three terrain/road reference tools, with CI enforcing the registry count and smoke tests. The Windows portable-package workflow builds a private Node runtime plus native stdio launcher, checks the MCP handshake, and publishes a ZIP artifact. The package is CI-verified, but real DCS runtime behavior still requires a Windows installation test.

## Design principles

- Standalone repository, release cadence, tool registry, tests, and Windows packaging.
- Local-first; Claude Desktop can launch the server using MCP stdio.
- Use installed DCS data as the authority where practical; report data source and version.
- Reuse proven BNS/Frontline components only after checking coupling, license, tests, and provenance.
- Prefer fewer reliable, composable tools over inflated tool counts.
- Separate mission-file edits from claims of runtime correctness.
- Validate before writes; use disposable test missions for integration tests.
- Never overwrite production missions, live Mods folders, or source assets without explicit configuration and safeguards.
- Keep third-party asset provenance and distribution rights intact.

## Initial priorities

1. Inventory Frontline MCP source, registry, packaging, and integration adapters.
2. Define the standalone architecture and identify dependencies on Frontline campaign services.
3. Audit parity gaps against DCS-MCP's published capabilities and BNS aircraft/naval workflows.
4. Implement mission options, templates, weapon-setting discovery/validation, terrain/road queries, and robust placement checks where genuinely missing.
5. Add DCS-native discovery for aircraft, ships, weapons, statics, vehicles, maps, airfields, and installed mods.
6. Add tests and a reproducible Windows packaging pipeline.
7. Verify MCP handshake, tool schemas, clean install, and disposable-mission round trips before release.

## Non-goals

- This service does not replace the BNS asset library, Blender build tools, provenance manifests, or per-mod source repositories.
- It does not promise to create or repair 3D geometry by itself.
- It must not claim that a mission edit proves an aircraft/ship functions correctly in the running simulator.

## Development

Development is on the feature branch until the latest CI and Windows package checks pass. See [docs/CAPABILITY-GAP-AUDIT.md](docs/CAPABILITY-GAP-AUDIT.md), [docs/CROSSOVER-LEDGER.md](docs/CROSSOVER-LEDGER.md), and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
