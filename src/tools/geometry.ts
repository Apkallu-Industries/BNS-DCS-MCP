import { z } from 'zod';
import type { ToolDefinition, ToolContext } from './index.js';

const R_EARTH = 6371000; // meters

function toRad(deg: number): number { return deg * Math.PI / 180; }
function toDeg(rad: number): number { return rad * 180 / Math.PI; }

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R_EARTH * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function cartesianDistance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

function bearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function cartesianHeading(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return (toDeg(Math.atan2(dx, dy)) + 360) % 360;
}

const pointSchema = z.union([
  z.object({ lat: z.number(), lon: z.number() }),
  z.object({ x: z.number(), y: z.number() }),
]);

export const geometryTools: ToolDefinition[] = [
  {
    name: 'distance_between',
    description:
      'Calculate the distance between two points. Accepts lat/lon (haversine, meters) or x/y (cartesian, map units). ' +
      'Both points must use the same coordinate system.',
    inputSchema: z.object({
      from: pointSchema,
      to: pointSchema,
    }),
    async handler(args: any) {
      if ('lat' in args.from && 'lat' in args.to) {
        const d = haversineDistance(args.from.lat, args.from.lon, args.to.lat, args.to.lon);
        return { distance_m: Math.round(d), distance_nm: Math.round(d / 1852 * 100) / 100, distance_km: Math.round(d / 10) / 100 };
      }
      if ('x' in args.from && 'x' in args.to) {
        const d = cartesianDistance(args.from.x, args.from.y, args.to.x, args.to.y);
        return { distance_m: Math.round(d), distance_nm: Math.round(d / 1852 * 100) / 100, distance_km: Math.round(d / 10) / 100 };
      }
      throw new Error('Both points must use the same coordinate type (lat/lon or x/y)');
    },
  },

  {
    name: 'heading_between',
    description:
      'Calculate the heading (bearing) from one point to another in degrees (0=north, 90=east). ' +
      'Accepts lat/lon or x/y.',
    inputSchema: z.object({
      from: pointSchema,
      to: pointSchema,
    }),
    async handler(args: any) {
      if ('lat' in args.from && 'lat' in args.to) {
        return { heading_deg: Math.round(bearing(args.from.lat, args.from.lon, args.to.lat, args.to.lon) * 100) / 100 };
      }
      if ('x' in args.from && 'x' in args.to) {
        return { heading_deg: Math.round(cartesianHeading(args.from.x, args.from.y, args.to.x, args.to.y) * 100) / 100 };
      }
      throw new Error('Both points must use the same coordinate type');
    },
  },

  {
    name: 'midpoint',
    description: 'Get the midpoint between two points (lat/lon or x/y).',
    inputSchema: z.object({
      from: pointSchema,
      to: pointSchema,
    }),
    async handler(args: any) {
      if ('lat' in args.from && 'lat' in args.to) {
        return { lat: (args.from.lat + args.to.lat) / 2, lon: (args.from.lon + args.to.lon) / 2 };
      }
      if ('x' in args.from && 'x' in args.to) {
        return { x: (args.from.x + args.to.x) / 2, y: (args.from.y + args.to.y) / 2 };
      }
      throw new Error('Both points must use the same coordinate type');
    },
  },

  {
    name: 'point_from_heading',
    description:
      'Calculate a point at a given heading and distance from a start point. ' +
      'For x/y: uses flat-earth math. For lat/lon: uses great-circle projection.',
    inputSchema: z.object({
      from: pointSchema,
      heading_deg: z.number().describe('Heading in degrees (0=north, 90=east)'),
      distance_m: z.number().describe('Distance in meters'),
    }),
    async handler(args: any) {
      const hdg = toRad(args.heading_deg);
      const dist = args.distance_m;

      if ('lat' in args.from) {
        const lat1 = toRad(args.from.lat);
        const lon1 = toRad(args.from.lon);
        const angDist = dist / R_EARTH;

        const lat2 = Math.asin(
          Math.sin(lat1) * Math.cos(angDist) +
          Math.cos(lat1) * Math.sin(angDist) * Math.cos(hdg)
        );
        const lon2 = lon1 + Math.atan2(
          Math.sin(hdg) * Math.sin(angDist) * Math.cos(lat1),
          Math.cos(angDist) - Math.sin(lat1) * Math.sin(lat2)
        );

        return { lat: toDeg(lat2), lon: toDeg(lon2) };
      }

      if ('x' in args.from) {
        return {
          x: args.from.x + dist * Math.sin(hdg),
          y: args.from.y + dist * Math.cos(hdg),
        };
      }

      throw new Error('Invalid from point');
    },
  },

  {
    name: 'lerp_point',
    description: 'Linear interpolation between two points. t=0 returns "from", t=1 returns "to".',
    inputSchema: z.object({
      from: pointSchema,
      to: pointSchema,
      t: z.number().describe('Interpolation factor (0.0 to 1.0)'),
    }),
    async handler(args: any) {
      const t = args.t;
      if ('lat' in args.from && 'lat' in args.to) {
        return {
          lat: args.from.lat + (args.to.lat - args.from.lat) * t,
          lon: args.from.lon + (args.to.lon - args.from.lon) * t,
        };
      }
      if ('x' in args.from && 'x' in args.to) {
        return {
          x: args.from.x + (args.to.x - args.from.x) * t,
          y: args.from.y + (args.to.y - args.from.y) * t,
        };
      }
      throw new Error('Both points must use the same coordinate type');
    },
  },

  {
    name: 'point_in_zone',
    description: 'Check whether a point falls inside a circular zone.',
    inputSchema: z.object({
      point: z.object({ x: z.number(), y: z.number() }),
      zone_center: z.object({ x: z.number(), y: z.number() }),
      zone_radius: z.number().describe('Zone radius in meters'),
    }),
    async handler(args: any) {
      const d = cartesianDistance(args.point.x, args.point.y, args.zone_center.x, args.zone_center.y);
      return { inside: d <= args.zone_radius, distance_to_center: Math.round(d), radius: args.zone_radius };
    },
  },

  {
    name: 'random_point_within',
    description: 'Generate a random point within a circle.',
    inputSchema: z.object({
      center: z.object({ x: z.number(), y: z.number() }),
      radius: z.number().describe('Radius in meters'),
    }),
    async handler(args: any) {
      const angle = Math.random() * 2 * Math.PI;
      const r = args.radius * Math.sqrt(Math.random());
      return {
        x: args.center.x + r * Math.cos(angle),
        y: args.center.y + r * Math.sin(angle),
      };
    },
  },
];
