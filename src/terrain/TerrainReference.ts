import { readFile } from "node:fs/promises";

const MAX_REFERENCE_BYTES = 50 * 1024 * 1024;

export interface XY { x: number; y: number }
export interface RoadFeature { id: string; name?: string; points: XY[] }
export interface RoadReference {
  coordinateSystem: "DCS_METRES";
  roads: RoadFeature[];
}
export interface TerrainGrid {
  coordinateSystem: "DCS_METRES";
  origin: XY;
  spacing: XY;
  width: number;
  height: number;
  elevations: number[][];
}

async function readJson(path: string): Promise<unknown> {
  if (!path.trim() || path.length > 2048) throw new Error("A valid local reference file path is required.");
  const file = await readFile(path);
  if (file.byteLength > MAX_REFERENCE_BYTES) throw new Error("Terrain reference file exceeds the 50 MiB safety limit.");
  try { return JSON.parse(file.toString("utf8")); }
  catch { throw new Error("Terrain reference file is not valid JSON."); }
}

function finiteXY(value: unknown): value is XY {
  if (!value || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  return typeof p.x === "number" && Number.isFinite(p.x) && typeof p.y === "number" && Number.isFinite(p.y);
}

export async function loadRoadReference(path: string): Promise<RoadReference> {
  const value = await readJson(path) as Partial<RoadReference> | null;
  if (!value || value.coordinateSystem !== "DCS_METRES" || !Array.isArray(value.roads)) {
    throw new Error('Road file must use { "coordinateSystem": "DCS_METRES", "roads": [...] }.');
  }
  if (value.roads.length > 500_000) throw new Error("Road reference contains too many road features.");
  const roads: RoadFeature[] = value.roads.map((road, i) => {
    if (!road || typeof road.id !== "string" || !Array.isArray(road.points) ||
        road.points.length < 2 || road.points.length > 100_000 || !road.points.every(finiteXY)) {
      throw new Error(`Invalid road feature at index ${i}; each road needs an id and at least two finite {x,y} points.`);
    }
    return { id: road.id, name: typeof road.name === "string" ? road.name : undefined, points: road.points };
  });
  return { coordinateSystem: "DCS_METRES", roads };
}

export async function loadTerrainGrid(path: string): Promise<TerrainGrid> {
  const value = await readJson(path) as Partial<TerrainGrid> | null;
  if (!value || value.coordinateSystem !== "DCS_METRES" || !finiteXY(value.origin) ||
      !finiteXY(value.spacing) || !Number.isInteger(value.width) || !Number.isInteger(value.height) ||
      value.width! < 2 || value.height! < 2 || value.width! > 20_000 || value.height! > 20_000 ||
      value.width! * value.height! > 20_000_000 || value.spacing.x <= 0 || value.spacing.y <= 0 ||
      !Array.isArray(value.elevations) || value.elevations.length !== value.height) {
    throw new Error("Terrain grid has an invalid header. Expected DCS_METRES, origin, positive spacing, dimensions, and row-major elevations.");
  }
  const elevations = value.elevations;
  for (let row = 0; row < elevations.length; row++) {
    if (!Array.isArray(elevations[row]) || elevations[row].length !== value.width ||
        !elevations[row].every((n) => typeof n === "number" && Number.isFinite(n))) {
      throw new Error(`Terrain elevation row ${row} does not match the grid width or contains non-finite values.`);
    }
  }
  return {
    coordinateSystem: "DCS_METRES",
    origin: value.origin,
    spacing: value.spacing,
    width: value.width,
    height: value.height,
    elevations,
  };
}

export function sampleGrid(grid: TerrainGrid, point: XY): { elevation_m: number; slope_degrees: number; grid_cell: { x: number; y: number } } {
  const gx = (point.x - grid.origin.x) / grid.spacing.x;
  const gy = (point.y - grid.origin.y) / grid.spacing.y;
  if (gx < 0 || gy < 0 || gx > grid.width - 1 || gy > grid.height - 1) {
    throw new Error("Requested point lies outside the supplied terrain grid coverage.");
  }
  const x0 = Math.min(Math.floor(gx), grid.width - 2);
  const y0 = Math.min(Math.floor(gy), grid.height - 2);
  const tx = gx - x0;
  const ty = gy - y0;
  const z00 = grid.elevations[y0][x0];
  const z10 = grid.elevations[y0][x0 + 1];
  const z01 = grid.elevations[y0 + 1][x0];
  const z11 = grid.elevations[y0 + 1][x0 + 1];
  const top = z00 * (1 - tx) + z10 * tx;
  const bottom = z01 * (1 - tx) + z11 * tx;
  const elevation = top * (1 - ty) + bottom * ty;
  const dzdx = ((z10 - z00) * (1 - ty) + (z11 - z01) * ty) / grid.spacing.x;
  const dzdy = ((z01 - z00) * (1 - tx) + (z11 - z10) * tx) / grid.spacing.y;
  const slope = Math.atan(Math.hypot(dzdx, dzdy)) * 180 / Math.PI;
  return { elevation_m: Math.round(elevation * 100) / 100, slope_degrees: Math.round(slope * 100) / 100, grid_cell: { x: x0, y: y0 } };
}

export function nearestRoad(roads: RoadReference, point: XY): { road_id: string; road_name?: string; nearest_point: XY; distance_m: number; segment_index: number } | null {
  let best: { road_id: string; road_name?: string; nearest_point: XY; distance_m: number; segment_index: number } | null = null;
  for (const road of roads.roads) {
    for (let i = 0; i < road.points.length - 1; i++) {
      const a = road.points[i], b = road.points[i + 1];
      const dx = b.x - a.x, dy = b.y - a.y;
      const denom = dx * dx + dy * dy;
      const t = denom === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / denom));
      const nearest = { x: a.x + t * dx, y: a.y + t * dy };
      const distance = Math.hypot(point.x - nearest.x, point.y - nearest.y);
      if (!best || distance < best.distance_m) {
        best = { road_id: road.id, road_name: road.name, nearest_point: nearest, distance_m: distance, segment_index: i };
      }
    }
  }
  if (best) best.distance_m = Math.round(best.distance_m * 100) / 100;
  return best;
}
