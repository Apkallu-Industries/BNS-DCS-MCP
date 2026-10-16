/**
 * Serializes JavaScript objects back into DCS-compatible Lua table constructors.
 * Produces output matching DCS Mission Editor formatting conventions.
 */
export class LuaSerializer {
  static serialize(obj: any, indentLevel: number = 0): string {
    const indent = '\t'.repeat(indentLevel);
    const inner = '\t'.repeat(indentLevel + 1);

    if (obj === null || obj === undefined) return 'nil';
    if (typeof obj === 'boolean') return obj ? 'true' : 'false';

    if (typeof obj === 'number') {
      if (!Number.isFinite(obj)) return '0';
      return String(obj);
    }

    if (typeof obj === 'string') {
      const escaped = obj
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t');
      return `"${escaped}"`;
    }

    if (Array.isArray(obj)) {
      if (obj.length === 0) return '{}';
      const lines = ['{\n'];
      for (let i = 0; i < obj.length; i++) {
        lines.push(`${inner}[${i + 1}] = ${this.serialize(obj[i], indentLevel + 1)},\n`);
      }
      lines.push(`${indent}}`);
      return lines.join('');
    }

    if (typeof obj === 'object') {
      const keys = Object.keys(obj);
      if (keys.length === 0) return '{}';

      const lines = ['{\n'];
      for (const key of keys) {
        const val = this.serialize(obj[key], indentLevel + 1);
        if (/^\d+$/.test(key)) {
          lines.push(`${inner}[${key}] = ${val},\n`);
        } else if (/^[a-zA-Z_]\w*$/.test(key)) {
          lines.push(`${inner}["${key}"] = ${val},\n`);
        } else {
          lines.push(`${inner}["${key}"] = ${val},\n`);
        }
      }
      lines.push(`${indent}}`);
      return lines.join('');
    }

    return 'nil';
  }

  static serializeToAssignment(varName: string, obj: any): string {
    return `${varName} =\n${this.serialize(obj, 0)}\n`;
  }
}
