import { z } from 'zod';
import type { ToolDefinition, ToolContext } from './index.js';
import type { GroupData, UnitData } from '../types/dcs.js';
import { asArray } from '../miz/MizSession.js';
import { latLonToDcsCoordinates } from './coordinates.js';
import { appendNumericEntry, coalitionKey, requireCountry } from './dcs_helpers.js';
import { enforceHistoricalConstraint } from './constraint_gate.js';

const positionSchema = z.union([
  z.object({ lat_lon: z.object({ lat: z.number(), lon: z.number() }) }),
  z.object({ xy: z.object({ x: z.number(), y: z.number() }) }),
]);

function summarizeGroup(
  coalition: string, country: string, category: string, group: GroupData
) {
  return {
    group_id: group.groupId,
    name: group.name,
    coalition,
    country,
    category,
    unit_count: asArray(group.units as any).length,
    late_activation: group.lateActivation ?? false,
    hidden: group.hidden ?? false,
    position: group.x != null && group.y != null ? { x: group.x, y: group.y } : null,
    task: group.task ?? null,
    units: asArray(group.units as any).map((u: any) => ({
      unit_id: u.unitId,
      name: u.name,
      type: u.type,
      skill: u.skill ?? 'Average',
    })),
  };
}

export const groupTools: ToolDefinition[] = [
  {
    name: 'list_groups',
    description:
      'List groups in a mission, optionally filtered by coalition, country, or category. ' +
      'Returns summary info for each group.',
    inputSchema: z.object({
      session_id: z.string(),
      coalition: z.enum(['blue', 'red', 'neutral']).optional(),
      country: z.string().optional(),
      category: z.enum(['plane', 'helicopter', 'vehicle', 'ship', 'static']).optional(),
    }),
    async handler(args, ctx: ToolContext) {
      const session = ctx.sessions.get(args.session_id);
      const results = [];

      for (const entry of session.iterGroups({
        coalition: args.coalition,
        country: args.country,
        category: args.category,
      })) {
        results.push(summarizeGroup(entry.coalition, entry.country, entry.category, entry.group));
      }

      return { count: results.length, groups: results };
    },
  },

  {
    name: 'get_group',
    description:
      'Return full detail for a single group: units, route, tasks, etc. ' +
      'Accepts group_id (numeric) or group_name (string).',
    inputSchema: z.object({
      session_id: z.string(),
      group_id: z.number().optional(),
      group_name: z.string().optional(),
    }),
    async handler(args, ctx: ToolContext) {
      const session = ctx.sessions.get(args.session_id);

      let entry;
      if (args.group_id != null) {
        entry = session.findGroupById(args.group_id);
        if (!entry) throw new Error(`No group with id ${args.group_id}`);
      } else if (args.group_name) {
        entry = session.findGroupByName(args.group_name);
        if (!entry) throw new Error(`No group named "${args.group_name}"`);
      } else {
        throw new Error('Provide either group_id or group_name');
      }

      return {
        coalition: entry.coalition,
        country: entry.country,
        category: entry.category,
        group: entry.group,
      };
    },
  },

  {
    name: 'find_groups_by_name',
    description: 'Find groups whose name contains the search pattern (case-insensitive).',
    inputSchema: z.object({
      session_id: z.string(),
      pattern: z.string().describe('Substring to search for in group names'),
    }),
    async handler(args, ctx: ToolContext) {
      const session = ctx.sessions.get(args.session_id);
      const lower = args.pattern.toLowerCase();
      const results = [];

      for (const entry of session.iterGroups()) {
        if (entry.group.name.toLowerCase().includes(lower)) {
          results.push(summarizeGroup(entry.coalition, entry.country, entry.category, entry.group));
        }
      }

      return { count: results.length, groups: results };
    },
  },

  {
    name: 'get_unit',
    description: 'Get full detail for a single unit by unit_id.',
    inputSchema: z.object({
      session_id: z.string(),
      unit_id: z.number(),
    }),
    async handler(args, ctx: ToolContext) {
      const session = ctx.sessions.get(args.session_id);
      const result = session.findUnitById(args.unit_id);
      if (!result) throw new Error(`No unit with id ${args.unit_id}`);
      return {
        group_id: result.group.groupId,
        group_name: result.group.name,
        unit: result.unit,
      };
    },
  },

  {
    name: 'modify_group',
    description:
      'Modify properties of an existing group. Accepts group_id and a partial update object. ' +
      'Only provided fields are changed.',
    inputSchema: z.object({
      session_id: z.string(),
      group_id: z.number(),
      updates: z.record(z.any()).describe('Fields to update on the group'),
    }),
    async handler(args, ctx: ToolContext) {
      const session = ctx.sessions.get(args.session_id);
      const entry = session.findGroupById(args.group_id);
      if (!entry) throw new Error(`No group with id ${args.group_id}`);

      Object.assign(entry.group, args.updates);
      session.markDirty();

      return { updated: true, group_id: args.group_id, name: entry.group.name };
    },
  },

  {
    name: 'modify_unit',
    description: 'Modify properties of an existing unit. Only provided fields are changed.',
    inputSchema: z.object({
      session_id: z.string(),
      unit_id: z.number(),
      updates: z.record(z.any()).describe('Fields to update on the unit'),
    }),
    async handler(args, ctx: ToolContext) {
      const session = ctx.sessions.get(args.session_id);
      const result = session.findUnitById(args.unit_id);
      if (!result) throw new Error(`No unit with id ${args.unit_id}`);

      Object.assign(result.unit, args.updates);
      session.markDirty();

      return { updated: true, unit_id: args.unit_id, name: result.unit.name };
    },
  },

  {
    name: 'delete_group',
    description: 'Delete a group from the mission by group_id.',
    inputSchema: z.object({
      session_id: z.string(),
      group_id: z.number(),
    }),
    async handler(args, ctx: ToolContext) {
      const session = ctx.sessions.get(args.session_id);
      const entry = session.findGroupById(args.group_id);
      if (!entry) throw new Error(`No group with id ${args.group_id}`);

      // Find and remove from the country's category group array
      const m = session.mission;
      const coalData = entry.coalition === 'neutral'
        ? m.coalition?.neutrals
        : m.coalition?.[entry.coalition as 'blue' | 'red'];

      if (coalData?.country) {
        for (const country of asArray<any>(coalData.country as any)) {
          if (country.name !== entry.country) continue;
          const catData = (country as any)[entry.category];
          if (!catData?.group) continue;

          if (Array.isArray(catData.group)) {
            const idx = catData.group.findIndex((g: GroupData) => g.groupId === args.group_id);
            if (idx >= 0) catData.group.splice(idx, 1);
            else continue;
          } else {
            const keys = Object.keys(catData.group).filter(k => /^\d+$/.test(k)).sort((a, b) => Number(a) - Number(b));
            const groups = keys.map(k => catData.group[k]);
            const idx = groups.findIndex((g: GroupData) => g.groupId === args.group_id);
            if (idx < 0) continue;
            groups.splice(idx, 1);
            for (const key of keys) delete catData.group[key];
            groups.forEach((g: GroupData, i: number) => { catData.group[String(i + 1)] = g; });
          }

          session.markDirty();
          return { deleted: true, group_id: args.group_id, name: entry.group.name };
        }
      }

      throw new Error(`Group ${args.group_id} found but could not be removed from data structure`);
    },
  },

  {
    name: 'add_vehicle_group',
    description:
      'Add a new ground vehicle group to the mission. ' +
      'Position can be {lat_lon: {lat, lon}} or {xy: {x, y}}.',
    inputSchema: z.object({
      session_id: z.string(),
      coalition: z.enum(['blue', 'red', 'neutral']),
      country: z.string().describe('DCS country name (e.g. "USA", "Russia")'),
      name: z.string().describe('Unique group name'),
      vehicle_type: z.string().describe('DCS type string (e.g. "M-1 Abrams")'),
      position: positionSchema,
      count: z.number().default(1).describe('Number of vehicles'),
      heading: z.number().default(0).describe('Initial heading in degrees'),
      skill: z.string().default('Average'),
      hidden: z.boolean().optional(),
      late_activation: z.boolean().optional(),
    }),
    async handler(args, ctx: ToolContext) {
      const session = ctx.sessions.get(args.session_id);
      enforceHistoricalConstraint(session, args.vehicle_type, 'vehicle');
      const m = session.mission;

      // Resolve position to authoritative DCS x/y coordinates.
      let x: number, y: number;
      if ('xy' in args.position) {
        x = args.position.xy.x;
        y = args.position.xy.y;
      } else {
        const converted = latLonToDcsCoordinates(
          args.position.lat_lon.lat,
          args.position.lat_lon.lon,
          session.theatre
        );
        x = converted.x;
        y = converted.y;
      }

      // Never invent DCS country IDs. The country must already exist in the requested coalition.
      const countryData = requireCountry(m, args.coalition, args.country);
      if (!countryData.vehicle) countryData.vehicle = { group: [] };
      if (!countryData.vehicle.group) countryData.vehicle.group = [];

      const groupId = session.getNextGroupId();
      let unitIdBase = session.getNextUnitId();

      const headingRad = (args.heading * Math.PI) / 180;
      const units: UnitData[] = [];
      for (let i = 0; i < args.count; i++) {
        const unitX = x - i * 40 * Math.sin(headingRad);
        const unitY = y - i * 40 * Math.cos(headingRad);
        units.push({
          unitId: unitIdBase + i,
          name: `${args.name} #${String(i + 1).padStart(3, '0')}`,
          type: args.vehicle_type,
          skill: args.skill,
          x: unitX,
          y: unitY,
          heading: headingRad,
          playerCanDrive: false,
        } as UnitData);
      }

      const group: GroupData = {
        groupId,
        name: args.name,
        hidden: args.hidden ?? false,
        lateActivation: args.late_activation ?? false,
        start_time: 0,
        task: 'Ground Nothing',
        uncontrolled: false,
        x,
        y,
        units,
        route: {
          routeRelativeTOT: true,
          points: [
            {
              name: '',
              type: 'Turning Point',
              action: 'Off Road',
              x,
              y,
              alt: 0,
              alt_type: 'BARO',
              speed: 0,
              task: { id: 'ComboTask', params: { tasks: {} } },
            },
          ],
        },
      };

      appendNumericEntry(countryData.vehicle.group, group);
      session.markDirty();

      return {
        group_id: groupId,
        name: args.name,
        unit_ids: units.map(u => u.unitId),
        position: { x, y },
      };
    },
  },
];
