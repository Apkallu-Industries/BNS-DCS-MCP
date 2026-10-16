# Agent instructions — BNS DCS MCP

## Mission

Build a reliable, standalone local MCP integration service for DCS World and the Blacknet Systems development factory. This repository is independent of DCS AI Frontline.

## Mandatory workflow

1. Read this file and the architecture/gap-audit docs before editing.
2. Inspect current source and tests before adding tools. Search for existing equivalent capabilities.
3. Make focused changes with tests. Do not claim a feature is complete based only on a schema or stub.
4. Keep the MCP registry count, schemas, docs and tests synchronized.
5. Validate builds and packaging in a clean environment; report exactly what ran and what did not.
6. Keep handoff/status notes current at meaningful stopping points so another agent can resume after a context switch.

## Boundaries

- Do not make this server depend on Frontline campaign state, databases, daemons, or runtime services.
- Do not write to DCS installation files or live Mods folders.
- Do not overwrite source masters, reference assets, or production missions. Prefer new output paths and disposable test missions.
- Keep asset provenance and license constraints intact; do not copy third-party code/assets without checking permissions.
- Never expose secrets or local credentials in logs, test fixtures, commits, or example configuration.
- Keep stdout clean for MCP stdio protocol traffic; diagnostic output belongs on stderr or in logs.
- Any local network listener must bind to loopback by default and have documented access controls.

## Definition of done

A feature is done only when:
- its input/output schema is validated;
- successful and failure paths are tested;
- it is registered and discoverable;
- it is documented;
- it has been checked against relevant existing tools for duplication;
- any DCS-dependent claims are backed by a simulator or fixture-based integration test;
- the Windows packaging pipeline includes it and a clean-install smoke test passes.

## Release discipline

The initial repository is a documentation bootstrap, not a working server. Keep that status explicit until implementation, tests, and packaging are actually present and verified. Never fabricate tool counts, build results, or runtime validation.
