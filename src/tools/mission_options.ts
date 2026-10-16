import { z } from "zod";
import type { ToolDefinition } from "./index.js";

/** Generic access to the separate DCS options Lua table. */
export const missionOptionTools: ToolDefinition[] = [
  {
    name: "get_mission_options",
    description: "Return the DCS mission options table from the open .miz session. This is the separate options file, not the mission's forcedOptions field.",
    inputSchema: z.object({ session_id: z.string() }),
    async handler(args: { session_id: string }, ctx) {
      const options = ctx.sessions.get(args.session_id).options;
      return { options, top_level_keys: Object.keys(options).sort() };
    },
  },
  {
    name: "get_mission_option",
    description: "Read one value from the DCS mission options table using a dotted path, such as difficulty or miscellaneous.allow_player_can_drive.",
    inputSchema: z.object({
      session_id: z.string(),
      path: z.string().min(1).max(200),
    }),
    async handler(args: { session_id: string; path: string }, ctx) {
      const parts = validatePath(args.path);
      let value: any = ctx.sessions.get(args.session_id).options;
      for (const part of parts) {
        if (value == null || typeof value !== "object" || !(part in value)) {
          return { path: args.path, exists: false, value: null };
        }
        value = value[part];
      }
      return { path: args.path, exists: true, value };
    },
  },
  {
    name: "set_mission_option",
    description: "Set one value in the DCS mission options table using a dotted path. The change remains in the session until save_miz is called.",
    inputSchema: z.object({
      session_id: z.string(),
      path: z.string().min(1).max(200),
      value: z.any().describe("JSON-compatible option value"),
    }),
    async handler(args: { session_id: string; path: string; value: unknown }, ctx) {
      const parts = validatePath(args.path);
      const session = ctx.sessions.get(args.session_id);
      session.setOption(parts.join("."), args.value);
      return { updated: true, path: parts.join("."), value: args.value, dirty: session.isDirty };
    },
  },
];

function validatePath(path: string): string[] {
  const parts = path.split(".").map(part => part.trim());
  if (parts.some(part =>
    !part || part === "__proto__" || part === "prototype" || part === "constructor"
  )) {
    throw new Error("Invalid mission option path");
  }
  return parts;
}
