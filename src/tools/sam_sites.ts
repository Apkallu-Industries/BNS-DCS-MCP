import { z } from 'zod';
import type { ToolDefinition, ToolContext } from './index.js';
import { appendNumericEntry, requireCountry } from './dcs_helpers.js';

interface SamTemplate {
  description: string;
  introductionYear: number;
  units: Array<{ type: string; role: string; dx: number; dy: number }>;
}

const SAM_TEMPLATES: Record<string, SamTemplate> = {
  sa2: {
    description: 'SA-2 Guideline (S-75) — Cold War-era medium/high-altitude SAM',
    introductionYear: 1957,
    units: [
      { type: 'S_75M_Volhov', role: 'SR', dx: 0, dy: 0 },
      { type: 'SNR_75V', role: 'TR', dx: 0, dy: 50 },
      { type: 'S_75M_Volhov', role: 'LN', dx: 80, dy: -40 },
      { type: 'S_75M_Volhov', role: 'LN', dx: 80, dy: 40 },
      { type: 'S_75M_Volhov', role: 'LN', dx: -80, dy: -40 },
      { type: 'S_75M_Volhov', role: 'LN', dx: -80, dy: 40 },
      { type: 'S_75M_Volhov', role: 'LN', dx: 0, dy: -80 },
      { type: 'S_75M_Volhov', role: 'LN', dx: 0, dy: 80 },
    ],
  },
  sa3: {
    description: 'SA-3 Goa (S-125) — Low/medium-altitude SAM',
    introductionYear: 1961,
    units: [
      { type: 'snr s-125 tr', role: 'TR', dx: 0, dy: 0 },
      { type: '5p73 s-125 ln', role: 'LN', dx: 80, dy: -40 },
      { type: '5p73 s-125 ln', role: 'LN', dx: 80, dy: 40 },
      { type: '5p73 s-125 ln', role: 'LN', dx: -80, dy: -40 },
      { type: '5p73 s-125 ln', role: 'LN', dx: -80, dy: 40 },
      { type: 'p-19 s-125 sr', role: 'SR', dx: -100, dy: 0 },
    ],
  },
  sa6: {
    description: 'SA-6 Gainful (2K12 Kub) — Mobile medium-range SAM',
    introductionYear: 1967,
    units: [
      { type: 'Kub 1S91 str', role: 'STR', dx: 0, dy: 0 },
      { type: 'Kub 2P25 ln', role: 'LN', dx: 60, dy: -40 },
      { type: 'Kub 2P25 ln', role: 'LN', dx: 60, dy: 40 },
      { type: 'Kub 2P25 ln', role: 'LN', dx: -60, dy: 0 },
      { type: 'p-19 s-125 sr', role: 'SR', dx: -100, dy: 0 },
    ],
  },
  sa10: {
    description: 'SA-10 Grumble (S-300PS) — Long-range strategic SAM',
    introductionYear: 1978,
    units: [
      { type: 'S-300PS 40B6M tr', role: 'TR', dx: 0, dy: 0 },
      { type: 'S-300PS 40B6MD sr', role: 'SR', dx: -80, dy: 0 },
      { type: 'S-300PS 5P85C ln', role: 'LN', dx: 80, dy: -60 },
      { type: 'S-300PS 5P85C ln', role: 'LN', dx: 80, dy: 60 },
      { type: 'S-300PS 5P85D ln', role: 'LN', dx: -80, dy: -60 },
      { type: 'S-300PS 5P85D ln', role: 'LN', dx: -80, dy: 60 },
      { type: 'S-300PS 54K6 cp', role: 'CP', dx: -150, dy: 0 },
    ],
  },
  sa11: {
    description: 'SA-11 Gadfly (Buk) — Mobile medium-range SAM',
    introductionYear: 1979,
    units: [
      { type: 'SA-11 Buk SR 9S18M1', role: 'SR', dx: 0, dy: 0 },
      { type: 'SA-11 Buk CC 9S470M1', role: 'CC', dx: -80, dy: 0 },
      { type: 'SA-11 Buk LN 9A310M1', role: 'LN', dx: 80, dy: -50 },
      { type: 'SA-11 Buk LN 9A310M1', role: 'LN', dx: 80, dy: 50 },
      { type: 'SA-11 Buk LN 9A310M1', role: 'LN', dx: -80, dy: -50 },
      { type: 'SA-11 Buk LN 9A310M1', role: 'LN', dx: -80, dy: 50 },
    ],
  },
  patriot: {
    description: 'MIM-104 Patriot — US long-range SAM',
    introductionYear: 1984,
    units: [
      { type: 'Patriot str', role: 'STR', dx: 0, dy: 0 },
      { type: 'Patriot ln', role: 'LN', dx: 80, dy: -50 },
      { type: 'Patriot ln', role: 'LN', dx: 80, dy: 50 },
      { type: 'Patriot ln', role: 'LN', dx: -80, dy: -50 },
      { type: 'Patriot ln', role: 'LN', dx: -80, dy: 50 },
      { type: 'Patriot cp', role: 'CP', dx: -120, dy: 0 },
      { type: 'Patriot ECS', role: 'ECS', dx: -120, dy: 40 },
      { type: 'Patriot EPP', role: 'EPP', dx: -120, dy: -40 },
    ],
  },
  hawk: {
    description: 'MIM-23 HAWK — US medium-range SAM',
    introductionYear: 1960,
    units: [
      { type: 'Hawk sr', role: 'SR', dx: 0, dy: 0 },
      { type: 'Hawk tr', role: 'TR', dx: 40, dy: 0 },
      { type: 'Hawk ln', role: 'LN', dx: 80, dy: -40 },
      { type: 'Hawk ln', role: 'LN', dx: 80, dy: 40 },
      { type: 'Hawk ln', role: 'LN', dx: -80, dy: 0 },
      { type: 'Hawk pcp', role: 'PCP', dx: -120, dy: 0 },
    ],
  },
  nasams: {
    description: 'NASAMS — Norwegian/US medium-range SAM',
    introductionYear: 2002,
    units: [
      { type: 'NASAMS_Radar_MPQ64F1', role: 'SR', dx: 0, dy: 0 },
      { type: 'NASAMS_LN_C', role: 'LN', dx: 80, dy: -40 },
      { type: 'NASAMS_LN_C', role: 'LN', dx: 80, dy: 40 },
      { type: 'NASAMS_LN_B', role: 'LN', dx: -80, dy: -40 },
      { type: 'NASAMS_LN_B', role: 'LN', dx: -80, dy: 40 },
      { type: 'NASAMS_Command_Post', role: 'CP', dx: -120, dy: 0 },
    ],
  },
  rapier: {
    description: 'Rapier — British short-range SAM',
    introductionYear: 1971,
    units: [
      { type: 'rapier_fsa_blindfire_radar', role: 'TR', dx: 0, dy: 0 },
      { type: 'rapier_fsa_launcher', role: 'LN', dx: 40, dy: -30 },
      { type: 'rapier_fsa_launcher', role: 'LN', dx: 40, dy: 30 },
      { type: 'rapier_fsa_optical_tracker_unit', role: 'OT', dx: -40, dy: 0 },
    ],
  },
};

function createSamSiteTool(key: string, template: SamTemplate): ToolDefinition {
  const toolName = `create_${key}_site`;
  return {
    name: toolName,
    description: `Create a ${template.description} site. Places all required units in proper formation.`,
    inputSchema: z.object({
      session_id: z.string(),
      coalition: z.enum(['blue', 'red', 'neutral']),
      country: z.string(),
      name: z.string().describe('Unique site name'),
      x: z.number().describe('Center position X'),
      y: z.number().describe('Center position Y'),
      heading: z.number().default(0).describe('Site orientation in degrees'),
      skill: z.string().default('High'),
      hidden: z.boolean().optional(),
      late_activation: z.boolean().optional(),
    }),
    async handler(args: any, ctx: ToolContext) {
      const session = ctx.sessions.get(args.session_id);
      const constraints = session.historicalConstraints;
      if (constraints?.enabled && template.introductionYear > constraints.year) {
        throw new Error(
          `HISTORICAL CONSTRAINT VIOLATION: ${template.description} (introduced ${template.introductionYear}) ` +
          `cannot appear in a ${constraints.year} mission. Postdates the scenario by ` +
          `${template.introductionYear - constraints.year} years.`
        );
      }
      const m = session.mission;

      const countryData: any = requireCountry(m, args.coalition, args.country);
      if (!(countryData as any).vehicle) (countryData as any).vehicle = { group: [] };
      const groupArr = (countryData as any).vehicle.group;

      const groupId = session.getNextGroupId();
      let unitIdBase = session.getNextUnitId();

      const hdgRad = (args.heading * Math.PI) / 180;
      const cosH = Math.cos(hdgRad);
      const sinH = Math.sin(hdgRad);

      const units = template.units.map((tmpl, i) => {
        const rx = tmpl.dx * cosH - tmpl.dy * sinH;
        const ry = tmpl.dx * sinH + tmpl.dy * cosH;
        return {
          unitId: unitIdBase + i,
          name: `${args.name} ${tmpl.role} ${i + 1}`,
          type: tmpl.type,
          skill: args.skill,
          x: args.x + rx,
          y: args.y + ry,
          heading: hdgRad,
          playerCanDrive: false,
        };
      });

      const group = {
        groupId,
        name: args.name,
        hidden: args.hidden ?? false,
        lateActivation: args.late_activation ?? false,
        start_time: 0,
        task: 'Ground Nothing',
        uncontrolled: false,
        x: args.x,
        y: args.y,
        units,
        route: {
          routeRelativeTOT: true,
          points: [{
            name: '',
            type: 'Turning Point',
            action: 'Off Road',
            x: args.x,
            y: args.y,
            alt: 0,
            alt_type: 'BARO',
            speed: 0,
            task: { id: 'ComboTask', params: { tasks: {} } },
          }],
        },
      };

      appendNumericEntry(groupArr, group);

      session.markDirty();

      return {
        group_id: groupId,
        name: args.name,
        sam_type: key.toUpperCase(),
        unit_count: units.length,
        unit_ids: units.map(u => u.unitId),
        position: { x: args.x, y: args.y },
      };
    },
  };
}

export const samSiteTools: ToolDefinition[] = Object.entries(SAM_TEMPLATES).map(
  ([key, tmpl]) => createSamSiteTool(key, tmpl)
);
