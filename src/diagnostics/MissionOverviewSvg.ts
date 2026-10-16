import { asArray, type MizSession } from '../miz/MizSession.js';

/**
 * Renders the layout of an open .miz as a north-up SVG in DCS map metres: unit positions by
 * coalition and category, routes, trigger zones (circles and quads) and human slots. It is a
 * placement check, not a map: there is no terrain underneath.
 *
 * DCS coordinates: x = north, y = east. SVG: left→right = east, top→bottom = south.
 */

export interface OverviewOptions {
  coalitions?: Array<'blue' | 'red' | 'neutral'>;
  includeRoutes?: boolean;
  includeZones?: boolean;
  includeLabels?: boolean;
  widthPx?: number;
  /** Restrict to groups whose name matches (case-insensitive substring). */
  groupFilter?: string;
}

const COLORS: Record<string, string> = { blue: '#2f6fdb', red: '#d6453d', neutral: '#8a8a8a' };
const escapeXml = (s: string) => s.replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]!));
const r1 = (n: number) => Math.round(n * 10) / 10;

interface UnitMark { x: number; y: number; coalition: string; category: string; human: boolean }
interface GroupMark { name: string; coalition: string; category: string; lead: { x: number; y: number }; route: Array<{ x: number; y: number }> }
interface ZoneMark { name: string; x: number; y: number; radius: number; vertices: Array<{ x: number; y: number }> | null }

function niceStep(meters: number): number {
  const pow = 10 ** Math.floor(Math.log10(meters));
  for (const m of [1, 2, 5, 10]) if (m * pow >= meters) return m * pow;
  return 10 * pow;
}

function marker(category: string, cx: number, cy: number, color: string): string {
  const s = 4;
  switch (category) {
    case 'plane': return `<polygon points="${r1(cx)},${r1(cy - s - 1)} ${r1(cx - s)},${r1(cy + s)} ${r1(cx + s)},${r1(cy + s)}" fill="${color}"/>`;
    case 'helicopter': return `<circle cx="${r1(cx)}" cy="${r1(cy)}" r="${s}" fill="${color}"/>`;
    case 'ship': return `<polygon points="${r1(cx)},${r1(cy - s - 1)} ${r1(cx + s + 1)},${r1(cy)} ${r1(cx)},${r1(cy + s + 1)} ${r1(cx - s - 1)},${r1(cy)}" fill="${color}"/>`;
    case 'static': return `<rect x="${r1(cx - 2.5)}" y="${r1(cy - 2.5)}" width="5" height="5" fill="none" stroke="${color}" stroke-width="1.5"/>`;
    default: return `<rect x="${r1(cx - s + 0.5)}" y="${r1(cy - s + 0.5)}" width="${2 * s - 1}" height="${2 * s - 1}" fill="${color}"/>`;
  }
}

export function renderMissionOverview(session: MizSession, options: OverviewOptions = {}) {
  const coalitions = new Set(options.coalitions ?? ['blue', 'red', 'neutral']);
  const includeRoutes = options.includeRoutes ?? true;
  const includeZones = options.includeZones ?? true;
  const includeLabels = options.includeLabels ?? true;
  const filter = options.groupFilter?.toLowerCase();

  const units: UnitMark[] = [];
  const groups: GroupMark[] = [];
  for (const { coalition, category, group } of session.iterGroups()) {
    if (!coalitions.has(coalition as any)) continue;
    if (filter && !String(group.name).toLowerCase().includes(filter)) continue;
    const us = asArray<any>(group.units).filter(u => Number.isFinite(u?.x) && Number.isFinite(u?.y));
    for (const u of us) units.push({ x: u.x, y: u.y, coalition, category, human: u.skill === 'Client' || u.skill === 'Player' });
    const route = asArray<any>((group as any).route?.points).filter(p => Number.isFinite(p?.x) && Number.isFinite(p?.y)).map(p => ({ x: p.x, y: p.y }));
    const lead = us[0] ?? route[0] ?? (Number.isFinite((group as any).x) ? { x: (group as any).x, y: (group as any).y } : null);
    if (lead) groups.push({ name: String(group.name), coalition, category, lead: { x: lead.x, y: lead.y }, route });
  }
  const zones: ZoneMark[] = includeZones
    ? asArray<any>((session.mission as any).triggers?.zones)
      .filter(z => Number.isFinite(z?.x) && Number.isFinite(z?.y))
      .map(z => {
        const vs = asArray<any>(z.verticies ?? z.vertices).filter(v => Number.isFinite(v?.x) && Number.isFinite(v?.y));
        return { name: String(z.name), x: z.x, y: z.y, radius: Number(z.radius) || 0, vertices: vs.length >= 3 ? vs.map(v => ({ x: v.x, y: v.y })) : null };
      })
    : [];

  const pts: Array<{ x: number; y: number }> = [...units, ...groups.flatMap(g => (includeRoutes ? g.route : []))];
  for (const z of zones) {
    if (z.vertices) pts.push(...z.vertices);
    else pts.push({ x: z.x - z.radius, y: z.y - z.radius }, { x: z.x + z.radius, y: z.y + z.radius });
  }
  if (!pts.length) throw new Error('Nothing to render: no units, routes or zones match the options.');

  let minX = Math.min(...pts.map(p => p.x)); let maxX = Math.max(...pts.map(p => p.x));
  let minY = Math.min(...pts.map(p => p.y)); let maxY = Math.max(...pts.map(p => p.y));
  const spanX = Math.max(maxX - minX, 1000);
  const spanY = Math.max(maxY - minY, 1000);
  const padM = Math.max(spanX, spanY) * 0.05;
  minX -= padM; maxX = minX + spanX + 2 * padM; minY -= padM; maxY = minY + spanY + 2 * padM;

  const width = Math.min(Math.max(options.widthPx ?? 1200, 300), 4000);
  const scale = width / (maxY - minY); // px per metre
  const height = Math.round((maxX - minX) * scale);
  const sx = (y: number) => (y - minY) * scale;
  const sy = (x: number) => (maxX - x) * scale;

  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="sans-serif" font-size="10">`);
  parts.push(`<rect width="100%" height="100%" fill="#f7f7f4"/>`);

  // 10 km-ish grid
  const grid = niceStep((maxY - minY) / 8);
  for (let y = Math.ceil(minY / grid) * grid; y <= maxY; y += grid) parts.push(`<line x1="${r1(sx(y))}" y1="0" x2="${r1(sx(y))}" y2="${height}" stroke="#e2e2dc" stroke-width="1"/>`);
  for (let x = Math.ceil(minX / grid) * grid; x <= maxX; x += grid) parts.push(`<line x1="0" y1="${r1(sy(x))}" x2="${width}" y2="${r1(sy(x))}" stroke="#e2e2dc" stroke-width="1"/>`);

  for (const z of zones) {
    // Label above the zone's northern edge so it does not sit on top of units inside it.
    const topX = z.vertices ? Math.max(...z.vertices.map(v => v.x)) : z.x + z.radius;
    const label = includeLabels ? `<text x="${r1(sx(z.y))}" y="${r1(sy(topX) - 4)}" fill="#6b5b2a" text-anchor="middle" font-style="italic">${escapeXml(z.name)}</text>` : '';
    if (z.vertices) {
      parts.push(`<polygon points="${z.vertices.map(v => `${r1(sx(v.y))},${r1(sy(v.x))}`).join(' ')}" fill="#e9c46a" fill-opacity="0.15" stroke="#b08a2e" stroke-dasharray="4 3"/>${label}`);
    } else {
      parts.push(`<circle cx="${r1(sx(z.y))}" cy="${r1(sy(z.x))}" r="${r1(Math.max(z.radius * scale, 2))}" fill="#e9c46a" fill-opacity="0.15" stroke="#b08a2e" stroke-dasharray="4 3"/>${label}`);
    }
  }

  if (includeRoutes) {
    for (const g of groups) {
      if (g.route.length < 2) continue;
      parts.push(`<polyline points="${g.route.map(p => `${r1(sx(p.y))},${r1(sy(p.x))}`).join(' ')}" fill="none" stroke="${COLORS[g.coalition] ?? '#555'}" stroke-opacity="0.5" stroke-width="1"/>`);
    }
  }

  for (const u of units) {
    const cx = sx(u.y); const cy = sy(u.x);
    parts.push(marker(u.category, cx, cy, COLORS[u.coalition] ?? '#555'));
    if (u.human) parts.push(`<circle cx="${r1(cx)}" cy="${r1(cy)}" r="7" fill="none" stroke="#111" stroke-width="1"/>`);
  }

  if (includeLabels) {
    for (const g of groups) parts.push(`<text x="${r1(sx(g.lead.y) + 7)}" y="${r1(sy(g.lead.x) - 5)}" fill="#222">${escapeXml(g.name)}</text>`);
  }

  // Scale bar and north arrow
  const bar = niceStep((maxY - minY) / 5);
  const barPx = bar * scale;
  parts.push(`<g transform="translate(12 ${height - 14})"><rect x="0" y="-4" width="${r1(barPx)}" height="4" fill="#222"/><text x="${r1(barPx + 6)}" y="0">${bar >= 1000 ? `${bar / 1000} km` : `${bar} m`}</text></g>`);
  parts.push(`<g transform="translate(${width - 20} 22)"><polygon points="0,-12 5,2 0,-2 -5,2" fill="#222"/><text x="0" y="14" text-anchor="middle">N</text></g>`);
  parts.push('</svg>');

  const byCoalition: Record<string, Record<string, number>> = {};
  for (const u of units) {
    byCoalition[u.coalition] ??= {};
    byCoalition[u.coalition][u.category] = (byCoalition[u.coalition][u.category] ?? 0) + 1;
  }
  return {
    svg: parts.join('\n'),
    widthPx: width,
    heightPx: height,
    metersPerPx: r1(1 / scale),
    boundsDcs: { minX: Math.round(minX), maxX: Math.round(maxX), minY: Math.round(minY), maxY: Math.round(maxY) },
    counts: { groups: groups.length, units: units.length, humanSlots: units.filter(u => u.human).length, zones: zones.length, unitsByCoalition: byCoalition },
    legend: 'triangle = plane, circle = helicopter, square = vehicle, diamond = ship, hollow square = static, black ring = Client/Player slot, dashed gold = trigger zone. North up; DCS x = north, y = east.',
  };
}
