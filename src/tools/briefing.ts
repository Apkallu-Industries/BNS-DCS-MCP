import { z } from 'zod';
import type { ToolDefinition, ToolContext } from './index.js';

export const briefingTools: ToolDefinition[] = [
  {
    name: 'set_briefing',
    description:
      'Set the mission briefing text. Fields: situation (main description text), ' +
      'blue_task, red_task, neutral_task, sortie (mission title).',
    inputSchema: z.object({
      session_id: z.string(),
      sortie: z.string().optional().describe('Mission title / sortie name'),
      situation: z.string().optional().describe('Main briefing description text'),
      blue_task: z.string().optional(),
      red_task: z.string().optional(),
      neutral_task: z.string().optional(),
    }),
    async handler(args, ctx: ToolContext) {
      const session = ctx.sessions.get(args.session_id);
      const m = session.mission;

      if (args.sortie != null) m.sortie = args.sortie;
      if (args.situation != null) m.descriptionText = args.situation;
      if (args.blue_task != null) m.descriptionBlueTask = args.blue_task;
      if (args.red_task != null) m.descriptionRedTask = args.red_task;
      if (args.neutral_task != null) m.descriptionNeutralsTask = args.neutral_task;

      session.markDirty();
      return {
        sortie: m.sortie,
        situation: m.descriptionText,
        blue_task: m.descriptionBlueTask,
        red_task: m.descriptionRedTask,
      };
    },
  },

  {
    name: 'get_briefing',
    description: 'Get the current mission briefing text.',
    inputSchema: z.object({
      session_id: z.string(),
    }),
    async handler(args, ctx: ToolContext) {
      const session = ctx.sessions.get(args.session_id);
      const m = session.mission;
      return {
        sortie: m.sortie ?? '',
        situation: m.descriptionText ?? '',
        blue_task: m.descriptionBlueTask ?? '',
        red_task: m.descriptionRedTask ?? '',
        neutral_task: m.descriptionNeutralsTask ?? '',
      };
    },
  },
];
