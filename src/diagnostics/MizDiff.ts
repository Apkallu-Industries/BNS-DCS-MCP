import * as crypto from 'node:crypto';
import { asArray, type MizSession } from '../miz/MizSession.js';

/**
 * Structural comparison of two open .miz sessions: groups (matched by coalition, category and
 * name), zones, trigger rules, weather, mission metadata and embedded files. Positions compare
 * with a metre tolerance; DCS runtime ids (groupId/unitId) are ignored by default because the
 * Mission Editor renumbers them freely.
 */

export interface DiffOptions {
  positionToleranceM?: number;
  ignoreIds?: boolean;
  maxChangesPerItem?: number;
}

export interface FieldChange { path: string; a: unknown; b: unknown }

const POSITION_KEYS = new Set(['x', 'y', 'alt', 'altitude']);
const ID_KEYS = new Set(['groupId', 'unitId']);

function flatten(value: unknown, prefix: string, out: Map<string, unknown>, ignoreIds: boolean): void {
  if (value && typeof value === 'object') {
    const entries = Array.isArray(value) ? value.map((v, i) => [String(i + 1), v] as const) : Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) out.set(prefix, Array.isArray(value) ? '[]' : '{}');
    for (const [k, v] of entries) {
      if (ignoreIds && ID_KEYS.has(k)) continue;
      flatten(v, prefix ? `${prefix}.${k}` : k, out, ignoreIds);
    }
    return;
  }
  out.set(prefix, value);
}

export function diffValues(a: unknown, b: unknown, options: DiffOptions = {}): FieldChange[] {
  const tol = options.positionToleranceM ?? 1;
  const ignoreIds = options.ignoreIds ?? true;
  const fa = new Map<string, unknown>();
  const fb = new Map<string, unknown>();
  flatten(a, '', fa, ignoreIds);
  flatten(b, '', fb, ignoreIds);
  const changes: FieldChange[] = [];
  for (const path of new Set([...fa.keys(), ...fb.keys()])) {
    const va = fa.get(path);
    const vb = fb.get(path);
    if (va === vb) continue;
    const leaf = path.split('.').pop() ?? '';
    if (typeof va === 'number' && typeof vb === 'number' && POSITION_KEYS.has(leaf) && Math.abs(va - vb) <= tol) continue;
    changes.push({ path, a: va, b: vb });
  }
  return changes.sort((x, y) => x.path.localeCompare(y.path, undefined, { numeric: true }));
}

function capped<T>(items: T[], max: number) {
  return items.length > max ? { items: items.slice(0, max), truncated: items.length - max } : { items, truncated: 0 };
}

function keyedDiff<T>(a: Map<string, T>, b: Map<string, T>, describe: (v: T) => unknown, options: DiffOptions) {
  const max = options.maxChangesPerItem ?? 25;
  const added = [...b.keys()].filter(k => !a.has(k)).map(k => ({ key: k, ...(describe(b.get(k)!) as object) }));
  const removed = [...a.keys()].filter(k => !b.has(k)).map(k => ({ key: k, ...(describe(a.get(k)!) as object) }));
  const changed = [];
  for (const [k, va] of a) {
    if (!b.has(k)) continue;
    const changes = diffValues(va, b.get(k), options);
    if (changes.length) {
      const { items, truncated } = capped(changes, max);
      changed.push({ key: k, changes: items, ...(truncated ? { moreChanges: truncated } : {}) });
    }
  }
  return { added, removed, changed };
}

function groupsOf(session: MizSession) {
  const map = new Map<string, any>();
  for (const { coalition, country, category, group } of session.iterGroups()) {
    map.set(`${coalition}/${category}/${group.name}`, { ...group, __country: country });
  }
  return map;
}

function zonesOf(session: MizSession) {
  const map = new Map<string, any>();
  for (const zone of asArray<any>((session.mission as any).triggers?.zones)) {
    if (zone?.name) map.set(String(zone.name), zone);
  }
  return map;
}

function triggersOf(session: MizSession) {
  const map = new Map<string, any>();
  asArray<any>((session.mission as any).trigrules).forEach((rule, i) => {
    const base = String(rule?.comment || `rule#${i + 1}`);
    let key = base;
    for (let n = 2; map.has(key); n++) key = `${base} (${n})`;
    map.set(key, rule);
  });
  return map;
}

async function filesOf(session: MizSession) {
  const map = new Map<string, { sha256: string; bytes: number }>();
  for (const path of session.listZipEntries()) {
    if (path.endsWith('/')) continue;
    const buf = await session.getZipEntryBinary(path);
    if (!buf) continue;
    map.set(path, { sha256: crypto.createHash('sha256').update(buf).digest('hex'), bytes: buf.length });
  }
  return map;
}

const describeGroup = (g: any) => ({
  country: g.__country,
  units: asArray<any>(g.units).length,
  types: [...new Set(asArray<any>(g.units).map(u => u?.type))],
  skills: [...new Set(asArray<any>(g.units).map(u => u?.skill))],
});

export async function diffMissions(a: MizSession, b: MizSession, options: DiffOptions = {}) {
  const ma: any = a.mission;
  const mb: any = b.mission;
  const meta = diffValues(
    { theatre: ma.theatre, date: ma.date, start_time: ma.start_time, sortie: ma.sortie, requiredModules: ma.requiredModules },
    { theatre: mb.theatre, date: mb.date, start_time: mb.start_time, sortie: mb.sortie, requiredModules: mb.requiredModules },
    options,
  );
  const weather = diffValues(ma.weather, mb.weather, options);
  const groups = keyedDiff(groupsOf(a), groupsOf(b), describeGroup, options);
  const zones = keyedDiff(zonesOf(a), zonesOf(b), (z: any) => ({ x: z.x, y: z.y, radius: z.radius, type: z.type }), options);
  const triggers = keyedDiff(triggersOf(a), triggersOf(b), (r: any) => ({ actions: asArray<any>(r?.actions).length }), options);

  const fa = await filesOf(a);
  const fb = await filesOf(b);
  const files = {
    added: [...fb.keys()].filter(k => !fa.has(k)).map(k => ({ path: k, bytes: fb.get(k)!.bytes })),
    removed: [...fa.keys()].filter(k => !fb.has(k)).map(k => ({ path: k, bytes: fa.get(k)!.bytes })),
    changed: [...fa.keys()].filter(k => fb.has(k) && fa.get(k)!.sha256 !== fb.get(k)!.sha256)
      .map(k => ({ path: k, bytesA: fa.get(k)!.bytes, bytesB: fb.get(k)!.bytes })),
  };

  const count = (d: { added: unknown[]; removed: unknown[]; changed: unknown[] }) => ({ added: d.added.length, removed: d.removed.length, changed: d.changed.length });
  return {
    a: { sessionId: a.sessionId, file: a.filePath || null },
    b: { sessionId: b.sessionId, file: b.filePath || null },
    identical: !meta.length && !weather.length && [groups, zones, triggers, files].every(d => !d.added.length && !d.removed.length && !d.changed.length),
    summary: { meta: meta.length, weather: weather.length, groups: count(groups), zones: count(zones), triggers: count(triggers), files: count(files) },
    meta,
    weather: capped(weather, options.maxChangesPerItem ?? 25),
    groups,
    zones,
    triggers,
    files,
    notes: [
      'Groups match on coalition/category/name, zones on name, trigger rules on their comment (duplicates numbered). A rename shows as removed + added.',
      `Position fields (x, y, alt) within ${options.positionToleranceM ?? 1} m are treated as equal${(options.ignoreIds ?? true) ? '; groupId/unitId are ignored' : ''}.`,
      'mission/warehouses/options/dictionary are compared through their parsed tables; other archive entries by SHA-256 (files.changed includes the mission file itself when anything above changed).',
    ],
  };
}
