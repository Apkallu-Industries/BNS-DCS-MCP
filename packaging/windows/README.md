# BNS-DCS-MCP Windows package

This package is independent of DCS-AI-Frontline. It provides a private Node.js runtime and a
small native launcher that preserves standard input/output for Claude Desktop's MCP stdio
transport. It does not install MongoDB, a JOC server, a Frontline bridge, or a Control Centre.

## Build

The GitHub Actions workflow `.github/workflows/windows-package.yml` builds the executable and
produces a ZIP artifact. The package layout is:

- `BNS-DCS-MCP.exe` — native launcher, no console window
- `runtime/node.exe` — private Node runtime
- `app/dist/` — compiled standalone server
- `app/node_modules/` — production dependencies
- `app/package.json` — runtime dependency manifest

The workflow runs the TypeScript build and tests, compiles the launcher with MSVC, then performs
an MCP stdio handshake against the packaged executable and checks the exact 97-tool registry.

## Claude Desktop configuration

After extracting the ZIP to a stable folder, add the following server entry to the Claude Desktop
configuration file, replacing the example path with the actual absolute path:

```json
{
  "mcpServers": {
    "bns-dcs-mcp": {
      "command": "C:\\BNS\\BNS-DCS-MCP\\BNS-DCS-MCP.exe",
      "args": []
    }
  }
}
```

Fully quit and restart Claude Desktop after editing its configuration. Do not point the entry at
a temporary build directory. This is a packaging scaffold until the Windows workflow completes
successfully and the artifact is tested on a real Windows installation with DCS.
