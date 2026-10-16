import { z } from "zod";
import type { ToolDefinition } from "./index.js";
import { asArray } from "../miz/MizSession.js";
import { appendNumericEntry, requireCountry } from "./dcs_helpers.js";

export const templateTools: ToolDefinition[] = [
  {
    name: "list_templates",
    description: "List reusable group templates from the currently open mission. Any existing group can be used as a structural template, preserving its DCS category, unit types, payloads, tasks and route structure.",
    inputSchema: z.object({
      session_id: z.string(),
      category: z.enum(["plane", "helicopter", "vehicle", "ship", "static"]).optional(),
    }),
    async handler(args: { session_id: string; category?: string }, ctx) {
      const session = ctx.sessions.get(args.session_id);
      const templates = [];
      for (const entry of session.iterGroups()) {
        if (args.category && entry.category !== args.category) continue;
        templates.push({
          template_id: entry.group.groupId,
          template_name: entry.group.name,
          coalition: entry.coalition,
          country: entry.country,
          category: entry.category,
          unit_count: asArray<any>(entry.group.units as any).length,
          unit_types: asArray<any>(entry.group.units as any).map((unit: any) => unit.type),
          origin: { x: entry.group.x ?? 0, y: entry.group.y ?? 0 },
        });
      }
      return { count: templates.length, templates };
    },
  },
  {
    name: "add_template_group",
    description: "Clone an existing mission group as a reusable template into an already-present target coalition/country. Allocates fresh group and unit IDs, applies a position offset to group, units and route points, and preserves the source group structure. It does not invent DCS country IDs or change the source group.",
    inputSchema: z.object({
      session_id: z.string(),
      template_group_id: z.number().optional(),
      template_group_name: z.string().optional(),
      new_group_name: z.string().min(1).max(128),
      coalition: z.enum(["blue", "red", "neutral"]),
      country: z.string().min(1),
      position: z.object({ x: z.number().finite(), y: z.number().finite() }).optional(),
      offset_x: z.number().finite().optional(),
      offset_y: z.number().finite().optional(),
    }).refine(args => args.template_group_id != null || !!args.template_group_name, {
      message: "Provide template_group_id or template_group_name",
    }),
    async handler(args: {
      session_id: string; template_group_id?: number; template_group_name?: string;
      new_group_name: string; coalition: "blue" | "red" | "neutral"; country: string;
      position?: { x: number; y: number }; offset_x?: number; offset_y?: number;
    }, ctx) {
      const session = ctx.sessions.get(args.session_id);
      const source = args.template_group_id != null
        ? session.findGroupById(args.template_group_id)
        : session.findGroupByName(args.template_group_name!);
      if (!source) throw new Error("Template group not found");
      if (session.findGroupByName(args.new_group_name)) {
        throw new Error(`A group named "${args.new_group_name}" already exists`);
      }

      const country = requireCountry(session.mission, args.coalition, args.country);
      const category = source.category;
      if (!country[category]) country[category] = { group: [] };
      if (!country[category].group) country[category].group = [];

      const clone: any = structuredClone(source.group);
      const oldX = Number(clone.x ?? 0);
      const oldY = Number(clone.y ?? 0);
      const targetX = args.position?.x ?? (oldX + (args.offset_x ?? 0));
      const targetY = args.position?.y ?? (oldY + (args.offset_y ?? 0));
      const dx = targetX - oldX;
      const dy = targetY - oldY;

      clone.groupId = session.getNextGroupId();
      clone.name = args.new_group_name;
      const nextUnitId = session.getNextUnitId();
      clone.x = targetX;
      clone.y = targetY;
      for (const [index, unit] of asArray<any>(clone.units as any).entries()) {
        unit.unitId = nextUnitId + index;
        if (unit.name) unit.name = unit.name.replace(source.group.name, args.new_group_name);
        else unit.name = `${args.new_group_name} unit ${unit.unitId}`;
        if (typeof unit.x === "number") unit.x += dx;
        if (typeof unit.y === "number") unit.y += dy;
      }
      for (const point of asArray<any>(clone.route?.points as any)) {
        if (typeof point.x === "number") point.x += dx;
        if (typeof point.y === "number") point.y += dy;
      }

      appendNumericEntry(country[category].group, clone);
      session.markDirty();
      return {
        added: true,
        group_id: clone.groupId,
        group_name: clone.name,
        category,
        coalition: args.coalition,
        country: args.country,
        unit_count: asArray<any>(clone.units as any).length,
        position: { x: targetX, y: targetY },
        source_group_id: source.group.groupId,
        dirty: session.isDirty,
      };
    },
  },
];
