import { z } from 'zod';
import { asArray } from '../miz/MizSession.js';
import { appendNumericEntry, removeNumericEntry } from './dcs_helpers.js';
import type { ToolDefinition, ToolContext } from './index.js';

const REQUIRED_DRAWING_LAYERS = ['Red', 'Blue', 'Neutral', 'Common', 'Author'] as const;

function drawingLayers(session: any): any[] {
  const m = session.mission as any;
  m.drawings ??= { options: { hiddenOnF10Map: {} }, layers: {} };
  m.drawings.options ??= { hiddenOnF10Map: {} };
  m.drawings.layers ??= {};
  return asArray<any>(m.drawings.layers);
}

function findLayer(session: any, name: string): any {
  const layer = drawingLayers(session).find(l => String(l?.name ?? '').toLowerCase() === name.toLowerCase());
  if (!layer) throw new Error(`Drawing layer "${name}" does not exist`);
  layer.objects ??= {};
  return layer;
}

function allDrawings(session: any): Array<{ layer: string; index: number; drawing: any }> {
  const out: Array<{ layer: string; index: number; drawing: any }> = [];
  for (const layer of drawingLayers(session)) {
    asArray<any>(layer?.objects).forEach((drawing, i) => out.push({ layer: layer.name, index: i + 1, drawing }));
  }
  return out;
}

function safeColor(value: string): string {
  if (!/^0x[0-9a-fA-F]{8}$/.test(value)) throw new Error('DCS drawing colors must use 0xRRGGBBAA format');
  return value;
}

function findDrawing(session: any, name: string) {
  const match = allDrawings(session).find(d => String(d.drawing?.name ?? '').toLowerCase() === name.toLowerCase());
  if (!match) throw new Error(`No drawing named "${name}"`);
  return match;
}

export const missionAuthoringTools: ToolDefinition[] = [
  {
    name: 'list_drawing_layers',
    description: 'List DCS F10 drawing layers and object counts, preserving the five Mission Editor invariant layers.',
    inputSchema: z.object({ session_id: z.string() }),
    async handler(args: any, ctx: ToolContext) {
      const session = ctx.sessions.get(args.session_id);
      const layers = drawingLayers(session).map((l, i) => ({
        index: i + 1,
        name: l.name,
        visible: l.visible !== false,
        objectCount: asArray<any>(l.objects).length,
      }));
      return { count: layers.length, requiredLayers: REQUIRED_DRAWING_LAYERS, layers };
    },
  },
  {
    name: 'list_drawings',
    description: 'List F10 map drawing objects across all layers, optionally filtering by layer or primitive type.',
    inputSchema: z.object({
      session_id: z.string(),
      layer: z.string().optional(),
      primitiveType: z.enum(['Line', 'Polygon', 'TextBox']).optional(),
    }),
    async handler(args: any, ctx: ToolContext) {
      const session = ctx.sessions.get(args.session_id);
      let rows = allDrawings(session);
      if (args.layer) rows = rows.filter(r => r.layer.toLowerCase() === args.layer.toLowerCase());
      if (args.primitiveType) rows = rows.filter(r => r.drawing?.primitiveType === args.primitiveType);
      return { count: rows.length, drawings: rows };
    },
  },
  {
    name: 'get_drawing',
    description: 'Get one full F10 map drawing object by its exact name.',
    inputSchema: z.object({ session_id: z.string(), name: z.string().min(1) }),
    async handler(args: any, ctx: ToolContext) {
      return findDrawing(ctx.sessions.get(args.session_id), args.name);
    },
  },
  {
    name: 'add_map_circle',
    description: 'Add a DCS-native circular F10 map drawing to a named layer.',
    inputSchema: z.object({
      session_id: z.string(),
      layer: z.enum(REQUIRED_DRAWING_LAYERS),
      name: z.string().min(1),
      x: z.number(),
      y: z.number(),
      radius: z.number().positive(),
      color: z.string().default('0xffffffff'),
      fillColor: z.string().default('0x00000000'),
      thickness: z.number().positive().default(2),
      visible: z.boolean().default(true),
    }),
    async handler(args: any, ctx: ToolContext) {
      const session = ctx.sessions.get(args.session_id);
      if (allDrawings(session).some(d => d.drawing?.name === args.name)) throw new Error(`Drawing "${args.name}" already exists`);
      const layer = findLayer(session, args.layer);
      const drawing = {
        primitiveType: 'Polygon',
        polygonMode: 'circle',
        name: args.name,
        layer: args.layer,
        layerName: args.layer,
        visible: args.visible,
        mapX: args.x,
        mapY: args.y,
        radius: args.radius,
        colorString: safeColor(args.color),
        fillColorString: safeColor(args.fillColor),
        thickness: args.thickness,
        style: 'solid',
      };
      const index = appendNumericEntry(layer.objects, drawing);
      session.markDirty();
      return { created: true, layer: args.layer, index, drawing };
    },
  },
  {
    name: 'add_map_text',
    description: 'Add a DCS-native F10 text-box annotation to a named drawing layer.',
    inputSchema: z.object({
      session_id: z.string(),
      layer: z.enum(REQUIRED_DRAWING_LAYERS),
      name: z.string().min(1),
      text: z.string(),
      x: z.number(),
      y: z.number(),
      fontSize: z.number().int().min(8).max(72).default(18),
      color: z.string().default('0xffffffff'),
      fillColor: z.string().default('0x00000000'),
      borderThickness: z.number().nonnegative().default(0),
      visible: z.boolean().default(true),
    }),
    async handler(args: any, ctx: ToolContext) {
      const session = ctx.sessions.get(args.session_id);
      if (allDrawings(session).some(d => d.drawing?.name === args.name)) throw new Error(`Drawing "${args.name}" already exists`);
      const layer = findLayer(session, args.layer);
      const drawing = {
        primitiveType: 'TextBox',
        name: args.name,
        text: args.text,
        layer: args.layer,
        layerName: args.layer,
        visible: args.visible,
        mapX: args.x,
        mapY: args.y,
        fontSize: args.fontSize,
        font: 'DejaVuLGCSansCondensed.ttf',
        angle: 0,
        colorString: safeColor(args.color),
        fillColorString: safeColor(args.fillColor),
        borderThickness: args.borderThickness,
      };
      const index = appendNumericEntry(layer.objects, drawing);
      session.markDirty();
      return { created: true, layer: args.layer, index, drawing };
    },
  },
  {
    name: 'add_map_line',
    description: 'Add a DCS-native segmented F10 line/polyline from absolute DCS x/y points.',
    inputSchema: z.object({
      session_id: z.string(),
      layer: z.enum(REQUIRED_DRAWING_LAYERS),
      name: z.string().min(1),
      points: z.array(z.object({ x: z.number(), y: z.number() })).min(2),
      color: z.string().default('0xffffffff'),
      thickness: z.number().positive().default(2),
      closed: z.boolean().default(false),
      visible: z.boolean().default(true),
    }),
    async handler(args: any, ctx: ToolContext) {
      const session = ctx.sessions.get(args.session_id);
      if (allDrawings(session).some(d => d.drawing?.name === args.name)) throw new Error(`Drawing "${args.name}" already exists`);
      const layer = findLayer(session, args.layer);
      const drawing = {
        primitiveType: 'Line',
        name: args.name,
        layer: args.layer,
        layerName: args.layer,
        visible: args.visible,
        mapX: args.points[0].x,
        mapY: args.points[0].y,
        points: args.points,
        lineMode: 'segments',
        style: 'solid',
        closed: args.closed,
        thickness: args.thickness,
        colorString: safeColor(args.color),
      };
      const index = appendNumericEntry(layer.objects, drawing);
      session.markDirty();
      return { created: true, layer: args.layer, index, drawing };
    },
  },
  {
    name: 'delete_drawing',
    description: 'Delete one F10 map drawing by exact name while preserving its containing layer.',
    inputSchema: z.object({ session_id: z.string(), name: z.string().min(1) }),
    async handler(args: any, ctx: ToolContext) {
      const session = ctx.sessions.get(args.session_id);
      const found = findDrawing(session, args.name);
      const layer = findLayer(session, found.layer);
      const removed = removeNumericEntry<any>(layer.objects, d => d?.name === found.drawing.name);
      if (!removed) throw new Error(`Unable to remove drawing "${args.name}"`);
      session.markDirty();
      return { deleted: true, layer: found.layer, drawing: removed };
    },
  },
  {
    name: 'set_drawing_visibility',
    description: 'Show or hide one F10 map drawing without deleting it.',
    inputSchema: z.object({ session_id: z.string(), name: z.string().min(1), visible: z.boolean() }),
    async handler(args: any, ctx: ToolContext) {
      const session = ctx.sessions.get(args.session_id);
      const found = findDrawing(session, args.name);
      found.drawing.visible = args.visible;
      session.markDirty();
      return { updated: true, name: args.name, visible: args.visible };
    },
  },
  {
    name: 'list_client_slots',
    description: 'List all player/client aircraft slots with coalition, country, category, airframe, base, parking, and start action.',
    inputSchema: z.object({ session_id: z.string(), coalition: z.enum(['blue','red','neutral']).optional() }),
    async handler(args: any, ctx: ToolContext) {
      const session = ctx.sessions.get(args.session_id);
      const slots: any[] = [];
      for (const entry of session.iterGroups({ coalition: args.coalition })) {
        if (!['plane', 'helicopter'].includes(entry.category)) continue;
        const wp0 = asArray<any>(entry.group.route?.points)[0] ?? {};
        for (const unit of asArray<any>(entry.group.units)) {
          if (!['Client', 'Player'].includes(unit.skill)) continue;
          slots.push({
            coalition: entry.coalition, country: entry.country, category: entry.category,
            groupId: entry.group.groupId, groupName: entry.group.name,
            unitId: unit.unitId, unitName: unit.name, type: unit.type, skill: unit.skill,
            airdromeId: unit.airdromeId ?? wp0.airdromeId ?? null,
            parking: unit.parking ?? unit.parking_id ?? wp0.parking ?? wp0.parking_id ?? null,
            startAction: wp0.action ?? null,
            startType: wp0.type ?? null,
            livery: unit.livery_id ?? null,
          });
        }
      }
      return { count: slots.length, slots };
    },
  },
  {
    name: 'get_client_slot',
    description: 'Get one player/client slot by unit id with its full unit and first route-point spawn data.',
    inputSchema: z.object({ session_id: z.string(), unit_id: z.number().int().positive() }),
    async handler(args: any, ctx: ToolContext) {
      const session = ctx.sessions.get(args.session_id);
      const found = session.findUnitById(args.unit_id);
      if (!found || !['Client','Player'].includes(found.unit.skill ?? '')) throw new Error(`Unit ${args.unit_id} is not a client/player slot`);
      return { group: found.group, unit: found.unit, spawnWaypoint: asArray<any>(found.group.route?.points)[0] ?? null };
    },
  },
  {
    name: 'validate_client_slot_parking',
    description: 'Audit player/client slots for the DCS parking invariants that prevent cockpit/slot-loading failures.',
    inputSchema: z.object({ session_id: z.string() }),
    async handler(args: any, ctx: ToolContext) {
      const session = ctx.sessions.get(args.session_id);
      const issues: any[] = [];
      let checked = 0;
      for (const entry of session.iterGroups()) {
        if (!['plane','helicopter'].includes(entry.category)) continue;
        const wp0 = asArray<any>(entry.group.route?.points)[0] ?? {};
        for (const unit of asArray<any>(entry.group.units)) {
          if (!['Client','Player'].includes(unit.skill)) continue;
          checked++;
          const isParkingStart = /parking/i.test(String(wp0.action ?? wp0.type ?? ''));
          if (!isParkingStart) continue;
          const parking = unit.parking_id ?? unit.parking;
          const routeParking = wp0.parking_id ?? wp0.parking;
          if (!Number.isInteger(parking) || parking <= 0) issues.push({ unitId: unit.unitId, unitName: unit.name, issue: 'unit parking_id must be a positive integer', value: parking });
          if (!Number.isInteger(routeParking) || routeParking <= 0) issues.push({ unitId: unit.unitId, unitName: unit.name, issue: 'route point parking_id must be a positive integer', value: routeParking });
          if (parking !== routeParking) issues.push({ unitId: unit.unitId, unitName: unit.name, issue: 'unit and route parking ids differ', unitParking: parking, routeParking });
          if (!Number.isInteger(unit.airdromeId ?? wp0.airdromeId)) issues.push({ unitId: unit.unitId, unitName: unit.name, issue: 'parking start has no numeric airdromeId' });
        }
      }
      return { valid: issues.length === 0, checkedSlots: checked, issueCount: issues.length, issues };
    },
  },
  {
    name: 'set_unit_livery',
    description: 'Set or clear the livery_id on one mission unit.',
    inputSchema: z.object({ session_id: z.string(), unit_id: z.number().int().positive(), livery: z.string().nullable() }),
    async handler(args: any, ctx: ToolContext) {
      const session = ctx.sessions.get(args.session_id);
      const found = session.findUnitById(args.unit_id);
      if (!found) throw new Error(`No unit with id ${args.unit_id}`);
      if (args.livery === null) delete found.unit.livery_id;
      else found.unit.livery_id = args.livery;
      session.markDirty();
      return { updated: true, unitId: args.unit_id, unitName: found.unit.name, livery: found.unit.livery_id ?? null };
    },
  },
  {
    name: 'bulk_set_group_livery',
    description: 'Set or clear the same livery_id on every unit in one group.',
    inputSchema: z.object({ session_id: z.string(), group_id: z.number().int().positive(), livery: z.string().nullable() }),
    async handler(args: any, ctx: ToolContext) {
      const session = ctx.sessions.get(args.session_id);
      const entry = session.findGroupById(args.group_id);
      if (!entry) throw new Error(`No group with id ${args.group_id}`);
      const units = asArray<any>(entry.group.units);
      for (const unit of units) {
        if (args.livery === null) delete unit.livery_id;
        else unit.livery_id = args.livery;
      }
      session.markDirty();
      return { updated: true, groupId: args.group_id, groupName: entry.group.name, unitCount: units.length, livery: args.livery };
    },
  },
  {
    name: 'list_liveries_in_use',
    description: 'List livery_id values currently referenced by mission units and the units using each livery.',
    inputSchema: z.object({ session_id: z.string() }),
    async handler(args: any, ctx: ToolContext) {
      const session = ctx.sessions.get(args.session_id);
      const map = new Map<string, any[]>();
      for (const entry of session.iterGroups()) for (const unit of asArray<any>(entry.group.units)) {
        if (!unit.livery_id) continue;
        const rows = map.get(unit.livery_id) ?? [];
        rows.push({ unitId: unit.unitId, unitName: unit.name, type: unit.type, groupId: entry.group.groupId, groupName: entry.group.name });
        map.set(unit.livery_id, rows);
      }
      return { count: map.size, liveries: [...map.entries()].map(([livery, units]) => ({ livery, units })) };
    },
  },
  {
    name: 'list_embedded_scripts',
    description: 'List Lua/script resources embedded in the .miz package, including mission scripting payloads.',
    inputSchema: z.object({ session_id: z.string() }),
    async handler(args: any, ctx: ToolContext) {
      const entries = ctx.sessions.get(args.session_id).listZipEntries().filter((p: string) => /\.lua$/i.test(p) || /script/i.test(p));
      return { count: entries.length, entries };
    },
  },
  {
    name: 'list_kneeboard_entries',
    description: 'List files embedded under the mission KNEEBOARD directory.',
    inputSchema: z.object({ session_id: z.string() }),
    async handler(args: any, ctx: ToolContext) {
      const entries = ctx.sessions.get(args.session_id).listZipEntries().filter((p: string) => /^KNEEBOARD\//i.test(p) && !p.endsWith('/'));
      return { count: entries.length, entries };
    },
  },
  {
    name: 'list_mission_media_assets',
    description: 'List embedded mission images, audio, video, and PDF resources by package path.',
    inputSchema: z.object({ session_id: z.string() }),
    async handler(args: any, ctx: ToolContext) {
      const entries = ctx.sessions.get(args.session_id).listZipEntries().filter((p: string) => /\.(png|jpe?g|webp|bmp|dds|ogg|wav|mp3|mp4|webm|pdf)$/i.test(p));
      return { count: entries.length, entries };
    },
  },
  {
    name: 'get_mission_package_inventory',
    description: 'Return a classified inventory of the .miz ZIP contents: core files, scripts, kneeboard, media, localization, and other resources.',
    inputSchema: z.object({ session_id: z.string() }),
    async handler(args: any, ctx: ToolContext) {
      const entries = ctx.sessions.get(args.session_id).listZipEntries().filter((p: string) => !p.endsWith('/'));
      const classify = (p: string) => /^KNEEBOARD\//i.test(p) ? 'kneeboard' : /\.lua$/i.test(p) || /script/i.test(p) ? 'scripts' : /^l10n\//i.test(p) ? 'localization' : /\.(png|jpe?g|webp|bmp|dds|ogg|wav|mp3|mp4|webm|pdf)$/i.test(p) ? 'media' : ['mission','warehouses','options','theatre'].includes(p) ? 'core' : 'other';
      const byClass: Record<string,string[]> = { core: [], scripts: [], kneeboard: [], media: [], localization: [], other: [] };
      entries.forEach((p: string) => byClass[classify(p)].push(p));
      return { total: entries.length, counts: Object.fromEntries(Object.entries(byClass).map(([k,v]) => [k,v.length])), entries: byClass };
    },
  },
  {
    name: 'validate_drawing_layers',
    description: 'Validate the five mandatory DCS Mission Editor drawing layers and report duplicates/missing layers.',
    inputSchema: z.object({ session_id: z.string() }),
    async handler(args: any, ctx: ToolContext) {
      const layers = drawingLayers(ctx.sessions.get(args.session_id));
      const names = layers.map(l => String(l?.name ?? ''));
      const missing = REQUIRED_DRAWING_LAYERS.filter(n => !names.includes(n));
      const duplicates = names.filter((n, i) => names.indexOf(n) !== i);
      return { valid: missing.length === 0 && duplicates.length === 0, required: REQUIRED_DRAWING_LAYERS, actual: names, missing, duplicates: [...new Set(duplicates)] };
    },
  },
  {
    name: 'validate_release_readiness',
    description: 'Run a focused MCP release-readiness audit over mission structure, drawings, client parking, briefing text, warehouses, kneeboard, scripts, and package core files.',
    inputSchema: z.object({ session_id: z.string() }),
    async handler(args: any, ctx: ToolContext) {
      const session = ctx.sessions.get(args.session_id);
      const entries = session.listZipEntries();
      const layers = drawingLayers(session).map(l => l?.name);
      const missingLayers = REQUIRED_DRAWING_LAYERS.filter(n => !layers.includes(n));
      const kneeboardCount = entries.filter((p: string) => /^KNEEBOARD\//i.test(p) && !p.endsWith('/')).length;
      const scripts = entries.filter((p: string) => /\.lua$/i.test(p) || /script/i.test(p));
      const coreMissing = ['mission','warehouses','options','theatre'].filter(p => !entries.includes(p) && session.filePath);
      const parkingIssues: any[] = [];
      for (const entry of session.iterGroups()) {
        if (!['plane','helicopter'].includes(entry.category)) continue;
        const wp0 = asArray<any>(entry.group.route?.points)[0] ?? {};
        for (const unit of asArray<any>(entry.group.units)) {
          if (!['Client','Player'].includes(unit.skill) || !/parking/i.test(String(wp0.action ?? wp0.type ?? ''))) continue;
          const a = unit.parking_id ?? unit.parking;
          const b = wp0.parking_id ?? wp0.parking;
          if (!Number.isInteger(a) || !Number.isInteger(b) || a !== b) parkingIssues.push({ unitId: unit.unitId, unitName: unit.name, unitParking: a, routeParking: b });
        }
      }
      const checks = {
        drawingLayers: { pass: missingLayers.length === 0, missing: missingLayers },
        clientParking: { pass: parkingIssues.length === 0, issues: parkingIssues },
        briefing: { pass: Boolean(session.mission.descriptionText || session.mission.descriptionBlueTask || session.mission.descriptionRedTask) },
        warehouses: { pass: Object.keys(session.warehouses ?? {}).length > 0 || !session.filePath },
        kneeboard: { pass: kneeboardCount > 0, count: kneeboardCount },
        scripts: { pass: scripts.length > 0, count: scripts.length },
        corePackage: { pass: coreMissing.length === 0, missing: coreMissing },
      };
      const blocking = ['drawingLayers','clientParking','corePackage'].filter(k => !(checks as any)[k].pass);
      return { ready: blocking.length === 0, blockingChecks: blocking, checks };
    },
  },
  {
    name: 'get_warehouse_summary',
    description: 'Summarise the parsed DCS warehouses table without dumping the entire potentially huge inventory.',
    inputSchema: z.object({ session_id: z.string() }),
    async handler(args: any, ctx: ToolContext) {
      const warehouses = ctx.sessions.get(args.session_id).warehouses ?? {};
      const topKeys = Object.keys(warehouses);
      const sections = topKeys.map(key => {
        const value = warehouses[key];
        const numericCount = value && typeof value === 'object' ? Object.keys(value).filter(k => /^\d+$/.test(k)).length : 0;
        return { key, type: Array.isArray(value) ? 'array' : typeof value, numericEntries: numericCount, childKeys: value && typeof value === 'object' ? Object.keys(value).slice(0, 30) : [] };
      });
      return { topLevelKeys: topKeys, sectionCount: sections.length, sections };
    },
  },
];
