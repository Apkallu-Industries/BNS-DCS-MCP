import * as crypto from 'node:crypto';
import { lauxlib, lua, to_luastring } from 'fengari';

/**
 * Offline checks for DCS mission Lua: syntax (fengari), Lua 5.1 compatibility, known DCS load
 * hazards, and calls into MOOSE / MIST / CTLD checked against an index of the framework source.
 *
 * fengari implements Lua 5.3 while DCS runs Lua 5.1, so a clean fengari parse is necessary but not
 * sufficient: the 5.3-only syntax scan below covers the difference.
 */

export interface LuaSource { path: string; text: string }

export interface LintFinding {
  severity: 'error' | 'warning';
  rule: 'syntax' | 'lua51_incompatible' | 'four_byte_character' | 'unknown_framework_call' | 'known_issue';
  file: string;
  line: number;
  message: string;
  suggestions?: string[];
}

/** Framework libraries shipped inside missions, matched on the file's base name. */
export const FRAMEWORK_FILE_PATTERN = /^(moose(_include)?|moose_|mist(_\d+)*|ctld|csar)\.lua$/i;
export const isFrameworkFile = (path: string) => FRAMEWORK_FILE_PATTERN.test(path.split(/[\\/]/).pop() ?? path);

// ---------------------------------------------------------------------------------------------
// Lexical pass: blank out comments and strings (keeping newlines) and collect string literals.
// ---------------------------------------------------------------------------------------------

interface Stripped { code: string; strings: Array<{ line: number; value: string }> }

function longBracketLevel(text: string, i: number): number {
  // Returns the level of a long bracket "[==[" starting at i, or -1.
  if (text[i] !== '[') return -1;
  let j = i + 1;
  while (text[j] === '=') j++;
  return text[j] === '[' ? j - i - 1 : -1;
}

export function stripLua(text: string): Stripped {
  const out: string[] = [];
  const strings: Stripped['strings'] = [];
  let line = 1;
  let i = 0;
  const blank = (s: string) => s.replace(/[^\n]/g, ' ');
  const push = (s: string) => { out.push(s); line += (s.match(/\n/g) ?? []).length; };

  while (i < text.length) {
    const c = text[i];
    if (c === '-' && text[i + 1] === '-') {
      const level = longBracketLevel(text, i + 2);
      if (level >= 0) {
        const close = ']' + '='.repeat(level) + ']';
        const end = text.indexOf(close, i + 4 + level);
        const stop = end === -1 ? text.length : end + close.length;
        push(blank(text.slice(i, stop)));
        i = stop;
      } else {
        const end = text.indexOf('\n', i);
        const stop = end === -1 ? text.length : end;
        push(blank(text.slice(i, stop)));
        i = stop;
      }
      continue;
    }
    const level = longBracketLevel(text, i);
    if (level >= 0) {
      const close = ']' + '='.repeat(level) + ']';
      const end = text.indexOf(close, i + 2 + level);
      const stop = end === -1 ? text.length : end + close.length;
      strings.push({ line, value: text.slice(i + 2 + level, end === -1 ? text.length : end) });
      push(blank(text.slice(i, stop)));
      i = stop;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < text.length && text[j] !== c && text[j] !== '\n') j += text[j] === '\\' ? 2 : 1;
      const stop = Math.min(j + 1, text.length);
      strings.push({ line, value: text.slice(i + 1, j) });
      push(blank(text.slice(i, stop)));
      i = stop;
      continue;
    }
    out.push(c);
    if (c === '\n') line++;
    i++;
  }
  return { code: out.join(''), strings };
}

// ---------------------------------------------------------------------------------------------
// Syntax and compatibility checks
// ---------------------------------------------------------------------------------------------

export function checkLuaSyntax(source: LuaSource): LintFinding | null {
  const L = lauxlib.luaL_newstate();
  try {
    const status = lauxlib.luaL_loadbuffer(L, to_luastring(source.text), null, to_luastring(`=${source.path}`));
    if (status === lua.LUA_OK) return null;
    const message = String(lua.lua_tojsstring(L, -1));
    const m = /^[^:]*:(\d+): (.*)$/s.exec(message);
    return { severity: 'error', rule: 'syntax', file: source.path, line: m ? Number(m[1]) : 0, message: m ? m[2] : message };
  } finally {
    lua.lua_close(L);
  }
}

const LUA53_ONLY: Array<{ re: RegExp; what: string }> = [
  { re: /\/\//, what: 'floor division operator "//"' },
  { re: /<<|>>/, what: 'bit shift operator' },
  { re: /&/, what: 'bitwise AND operator "&"' },
  { re: /\|/, what: 'bitwise OR operator "|"' },
  { re: /~(?!=)/, what: 'bitwise XOR/NOT operator "~"' },
  { re: /\bgoto\b/, what: '"goto" statement' },
  { re: /::\s*[A-Za-z_]\w*\s*::/, what: 'goto label "::name::"' },
];

export function checkLua51Compatibility(source: LuaSource, stripped = stripLua(source.text)): LintFinding[] {
  const findings: LintFinding[] = [];
  stripped.code.split('\n').forEach((codeLine, idx) => {
    for (const { re, what } of LUA53_ONLY) {
      if (re.test(codeLine)) {
        findings.push({ severity: 'error', rule: 'lua51_incompatible', file: source.path, line: idx + 1, message: `${what} is Lua 5.2+/5.3 syntax; DCS runs Lua 5.1 and will fail to load this script.` });
      }
    }
  });
  for (const s of stripped.strings) {
    if ([...s.value].some(ch => (ch.codePointAt(0) ?? 0) > 0xffff)) {
      findings.push({ severity: 'warning', rule: 'four_byte_character', file: source.path, line: s.line, message: 'String literal contains a 4-byte UTF-8 character (e.g. an emoji). DCS has failed on these in F10 menu text (docs/DCS_MISSION_HANGS_AND_LUA_ERRORS.md).' });
    }
  }
  return findings;
}

/** Script-level patterns of incidents in docs/DCS_MISSION_HANGS_AND_LUA_ERRORS.md. */
const KNOWN_SCRIPT_HAZARDS: Array<{ re: RegExp; message: string }> = [
  { re: /:SetRadio\(\s*[\d.]+\s*,\s*\d+\s*\)/, message: 'Known issue #17: SetRadio(freq, <number>) passes a numeric modulation; MOOSE indexes it as a string ("AM"/"FM") and crashes (RECOVERYTANKER on record).' },
];

export function checkKnownScriptHazards(source: LuaSource, stripped = stripLua(source.text)): LintFinding[] {
  const findings: LintFinding[] = [];
  stripped.code.split('\n').forEach((codeLine, idx) => {
    for (const h of KNOWN_SCRIPT_HAZARDS) if (h.re.test(codeLine)) findings.push({ severity: 'warning', rule: 'known_issue', file: source.path, line: idx + 1, message: h.message });
  });
  return findings;
}

// ---------------------------------------------------------------------------------------------
// Framework API index
// ---------------------------------------------------------------------------------------------

export interface FrameworkMethod {
  className: string;
  name: string;
  separator: ':' | '.';
  params: string[];
  file: string;
  line: number;
  doc: string;
  /** True for FSM events generated by AddTransition (Event, __Event, OnBefore/OnAfterEvent). */
  generated?: boolean;
}

export interface FrameworkClass {
  name: string;
  parent: string | null;
  file: string;
  line: number;
  methods: Map<string, FrameworkMethod>;
}

export interface FrameworkApiIndex {
  sources: Array<{ path: string; sha256: string; lines: number }>;
  classes: Map<string, FrameworkClass>;
}

const FUNC_DECL = /^\s*function\s+([A-Za-z_][\w.]*)([:.])([A-Za-z_]\w*)\s*\(([^)]*)\)/;
const ASSIGN_DECL = /^\s*([A-Za-z_][\w.]*)\.([A-Za-z_]\w*)\s*=\s*function\s*\(([^)]*)\)/;
const CLASS_DECL = /^([A-Z][A-Z0-9_]*)\s*=\s*\{/;
const INHERIT = /Inherit\(\s*self\s*,\s*([A-Z][A-Z0-9_]*)\s*[:.]\s*New/;
const TRANSITION = /:AddTransition\(\s*(?:["'][^"']*["']|\{[^}]*\})\s*,\s*["']([A-Za-z_]\w*)["']/;

function docAbove(lines: string[], idx: number): string {
  const doc: string[] = [];
  for (let i = idx - 1; i >= 0 && doc.length < 15; i--) {
    const t = lines[i].trim();
    if (!t.startsWith('--')) break;
    doc.unshift(t.replace(/^-+\s?/, ''));
  }
  return doc.join('\n').trim();
}

function ensureClass(index: FrameworkApiIndex, name: string, file: string, line: number): FrameworkClass {
  let cls = index.classes.get(name);
  if (!cls) {
    cls = { name, parent: null, file, line, methods: new Map() };
    index.classes.set(name, cls);
  }
  return cls;
}

export function addSourceToIndex(index: FrameworkApiIndex, source: LuaSource): void {
  const lines = source.text.split(/\r?\n/);
  index.sources.push({ path: source.path, sha256: crypto.createHash('sha256').update(source.text).digest('hex'), lines: lines.length });
  let currentClass: string | null = null;
  lines.forEach((text, idx) => {
    const lineNo = idx + 1;
    const classDecl = CLASS_DECL.exec(text);
    if (classDecl) ensureClass(index, classDecl[1], source.path, lineNo);

    const f = FUNC_DECL.exec(text);
    const a = f ? null : ASSIGN_DECL.exec(text);
    if (f || a) {
      const [className, separator, name, params] = f ? [f[1], f[2] as ':' | '.', f[3], f[4]] : [a![1], '.' as const, a![2], a![3]];
      const cls = ensureClass(index, className, source.path, lineNo);
      if (!cls.methods.has(name) || cls.methods.get(name)!.generated) {
        cls.methods.set(name, {
          className, name, separator, file: source.path, line: lineNo, doc: docAbove(lines, idx),
          params: params.split(',').map(p => p.trim()).filter(Boolean),
        });
      }
      currentClass = className;
      return;
    }
    if (!currentClass) return;
    const inherit = INHERIT.exec(text);
    if (inherit && inherit[1] !== currentClass) {
      const cls = ensureClass(index, currentClass, source.path, lineNo);
      cls.parent ??= inherit[1];
    }
    const transition = TRANSITION.exec(text);
    if (transition) {
      const cls = ensureClass(index, currentClass, source.path, lineNo);
      const event = transition[1];
      for (const name of [event, `__${event}`, `OnBefore${event}`, `OnAfter${event}`]) {
        if (!cls.methods.has(name)) {
          cls.methods.set(name, { className: currentClass, name, separator: ':', params: [], file: source.path, line: lineNo, doc: `FSM event generated by AddTransition("${event}").`, generated: true });
        }
      }
    }
  });
}

export function buildFrameworkIndex(sources: LuaSource[]): FrameworkApiIndex {
  const index: FrameworkApiIndex = { sources: [], classes: new Map() };
  for (const source of sources) addSourceToIndex(index, source);
  return index;
}

/** Walks the class and its ancestors; MOOSE classes without a recorded parent fall back to BASE. */
export function resolveMethod(index: FrameworkApiIndex, className: string, method: string): FrameworkMethod | null {
  const visited = new Set<string>();
  let current: string | null = className;
  while (current && !visited.has(current)) {
    visited.add(current);
    const cls = index.classes.get(current);
    const hit = cls?.methods.get(method);
    if (hit) return hit;
    current = cls?.parent ?? (current !== 'BASE' && index.classes.has('BASE') && /^[A-Z][A-Z0-9_]*$/.test(current) ? 'BASE' : null);
  }
  return null;
}

export function ancestry(index: FrameworkApiIndex, className: string): string[] {
  const chain: string[] = [];
  let current: string | null = className;
  while (current && !chain.includes(current)) {
    chain.push(current);
    current = index.classes.get(current)?.parent ?? null;
  }
  return chain;
}

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1].toLowerCase() === b[j - 1].toLowerCase() ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

export function suggestMethods(index: FrameworkApiIndex, className: string, method: string, limit = 3): string[] {
  const names = new Set<string>();
  for (const cls of ancestry(index, className)) for (const name of index.classes.get(cls)?.methods.keys() ?? []) names.add(name);
  return [...names]
    .map(name => ({ name, d: editDistance(method, name) }))
    .filter(x => x.d <= Math.max(2, Math.floor(method.length / 3)))
    .sort((x, y) => x.d - y.d)
    .slice(0, limit)
    .map(x => `${className}:${x.name}`);
}

/** DCS scripting-engine and Lua standard-library tables: frameworks sometimes patch them, but they are not framework classes. */
const NOT_FRAMEWORK_OWNERS = new Set([
  'env', 'trigger', 'timer', 'world', 'coalition', 'land', 'atmosphere', 'missionCommands', 'coord', 'net', 'radio',
  'Group', 'Unit', 'StaticObject', 'Airbase', 'Object', 'Weapon', 'Controller', 'AI', 'Spot', 'SceneryObject', 'Warehouse',
  'string', 'table', 'math', 'os', 'io', 'lfs', 'socket', 'coroutine', 'debug', 'package', '_G', 'self',
]);

const CALL = /(?<![.:\w])([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\s*([:.])\s*([A-Za-z_]\w*)\s*\(/g;

/**
 * Reports calls written directly on a framework class or table (SPAWN:NewWithAlias(...),
 * mist.utils.round(...)) whose method is not defined in the indexed framework source, its
 * ancestors, or the mission's own extensions. Calls on instances (spawner:Spawn()) cannot be
 * typed statically and are not checked.
 */
export function checkFrameworkCalls(index: FrameworkApiIndex, source: LuaSource, stripped = stripLua(source.text)): LintFinding[] {
  const findings: LintFinding[] = [];
  const locals = new Set([...stripped.code.matchAll(/\blocal\s+([A-Za-z_]\w*)/g)].map(m => m[1]));
  stripped.code.split('\n').forEach((codeLine, idx) => {
    for (const m of codeLine.matchAll(CALL)) {
      const [, owner, , method] = m;
      const root = owner.split('.')[0];
      if (locals.has(root) || NOT_FRAMEWORK_OWNERS.has(root)) continue;
      const cls = index.classes.get(owner);
      if (!cls || cls.methods.size === 0) continue;
      if (resolveMethod(index, owner, method)) continue;
      findings.push({
        severity: 'warning', rule: 'unknown_framework_call', file: source.path, line: idx + 1,
        message: `${owner}${m[2]}${method}() is not defined on ${owner} or its ancestors (${ancestry(index, owner).join(' → ')}) in the indexed framework source.`,
        suggestions: suggestMethods(index, owner, method),
      });
    }
  });
  return findings;
}

export interface LintOptions {
  /** Also parse the framework files themselves with fengari (slow for the 9.7 MB Moose.lua). */
  includeFrameworks?: boolean;
  /** Extra framework sources to index when the mission does not embed them. */
  extraFrameworkSources?: LuaSource[];
}

export function lintMissionScripts(scripts: LuaSource[], options: LintOptions = {}) {
  const frameworks = scripts.filter(s => isFrameworkFile(s.path));
  const project = scripts.filter(s => !isFrameworkFile(s.path));
  const index = buildFrameworkIndex([...frameworks, ...(options.extraFrameworkSources ?? [])]);
  // Methods a mission adds to framework classes (function CTLD:MyHelper()) are legitimate targets.
  for (const s of project) {
    const ext = buildFrameworkIndex([s]);
    for (const [name, cls] of ext.classes) {
      const target = index.classes.get(name);
      if (!target) continue;
      for (const [m, info] of cls.methods) if (!target.methods.has(m)) target.methods.set(m, info);
    }
  }

  const findings: LintFinding[] = [];
  const files: Array<{ path: string; framework: boolean; bytes: number; syntaxOk: boolean | null }> = [];
  for (const s of scripts) {
    const framework = isFrameworkFile(s.path);
    let syntaxOk: boolean | null = null;
    if (!framework || options.includeFrameworks) {
      const syntax = checkLuaSyntax(s);
      syntaxOk = !syntax;
      if (syntax) findings.push(syntax);
    }
    if (!framework) {
      const stripped = stripLua(s.text);
      findings.push(...checkLua51Compatibility(s, stripped));
      findings.push(...checkFrameworkCalls(index, s, stripped));
      findings.push(...checkKnownScriptHazards(s, stripped));
    }
    files.push({ path: s.path, framework, bytes: Buffer.byteLength(s.text), syntaxOk });
  }

  return {
    ok: !findings.some(f => f.severity === 'error'),
    errors: findings.filter(f => f.severity === 'error').length,
    warnings: findings.filter(f => f.severity === 'warning').length,
    frameworkIndex: {
      sources: index.sources.map(s => s.path),
      classes: [...index.classes.values()].filter(c => c.methods.size > 0).length,
      methods: [...index.classes.values()].reduce((n, c) => n + c.methods.size, 0),
    },
    files,
    findings,
    limits: [
      'fengari parses Lua 5.3; Lua 5.1 differences are covered by the 5.3-only syntax scan, not by a 5.1 parser.',
      'Only calls written on a framework class or table name are checked; calls on instances are not typed.',
      'No framework source in the mission (and none supplied) means framework calls are not checked.',
    ],
  };
}
