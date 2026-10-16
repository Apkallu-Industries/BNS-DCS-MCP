import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import JSZip from 'jszip';
import { LuaParser } from './LuaParser.js';
import { LuaSerializer } from './LuaSerializer.js';
import type { DcsMission, CoalitionData, CountryData, GroupData, UnitData } from '../types/dcs.js';

export interface MizSessionInfo {
  sessionId: string;
  filePath: string;
  theatre: string;
  sortie: string;
  startTime: number;
  date: { year: number; month: number; day: number };
  coalitions: { blue: number; red: number; neutral: number };
  dirty: boolean;
}

interface ParsedMiz {
  mission: DcsMission;
  warehouses: Record<string, any>;
  options: Record<string, any>;
  theatre: string;
  dictionary: Record<string, string>;
  mapResource: Record<string, string>;
}

/**
 * DCS Lua tables with numeric keys parse as objects like {"1": ..., "2": ...}.
 * This coerces them into arrays for safe iteration.
 */
export function asArray<T>(val: T[] | Record<string, T> | undefined | null): T[] {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === 'object') {
    return Object.entries(val)
      .filter(([k]) => /^\d+$/.test(k))
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([, v]) => v);
  }
  return [];
}

export interface HistoricalConstraints {
  enabled: boolean;
  year: number;
  theatre: string;
  warId?: string;
}

export class MizSession {
  readonly sessionId: string;
  readonly filePath: string;

  private zip: JSZip;
  private parsed: ParsedMiz;
  private dirty: boolean = false;
  private _historicalConstraints: HistoricalConstraints | null = null;

  private constructor(
    sessionId: string,
    filePath: string,
    zip: JSZip,
    parsed: ParsedMiz
  ) {
    this.sessionId = sessionId;
    this.filePath = filePath;
    this.zip = zip;
    this.parsed = parsed;
  }

  static async open(filePath: string): Promise<MizSession> {
    const resolved = path.resolve(filePath);
    const buffer = await fs.readFile(resolved);
    const zip = await JSZip.loadAsync(buffer);

    const missionLua = await zip.file('mission')?.async('string');
    if (!missionLua) throw new Error('Invalid .miz: missing "mission" file');

    const warehousesLua = await zip.file('warehouses')?.async('string') ?? '';
    const optionsLua = await zip.file('options')?.async('string') ?? '';
    const theatreTxt = await zip.file('theatre')?.async('string') ?? '';
    const dictLua = await zip.file('l10n/DEFAULT/dictionary')?.async('string') ?? '';
    const mapResLua = await zip.file('l10n/DEFAULT/mapResource')?.async('string') ?? '';

    const mission = LuaParser.parse(missionLua) as DcsMission;
    const warehouses = warehousesLua ? LuaParser.parse(warehousesLua) : {};
    const options = optionsLua ? LuaParser.parse(optionsLua) : {};
    const dictionary = dictLua ? LuaParser.parse(dictLua) : {};
    const mapResource = mapResLua ? LuaParser.parse(mapResLua) : {};

    const sessionId = crypto.randomUUID().slice(0, 8);

    return new MizSession(sessionId, resolved, zip, {
      mission,
      warehouses,
      options,
      theatre: theatreTxt.trim(),
      dictionary,
      mapResource,
    });
  }

  static async create(theatre: string): Promise<MizSession> {
    const zip = new JSZip();
    const dictionary = {
      DictKey_descriptionText_1: 'AI-authored DCS mission',
      DictKey_descriptionBlueTask_2: '',
      DictKey_descriptionRedTask_3: '',
      DictKey_sortie_4: 'AI Mission',
    };

    const emptyCoalition = (name: string) => ({
      name,
      bullseye: { x: 0, y: 0 },
      nav_points: {},
      country: [],
    });

    const mission: DcsMission = {
      requiredModules: {},
      failures: {},
      forcedOptions: {},
      date: { Year: 2024, Month: 6, Day: 15 },
      maxDictId: 4,
      currentKey: 20000,
      maxKey: 20000,
      result: {
        offline: { conditions: {}, actions: {}, func: {} },
        total: 0,
        blue: { conditions: {}, actions: {}, func: {} },
        red: { conditions: {}, actions: {}, func: {} },
      },
      groundControl: {
        passwords: {
          artillery_commander: {},
          instructor: {},
          observer: {},
          forward_observer: {},
        },
        roles: {
          artillery_commander: { neutrals: 0, blue: 4, red: 4 },
          instructor: { neutrals: 0, blue: 4, red: 4 },
          observer: { neutrals: 0, blue: 4, red: 4 },
          forward_observer: { neutrals: 0, blue: 8, red: 8 },
        },
        isPilotControlVehicles: true,
      },
      pictureFileNameN: {},
      pictureFileNameR: {},
      pictureFileNameB: {},
      pictureFileNameServer: {},
      drawings: {
        options: { hiddenOnF10Map: {} },
        layers: {
          1: { visible: true, name: 'Red', objects: {} },
          2: { visible: true, name: 'Blue', objects: {} },
          3: { visible: true, name: 'Neutral', objects: {} },
          4: { visible: true, name: 'Common', objects: {} },
          5: { visible: true, name: 'Author', objects: {} },
        },
      },
      theatre,
      sortie: 'DictKey_sortie_4',
      descriptionText: 'DictKey_descriptionText_1',
      descriptionNeutralsTask: '',
      descriptionBlueTask: 'DictKey_descriptionBlueTask_2',
      descriptionRedTask: 'DictKey_descriptionRedTask_3',
      version: 23,
      start_time: 28800,
      weather: {
        atmosphere_type: 0,
        groundTurbulence: 0,
        type_weather: 0,
        modifiedTime: true,
        qnh: 760,
        cyclones: {},
        enable_fog: false,
        enable_dust: false,
        dust_density: 0,
        name: 'Summer, clean',
        wind: {
          atGround: { speed: 0, dir: 0 },
          at2000: { speed: 0, dir: 0 },
          at8000: { speed: 0, dir: 0 },
        },
        fog: { thickness: 0, visibility: 6000 },
        visibility: { distance: 80000 },
        clouds: { density: 0, thickness: 200, base: 2500, iprecptns: 0 },
        season: { temperature: 20 },
      },
      map: { centerX: 0, centerY: 0, zoom: 500000 },
      coalitions: { blue: [], red: [], neutrals: [] },
      coalition: {
        blue: emptyCoalition('blue'),
        red: emptyCoalition('red'),
        neutrals: emptyCoalition('neutrals'),
      },
      goals: {},
      trig: {
        actions: {},
        events: {},
        custom: {},
        func: {},
        flag: {},
        conditions: {},
        customStartup: {},
        funcStartup: {},
      },
      trigrules: {},
      triggers: { zones: {} },
    };

    const sessionId = crypto.randomUUID().slice(0, 8);
    return new MizSession(sessionId, '', zip, {
      mission,
      warehouses: {},
      options: {},
      theatre,
      dictionary,
      mapResource: {},
    });
  }

  get mission(): DcsMission {
    return this.parsed.mission;
  }

  get warehouses(): Record<string, any> {
    return this.parsed.warehouses;
  }

  /** Read the separate DCS options Lua table from the mission package. */
  get options(): Record<string, any> {
    return this.parsed.options;
  }

  /**
   * Update a dotted path inside the DCS options table.
   * Prototype-related keys are blocked because option paths are AI/user supplied.
   */
  setOption(optionPath: string, value: unknown): void {
    const parts = optionPath.split('.').map(part => part.trim());
    if (parts.length === 0 || parts.some(part =>
      !part || part === '__proto__' || part === 'prototype' || part === 'constructor'
    )) {
      throw new Error('Invalid option path');
    }

    let target: Record<string, any> = this.parsed.options;
    for (const part of parts.slice(0, -1)) {
      const current = target[part];
      if (current == null) {
        target[part] = {};
      } else if (typeof current !== 'object' || Array.isArray(current)) {
        throw new Error(`Cannot traverse non-object option path segment: ${part}`);
      }
      target = target[part];
    }

    target[parts[parts.length - 1]] = value;
    this.markDirty();
  }

  get dictionary(): Record<string, string> {
    return this.parsed.dictionary;
  }

  get mapResource(): Record<string, string> {
    return this.parsed.mapResource;
  }

  get theatre(): string {
    return this.parsed.theatre || this.parsed.mission.theatre || '';
  }

  get isDirty(): boolean {
    return this.dirty;
  }

  markDirty(): void {
    this.dirty = true;
  }

  getInfo(): MizSessionInfo {
    const m = this.parsed.mission;
    const countGroups = (coal?: CoalitionData) => {
      if (!coal?.country) return 0;
      let n = 0;
      for (const c of asArray(coal.country as any)) {
        for (const cat of ['plane', 'helicopter', 'vehicle', 'ship', 'static'] as const) {
          n += asArray((c as any)?.[cat]?.group).length;
        }
      }
      return n;
    };

    return {
      sessionId: this.sessionId,
      filePath: this.filePath,
      theatre: this.theatre,
      sortie: m.sortie ?? '',
      startTime: m.start_time ?? 0,
      date: {
        year: m.date?.Year ?? 2024,
        month: m.date?.Month ?? 1,
        day: m.date?.Day ?? 1,
      },
      coalitions: {
        blue: countGroups(m.coalition?.blue),
        red: countGroups(m.coalition?.red),
        neutral: countGroups(m.coalition?.neutrals),
      },
      dirty: this.dirty,
    };
  }

  // ── Historical constraint gate ───────────────────────────────────

  get historicalConstraints(): HistoricalConstraints | null {
    return this._historicalConstraints;
  }

  setHistoricalConstraints(enabled: boolean, warId?: string): HistoricalConstraints {
    const m = this.parsed.mission;
    const year = m.date?.Year ?? 2024;
    const theatre = this.theatre;

    this._historicalConstraints = enabled
      ? { enabled: true, year, theatre, warId }
      : { enabled: false, year, theatre };

    return this._historicalConstraints;
  }

  // ── Group traversal ──────────────────────────────────────────────

  *iterGroups(filter?: {
    coalition?: string;
    country?: string;
    category?: string;
  }): Generator<{
    coalition: string;
    country: string;
    category: string;
    group: GroupData;
  }> {
    const coalitions = this.parsed.mission.coalition;
    if (!coalitions) return;

    const coalEntries: [string, CoalitionData | undefined][] = [
      ['blue', coalitions.blue],
      ['red', coalitions.red],
      ['neutral', coalitions.neutrals],
    ];

    const categories = ['plane', 'helicopter', 'vehicle', 'ship', 'static'] as const;

    for (const [coalName, coalData] of coalEntries) {
      if (filter?.coalition && coalName !== filter.coalition) continue;
      if (!coalData?.country) continue;

      for (const country of asArray(coalData.country as any)) {
        const countryObj = country as CountryData;
        if (filter?.country && countryObj.name?.toLowerCase() !== filter.country.toLowerCase()) continue;

        for (const cat of categories) {
          if (filter?.category && cat !== filter.category) continue;
          const groups = asArray((countryObj as any)[cat]?.group);

          for (const group of groups) {
            yield { coalition: coalName, country: countryObj.name, category: cat, group: group as GroupData };
          }
        }
      }
    }
  }

  findGroupById(groupId: number): { coalition: string; country: string; category: string; group: GroupData } | null {
    for (const entry of this.iterGroups()) {
      if (entry.group.groupId === groupId) return entry;
    }
    return null;
  }

  findGroupByName(name: string): { coalition: string; country: string; category: string; group: GroupData } | null {
    const lower = name.toLowerCase();
    for (const entry of this.iterGroups()) {
      if (entry.group.name.toLowerCase() === lower) return entry;
    }
    return null;
  }

  findUnitById(unitId: number): { group: GroupData; unit: UnitData } | null {
    for (const entry of this.iterGroups()) {
      for (const unit of asArray(entry.group.units as any)) {
        if ((unit as UnitData).unitId === unitId) return { group: entry.group, unit: unit as UnitData };
      }
    }
    return null;
  }

  // ── Raw Lua path access ──────────────────────────────────────────

  getRawValue(dottedPath: string): any {
    const parts = this.parsePath(dottedPath);
    let current: any = this.parsed.mission;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (current === null || current === undefined) {
        throw new Error(`Path "${dottedPath}" failed at "${part}": parent is ${current}`);
      }

      if (typeof part === 'number') {
        if (Array.isArray(current)) {
          current = current[part - 1]; // Lua 1-indexed
        } else if (typeof current === 'object') {
          current = current[String(part)];
        } else {
          throw new Error(`Path "${dottedPath}" failed at index [${part}]: not indexable`);
        }
      } else {
        if (typeof current !== 'object') {
          throw new Error(`Path "${dottedPath}" failed at "${part}": not an object`);
        }
        current = current[part];
      }
    }

    return current;
  }

  setRawValue(dottedPath: string, value: any): void {
    const parts = this.parsePath(dottedPath);
    if (parts.length === 0) throw new Error('Empty path');

    let current: any = this.parsed.mission;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (typeof part === 'number') {
        current = Array.isArray(current) ? current[part - 1] : current[String(part)];
      } else {
        current = current[part];
      }
      if (current === null || current === undefined) {
        throw new Error(`Path "${dottedPath}" failed: "${parts.slice(0, i + 1).join('.')}" does not exist`);
      }
    }

    const lastKey = parts[parts.length - 1];
    if (typeof lastKey === 'number') {
      if (Array.isArray(current)) {
        current[lastKey - 1] = value;
      } else {
        current[String(lastKey)] = value;
      }
    } else {
      current[lastKey] = value;
    }

    this.dirty = true;
  }

  private parsePath(path: string): Array<string | number> {
    const parts: Array<string | number> = [];
    const regex = /([a-zA-Z_]\w*)|(?:\[(\d+)\])/g;
    let match: RegExpExecArray | null;
    let lastIndex = 0;

    // Split on dots, handling [N] indexing
    const segments = path.split('.');
    for (const seg of segments) {
      const bracketMatch = seg.match(/^(.+?)(?:\[(\d+)\])?$/);
      if (bracketMatch) {
        if (bracketMatch[1]) parts.push(bracketMatch[1]);
        if (bracketMatch[2]) parts.push(parseInt(bracketMatch[2], 10));
      } else {
        parts.push(seg);
      }
    }

    return parts;
  }

  // ── Save ─────────────────────────────────────────────────────────

  async save(outputPath?: string): Promise<string> {
    const target = outputPath ?? this.filePath;
    if (!target) throw new Error('No file path specified for save');

    this.zip.file('mission', LuaSerializer.serializeToAssignment('mission', this.parsed.mission));
    this.zip.file('warehouses', LuaSerializer.serializeToAssignment('warehouses', this.parsed.warehouses));
    this.zip.file('options', LuaSerializer.serializeToAssignment('options', this.parsed.options));
    this.zip.file('theatre', this.parsed.theatre);
    this.zip.file('l10n/DEFAULT/dictionary', LuaSerializer.serializeToAssignment('dictionary', this.parsed.dictionary));
    this.zip.file('l10n/DEFAULT/mapResource', LuaSerializer.serializeToAssignment('mapResource', this.parsed.mapResource));

    const buffer = await this.zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, buffer);
    this.dirty = false;
    return target;
  }

  // ── Zip access (for images, resources, etc.) ─────────────────────

  async getZipEntry(entryPath: string): Promise<string | null> {
    const file = this.zip.file(entryPath);
    if (!file) return null;
    return file.async('string');
  }

  async getZipEntryBinary(entryPath: string): Promise<Buffer | null> {
    const file = this.zip.file(entryPath);
    if (!file) return null;
    return file.async('nodebuffer');
  }

  setZipEntry(entryPath: string, content: string | Buffer): void {
    this.zip.file(entryPath, content);
    this.dirty = true;
  }

  listZipEntries(): string[] {
    const entries: string[] = [];
    this.zip.forEach((relativePath) => {
      entries.push(relativePath);
    });
    return entries;
  }

  getNextGroupId(): number {
    let maxId = 0;
    for (const entry of this.iterGroups()) {
      if (entry.group.groupId > maxId) maxId = entry.group.groupId;
    }
    return maxId + 1;
  }

  getNextUnitId(): number {
    let maxId = 0;
    for (const entry of this.iterGroups()) {
      for (const unit of asArray(entry.group.units as any)) {
        if ((unit as UnitData).unitId > maxId) maxId = (unit as UnitData).unitId;
      }
    }
    return maxId + 1;
  }
}
