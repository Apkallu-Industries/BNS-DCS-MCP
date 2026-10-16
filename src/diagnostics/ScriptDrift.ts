import * as crypto from 'node:crypto';
import { asArray, type MizSession } from '../miz/MizSession.js';
import { isFrameworkFile, type LuaSource } from './LuaScriptLint.js';

/**
 * What scripts a mission runs at start and whether they are the scripts in the repo:
 *  - load order from both trigger tables: `trigrules` (what the Mission Editor shows) and the
 *    compiled `trig` table (what DCS executes), and whether they agree;
 *  - trigger comments that do not name the file they load (bug B2 in the engineering memory);
 *  - embedded scripts compared with packages/runtime/src: identical, differing, mission-only,
 *    source-only (bugs B3/B4).
 */

export interface LoadStep {
  order: number;
  comment: string;
  predicate: string;
  kind: 'file' | 'inline';
  resKey: string | null;
  file: string | null;
  archivePath: string | null;
  /** Code of an inline a_do_script action (not returned by audit_script_drift). */
  inlineCode?: string;
}

const sha = (text: string) => crypto.createHash('sha256').update(text).digest('hex');
const normalizeEol = (text: string) => text.replace(/\r\n/g, '\n');
const basename = (p: string) => p.split(/[\\/]/).pop() ?? p;

/** Mission-start script loads (triggerStart rules) in order, resolving ResKeys through mapResource. */
export function missionScriptLoadOrder(session: MizSession): LoadStep[] {
  const mapResource = session.mapResource ?? {};
  const entries = session.listZipEntries();
  const steps: LoadStep[] = [];
  for (const rule of asArray<any>((session.mission as any).trigrules)) {
    if (rule?.predicate !== 'triggerStart') continue;
    for (const action of asArray<any>(rule.actions)) {
      if (action?.predicate === 'a_do_script_file') {
        const file = mapResource[action.file] ?? null;
        steps.push({
          order: steps.length + 1, comment: String(rule.comment ?? ''), predicate: 'a_do_script_file', kind: 'file',
          resKey: action.file ?? null, file,
          archivePath: file ? entries.find(e => basename(e) === file) ?? null : null,
        });
      } else if (action?.predicate === 'a_do_script') {
        steps.push({ order: steps.length + 1, comment: String(rule.comment ?? ''), predicate: 'a_do_script', kind: 'inline', resKey: null, file: null, archivePath: null, inlineCode: String(action.text ?? '') });
      }
    }
  }
  return steps;
}

/** ResKeys in the order the compiled trig table loads them (trig.actions / funcStartup). */
function compiledLoadOrder(session: MizSession): string[] {
  const trig: any = (session.mission as any).trig ?? {};
  const texts = [...asArray<string>(trig.actions), ...asArray<string>(trig.funcStartup)].filter(t => typeof t === 'string');
  const keys: string[] = [];
  for (const t of texts) for (const m of t.matchAll(/a_do_script_file\(getValueResourceByKey\("([^"]+)"\)\)/g)) if (!keys.includes(m[1])) keys.push(m[1]);
  return keys;
}

const STOP_WORDS = new Set(['load', 'execute', 'run', 'init', 'initialize', 'start', 'script', 'scripts', 'system', 'systems', 'controller', 'module', 'blackhorse', 'black', 'horse', 'the', 'and', 'lua']);
function words(text: string): string[] {
  return text.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 3 && !/^\d+$/.test(w) && !STOP_WORDS.has(w));
}

/** True when the trigger comment shares no significant word with the file it loads. */
export function labelMismatch(comment: string, file: string): boolean {
  const c = words(comment);
  const f = words(file.replace(/\.lua$/i, ''));
  if (!c.length || !f.length) return false;
  return !c.some(w => f.some(x => x.includes(w) || w.includes(x)));
}

function lineDelta(a: string, b: string) {
  const count = (t: string) => {
    const m = new Map<string, number>();
    for (const l of normalizeEol(t).split('\n')) m.set(l, (m.get(l) ?? 0) + 1);
    return m;
  };
  const ca = count(a);
  const cb = count(b);
  let onlyInMission = 0;
  let onlyInSource = 0;
  for (const [l, n] of ca) onlyInMission += Math.max(0, n - (cb.get(l) ?? 0));
  for (const [l, n] of cb) onlyInSource += Math.max(0, n - (ca.get(l) ?? 0));
  return { linesOnlyInMission: onlyInMission, linesOnlyInSource: onlyInSource };
}

export async function auditScriptDrift(session: MizSession, source: LuaSource[] | null) {
  const steps = missionScriptLoadOrder(session);
  const compiled = compiledLoadOrder(session);
  const editorKeys = steps.filter(s => s.resKey).map(s => s.resKey!);
  const orderAgrees = compiled.length === editorKeys.length && compiled.every((k, i) => k === editorKeys[i]);

  const embedded: LuaSource[] = [];
  for (const p of session.listZipEntries().filter(e => /\.lua$/i.test(e))) {
    const text = await session.getZipEntry(p);
    if (text != null) embedded.push({ path: p, text });
  }
  const loadedFiles = new Set(steps.map(s => s.file).filter(Boolean) as string[]);
  const firstFramework = steps.findIndex(s => s.file && isFrameworkFile(s.file));
  const lastFramework = steps.reduce((n, s, i) => (s.file && isFrameworkFile(s.file) ? i : n), -1);

  const loadOrder = steps.map(({ inlineCode, ...s }, i) => ({
    ...s,
    ...(inlineCode != null ? { inlineCodeChars: inlineCode.length } : {}),
    labelMismatch: s.file ? labelMismatch(s.comment, s.file) : false,
    missingFromArchive: s.kind === 'file' && !s.archivePath,
    loadedBeforeFrameworks: s.file != null && !isFrameworkFile(s.file) && lastFramework >= 0 && i < lastFramework,
  }));

  let comparison: any = { checked: false, reason: 'No source directory found (pass sourceDir, or run from a repo checkout with packages/runtime/src).' };
  if (source) {
    const bySource = new Map(source.map(s => [basename(s.path), s]));
    const identical: string[] = [];
    const differs: Array<{ file: string; loaded: boolean; linesOnlyInMission: number; linesOnlyInSource: number }> = [];
    const missionOnly: string[] = [];
    for (const e of embedded) {
      const name = basename(e.path);
      if (isFrameworkFile(name)) continue;
      const src = bySource.get(name);
      if (!src) { missionOnly.push(name); continue; }
      if (sha(normalizeEol(src.text)) === sha(normalizeEol(e.text))) identical.push(name);
      else differs.push({ file: name, loaded: loadedFiles.has(name), ...lineDelta(e.text, src.text) });
    }
    const embeddedNames = new Set(embedded.map(e => basename(e.path)));
    comparison = {
      checked: true,
      sourceFiles: source.length,
      identical,
      differs,
      missionOnly,
      sourceOnly: source.map(s => basename(s.path)).filter(n => !embeddedNames.has(n) && !isFrameworkFile(n)).sort(),
      note: 'Line counts are a multiset comparison (lines present in one version and not the other), not a positional diff. Line endings are normalised.',
    };
  }

  const findings: string[] = [];
  if (!orderAgrees) findings.push(`trigrules (editor) and the compiled trig table (what DCS runs) list different script loads: ${editorKeys.length} vs ${compiled.length}, or a different order. Re-save the mission in the Mission Editor or regenerate trig from trigrules.`);
  const mismatched = loadOrder.filter(s => s.labelMismatch);
  if (mismatched.length) findings.push(`${mismatched.length} trigger comment(s) do not name the file they load (e.g. "${mismatched[0].comment}" loads ${mismatched[0].file}).`);
  const missing = loadOrder.filter(s => s.missingFromArchive);
  if (missing.length) findings.push(`${missing.length} script load(s) point to a file that is not in the archive: ${missing.map(s => s.file ?? s.resKey).join(', ')}.`);
  const early = loadOrder.filter(s => s.loadedBeforeFrameworks);
  if (early.length) findings.push(`${early.length} project script(s) load before the last framework file (MIST/MOOSE): ${early.map(s => s.file).join(', ')}.`);
  if (firstFramework > 0) findings.push('The first script loaded is not a framework file.');
  const notLoaded = embedded.map(e => basename(e.path)).filter(n => !loadedFiles.has(n) && !isFrameworkFile(n));
  if (notLoaded.length) findings.push(`${notLoaded.length} embedded script(s) are never loaded by a mission-start trigger: ${notLoaded.slice(0, 10).join(', ')}${notLoaded.length > 10 ? ', ...' : ''}.`);
  if (comparison.checked && comparison.differs.length) findings.push(`${comparison.differs.length} embedded script(s) differ from packages/runtime/src; a rebuilt mission would ship the source versions, not these.`);

  return {
    scriptsLoadedAtStart: steps.filter(s => s.kind === 'file').length,
    inlineScriptActions: steps.filter(s => s.kind === 'inline').length,
    editorAndCompiledOrderAgree: orderAgrees,
    loadOrder,
    embeddedScriptsNotLoadedAtStart: notLoaded,
    sourceComparison: comparison,
    findings,
  };
}
