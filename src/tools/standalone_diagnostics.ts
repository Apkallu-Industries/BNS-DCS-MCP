import { z } from "zod";
import type { ToolDefinition } from "./index.js";
import { lintMissionScripts } from "../diagnostics/LuaScriptLint.js";
import { renderMissionOverview } from "../diagnostics/MissionOverviewSvg.js";
import { diffMissions } from "../diagnostics/MizDiff.js";

export const standaloneDiagnosticsTools: ToolDefinition[] = [
  {
    name: "lint_mission_scripts",
    description: "Lint supplied Lua mission scripts for syntax errors, Lua 5.1 compatibility hazards and common script mistakes. Script text is analysed in memory and is not executed.",
    inputSchema: z.object({
      scripts: z.array(z.object({
        path: z.string().min(1).max(1024),
        text: z.string().max(2_000_000),
      })).max(200),
    }),
    async handler(args: { scripts: Array<{ path: string; text: string }> }) {
      return lintMissionScripts(args.scripts);
    },
  },
  {
    name: "render_mission_overview",
    description: "Render a static SVG overview of the open mission's groups, routes and zones for inspection. Returns SVG text and summary data; it does not launch DCS.",
    inputSchema: z.object({
      session_id: z.string(),
      include_routes: z.boolean().optional(),
      include_zones: z.boolean().optional(),
      include_labels: z.boolean().optional(),
      group_filter: z.string().optional(),
      coalitions: z.array(z.enum(["blue", "red", "neutral"])).optional(),
    }),
    async handler(args: {
      session_id: string; include_routes?: boolean; include_zones?: boolean;
      include_labels?: boolean; group_filter?: string; coalitions?: Array<"blue" | "red" | "neutral">;
    }, ctx) {
      const session = ctx.sessions.get(args.session_id);
      return renderMissionOverview(session, {
        includeRoutes: args.include_routes,
        includeZones: args.include_zones,
        includeLabels: args.include_labels,
        groupFilter: args.group_filter,
        coalitions: args.coalitions,
      });
    },
  },
  {
    name: "diff_miz",
    description: "Compare two open .miz mission sessions and report differences in metadata, weather, groups, zones, triggers and embedded files.",
    inputSchema: z.object({
      session_id_a: z.string(),
      session_id_b: z.string(),
      max_changes: z.number().int().min(1).max(5000).optional(),
    }),
    async handler(args: { session_id_a: string; session_id_b: string; max_changes?: number }, ctx) {
      const a = ctx.sessions.get(args.session_id_a);
      const b = ctx.sessions.get(args.session_id_b);
      return diffMissions(a, b, { maxChanges: args.max_changes });
    },
  },
];
