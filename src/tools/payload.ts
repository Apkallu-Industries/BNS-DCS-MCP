import { z } from 'zod';
import type { ToolDefinition, ToolContext } from './index.js';
import { asArray } from '../miz/MizSession.js';

export const payloadTools: ToolDefinition[] = [
  {
    name: 'set_payload',
    description:
      'Set a unit\'s payload (pylons, fuel, countermeasures, gun). ' +
      'Pylons are keyed by station number, each with a CLSID (weapon class ID string).',
    inputSchema: z.object({
      session_id: z.string(),
      unit_id: z.number(),
      pylons: z.record(z.object({
        CLSID: z.string(),
      })).optional().describe('Pylon loadout: { "1": { "CLSID": "{...}" }, ... }'),
      fuel: z.number().optional().describe('Internal fuel in kg'),
      flare: z.number().optional(),
      chaff: z.number().optional(),
      gun: z.number().optional().describe('Gun ammo percentage (0-100)'),
    }),
    async handler(args: any, ctx: ToolContext) {
      const session = ctx.sessions.get(args.session_id);
      const result = session.findUnitById(args.unit_id);
      if (!result) throw new Error(`No unit with id ${args.unit_id}`);

      if (!result.unit.payload) result.unit.payload = {} as any;
      const p = result.unit.payload!;

      if (args.pylons != null) p.pylons = args.pylons;
      if (args.fuel != null) p.fuel = args.fuel;
      if (args.flare != null) p.flare = args.flare;
      if (args.chaff != null) p.chaff = args.chaff;
      if (args.gun != null) p.gun = args.gun;

      session.markDirty();
      return { updated: true, unit_id: args.unit_id, payload: p };
    },
  },

  {
    name: 'clear_payload',
    description: 'Clear all pylons from a unit (empties the loadout).',
    inputSchema: z.object({
      session_id: z.string(),
      unit_id: z.number(),
    }),
    async handler(args: any, ctx: ToolContext) {
      const session = ctx.sessions.get(args.session_id);
      const result = session.findUnitById(args.unit_id);
      if (!result) throw new Error(`No unit with id ${args.unit_id}`);

      if (result.unit.payload) {
        result.unit.payload.pylons = {};
      }
      session.markDirty();
      return { cleared: true, unit_id: args.unit_id };
    },
  },

  {
    name: 'get_payload',
    description: "Get a unit's current payload configuration.",
    inputSchema: z.object({
      session_id: z.string(),
      unit_id: z.number(),
    }),
    async handler(args: any, ctx: ToolContext) {
      const session = ctx.sessions.get(args.session_id);
      const result = session.findUnitById(args.unit_id);
      if (!result) throw new Error(`No unit with id ${args.unit_id}`);

      return {
        unit_id: args.unit_id,
        unit_name: result.unit.name,
        aircraft_type: result.unit.type,
        payload: result.unit.payload ?? {},
      };
    },
  },
];
