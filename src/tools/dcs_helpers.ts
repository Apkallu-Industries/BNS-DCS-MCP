import type { DcsMission } from '../types/dcs.js';
import { asArray } from '../miz/MizSession.js';

export type CoalitionName = 'blue' | 'red' | 'neutral';

export function coalitionKey(coalition: CoalitionName): 'blue' | 'red' | 'neutrals' {
  return coalition === 'neutral' ? 'neutrals' : coalition;
}

export function appendNumericEntry<T>(table: T[] | Record<string, T>, value: T): number {
  if (Array.isArray(table)) {
    table.push(value);
    return table.length;
  }
  const keys = Object.keys(table).filter(k => /^\d+$/.test(k)).map(Number);
  const next = keys.length ? Math.max(...keys) + 1 : 1;
  table[String(next)] = value;
  return next;
}

export function removeNumericEntry<T>(
  table: T[] | Record<string, T>,
  predicate: (value: T) => boolean
): T | null {
  if (Array.isArray(table)) {
    const idx = table.findIndex(predicate);
    if (idx < 0) return null;
    return table.splice(idx, 1)[0] ?? null;
  }

  const keys = Object.keys(table)
    .filter(k => /^\d+$/.test(k))
    .sort((a, b) => Number(a) - Number(b));
  const values = keys.map(k => table[k]);
  const idx = values.findIndex(predicate);
  if (idx < 0) return null;
  const [removed] = values.splice(idx, 1);

  for (const key of keys) delete table[key];
  values.forEach((value, i) => {
    table[String(i + 1)] = value;
  });
  return removed ?? null;
}

export function ensureCoalition(mission: DcsMission, coalition: CoalitionName): any {
  if (!mission.coalition) mission.coalition = {};
  const key = coalitionKey(coalition);
  let data = (mission.coalition as any)[key];
  if (!data) {
    data = {
      name: key,
      bullseye: { x: 0, y: 0 },
      nav_points: {},
      country: [],
    };
    (mission.coalition as any)[key] = data;
  }
  if (!data.name) data.name = key;
  if (!data.bullseye) data.bullseye = { x: 0, y: 0 };
  if (!data.nav_points) data.nav_points = {};
  if (!data.country) data.country = [];
  return data;
}

export function findCountry(mission: DcsMission, coalition: CoalitionName, countryName: string): any | null {
  const data = ensureCoalition(mission, coalition);
  return asArray<any>(data.country).find(
    c => c?.name?.toLowerCase() === countryName.toLowerCase()
  ) ?? null;
}

export function requireCountry(mission: DcsMission, coalition: CoalitionName, countryName: string): any {
  const found = findCountry(mission, coalition, countryName);
  if (!found) {
    throw new Error(
      `Country "${countryName}" is not present in ${coalition}. Call set_country_coalition with country_name "${countryName}" first (country_id is resolved from the DCS country catalogue; see country_lookup). MCP will not invent country IDs.`
    );
  }
  return found;
}

export function syncCoalitionsRoster(mission: DcsMission): void {
  const roster: Record<string, number[]> = {
    blue: [],
    red: [],
    neutrals: [],
  };

  for (const key of ['blue', 'red', 'neutrals'] as const) {
    const coal = (mission.coalition as any)?.[key];
    if (!coal?.country) continue;
    roster[key] = asArray<any>(coal.country)
      .map(c => Number(c?.id))
      .filter(id => Number.isFinite(id));
  }

  (mission as any).coalitions = roster;
}
