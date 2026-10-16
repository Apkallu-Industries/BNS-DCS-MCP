import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { z } from 'zod';
import type { ToolDefinition } from './index.js';

export type DcsExportVariant = 'stable' | 'openbeta';
export interface DcsExportSnapshot {
  schema_version: 1;
  sampled_at_utc: string;
  model_time_seconds: number | null;
  seat_number: number | null;
  model_time_acceleration: number | null;
  multiplayer: boolean | null;
  track_replay: boolean | null;
  flight_model_master: boolean | null;
}
const SNAPSHOT_NAME = 'BlacknetExportTelemetry.json';
const MAX_AGE_SECONDS = 10;

export function resolveDcsExportPath(variant: DcsExportVariant): string {
  const override = process.env.DCS_EXPORT_STATUS_PATH;
  if (override) return path.resolve(override);
  const dcsFolder = variant === 'openbeta' ? 'DCS.openbeta' : 'DCS';
  return path.join(os.homedir(), 'Saved Games', dcsFolder, 'Logs', SNAPSHOT_NAME);
}
const nullableNumber = (v: unknown): v is number | null => v === null || (typeof v === 'number' && Number.isFinite(v));
const nullableBoolean = (v: unknown): v is boolean | null => v === null || typeof v === 'boolean';

export async function readDcsExportSnapshot(filePath: string, now = Date.now()) {
  let stat: Awaited<ReturnType<typeof fs.stat>>;
  let raw: string;
  try { [stat, raw] = await Promise.all([fs.stat(filePath), fs.readFile(filePath, 'utf8')]); }
  catch (error: any) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') {
      return { status: 'not_configured' as const, installed: false, file: filePath,
        instructions: 'Install the optional Blacknet Export.lua bridge in Saved Games\\DCS\\Scripts and load it from Export.lua.' };
    }
    throw error;
  }
  let value: any;
  try { value = JSON.parse(raw); }
  catch { return { status: 'invalid' as const, installed: true, file: filePath, error: 'Snapshot is not valid JSON.' }; }
  const valid = value?.schema_version === 1 &&
    typeof value.sampled_at_utc === 'string' && Number.isFinite(Date.parse(value.sampled_at_utc)) &&
    nullableNumber(value.model_time_seconds) &&
    (value.seat_number === null || (Number.isInteger(value.seat_number) && value.seat_number >= 0)) &&
    nullableNumber(value.model_time_acceleration) && nullableBoolean(value.multiplayer) &&
    nullableBoolean(value.track_replay) && nullableBoolean(value.flight_model_master);
  if (!valid) return { status: 'invalid' as const, installed: true, file: filePath,
    error: 'Snapshot does not match the supported Export API schema (v1).' };
  const ageSeconds = Math.max(0, (now - stat.mtimeMs) / 1000);
  return { status: ageSeconds <= MAX_AGE_SECONDS ? 'live' as const : 'stale' as const,
    installed: true, file: filePath, age_seconds: Math.round(ageSeconds * 10) / 10,
    snapshot: value as DcsExportSnapshot };
}

export const dcsExportTools: ToolDefinition[] = [{
  name: 'get_dcs_export_status',
  description: 'Read the latest local DCS Export.lua snapshot: multicrew seat, time acceleration, multiplayer/track state, and whether this client owns the aircraft flight model. Requires the optional Blacknet Export bridge. Seat and flight-model ownership may be null if ownship export is disabled. Read-only.',
  inputSchema: z.object({ variant: z.enum(['stable', 'openbeta']).default('stable') }),
  async handler(args: { variant: DcsExportVariant }) {
    return readDcsExportSnapshot(resolveDcsExportPath(args.variant));
  },
}];
