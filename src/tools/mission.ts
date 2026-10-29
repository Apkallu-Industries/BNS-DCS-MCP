import { z } from 'zod';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { MizSession, asArray } from '../miz/MizSession.js';
import type { ToolDefinition, ToolContext } from './index.js';

const DCS_MISSIONS_DIR = path.join(
  os.homedir(),
  'Saved Games', 'DCS', 'Missions'
);

export async function resolveMizPath(inputPath: string): Promise<string> {
  if (path.isAbsolute(inputPath)) return inputPath;

  // Expand env vars
  let expanded = inputPath.replace(/%([^%]+)%/g, (_, name) => process.env[name] ?? _);

  if (path.isAbsolute(expanded)) return expanded;

  // Bare filename — look in DCS Missions folder
  const candidate = path.join(DCS_MISSIONS_DIR, expanded);
  try {
    await fs.access(candidate);
    return candidate;
  } catch {
    throw new Error(
      `Could not find "${inputPath}". Provide an absolute path, or place the file in ${DCS_MISSIONS_DIR}`
    );
  }
}

export const missionTools: ToolDefinition[] = [
  {
    name: 'open_miz',
    description:
      'Open an existing .miz file and return a session handle. ' +
      'The session_id returned is required by every other tool. ' +
      'Accepts an absolute path or a bare filename (looked up in DCS Missions folder).',
    inputSchema: z.object({
      path: z.string().describe('Path to the .miz file'),
    }),
    async handler(args: { path: string }, ctx: ToolContext) {
      const resolved = await resolveMizPath(args.path);
      const session = await MizSession.open(resolved);
      ctx.sessions.add(session);
      return {
        session_id: session.sessionId,
        file: resolved,
        info: session.getInfo(),
      };
    },
  },

  {
    name: 'new_miz',
    description:
      'Create a new empty mission for the specified theater. ' +
      'Returns a session handle. Save with save_miz when ready.',
    inputSchema: z.object({
      theatre: z.string().describe('DCS theater name (e.g. "PersianGulf", "Caucasus", "Syria")'),
    }),
    async handler(args: { theatre: string }, ctx: ToolContext) {
      const session = await MizSession.create(args.theatre);
      ctx.sessions.add(session);
      return {
        session_id: session.sessionId,
        theatre: args.theatre,
        info: session.getInfo(),
      };
    },
  },

  {
    name: 'save_miz',
    description:
      'Save the current mission to disk. Does NOT close the session. ' +
      'Optionally specify an output path; defaults to the original file path.',
    inputSchema: z.object({
      session_id: z.string(),
      path: z.string().optional().describe('Output path (defaults to original)'),
    }),
    async handler(args: { session_id: string; path?: string }, ctx: ToolContext) {
      const session = ctx.sessions.get(args.session_id);
      const saved = await session.save(args.path);
      return { saved_to: saved, session_id: session.sessionId };
    },
  },

  {
    name: 'close_miz',
    description: 'Close a mission session and release its memory. Unsaved changes are lost.',
    inputSchema: z.object({
      session_id: z.string(),
    }),
    async handler(args: { session_id: string }, ctx: ToolContext) {
      const session = ctx.sessions.get(args.session_id);
      const wasDirty = session.isDirty;
      ctx.sessions.remove(args.session_id);
      return { closed: true, had_unsaved_changes: wasDirty };
    },
  },

  {
    name: 'get_mission_info',
    description: 'Get summary info about a session (theater, time, group counts).',
    inputSchema: z.object({
      session_id: z.string(),
    }),
    async handler(args: { session_id: string }, ctx: ToolContext) {
      return ctx.sessions.get(args.session_id).getInfo();
    },
  },

  {
    name: 'list_sessions',
    description: 'List all open mission sessions.',
    inputSchema: z.object({}),
    async handler(_args: {}, ctx: ToolContext) {
      return ctx.sessions.list().map(s => s.getInfo());
    },
  },

  {
    name: 'validate',
    description:
      'Validate the mission against DCS invariants: coalition tables, waypoint structures, ' +
      'callsign formats, payload requirements, etc. Returns errors and warnings.',
    inputSchema: z.object({
      session_id: z.string(),
    }),
    async handler(args: { session_id: string }, ctx: ToolContext) {
      const session = ctx.sessions.get(args.session_id);
      const errors: string[] = [];
      const warnings: string[] = [];
      const m = session.mission;

      if (m.version !== 23) errors.push('Mission version must be 23');
      if (!m.failures) errors.push('Missing failures table');
      if (!m.forcedOptions) errors.push('Missing forcedOptions table');
      if (m.currentKey == null) errors.push('Missing currentKey');
      if (m.maxKey == null) errors.push('Missing maxKey');
      if (!m.coalitions) errors.push('Missing root coalitions roster');
      if (!m.trig) errors.push('Missing trig runtime table');
      if (!m.trigrules) errors.push('Missing top-level trigrules table');
      if (!m.triggers) errors.push('Missing triggers table');

      if (!m.coalition) {
        errors.push('Missing coalition table');
      } else {
        for (const side of ['blue', 'red', 'neutrals'] as const) {
          const coal = (m.coalition as any)[side];
          if (!coal) {
            errors.push(`Missing ${side} coalition`);
            continue;
          }
          if (!coal.nav_points) errors.push(`Missing ${side}.nav_points`);
          if (!coal.bullseye) warnings.push(`Missing ${side}.bullseye`);
          if (!coal.country) errors.push(`Missing ${side}.country table`);
        }
      }

      if (!session.theatre) errors.push('Theatre is empty');

      const groupIds = new Set<number>();
      const unitIds = new Set<number>();
      for (const entry of session.iterGroups()) {
        const group = entry.group;
        if (groupIds.has(group.groupId)) errors.push(`Duplicate groupId ${group.groupId}`);
        groupIds.add(group.groupId);

        const points = asArray<any>(group.route?.points as any);
        if (!group.route || points.length === 0) {
          errors.push(`Group "${group.name}" is missing a physical route point`);
        } else {
          points.forEach((pt: any, i: number) => {
            if (pt.alt == null) errors.push(`Group "${group.name}" waypoint ${i + 1} missing alt`);
            // The Mission Editor writes no alt_type on static objects' single placement point.
            if (pt.alt_type == null && entry.category !== 'static') errors.push(`Group "${group.name}" waypoint ${i + 1} missing alt_type`);
          });
        }

        const units = asArray<any>(group.units as any);
        if (units.length === 0) {
          errors.push(`Group "${group.name}" has no units`);
          continue;
        }

        for (const u of units) {
          if (unitIds.has(u.unitId)) errors.push(`Duplicate unitId ${u.unitId}`);
          unitIds.add(u.unitId);
          if (!u.type) errors.push(`Unit "${u.name}" in group "${group.name}" has no type`);

          if (entry.category === 'plane' || entry.category === 'helicopter') {
            if (!u.payload || typeof u.payload !== 'object') {
              errors.push(`Air unit "${u.name}" is missing a payload table`);
            }
            // NATO-style countries carry a callsign table ({1, 2, 3, name = "Enfield11"}); the Mission Editor writes a
            // plain positive number for the others (Japan, Russia, ...: callsign = 101). Both are valid.
            const cs = u.callsign;
            const numericOk = typeof cs === 'number' && Number.isInteger(cs) && cs > 0;
            if (!numericOk && (!cs || typeof cs !== 'object')) {
              errors.push(`Air unit "${u.name}" has an invalid callsign (expected a callsign table or a positive number)`);
            }
            if (u.parking_id != null && (!Number.isInteger(u.parking_id) || u.parking_id <= 0)) {
              errors.push(`Air unit "${u.name}" parking_id must be a positive integer`);
            }
          }
        }

        // The Mission Editor refuses to save a group whose route has no waypoint with a locked time ("Route has no
        // waypoints with locked time!"); found 2026-10-23 on script-built BNS test missions that passed this check.
        if (points.length > 0 && !points.some((p: any) => p?.ETA_locked === true)) {
          errors.push(`Group "${group.name}" route has no waypoint with locked time (set ETA_locked = true on WP1)`);
        }

        if (entry.category === 'plane' || entry.category === 'helicopter') {
          const first = points[0];
          const parkingStart = first?.type === 'TakeOffParking' || first?.type === 'TakeOffParkingHot';
          if (parkingStart) {
            if (first.airdromeId == null) errors.push(`Flight "${group.name}" parking start missing airdromeId`);
            if (!Number.isInteger(first.parking_id) || first.parking_id <= 0) {
              errors.push(`Flight "${group.name}" parking start missing numeric route parking_id`);
            }
          }

          const last = points[points.length - 1];
          if (last && last.type !== 'Land' && last.action !== 'Landing') {
            warnings.push(`Flight "${group.name}" route does not end with a landing waypoint`);
          }
        }
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings,
        group_count: groupIds.size,
        unit_count: unitIds.size,
      };
    },
  },
];
