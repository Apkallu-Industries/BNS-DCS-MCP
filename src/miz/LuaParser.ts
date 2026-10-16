/**
 * Parses DCS mission Lua table constructors into JavaScript objects.
 *
 * DCS .miz files contain Lua like:
 *   mission = { ["key"] = value, ... }
 *   warehouses = { ... }
 *
 * This parser handles the subset of Lua used by DCS:
 *   - Table constructors with string keys (["key"]) and integer keys ([N])
 *   - String, number, boolean, nil literals
 *   - Nested tables
 *   - Single-line and multi-line comments
 *   - The leading `varname =` assignment wrapper
 */

export class LuaParser {
  private src: string;
  private pos: number;

  constructor(src: string) {
    this.src = src;
    this.pos = 0;
  }

  static parse(src: string): any {
    const parser = new LuaParser(src);
    parser.skipWhitespaceAndComments();

    // Skip leading assignment: `mission =`, `warehouses =`, etc.
    const assignMatch = /^[a-zA-Z_]\w*\s*=\s*/;
    const remaining = parser.src.slice(parser.pos);
    const m = remaining.match(assignMatch);
    if (m) {
      parser.pos += m[0].length;
    }

    parser.skipWhitespaceAndComments();
    return parser.parseValue();
  }

  private parseValue(): any {
    this.skipWhitespaceAndComments();

    if (this.pos >= this.src.length) {
      throw this.error('Unexpected end of input');
    }

    const ch = this.src[this.pos];

    if (ch === '{') return this.parseTable();
    if (ch === '"' || ch === "'") return this.parseString(ch);
    if (ch === '-' || (ch >= '0' && ch <= '9')) return this.parseNumber();

    // Keywords
    if (this.matchKeyword('true')) return true;
    if (this.matchKeyword('false')) return false;
    if (this.matchKeyword('nil')) return null;

    // Unquoted string or identifier (rare in DCS but possible)
    const ident = this.parseIdentifier();
    if (ident !== null) return ident;

    throw this.error(`Unexpected character: ${ch}`);
  }

  private parseTable(): Record<string, any> | any[] {
    this.expect('{');
    this.skipWhitespaceAndComments();

    const entries: Array<{ key: string | number; value: any }> = [];
    let hasStringKeys = false;
    let hasIntKeys = false;
    let maxIntKey = 0;
    let nextImplicitKey = 1;

    while (this.pos < this.src.length && this.src[this.pos] !== '}') {
      this.skipWhitespaceAndComments();
      if (this.src[this.pos] === '}') break;

      const entry = this.parseTableEntry(nextImplicitKey);
      if (entry) {
        entries.push(entry);
        if (entry.implicit) nextImplicitKey++;
        if (typeof entry.key === 'number') {
          hasIntKeys = true;
          if (entry.key > maxIntKey) maxIntKey = entry.key;
        } else {
          hasStringKeys = true;
        }
      }

      this.skipWhitespaceAndComments();
      // Optional comma or semicolon separator
      if (this.pos < this.src.length && (this.src[this.pos] === ',' || this.src[this.pos] === ';')) {
        this.pos++;
      }
      this.skipWhitespaceAndComments();
    }

    this.expect('}');

    // Decide representation: if ALL keys are consecutive integers 1..N, produce an array.
    // Otherwise produce an object. DCS uses 1-based Lua indexing.
    if (hasIntKeys && !hasStringKeys && entries.length > 0) {
      const allConsecutive = entries.length === maxIntKey &&
        entries.every(e => typeof e.key === 'number');
      if (allConsecutive) {
        const arr: any[] = new Array(maxIntKey);
        for (const e of entries) {
          arr[(e.key as number) - 1] = e.value;
        }
        return arr;
      }
    }

    // Object representation — preserve both string and numeric keys
    const obj: Record<string, any> = {};
    for (const e of entries) {
      obj[String(e.key)] = e.value;
    }
    return obj;
  }

  private parseTableEntry(implicitKey: number): { key: string | number; value: any; implicit?: boolean } | null {
    this.skipWhitespaceAndComments();

    if (this.src[this.pos] === '[') {
      // Keyed entry: ["key"] = value  or  [N] = value
      this.pos++; // skip [
      this.skipWhitespaceAndComments();

      let key: string | number;

      if (this.src[this.pos] === '"' || this.src[this.pos] === "'") {
        key = this.parseString(this.src[this.pos]);
      } else {
        key = this.parseNumber() as number;
      }

      this.skipWhitespaceAndComments();
      this.expect(']');
      this.skipWhitespaceAndComments();
      this.expect('=');
      this.skipWhitespaceAndComments();

      const value = this.parseValue();
      return { key, value };
    }

    // Implicit integer key (positional entry in array-like table).
    // Preserve it exactly instead of silently discarding data during round-trip edits.
    const value = this.parseValue();
    return { key: implicitKey, value, implicit: true };
  }

  private parseString(quote: string): string {
    this.expect(quote);
    let result = '';

    while (this.pos < this.src.length && this.src[this.pos] !== quote) {
      if (this.src[this.pos] === '\\') {
        this.pos++;
        if (this.pos >= this.src.length) throw this.error('Unterminated string escape');
        const esc = this.src[this.pos];
        switch (esc) {
          case 'n': result += '\n'; break;
          case 'r': result += '\r'; break;
          case 't': result += '\t'; break;
          case '\\': result += '\\'; break;
          case '"': result += '"'; break;
          case "'": result += "'"; break;
          case '\n': result += '\n'; break;
          default:
            // Numeric escape \DDD
            if (esc >= '0' && esc <= '9') {
              let numStr = esc;
              for (let i = 0; i < 2 && this.pos + 1 < this.src.length; i++) {
                const next = this.src[this.pos + 1];
                if (next >= '0' && next <= '9') {
                  numStr += next;
                  this.pos++;
                } else break;
              }
              result += String.fromCharCode(parseInt(numStr, 10));
            } else {
              result += esc;
            }
        }
      } else {
        result += this.src[this.pos];
      }
      this.pos++;
    }

    this.expect(quote);
    return result;
  }

  private parseNumber(): number {
    const start = this.pos;

    if (this.src[this.pos] === '-') this.pos++;

    // Hex
    if (this.pos + 1 < this.src.length && this.src[this.pos] === '0' &&
        (this.src[this.pos + 1] === 'x' || this.src[this.pos + 1] === 'X')) {
      this.pos += 2;
      while (this.pos < this.src.length && /[0-9a-fA-F]/.test(this.src[this.pos])) this.pos++;
      return Number(this.src.slice(start, this.pos));
    }

    // Integer / float
    while (this.pos < this.src.length && this.src[this.pos] >= '0' && this.src[this.pos] <= '9') {
      this.pos++;
    }

    if (this.pos < this.src.length && this.src[this.pos] === '.') {
      this.pos++;
      while (this.pos < this.src.length && this.src[this.pos] >= '0' && this.src[this.pos] <= '9') {
        this.pos++;
      }
    }

    // Exponent
    if (this.pos < this.src.length && (this.src[this.pos] === 'e' || this.src[this.pos] === 'E')) {
      this.pos++;
      if (this.pos < this.src.length && (this.src[this.pos] === '+' || this.src[this.pos] === '-')) {
        this.pos++;
      }
      while (this.pos < this.src.length && this.src[this.pos] >= '0' && this.src[this.pos] <= '9') {
        this.pos++;
      }
    }

    const numStr = this.src.slice(start, this.pos);
    const num = Number(numStr);
    if (isNaN(num)) throw this.error(`Invalid number: ${numStr}`);
    return num;
  }

  private matchKeyword(kw: string): boolean {
    if (this.src.startsWith(kw, this.pos)) {
      const afterPos = this.pos + kw.length;
      if (afterPos >= this.src.length || !/[a-zA-Z0-9_]/.test(this.src[afterPos])) {
        this.pos = afterPos;
        return true;
      }
    }
    return false;
  }

  private parseIdentifier(): string | null {
    if (!/[a-zA-Z_]/.test(this.src[this.pos])) return null;
    const start = this.pos;
    while (this.pos < this.src.length && /[a-zA-Z0-9_]/.test(this.src[this.pos])) {
      this.pos++;
    }
    return this.src.slice(start, this.pos);
  }

  private skipWhitespaceAndComments(): void {
    while (this.pos < this.src.length) {
      // Whitespace
      if (/\s/.test(this.src[this.pos])) {
        this.pos++;
        continue;
      }

      // Line comment: -- ...
      if (this.src[this.pos] === '-' && this.pos + 1 < this.src.length && this.src[this.pos + 1] === '-') {
        // Check for block comment: --[[ ... ]]
        if (this.src.startsWith('--[[', this.pos)) {
          const endIdx = this.src.indexOf(']]', this.pos + 4);
          this.pos = endIdx === -1 ? this.src.length : endIdx + 2;
        } else {
          while (this.pos < this.src.length && this.src[this.pos] !== '\n') this.pos++;
        }
        continue;
      }

      break;
    }
  }

  private expect(ch: string): void {
    if (this.pos >= this.src.length || this.src[this.pos] !== ch) {
      const got = this.pos < this.src.length ? this.src[this.pos] : 'EOF';
      throw this.error(`Expected '${ch}', got '${got}'`);
    }
    this.pos++;
  }

  private error(msg: string): Error {
    const lineNum = this.src.slice(0, this.pos).split('\n').length;
    const col = this.pos - this.src.lastIndexOf('\n', this.pos - 1);
    return new Error(`LuaParser error at line ${lineNum}, col ${col}: ${msg}`);
  }
}
