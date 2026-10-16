import { z } from 'zod';
import type { ToolDefinition, ToolContext } from './index.js';

export const zoneTools: ToolDefinition[] = [
  {
    name: 'list_zones',
    description: 'List all trigger zones in the mission.',
    inputSchema: z.object({
      session_id: z.string(),
    }),
    async handler(args, ctx: ToolContext) {
      const session = ctx.sessions.get(args.session_id);
      const zones = session.mission.triggers?.zones;
      if (!zones) return { count: 0, zones: [] };

      const list = Array.isArray(zones) ? zones : Object.values(zones);
      return {
        count: list.length,
        zones: list.map((z: any, i: number) => ({
          index: i,
          name: z.name ?? `Zone ${i}`,
          x: z.x,
          y: z.y,
          radius: z.radius ?? 0,
          type: z.type ?? 0,
          hidden: z.hidden ?? false,
          color: z.color,
        })),
      };
    },
  },

  {
    name: 'add_zone',
    description: 'Add a circular trigger zone.',
    inputSchema: z.object({
      session_id: z.string(),
      name: z.string(),
      x: z.number(),
      y: z.number(),
      radius: z.number().describe('Zone radius in meters'),
      hidden: z.boolean().default(false),
      color: z.array(z.number()).optional().describe('RGBA color [r,g,b,a] 0-1'),
    }),
    async handler(args, ctx: ToolContext) {
      const session = ctx.sessions.get(args.session_id);
      const m = session.mission;
      if (!m.triggers) m.triggers = { zones: {} };
      if (!m.triggers.zones) m.triggers.zones = {};

      const zones = m.triggers.zones;
      const existingKeys = Array.isArray(zones)
        ? zones.length
        : Object.keys(zones).map(Number).filter(n => !isNaN(n));
      const nextKey = Array.isArray(existingKeys)
        ? (existingKeys.length > 0 ? Math.max(...existingKeys) + 1 : 1)
        : (existingKeys as number) + 1;

      const zone = {
        name: args.name,
        x: args.x,
        y: args.y,
        radius: args.radius,
        type: 0,
        hidden: args.hidden,
        color: args.color ?? [1, 0, 0, 0.15],
        properties: {},
        zoneId: nextKey,
      };

      if (Array.isArray(zones)) {
        zones.push(zone);
      } else {
        zones[String(nextKey)] = zone;
      }

      session.markDirty();
      return { added: true, zone_id: nextKey, name: args.name };
    },
  },

  {
    name: 'modify_zone',
    description: 'Modify an existing zone by name. Only provided fields are changed.',
    inputSchema: z.object({
      session_id: z.string(),
      zone_name: z.string(),
      updates: z.record(z.any()),
    }),
    async handler(args, ctx: ToolContext) {
      const session = ctx.sessions.get(args.session_id);
      const zones = session.mission.triggers?.zones;
      if (!zones) throw new Error('No zones in this mission');

      const list = Array.isArray(zones) ? zones : Object.values(zones);
      const zone = list.find((z: any) => z.name === args.zone_name);
      if (!zone) throw new Error(`No zone named "${args.zone_name}"`);

      Object.assign(zone, args.updates);
      session.markDirty();
      return { updated: true, name: args.zone_name };
    },
  },

  {
    name: 'delete_zone',
    description: 'Delete a zone by name.',
    inputSchema: z.object({
      session_id: z.string(),
      zone_name: z.string(),
    }),
    async handler(args, ctx: ToolContext) {
      const session = ctx.sessions.get(args.session_id);
      const zones = session.mission.triggers?.zones;
      if (!zones) throw new Error('No zones in this mission');

      if (Array.isArray(zones)) {
        const idx = zones.findIndex((z: any) => z.name === args.zone_name);
        if (idx < 0) throw new Error(`No zone named "${args.zone_name}"`);
        zones.splice(idx, 1);
      } else {
        const key = Object.entries(zones).find(([_, z]) => (z as any).name === args.zone_name)?.[0];
        if (!key) throw new Error(`No zone named "${args.zone_name}"`);
        delete zones[key];
      }

      session.markDirty();
      return { deleted: true, name: args.zone_name };
    },
  },
];
