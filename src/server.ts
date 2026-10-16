import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SessionStore } from "./miz/SessionStore.js";
import { ToolRegistry, type ToolContext } from "./tools/index.js";
import { missionTools } from "./tools/mission.js";
import { groupTools } from "./tools/groups.js";
import { waypointTools } from "./tools/waypoints.js";
import { coordinateTools } from "./tools/coordinates.js";
import { triggerTools } from "./tools/triggers.js";
import { zoneTools } from "./tools/zones.js";
import { weatherTools } from "./tools/weather.js";
import { payloadTools } from "./tools/payload.js";
import { rawTools } from "./tools/raw.js";
import { geometryTools } from "./tools/geometry.js";
import { briefingTools } from "./tools/briefing.js";
import { historicalTools } from "./tools/historical.js";

export const SERVER_NAME = "bns-dcs-mcp";
export const SERVER_VERSION = "0.1.0";

/** First migrated core surface; the registry grows by capability family with tests. */
export function createToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.registerAll(missionTools);
  registry.registerAll(groupTools);
  registry.registerAll(waypointTools);
  registry.registerAll(coordinateTools);
  registry.registerAll(triggerTools);
  registry.registerAll(zoneTools);
  registry.registerAll(weatherTools);
  registry.registerAll(payloadTools);
  registry.registerAll(rawTools);
  registry.registerAll(geometryTools);
  registry.registerAll(briefingTools);
  registry.registerAll(historicalTools);
  return registry;
}

export function createServer(): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  const sessions = new SessionStore();
  const ctx: ToolContext = { sessions };

  for (const tool of createToolRegistry().list()) {
    const shape = zodToJsonSchemaShape(tool.inputSchema);
    server.tool(tool.name, tool.description, shape, async (args) => {
      try {
        const result = await tool.handler(args, ctx);
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }], isError: true };
      }
    });
  }
  return server;
}

function zodToJsonSchemaShape(schema: z.ZodType<any>): Record<string, z.ZodType<any>> {
  if (schema instanceof z.ZodObject) return schema.shape;
  // Keep refined object schemas usable with MCP clients by unwrapping ZodEffects.
  if ("innerType" in schema && typeof (schema as any).innerType === "function") {
    return zodToJsonSchemaShape((schema as any).innerType());
  }
  if ("_def" in schema && (schema as any)._def?.schema) {
    return zodToJsonSchemaShape((schema as any)._def.schema);
  }
  return {};
}
