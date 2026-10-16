/**
 * Platform-independent mission integrity checks ported from tools/validate_mission_integrity.ts.
 *
 * That script needs Windows (PowerShell extraction) and DCS's own Lua engine; these checks run on
 * the parsed mission held by an MCP MizSession instead. Only checks the existing `validate` and
 * `validate_release_readiness` tools do not already cover are included. Theatre-specific
 * heuristics (hardcoded Persian Gulf water/runway boxes) and the `:getUnit(` lint (Group:getUnit(n)
 * is valid DCS API) are intentionally not ported.
 */

import { asArray } from '../miz/MizSession.js';

export type Severity = 'error' | 'warning';

export interface IntegrityFinding {
  severity: Severity;
  code: string;
  message: string;
  [context: string]: unknown;
}

export interface IntegrityResult {
  pass: boolean;
  errorCount: number;
  warningCount: number;
  findings: IntegrityFinding[];
  stats: Record<string, number>;
}

export interface GroupEntry {
  coalition: string;
  country: string;
  category: string;
  group: any;
}

function result(findings: IntegrityFinding[], stats: Record<string, number>): IntegrityResult {
  const errorCount = findings.filter(f => f.severity === 'error').length;
  return { pass: errorCount === 0, errorCount, warningCount: findings.length - errorCount, findings, stats };
}

const isHuman = (unit: any) => unit?.skill === 'Client' || unit?.skill === 'Player';

// ── Spawn conflicts ────────────────────────────────────────────────────────────

/** Two aircraft within this horizontal distance and altitude band at mission start will collide. */
export const SPAWN_PROXIMITY_METERS = 15;
export const SPAWN_ALTITUDE_BAND_METERS = 20;

export function checkSpawnConflicts(groups: GroupEntry[]): IntegrityResult {
  const findings: IntegrityFinding[] = [];
  const slots = new Map<string, { unit: string; group: string }>();
  const air: Array<{ unit: string; group: string; x: number; y: number; alt: number }> = [];
  let parkingStarts = 0;

  for (const { category, group } of groups) {
    if (category !== 'plane' && category !== 'helicopter') continue;
    const wp0 = asArray<any>(group.route?.points)[0] ?? {};
    const startType = String(wp0.type ?? '');
    const startAction = String(wp0.action ?? '');

    // Ship-linked "From Runway" is a carrier catapult start, not an airfield runway start.
    if ((startType === 'TakeOff' || startAction === 'From Runway') && wp0.linkUnit == null) {
      findings.push({
        severity: 'error', code: 'RUNWAY_START', group: group.name,
        message: `Flight "${group.name}" starts "From Runway"; project rule requires TakeOffParkingHot or TakeOffGroundHot to avoid runway spawn collisions.`,
      });
    }

    const airdrome = wp0.airdromeId ?? wp0.helipadId ?? null;
    const parkingStart = startType.startsWith('TakeOffParking');
    for (const unit of asArray<any>(group.units)) {
      const slot = unit.parking_id ?? unit.parking;
      if (parkingStart && airdrome != null && slot != null && slot !== '') {
        parkingStarts++;
        const key = `${airdrome}:${slot}`;
        const holder = slots.get(key);
        if (holder) {
          findings.push({
            severity: 'error', code: 'PARKING_SLOT_COLLISION', airdromeId: airdrome, parkingId: slot,
            units: [holder.unit, unit.name],
            message: `Airbase ${airdrome} slot ${slot} is assigned to both "${holder.unit}" (${holder.group}) and "${unit.name}" (${group.name}).`,
          });
        } else {
          slots.set(key, { unit: unit.name, group: group.name });
        }
      }
      // Proximity: AI aircraft present at mission start. Parking starts are covered by slot
      // uniqueness (carrier deck slots share coordinates) and human slots spawn on demand.
      if (!group.lateActivation && !parkingStart && !isHuman(unit) && Number.isFinite(unit.x) && Number.isFinite(unit.y)) {
        air.push({ unit: unit.name, group: group.name, x: unit.x, y: unit.y, alt: Number(unit.alt) || 0 });
      }
    }
  }

  // Spatial hash so large missions stay near-linear.
  const cell = (v: number) => Math.floor(v / SPAWN_PROXIMITY_METERS);
  const grid = new Map<string, number[]>();
  air.forEach((u, i) => {
    const k = `${cell(u.x)}:${cell(u.y)}`;
    grid.set(k, [...(grid.get(k) ?? []), i]);
  });
  air.forEach((a, i) => {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const j of grid.get(`${cell(a.x) + dx}:${cell(a.y) + dy}`) ?? []) {
          if (j <= i) continue;
          const b = air[j];
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          if (dist < SPAWN_PROXIMITY_METERS && Math.abs(a.alt - b.alt) < SPAWN_ALTITUDE_BAND_METERS) {
            findings.push({
              severity: 'error', code: 'SPAWN_PROXIMITY_COLLISION', units: [a.unit, b.unit], distanceMeters: Math.round(dist * 10) / 10,
              message: `"${a.unit}" (${a.group}) and "${b.unit}" (${b.group}) spawn ${dist.toFixed(1)} m apart at mission start.`,
            });
          }
        }
      }
    }
  });

  return result(findings, { parkingStarts, uniqueParkingSlots: slots.size, activeAircraftChecked: air.length });
}

// ── Script references ──────────────────────────────────────────────────────────

export type ScriptRefKind = 'group' | 'unit' | 'static' | 'zone';

const REFERENCE_PATTERNS: Array<{ kind: ScriptRefKind; api: string; re: RegExp }> = [
  { kind: 'group', api: 'Group.getByName', re: /Group\.getByName\(\s*["']([^"']+)["']\s*\)/g },
  { kind: 'group', api: 'GROUP:FindByName', re: /GROUP:FindByName\(\s*["']([^"']+)["']\s*\)/g },
  { kind: 'group', api: 'SPAWN:New', re: /SPAWN:New(?:WithAlias)?\(\s*["']([^"']+)["']/g },
  { kind: 'unit', api: 'Unit.getByName', re: /Unit\.getByName\(\s*["']([^"']+)["']\s*\)/g },
  { kind: 'unit', api: 'UNIT:FindByName', re: /UNIT:FindByName\(\s*["']([^"']+)["']\s*\)/g },
  { kind: 'static', api: 'StaticObject.getByName', re: /StaticObject\.getByName\(\s*["']([^"']+)["']\s*\)/g },
  { kind: 'zone', api: 'trigger.misc.getZone', re: /trigger\.misc\.getZone\(\s*["']([^"']+)["']\s*\)/g },
  { kind: 'zone', api: 'ZONE:New', re: /ZONE:New\(\s*["']([^"']+)["']\s*\)/g },
];

/** Framework files are excluded: their name strings are examples/docs, not mission references. */
export const FRAMEWORK_SCRIPT_PATTERN = /moose|mist/i;

export function checkScriptReferences(
  scripts: Array<{ path: string; text: string }>,
  names: Record<ScriptRefKind, Set<string>>,
  ignoreNames: Set<string> = new Set(),
): IntegrityResult {
  const findings: IntegrityFinding[] = [];
  let references = 0;
  let scanned = 0;
  for (const script of scripts) {
    if (FRAMEWORK_SCRIPT_PATTERN.test(script.path)) continue;
    scanned++;
    const lines = script.text.split(/\r?\n/);
    lines.forEach((line, idx) => {
      if (/^\s*--/.test(line)) return; // whole-line Lua comment
      for (const { kind, api, re } of REFERENCE_PATTERNS) {
        re.lastIndex = 0;
        for (const m of line.matchAll(re)) {
          references++;
          const name = m[1];
          if (names[kind].has(name) || ignoreNames.has(name)) continue;
          findings.push({
            severity: 'error', code: 'DEAD_SCRIPT_REFERENCE', kind, api, name, file: script.path, line: idx + 1,
            message: `${script.path}:${idx + 1} ${api}("${name}") names a ${kind} that does not exist in the mission (pass it in ignoreNames if it is spawned at runtime).`,
          });
        }
      }
    });
  }
  return result(findings, { scriptsScanned: scanned, references });
}

// ── Resource integrity ─────────────────────────────────────────────────────────

function collectStrings(value: unknown, out: Set<string>, depth = 0): void {
  if (depth > 64 || value == null) return;
  if (typeof value === 'string') out.add(value);
  else if (typeof value === 'object') for (const v of Object.values(value as object)) collectStrings(v, out, depth + 1);
}

const PICTURE_TABLES = ['pictureFileNameB', 'pictureFileNameR', 'pictureFileNameN', 'pictureFileNameServer'];

export function checkResourceIntegrity(
  mission: any,
  mapResource: Record<string, unknown>,
  dictionary: Record<string, unknown>,
  zipEntries: string[],
  isPackaged: boolean,
): IntegrityResult {
  const findings: IntegrityFinding[] = [];
  const strings = new Set<string>();
  collectStrings(mission, strings);
  const resKeys = [...strings].filter(s => /^ResKey_/.test(s));
  const dictKeys = [...strings].filter(s => /^DictKey_/.test(s));

  for (const key of resKeys) {
    if (!(key in mapResource)) {
      findings.push({ severity: 'error', code: 'ORPHANED_RESKEY', key, message: `Mission references ${key} but mapResource does not define it.` });
    }
  }
  for (const key of dictKeys) {
    if (!(key in dictionary)) {
      findings.push({ severity: 'warning', code: 'MISSING_DICTKEY', key, message: `Mission references ${key} but the dictionary does not define it (text will be blank).` });
    }
  }

  const entries = new Set(zipEntries);
  if (isPackaged) {
    for (const [key, file] of Object.entries(mapResource)) {
      if (typeof file !== 'string') continue;
      if (!entries.has(`l10n/DEFAULT/${file}`) && !entries.has(file)) {
        findings.push({ severity: 'error', code: 'MISSING_RESOURCE_FILE', key, file, message: `mapResource ${key} points to "${file}", which is not in the .miz.` });
      }
    }
  }

  for (const table of PICTURE_TABLES) {
    for (const entry of asArray<any>(mission?.[table])) {
      if (typeof entry !== 'string') continue;
      if (!entry.startsWith('ResKey_')) {
        findings.push({ severity: 'error', code: 'RAW_PICTURE_FILENAME', table, entry, message: `${table} holds raw filename "${entry}" instead of a ResKey (crashes me_autobriefing.lua).` });
      }
    }
  }

  for (const entry of zipEntries) {
    if (entry.includes('\\')) {
      findings.push({ severity: 'error', code: 'BACKSLASH_ZIP_ENTRY', entry, message: `.miz entry "${entry}" uses a backslash path separator; DCS requires forward slashes.` });
    }
  }

  return result(findings, {
    resKeysReferenced: resKeys.length,
    dictKeysReferenced: dictKeys.length,
    mapResourceEntries: Object.keys(mapResource).length,
    zipEntries: zipEntries.length,
  });
}

// ── Combat readiness ───────────────────────────────────────────────────────────

/** Combat airframes that must carry weapons when AI-flown (from the integrity script). */
export const COMBAT_AIRFRAMES = new Set([
  'F-16C_50', 'FA-18C_hornet', 'A-10C_2', 'A-10C', 'F-15C', 'F-22A', 'AH-64D_BLK_II', 'AH-64D',
  'Ka-50_3', 'Ka-50', 'MQ-9 Reaper', 'MiG-29A', 'MiG-29S', 'Su-25T', 'Su-25', 'Su-24M',
  'Mi-24P', 'Mi-8MT', 'SA342M', 'OH-58D',
]);

export function checkCombatReadiness(groups: GroupEntry[]): IntegrityResult {
  const findings: IntegrityFinding[] = [];
  let aiCombatUnits = 0;
  let navalGroups = 0;
  for (const { category, group } of groups) {
    if (category === 'ship') {
      navalGroups++;
      const lead = asArray<any>(group.units)[0];
      if (lead && (lead.frequency == null || group.frequency == null)) {
        findings.push({
          severity: 'error', code: 'NAVAL_RADIO_MISSING', group: group.name,
          message: `Naval group "${group.name}" is missing group or lead-unit radio frequency (MOOSE NAVYGROUP:New divides it and crashes).`,
        });
      }
      continue;
    }
    if (category !== 'plane' && category !== 'helicopter') continue;
    for (const unit of asArray<any>(group.units)) {
      // Human slots are armed by the player at spawn, so only AI flights are checked.
      if (!COMBAT_AIRFRAMES.has(unit.type) || isHuman(unit)) continue;
      aiCombatUnits++;
      const pylons = unit.payload?.pylons;
      if (!pylons || Object.keys(pylons).length === 0) {
        findings.push({ severity: 'error', code: 'UNARMED_AI_COMBAT_UNIT', group: group.name, unit: unit.name, type: unit.type, message: `AI ${unit.type} "${unit.name}" (${group.name}) has no weapons on its pylons.` });
      }
      if (!(Number(unit.payload?.ammo_type) >= 1)) {
        findings.push({ severity: 'warning', code: 'MISSING_CANNON_AMMO_TYPE', group: group.name, unit: unit.name, type: unit.type, message: `AI ${unit.type} "${unit.name}" (${group.name}) has no payload.ammo_type set.` });
      }
    }
  }
  return result(findings, { aiCombatUnits, navalGroups });
}

// ── Slots, routes and table indexing ───────────────────────────────────────────

const GROUP_CATEGORIES = ['plane', 'helicopter', 'vehicle', 'ship', 'static'] as const;

function indexGaps(table: unknown): number[] {
  if (!table || typeof table !== 'object' || Array.isArray(table)) return [];
  const keys = Object.keys(table).filter(k => /^\d+$/.test(k)).map(Number).sort((a, b) => a - b);
  return keys.filter((k, i) => k !== i + 1);
}

export function checkSlotAndRouteIntegrity(mission: any, groups: GroupEntry[]): IntegrityResult {
  const findings: IntegrityFinding[] = [];
  let playerSlots = 0;
  let clientSlots = 0;

  for (const { category, group } of groups) {
    for (const unit of asArray<any>(group.units)) {
      if (unit.skill === 'Player') playerSlots++;
      else if (unit.skill === 'Client') clientSlots++;
    }
    if (category === 'static') continue;
    const points = asArray<any>(group.route?.points);
    if (points.length > 1) {
      const first = points[0];
      const last = points[points.length - 1];
      if (!first?.ETA_locked && !last?.ETA_locked) {
        // Mission Editor route-verification message; not shown to block the simulator loading.
        findings.push({ severity: 'warning', code: 'ROUTE_NO_LOCKED_TIME', group: group.name, message: `Group "${group.name}" has no waypoint with a locked time (DCS: "Route has no waypoints with locked time!").` });
      }
      if (group.lateActivation && !first?.ETA_locked) {
        findings.push({ severity: 'warning', code: 'LATE_ACTIVATION_UNLOCKED_START', group: group.name, message: `Late-activated group "${group.name}" has no locked time on its first waypoint.` });
      }
    }
  }

  if (playerSlots === 0 && clientSlots === 0) {
    findings.push({ severity: 'error', code: 'NO_HUMAN_SLOTS', message: 'Mission has no Player or Client slots; nobody can fly it.' });
  } else if (playerSlots === 0) {
    findings.push({ severity: 'warning', code: 'NO_PLAYER_SLOT', message: `No "Player" slot (${clientSlots} Client slots): single-player mode cannot spawn the player.` });
  }

  const required = mission?.requiredModules && typeof mission.requiredModules === 'object' ? Object.values(mission.requiredModules) : [];
  if (required.length) {
    findings.push({ severity: 'warning', code: 'REQUIRED_MODULES', modules: required, message: `Mission requires ${required.length} module(s): ${required.join(', ')}. Players without them cannot load it.` });
  }

  // Raw (un-normalised) tables: DCS iterates these with ipairs, which stops at the first gap.
  for (const side of ['blue', 'red', 'neutrals']) {
    const countries = mission?.coalition?.[side]?.country;
    for (const gap of indexGaps(countries)) {
      findings.push({ severity: 'error', code: 'NON_CONTIGUOUS_INDEX', table: `coalition.${side}.country`, index: gap, message: `coalition.${side}.country index [${gap}] breaks the 1..n sequence; entries after it are skipped by ipairs.` });
    }
    for (const country of asArray<any>(countries)) {
      for (const cat of GROUP_CATEGORIES) {
        for (const gap of indexGaps(country?.[cat]?.group)) {
          findings.push({ severity: 'error', code: 'NON_CONTIGUOUS_INDEX', table: `${side}/${country?.name}/${cat}.group`, index: gap, message: `${side}/${country?.name} ${cat} group index [${gap}] breaks the 1..n sequence; groups after it are skipped by ipairs.` });
        }
      }
    }
  }

  return result(findings, { playerSlots, clientSlots, requiredModules: required.length });
}
