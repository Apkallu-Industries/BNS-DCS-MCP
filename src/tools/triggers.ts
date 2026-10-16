import { z } from 'zod';
import type { ToolDefinition, ToolContext } from './index.js';
import { asArray } from '../miz/MizSession.js';
import { appendNumericEntry } from './dcs_helpers.js';

function numericKeys(table: any): number[] {
  if (!table) return [];
  if (Array.isArray(table)) return table.map((_, i) => i + 1);
  return Object.keys(table).filter(k => /^\d+$/.test(k)).map(Number).sort((a, b) => a - b);
}

function getNumeric(table: any, index: number): any {
  if (!table) return undefined;
  return Array.isArray(table) ? table[index - 1] : table[String(index)];
}

function deleteTailEntry(table: any, index: number): void {
  if (!table) return;
  if (Array.isArray(table)) {
    if (index !== table.length) throw new Error('Refusing to shift trigger runtime indexes');
    table.pop();
    return;
  }
  delete table[String(index)];
}

export const triggerTools: ToolDefinition[] = [
  {
    name: 'list_triggers',
    description: 'List DCS Mission Editor trigger definitions from the top-level trigrules table.',
    inputSchema: z.object({
      session_id: z.string(),
    }),
    async handler(args, ctx: ToolContext) {
      const session = ctx.sessions.get(args.session_id);
      const rules = session.mission.trigrules;
      if (!rules) return { count: 0, triggers: [] };

      const triggers = asArray<any>(rules);
      return {
        count: triggers.length,
        triggers: triggers.map((t: any, i: number) => ({
          index: i + 1,
          comment: t.comment ?? '',
          event: t.predicate ?? t.eventlist ?? 'unknown',
          conditions: t.rules ?? [],
          actions: t.actions ?? [],
          has_runtime_condition: getNumeric(session.mission.trig?.conditions, i + 1) != null,
          has_runtime_action: getNumeric(session.mission.trig?.actions, i + 1) != null,
        })),
      };
    },
  },

  {
    name: 'add_trigger',
    description:
      'Add a safe mission-start trigger. DCS stores editor definitions in top-level trigrules and runtime code in trig; ' +
      'this tool updates both. Once/continuous trigger compilation is intentionally rejected until a dedicated DCS trigger compiler is implemented.',
    inputSchema: z.object({
      session_id: z.string(),
      trigger_type: z.enum(['once', 'continuous', 'start']),
      comment: z.string().default(''),
      conditions: z.array(z.record(z.any())).optional().describe('Mission Editor trigrules condition objects'),
      actions: z.array(z.record(z.any())).optional().describe('Mission Editor trigrules action objects'),
      runtime_condition: z.string().default('return(true)').describe('Lua body stored in mission.trig.conditions'),
      runtime_action: z.string().describe('Lua body stored in mission.trig.actions'),
    }),
    async handler(args, ctx: ToolContext) {
      if (args.trigger_type !== 'start') {
        throw new Error(
          'Safe MCP compilation currently supports trigger_type="start" only. Once/continuous triggers require the DCS trigger compiler; refusing to emit a half-valid trigger.'
        );
      }

      const session = ctx.sessions.get(args.session_id);
      const m = session.mission;
      if (!m.trigrules) m.trigrules = {};
      if (!m.trig) m.trig = {};
      for (const key of ['actions', 'conditions', 'flag', 'funcStartup', 'func', 'events', 'custom', 'customStartup']) {
        if (!m.trig[key]) m.trig[key] = {};
      }

      const existing = numericKeys(m.trigrules);
      const nextIndex = existing.length ? Math.max(...existing) + 1 : 1;

      const trigger = {
        rules: args.conditions ?? [],
        eventlist: '',
        comment: args.comment,
        predicate: 'triggerStart',
        actions: args.actions ?? [],
        colorItem: '0x00ffffff',
      };

      appendNumericEntry(m.trigrules as any, trigger);
      if (Array.isArray(m.trig.conditions)) m.trig.conditions.push(args.runtime_condition);
      else m.trig.conditions[String(nextIndex)] = args.runtime_condition;
      if (Array.isArray(m.trig.actions)) m.trig.actions.push(args.runtime_action);
      else m.trig.actions[String(nextIndex)] = args.runtime_action;
      if (Array.isArray(m.trig.flag)) m.trig.flag.push(true);
      else m.trig.flag[String(nextIndex)] = true;

      const startup = `if mission.trig.conditions[${nextIndex}]() then mission.trig.actions[${nextIndex}]() end`;
      if (Array.isArray(m.trig.funcStartup)) m.trig.funcStartup.push(startup);
      else m.trig.funcStartup[String(nextIndex)] = startup;

      session.markDirty();
      return { added: true, trigger_index: nextIndex, trigger_type: 'start', runtime_synced: true };
    },
  },

  {
    name: 'delete_trigger',
    description:
      'Delete the final trigger and its matching runtime entries. Non-tail deletion is refused because shifting indexes can corrupt existing DCS trigger runtime references.',
    inputSchema: z.object({
      session_id: z.string(),
      trigger_index: z.number().int().positive(),
    }),
    async handler(args, ctx: ToolContext) {
      const session = ctx.sessions.get(args.session_id);
      const m = session.mission;
      const rules = m.trigrules;
      if (!rules) throw new Error('No trigrules in this mission');

      const keys = numericKeys(rules);
      if (!keys.includes(args.trigger_index)) {
        throw new Error(`No trigger at index ${args.trigger_index}`);
      }
      const max = Math.max(...keys);
      if (args.trigger_index !== max) {
        throw new Error(
          `Refusing to delete trigger ${args.trigger_index}: it is not the final trigger (${max}). DCS trigger runtime tables are index-coupled; delete from the tail or use raw tools with explicit reindexing.`
        );
      }

      deleteTailEntry(rules, args.trigger_index);
      deleteTailEntry(m.trig?.conditions, args.trigger_index);
      deleteTailEntry(m.trig?.actions, args.trigger_index);
      deleteTailEntry(m.trig?.flag, args.trigger_index);
      deleteTailEntry(m.trig?.funcStartup, args.trigger_index);
      deleteTailEntry(m.trig?.func, args.trigger_index);

      session.markDirty();
      return { deleted: true, trigger_index: args.trigger_index, runtime_synced: true };
    },
  },
];
