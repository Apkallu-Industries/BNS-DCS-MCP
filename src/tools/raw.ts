import { z } from 'zod';
import type { ToolDefinition, ToolContext } from './index.js';

export const rawTools: ToolDefinition[] = [
  {
    name: 'get_raw_lua',
    description:
      'Read an arbitrary value from the mission dict by dotted path. ' +
      'Example paths: "coalition.blue.country[1]", "weather.clouds.density", ' +
      '"forcedOptions". Returns the raw value (dict/list/scalar).',
    inputSchema: z.object({
      session_id: z.string(),
      path: z.string().describe('Dotted path into the mission data'),
    }),
    async handler(args, ctx: ToolContext) {
      const session = ctx.sessions.get(args.session_id);
      const value = session.getRawValue(args.path);
      return { path: args.path, value };
    },
  },

  {
    name: 'set_raw_lua',
    description:
      'Write a value to the mission dict at the given dotted path. ' +
      'Values are JSON-typed: numbers as numbers, booleans as booleans, null as null.',
    inputSchema: z.object({
      session_id: z.string(),
      path: z.string().describe('Dotted path into the mission data'),
      value: z.any().describe('The value to set'),
    }),
    async handler(args, ctx: ToolContext) {
      const session = ctx.sessions.get(args.session_id);
      session.setRawValue(args.path, args.value);
      const readBack = session.getRawValue(args.path);
      return { path: args.path, written: true, value: readBack };
    },
  },

  {
    name: 'list_zip_entries',
    description: 'List all files inside the .miz archive.',
    inputSchema: z.object({
      session_id: z.string(),
    }),
    async handler(args, ctx: ToolContext) {
      const session = ctx.sessions.get(args.session_id);
      const entries = session.listZipEntries();
      return { count: entries.length, entries };
    },
  },

  {
    name: 'get_zip_entry',
    description: 'Read a text file from inside the .miz archive by its entry path.',
    inputSchema: z.object({
      session_id: z.string(),
      entry_path: z.string().describe('Path inside the .miz (e.g. "l10n/DEFAULT/dictionary")'),
    }),
    async handler(args, ctx: ToolContext) {
      const session = ctx.sessions.get(args.session_id);
      const content = await session.getZipEntry(args.entry_path);
      if (content === null) throw new Error(`No entry "${args.entry_path}" in this .miz`);
      return { entry_path: args.entry_path, content };
    },
  },

  {
    name: 'set_zip_entry',
    description: 'Write a text file into the .miz archive at the given entry path.',
    inputSchema: z.object({
      session_id: z.string(),
      entry_path: z.string(),
      content: z.string(),
    }),
    async handler(args, ctx: ToolContext) {
      const session = ctx.sessions.get(args.session_id);
      session.setZipEntry(args.entry_path, args.content);
      return { written: true, entry_path: args.entry_path };
    },
  },
];
