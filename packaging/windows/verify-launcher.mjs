import path from 'node:path';
import fs from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const launcher = path.resolve(process.argv[2] ?? '');
if (!launcher || !fs.existsSync(launcher)) {
  throw new Error('Usage: node verify-launcher.mjs <path-to-BNS-DCS-MCP.exe>');
}
const expected = 100;
const client = new Client({ name: 'bns-dcs-mcp-package-smoke', version: '0.1.0' }, { capabilities: {} });
const transport = new StdioClientTransport({ command: launcher, args: [], stderr: 'pipe' });
let stderr = '';
transport.stderr?.on('data', chunk => { stderr += chunk; });
const timeout = setTimeout(() => {
  console.error('Timed out verifying BNS-DCS-MCP.exe');
  process.exit(124);
}, 90000);
try {
  await client.connect(transport);
  const response = await client.listTools();
  const names = response.tools.map(tool => tool.name);
  if (names.length !== expected || new Set(names).size !== expected) {
    throw new Error(`Expected ${expected} unique tools, received ${names.length} (${new Set(names).size} unique)`);
  }
  console.log(`BNS-DCS-MCP.exe stdio handshake OK: ${expected} unique tools`);
} catch (error) {
  console.error(stderr);
  throw error;
} finally {
  clearTimeout(timeout);
  await client.close().catch(() => {});
}
