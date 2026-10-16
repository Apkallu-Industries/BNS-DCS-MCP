import { z } from "zod";
import type { ToolDefinition } from "./index.js";
import { loadRoadReference, loadTerrainGrid, nearestRoad, sampleGrid } from "../terrain/TerrainReference.js";

const pointSchema = { x: z.number().finite(), y: z.number().finite() };

export const terrainTools: ToolDefinition[] = [
  {
    name: "sample_terrain_height",
    description: "Sample elevation and local slope from an explicitly supplied DCS-metre terrain grid JSON. This does not read proprietary DCS terrain files automatically; grid coverage and source provenance must be checked by the caller.",
    inputSchema: z.object({ grid_path: z.string().min(1).max(2048), point: z.object(pointSchema) }),
    async handler(args: { grid_path: string; point: { x: number; y: number } }) {
      const grid = await loadTerrainGrid(args.grid_path);
      return { point: args.point, ...sampleGrid(grid, args.point), source: args.grid_path, coordinate_system: "DCS_METRES", caveat: "Results are only as accurate and complete as the supplied terrain grid." };
    },
  },
  {
    name: "validate_terrain_placement",
    description: "Check whether a point falls inside a supplied terrain grid and whether its sampled slope is below a chosen limit. This is a terrain-reference check, not a full collision or DCS Mission Editor validation.",
    inputSchema: z.object({
      grid_path: z.string().min(1).max(2048),
      point: z.object(pointSchema),
      max_slope_degrees: z.number().min(0).max(90).default(8),
    }),
    async handler(args: { grid_path: string; point: { x: number; y: number }; max_slope_degrees: number }) {
      const grid = await loadTerrainGrid(args.grid_path);
      const sample = sampleGrid(grid, args.point);
      return { point: args.point, ...sample, max_slope_degrees: args.max_slope_degrees, acceptable: sample.slope_degrees <= args.max_slope_degrees, source: args.grid_path, coordinate_system: "DCS_METRES", caveat: "Does not check buildings, trees, surface type, or unit-specific clearance." };
    },
  },
  {
    name: "find_road_near",
    description: "Find the nearest segment in a supplied road-reference JSON using DCS map metres. The file must contain roads as polylines in the same coordinate system; native DCS terrain road data is not extracted automatically.",
    inputSchema: z.object({
      roads_path: z.string().min(1).max(2048),
      point: z.object(pointSchema),
      max_distance_m: z.number().positive().max(100_000).default(500),
    }),
    async handler(args: { roads_path: string; point: { x: number; y: number }; max_distance_m: number }) {
      const roads = await loadRoadReference(args.roads_path);
      const nearest = nearestRoad(roads, args.point);
      return { point: args.point, found: nearest !== null && nearest.distance_m <= args.max_distance_m, nearest: nearest && nearest.distance_m <= args.max_distance_m ? nearest : null, nearest_any_distance_m: nearest?.distance_m ?? null, max_distance_m: args.max_distance_m, road_count: roads.roads.length, source: args.roads_path, coordinate_system: "DCS_METRES" };
    },
  },
];
