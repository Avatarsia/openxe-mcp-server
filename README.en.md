# OpenXE MCP Server

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server that exposes **OpenXE ERP** functionality to LLM-based agents. Reads go through the REST v1 API (resources), writes go through the Legacy API (tools).

## Features

- **30+ MCP tools** for creating and editing ERP records (documents, addresses, subscriptions)
- **19 MCP resources** for reading articles, orders, invoices, stock levels, and more
- **HTTP Digest Auth** compatible with OpenXE's Xentral-API realm
- **Verified** against a live OpenXE v1.12 instance
- **73 unit tests** with Vitest

## Requirements

- Node.js >= 20
- An OpenXE instance with API access enabled

## Quick Start

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test
```

## Configuration

The server reads its config from environment variables:

| Variable | Required | Default | Description |
|---|---|---|---|
| `OPENXE_URL` | Yes | - | Base URL of the OpenXE instance (e.g. `http://your-openxe-host`) |
| `OPENXE_USERNAME` | Yes | - | API username |
| `OPENXE_PASSWORD` | Yes | - | API password |
| `OPENXE_API_PATH` | No | `/api/index.php` | API endpoint path |
| `OPENXE_TIMEOUT` | No | `30000` | Request timeout in ms |

## Usage with Claude Desktop

Copy `claude-desktop-config.example.json` into your Claude Desktop config and adjust the paths and credentials:

```json
{
  "mcpServers": {
    "openxe": {
      "command": "npx",
      "args": ["tsx", "/path/to/openxe-mcp-server/src/index.ts"],
      "env": {
        "OPENXE_URL": "http://your-openxe-host",
        "OPENXE_USERNAME": "user",
        "OPENXE_PASSWORD": "pass"
      }
    }
  }
}
```

## Usage with Claude Code

Add the MCP server via the CLI:

```bash
claude mcp add openxe -- npx tsx /path/to/openxe-mcp-server/src/index.ts
```

Set the required environment variables in your shell before launching Claude Code.

## Project Structure

```
src/
  index.ts          # MCP server entry point
  config.ts         # Environment variable parsing (Zod)
  client/           # HTTP Digest Auth client for OpenXE
  tools/            # MCP tool handlers (writes via Legacy API)
  resources/        # MCP resource handlers (reads via REST v1)
  schemas/          # Zod schemas for request validation
tests/
  client/           # HTTP client unit tests
  tools/            # Tool handler tests
  resources/        # Resource handler tests
  integration/      # Integration test stubs
docs/
  api-reference/    # Verified OpenXE API documentation
  llm/              # LLM-optimized API reference
  SKILL.md          # Claude Code skill definition
```

## API Documentation

The `docs/api-reference/` directory contains verified API documentation covering:

- **AUTH.md** -- HTTP Digest authentication flow
- **LEGACY-API.md** -- Legacy write API (used by tools)
- **REST-V1-STAMMDATEN.md** -- Master data endpoints
- **REST-V1-BELEGE.md** -- Document endpoints (orders, invoices, etc.)
- **REST-V1-SONSTIGE.md** -- Other REST endpoints
- **SPEZIAL-APIS.md** -- Special API endpoints

All documentation was verified against a live OpenXE v1.12 instance.

## License

MIT -- see [LICENSE](LICENSE).
