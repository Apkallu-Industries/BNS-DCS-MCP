import { z } from 'zod';
import { SessionStore } from '../miz/SessionStore.js';

/**
 * Session-argument resilience at the MCP boundary.
 *
 * Some MCP relays (seen 2026-10-22 on a remote-device bridge) strip an argument named `session_id` before it reaches
 * the server, so every session tool failed with "Required at session_id" although the client sent it. The MCP-facing
 * schema of a session tool therefore also accepts the aliases below, and when none arrives and exactly one mission is
 * open, that session is used. Tool handlers still receive `session_id` exactly as before.
 */
export const SESSION_ALIASES = ['sessionId', 'miz_id'] as const;

export interface SessionShape {
  shape: Record<string, z.ZodTypeAny>;
  hasSession: boolean;
  sessionRequired: boolean;
}

/** MCP-facing shape: `session_id` made optional (requiredness enforced in resolveSessionArgs) plus the aliases. */
export function withSessionAliases(shape: Record<string, z.ZodTypeAny>): SessionShape {
  const base = shape.session_id;
  if (!base) return { shape, hasSession: false, sessionRequired: false };
  const sessionRequired = !base.isOptional();
  const out: Record<string, z.ZodTypeAny> = { ...shape, session_id: base.isOptional() ? base : base.optional() };
  for (const alias of SESSION_ALIASES) {
    if (!(alias in out)) {
      out[alias] = z.string().optional().describe(`Alias of session_id (for clients or relays that drop session_id).`);
    }
  }
  return { shape: out, hasSession: true, sessionRequired };
}

/** Map an alias onto session_id; for a tool that requires a session, fall back to the only open session. */
export function resolveSessionArgs(args: Record<string, any> | undefined, sessions: SessionStore,
                                   sessionRequired: boolean): Record<string, any> {
  const a: Record<string, any> = { ...(args ?? {}) };
  let id: unknown = a.session_id;
  for (const alias of SESSION_ALIASES) {
    if ((id === undefined || id === '') && typeof a[alias] === 'string' && a[alias] !== '') id = a[alias];
    delete a[alias];
  }
  if ((id === undefined || id === '') && sessionRequired) {
    const open = sessions.list();
    if (open.length === 1) {
      id = open[0].sessionId;
    } else {
      const hint = open.length > 1
        ? `${open.length} sessions are open (${open.map((s) => s.sessionId).join(', ')}), so one must be named.`
        : 'No sessions are open. Call open_miz or new_miz first.';
      throw new Error(`session_id is required (also accepted as ${SESSION_ALIASES.join(' or ')}). ${hint}`);
    }
  }
  if (id !== undefined && id !== '') a.session_id = id;
  else delete a.session_id;
  return a;
}
