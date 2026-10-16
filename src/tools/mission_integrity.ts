import { z } from 'zod';
import { asArray, type MizSession } from '../miz/MizSession.js';
import {
  checkCombatReadiness,
  checkResourceIntegrity,
  checkScriptReferences,
  checkSlotAndRouteIntegrity,
  checkSpawnConflicts,
  type GroupEntry,
  type ScriptRefKind,
} from '../validation/MissionIntegrityChecks.js';
import type { ToolContext, ToolDefinition } from './index.js';

/**
 * Mission integrity checks ported from tools/validate_mission_integrity.ts that the existing
 * `validate` / `validate_release_readiness` tools do not cover. All run on an open .miz session;
 * none need Windows, PowerShell or the DCS Lua engine.
 */

const sessionInput = { session_id: z.string() };
const groupsOf = (session: MizSession): GroupEntry[] => [...session.iterGroups()];

async function embeddedScripts(session: MizSession): Promise<Array<{ path: string; text: string }>> {
  const scripts = [];
  for (const path of session.listZipEntries().filter(p => /\.lua$/i.test(p))) {
    const text = await session.getZipEntry(path);
    if (text != null) scripts.push({ path, text });
  }
  return scripts;
}

function missionNames(session: MizSession): Record<ScriptRefKind, Set<string>> {
  const names: Record<ScriptRefKind, Set<string>> = { group: new Set(), unit: new Set(), static: new Set(), zone: new Set() };
  for (const { category, group } of session.iterGroups()) {
    if (group.name) names.group.add(String(group.name));
    for (const unit of asArray<any>(group.units)) {
      if (!unit?.name) continue;
      names.unit.add(String(unit.name));
      if (category === 'static') names.static.add(String(unit.name));
    }
  }
  for (const zone of asArray<any>((session.mission as any).triggers?.zones)) {
    if (zone?.name) names.zone.add(String(zone.name));
  }
  return names;
}

export const missionIntegrityTools: ToolDefinition[] = [
  {
    name: 'check_spawn_conflicts',
    description: 'Find mission-start spawn conflicts in an open .miz: parking slots assigned to two aircraft, AI aircraft (non-parking starts, not late-activated) spawning within 15 m / 20 m altitude of each other, and flights starting "From Runway" at an airfield (carrier catapult starts are exempt).',
    inputSchema: z.object(sessionInput),
    async handler(args: any, ctx: ToolContext) {
      return checkSpawnConflicts(groupsOf(ctx.sessions.get(args.session_id)));
    },
  },
  {
    name: 'check_script_references',
    description: 'Scan embedded mission Lua scripts (excluding MOOSE/MIST) for group, unit, static and zone names used via Group/Unit/StaticObject.getByName, GROUP/UNIT:FindByName, SPAWN:New, trigger.misc.getZone and ZONE:New, and report any name that does not exist in the mission, with file and line.',
    inputSchema: z.object({
      ...sessionInput,
      ignoreNames: z.array(z.string().min(1)).max(500).default([]).describe('Names created at runtime (e.g. dynamically spawned groups) that should not be reported.'),
    }),
    async handler(args: any, ctx: ToolContext) {
      const session = ctx.sessions.get(args.session_id);
      return checkScriptReferences(await embeddedScripts(session), missionNames(session), new Set(args.ignoreNames));
    },
  },
  {
    name: 'check_resource_integrity',
    description: 'Check .miz resource wiring: ResKeys referenced by the mission but missing from mapResource, DictKeys missing from the dictionary, mapResource files absent from the archive, briefing picture tables holding raw filenames, and archive entries with backslash separators.',
    inputSchema: z.object(sessionInput),
    async handler(args: any, ctx: ToolContext) {
      const session = ctx.sessions.get(args.session_id);
      return checkResourceIntegrity(session.mission, session.mapResource ?? {}, session.dictionary ?? {}, session.listZipEntries(), !!session.filePath);
    },
  },
  {
    name: 'check_combat_readiness',
    description: 'Check that AI combat aircraft are armed (non-empty pylons, cannon ammo_type set) and that naval groups carry the group and lead-unit radio frequencies MOOSE NAVYGROUP requires. Human (Client/Player) slots are not checked for loadouts.',
    inputSchema: z.object(sessionInput),
    async handler(args: any, ctx: ToolContext) {
      return checkCombatReadiness(groupsOf(ctx.sessions.get(args.session_id)));
    },
  },
  {
    name: 'check_slot_and_route_integrity',
    description: 'Check mission-load blockers the Mission Editor enforces: human Player/Client slot presence, requiredModules, routes with no time-locked waypoint and late-activated groups without a locked first waypoint (warnings: Mission Editor route verification), and non-contiguous coalition/country/group indices that DCS ipairs loops would silently truncate.',
    inputSchema: z.object(sessionInput),
    async handler(args: any, ctx: ToolContext) {
      const session = ctx.sessions.get(args.session_id);
      return checkSlotAndRouteIntegrity(session.mission, groupsOf(session));
    },
  },
];
