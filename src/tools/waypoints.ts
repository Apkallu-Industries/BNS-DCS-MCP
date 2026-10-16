import { z } from 'zod';
import type { ToolDefinition, ToolContext } from './index.js';

export const waypointTools: ToolDefinition[] = [
  {
    name: 'get_route',
    description: "Get a group's route (all waypoints).",
    inputSchema: z.object({
      session_id: z.string(),
      group_id: z.number(),
    }),
    async handler(args, ctx: ToolContext) {
      const session = ctx.sessions.get(args.session_id);
      const entry = session.findGroupById(args.group_id);
      if (!entry) throw new Error(`No group with id ${args.group_id}`);

      return {
        group_id: args.group_id,
        name: entry.group.name,
        route: entry.group.route ?? { points: [] },
      };
    },
  },

  {
    name: 'set_route',
    description: "Replace a group's entire route with new waypoints.",
    inputSchema: z.object({
      session_id: z.string(),
      group_id: z.number(),
      points: z.array(z.object({
        name: z.string().optional(),
        type: z.string().default('Turning Point'),
        action: z.string().default('Turning Point'),
        x: z.number(),
        y: z.number(),
        alt: z.number().default(0),
        alt_type: z.string().default('BARO'),
        speed: z.number().default(0),
      })),
    }),
    async handler(args, ctx: ToolContext) {
      const session = ctx.sessions.get(args.session_id);
      const entry = session.findGroupById(args.group_id);
      if (!entry) throw new Error(`No group with id ${args.group_id}`);

      if (!entry.group.route) entry.group.route = {};
      entry.group.route.points = args.points.map((p: any, i: number) => ({
        ...p,
        name: p.name ?? `WP${i}`,
        task: { id: 'ComboTask', params: { tasks: {} } },
      }));
      session.markDirty();

      return { updated: true, group_id: args.group_id, waypoint_count: args.points.length };
    },
  },

  {
    name: 'add_waypoint',
    description: 'Add a waypoint to a group\'s route.',
    inputSchema: z.object({
      session_id: z.string(),
      group_id: z.number(),
      x: z.number(),
      y: z.number(),
      alt: z.number().default(0),
      alt_type: z.string().default('BARO'),
      speed: z.number().default(0),
      type: z.string().default('Turning Point'),
      action: z.string().default('Turning Point'),
      name: z.string().optional(),
      index: z.number().optional().describe('Insert position (0-based). Appends if omitted.'),
    }),
    async handler(args, ctx: ToolContext) {
      const session = ctx.sessions.get(args.session_id);
      const entry = session.findGroupById(args.group_id);
      if (!entry) throw new Error(`No group with id ${args.group_id}`);

      if (!entry.group.route) entry.group.route = { points: [] };
      if (!entry.group.route.points) entry.group.route.points = [];

      const wp = {
        name: args.name ?? `WP${entry.group.route.points.length}`,
        type: args.type,
        action: args.action,
        x: args.x,
        y: args.y,
        alt: args.alt,
        alt_type: args.alt_type,
        speed: args.speed,
        task: { id: 'ComboTask', params: { tasks: {} } },
      };

      if (args.index != null && args.index < entry.group.route.points.length) {
        entry.group.route.points.splice(args.index, 0, wp);
      } else {
        entry.group.route.points.push(wp);
      }

      session.markDirty();
      return {
        added: true,
        group_id: args.group_id,
        waypoint_index: args.index ?? entry.group.route.points.length - 1,
        total_waypoints: entry.group.route.points.length,
      };
    },
  },

  {
    name: 'modify_waypoint',
    description: 'Modify an existing waypoint by index. Only provided fields are changed.',
    inputSchema: z.object({
      session_id: z.string(),
      group_id: z.number(),
      waypoint_index: z.number().describe('0-based index into the route points array'),
      updates: z.record(z.any()),
    }),
    async handler(args, ctx: ToolContext) {
      const session = ctx.sessions.get(args.session_id);
      const entry = session.findGroupById(args.group_id);
      if (!entry) throw new Error(`No group with id ${args.group_id}`);

      const points = entry.group.route?.points;
      if (!points || args.waypoint_index >= points.length) {
        throw new Error(`Waypoint index ${args.waypoint_index} out of range (${points?.length ?? 0} waypoints)`);
      }

      Object.assign(points[args.waypoint_index], args.updates);
      session.markDirty();

      return { updated: true, group_id: args.group_id, waypoint_index: args.waypoint_index };
    },
  },
];
