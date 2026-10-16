import { MizSession } from './MizSession.js';

export class SessionStore {
  private sessions = new Map<string, MizSession>();

  add(session: MizSession): void {
    this.sessions.set(session.sessionId, session);
  }

  get(sessionId: string): MizSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      const ids = [...this.sessions.keys()];
      const hint = ids.length > 0
        ? `Active sessions: ${ids.join(', ')}`
        : 'No sessions are open. Call open_miz or new_miz first.';
      throw new Error(`Unknown session_id "${sessionId}". ${hint}`);
    }
    return session;
  }

  remove(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  list(): MizSession[] {
    return [...this.sessions.values()];
  }

  has(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  get size(): number {
    return this.sessions.size;
  }
}
