import { z } from 'zod';
import type { ToolDefinition, ToolContext } from './index.js';

export const weatherTools: ToolDefinition[] = [
  {
    name: 'set_weather',
    description:
      'Set weather conditions. All parameters are optional — only provided values change. ' +
      'Temperature in Celsius, visibility in meters, wind speed in m/s, wind direction in degrees.',
    inputSchema: z.object({
      session_id: z.string(),
      temperature: z.number().optional(),
      visibility: z.number().optional().describe('Visibility in meters'),
      wind_ground_speed: z.number().optional(),
      wind_ground_dir: z.number().optional(),
      wind_2000_speed: z.number().optional(),
      wind_2000_dir: z.number().optional(),
      wind_8000_speed: z.number().optional(),
      wind_8000_dir: z.number().optional(),
      fog_enabled: z.boolean().optional(),
      fog_visibility: z.number().optional(),
      fog_thickness: z.number().optional(),
      cloud_preset: z.string().optional().describe('DCS cloud preset name (e.g. "Preset1")'),
      cloud_density: z.number().optional(),
      cloud_base: z.number().optional(),
      cloud_thickness: z.number().optional(),
      dust_enabled: z.boolean().optional(),
      dust_density: z.number().optional(),
    }),
    async handler(args, ctx: ToolContext) {
      const session = ctx.sessions.get(args.session_id);
      const m = session.mission;
      if (!m.weather) m.weather = {};
      const w = m.weather;

      if (args.temperature != null) {
        if (!w.season) w.season = {};
        w.season.temperature = args.temperature;
      }

      if (args.visibility != null) {
        if (!w.visibility) w.visibility = {};
        w.visibility.distance = args.visibility;
      }

      if (!w.wind) w.wind = {};
      if (args.wind_ground_speed != null || args.wind_ground_dir != null) {
        if (!w.wind.atGround) w.wind.atGround = { speed: 0, dir: 0 };
        if (args.wind_ground_speed != null) w.wind.atGround.speed = args.wind_ground_speed;
        if (args.wind_ground_dir != null) w.wind.atGround.dir = args.wind_ground_dir;
      }
      if (args.wind_2000_speed != null || args.wind_2000_dir != null) {
        if (!w.wind.at2000) w.wind.at2000 = { speed: 0, dir: 0 };
        if (args.wind_2000_speed != null) w.wind.at2000.speed = args.wind_2000_speed;
        if (args.wind_2000_dir != null) w.wind.at2000.dir = args.wind_2000_dir;
      }
      if (args.wind_8000_speed != null || args.wind_8000_dir != null) {
        if (!w.wind.at8000) w.wind.at8000 = { speed: 0, dir: 0 };
        if (args.wind_8000_speed != null) w.wind.at8000.speed = args.wind_8000_speed;
        if (args.wind_8000_dir != null) w.wind.at8000.dir = args.wind_8000_dir;
      }

      if (args.fog_enabled != null) w.enable_fog = args.fog_enabled;
      if (args.fog_visibility != null || args.fog_thickness != null) {
        if (!w.fog) w.fog = { visibility: 6000, thickness: 0 };
        if (args.fog_visibility != null) w.fog.visibility = args.fog_visibility;
        if (args.fog_thickness != null) w.fog.thickness = args.fog_thickness;
      }

      if (args.cloud_preset != null || args.cloud_density != null || args.cloud_base != null) {
        if (!w.clouds) w.clouds = {};
        if (args.cloud_preset != null) w.clouds.preset = args.cloud_preset;
        if (args.cloud_density != null) w.clouds.density = args.cloud_density;
        if (args.cloud_base != null) w.clouds.base = args.cloud_base;
        if (args.cloud_thickness != null) w.clouds.thickness = args.cloud_thickness;
      }

      if (args.dust_enabled != null) w.enable_dust = args.dust_enabled;
      if (args.dust_density != null) {
        if (!w.dust_density) w.dust_density = 0;
        w.dust_density = args.dust_density;
      }

      session.markDirty();
      return { updated: true, weather: w };
    },
  },

  {
    name: 'set_start_time',
    description:
      'Set the mission start time and/or date. ' +
      'Time is seconds since midnight (e.g. 28800 = 08:00).',
    inputSchema: z.object({
      session_id: z.string(),
      start_time: z.number().optional().describe('Seconds since midnight'),
      year: z.number().optional(),
      month: z.number().optional(),
      day: z.number().optional(),
    }),
    async handler(args, ctx: ToolContext) {
      const session = ctx.sessions.get(args.session_id);
      const m = session.mission;

      if (args.start_time != null) m.start_time = args.start_time;

      if (args.year != null || args.month != null || args.day != null) {
        if (!m.date) m.date = { Year: 2024, Month: 6, Day: 15 };
        if (args.year != null) m.date.Year = args.year;
        if (args.month != null) m.date.Month = args.month;
        if (args.day != null) m.date.Day = args.day;
      }

      session.markDirty();
      return {
        start_time: m.start_time,
        date: m.date,
      };
    },
  },
];
