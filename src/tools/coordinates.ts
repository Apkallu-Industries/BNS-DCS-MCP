import { z } from 'zod';
import proj4 from 'proj4';
import type { ToolDefinition, ToolContext } from './index.js';

const PROJECTIONS: Record<string, string> = {
  persiangulf: '+proj=tmerc +lat_0=0 +lon_0=57 +k_0=0.9996 +x_0=75755.99999999645 +y_0=-2894933.0000000377 +towgs84=0,0,0,0,0,0,0 +units=m +vunits=m +ellps=WGS84 +no_defs',
  caucasus: '+proj=tmerc +lat_0=0 +lon_0=33 +k_0=0.9996 +x_0=-99516.9999999732 +y_0=-4998114.999999984 +towgs84=0,0,0,0,0,0,0 +units=m +vunits=m +ellps=WGS84 +no_defs',
  syria: '+proj=tmerc +lat_0=0 +lon_0=39 +k_0=0.9996 +x_0=282801.00000003993 +y_0=-3879865.9999999935 +towgs84=0,0,0,0,0,0,0 +units=m +vunits=m +ellps=WGS84 +no_defs',
  sinai: '+proj=tmerc +lat_0=0 +lon_0=33 +k_0=0.9996 +x_0=169221.9999999585 +y_0=-3325312.9999999693 +towgs84=0,0,0,0,0,0,0 +units=m +vunits=m +ellps=WGS84 +no_defs',
  kola: '+proj=tmerc +lat_0=0 +lon_0=21 +k_0=0.9996 +x_0=-62702.00000000087 +y_0=-7543624.999999979 +towgs84=0,0,0,0,0,0,0 +units=m +vunits=m +ellps=WGS84 +no_defs',
  falklands: '+proj=tmerc +lat_0=0 +lon_0=-57 +k_0=0.9996 +x_0=147639.99999997593 +y_0=5815417.000000032 +towgs84=0,0,0,0,0,0,0 +units=m +vunits=m +ellps=WGS84 +no_defs',
  marianaislands: '+proj=tmerc +lat_0=0 +lon_0=147 +k_0=0.9996 +x_0=238417.99999989968 +y_0=-1491840.000000048 +towgs84=0,0,0,0,0,0,0 +units=m +vunits=m +ellps=WGS84 +no_defs',
  nevada: '+proj=tmerc +lat_0=0 +lon_0=-117 +k_0=0.9996 +x_0=-193996.80999964548 +y_0=-4410028.063999966 +towgs84=0,0,0,0,0,0,0 +units=m +vunits=m +ellps=WGS84 +no_defs',
  normandy: '+proj=tmerc +lat_0=0 +lon_0=-3 +k_0=0.9996 +x_0=-195526.00000000204 +y_0=-5484812.999999951 +towgs84=0,0,0,0,0,0,0 +units=m +vunits=m +ellps=WGS84 +no_defs',
  thechannel: '+proj=tmerc +lat_0=0 +lon_0=3 +k_0=0.9996 +x_0=99376.00000000288 +y_0=-5636889.00000001 +towgs84=0,0,0,0,0,0,0 +units=m +vunits=m +ellps=WGS84 +no_defs',
  germany: '+proj=tmerc +lat_0=0 +lon_0=21 +k_0=0.9996 +x_0=35427.619999985734 +y_0=-6061633.128000011 +towgs84=0,0,0,0,0,0,0 +units=m +vunits=m +ellps=WGS84 +no_defs',
  afghanistan: '+proj=tmerc +lat_0=0 +lon_0=69 +k_0=0.9996 +x_0=0 +y_0=-3820000 +towgs84=0,0,0,0,0,0,0 +units=m +vunits=m +ellps=WGS84 +no_defs',
  iraq: '+proj=tmerc +lat_0=0 +lon_0=45 +k_0=0.9996 +x_0=0 +y_0=-3690000 +towgs84=0,0,0,0,0,0,0 +units=m +vunits=m +ellps=WGS84 +no_defs',
};

export function normalizeTheater(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function getProjection(theater: string): string {
  const norm = normalizeTheater(theater);
  const proj = PROJECTIONS[norm];
  if (!proj) {
    const valid = Object.keys(PROJECTIONS).join(', ');
    throw new Error(`Unknown theater "${theater}". Valid theaters: ${valid}`);
  }
  return proj;
}

export function latLonToDcsCoordinates(lat: number, lon: number, theater: string): { x: number; y: number } {
  const projStr = getProjection(theater);
  const [easting, northing] = proj4('WGS84', projStr, [lon, lat]);
  return { x: northing, y: easting };
}

export function dcsToLatLonCoordinates(x: number, y: number, theater: string): { lat: number; lon: number } {
  const projStr = getProjection(theater);
  const [lon, lat] = proj4(projStr, 'WGS84', [y, x]);
  return { lat, lon };
}

export const coordinateTools: ToolDefinition[] = [
  {
    name: 'dcs_to_latlon',
    description:
      'Convert DCS internal coordinates (x, y) to WGS84 GPS (lat, lon). ' +
      'In DCS: x = northing, y = easting. Theater is required. ' +
      'Supports all 13 DCS theaters.',
    inputSchema: z.object({
      x: z.number().describe('DCS x coordinate (northing)'),
      y: z.number().describe('DCS y coordinate (easting)'),
      theater: z.string().describe('Theater name (e.g. "PersianGulf", "Caucasus", "Syria")'),
    }),
    async handler(args: any) {
      const { lat, lon } = dcsToLatLonCoordinates(args.x, args.y, args.theater);
      return { lat: Math.round(lat * 1e6) / 1e6, lon: Math.round(lon * 1e6) / 1e6 };
    },
  },

  {
    name: 'latlon_to_dcs',
    description:
      'Convert WGS84 GPS (lat, lon) to DCS internal coordinates (x, y). ' +
      'Returns x = northing, y = easting. Theater is required.',
    inputSchema: z.object({
      lat: z.number().describe('Latitude in decimal degrees'),
      lon: z.number().describe('Longitude in decimal degrees'),
      theater: z.string().describe('Theater name (e.g. "PersianGulf", "Caucasus", "Syria")'),
    }),
    async handler(args: any) {
      const { x, y } = latLonToDcsCoordinates(args.lat, args.lon, args.theater);
      return { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 };
    },
  },

  {
    name: 'list_theaters',
    description: 'List all supported DCS theaters with their projection parameters.',
    inputSchema: z.object({}),
    async handler() {
      return {
        theaters: Object.keys(PROJECTIONS).map(key => ({
          id: key,
          central_meridian: parseFloat(PROJECTIONS[key].match(/lon_0=([-\d.]+)/)?.[1] ?? '0'),
        })),
      };
    },
  },
];
