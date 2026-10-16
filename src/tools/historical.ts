import { z } from 'zod';
import type { ToolDefinition, ToolContext } from './index.js';
import { EraAssetValidator } from './era_validator.js';

export const historicalTools: ToolDefinition[] = [
  {
    name: 'set_historical_constraints',
    description:
      'Enable or disable historical era constraints on a mission session. ' +
      'When enabled, all subsequent create_flight, add_vehicle_group, add_ship_group, and add_static calls ' +
      'will reject DCS unit types that postdate the mission year. ' +
      'The mission year is read from the .miz date field. ' +
      'Optionally specify a warId to additionally restrict to that war\'s exact order of battle.',
    inputSchema: z.object({
      session_id: z.string(),
      enabled: z.boolean().describe('true to enforce historical constraints, false to disable'),
      war_id: z.string().optional().describe(
        'Optional: restrict to a specific war OOB (e.g. "WAR_FALKLANDS_1982", "WAR_DESERT_STORM_1991"). ' +
        'When set, only DCS types explicitly listed in that war\'s missions are allowed.'
      ),
    }),
    async handler(args: any, ctx: ToolContext) {
      const session = ctx.sessions.get(args.session_id);
      const constraints = session.setHistoricalConstraints(args.enabled, args.war_id);

      if (constraints.enabled) {
        const available = EraAssetValidator.listByEra(constraints.year, 'aircraft');
        return {
          status: 'HISTORICAL_CONSTRAINTS_ENABLED',
          year: constraints.year,
          theatre: constraints.theatre,
          war_id: constraints.warId ?? null,
          era_appropriate_aircraft_count: available.length,
          message:
            `Historical constraints active for ${constraints.theatre} (${constraints.year}). ` +
            `All asset insertions will be validated against era ${constraints.year}. ` +
            (constraints.warId
              ? `Strict OOB mode: only types from ${constraints.warId} are allowed.`
              : 'Any DCS type introduced on or before this year is allowed.'),
        };
      }

      return {
        status: 'HISTORICAL_CONSTRAINTS_DISABLED',
        message: 'Historical constraints disabled. All DCS types are allowed.',
      };
    },
  },

  {
    name: 'get_historical_constraints',
    description: 'Get the current historical constraint status for a mission session.',
    inputSchema: z.object({
      session_id: z.string(),
    }),
    async handler(args: any, ctx: ToolContext) {
      const session = ctx.sessions.get(args.session_id);
      const constraints = session.historicalConstraints;

      if (!constraints || !constraints.enabled) {
        return {
          enabled: false,
          message: 'No historical constraints active. All DCS types allowed.',
        };
      }

      return {
        enabled: true,
        year: constraints.year,
        theatre: constraints.theatre,
        war_id: constraints.warId ?? null,
      };
    },
  },

  {
    name: 'validate_asset_era',
    description:
      'Check whether a DCS unit type is historically appropriate for a given year, ' +
      'without needing an open session. Returns allowed/rejected with reason and suggestions.',
    inputSchema: z.object({
      dcs_type: z.string().describe('DCS type string (e.g. "F-16C_50", "SpitfireLFMkIX", "T-72B")'),
      year: z.number().describe('Mission year (e.g. 1944, 1982, 2026)'),
      category: z.enum(['aircraft', 'helicopter', 'vehicle', 'ship', 'static']).optional(),
    }),
    async handler(args: any) {
      return EraAssetValidator.validate(args.dcs_type, args.year, args.category);
    },
  },

  {
    name: 'list_era_assets',
    description:
      'List all known DCS types available for a given year and optional category. ' +
      'Use this to discover which assets are era-appropriate before building a historical mission.',
    inputSchema: z.object({
      year: z.number().describe('Maximum introduction year'),
      category: z.enum(['aircraft', 'helicopter', 'vehicle', 'ship']).optional(),
    }),
    async handler(args: any) {
      const assets = EraAssetValidator.listByEra(args.year, args.category);
      return {
        year: args.year,
        category: args.category ?? 'all',
        count: assets.length,
        assets: assets.map(a => ({
          dcsType: a.dcsType,
          name: a.name,
          introduced: a.year,
          category: a.category,
          nation: a.nation,
        })),
      };
    },
  },
];
