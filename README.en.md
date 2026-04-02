# OpenXE MCP Server

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server that exposes **OpenXE ERP** functionality to LLM-based agents. Reads go through the REST v1 API (resources), writes go through the Legacy API (tools).

## Features

- **47+ MCP tools** for creating and editing ERP records (documents, addresses, procurement, subscriptions)
- **19 MCP resources** for reading articles, orders, invoices, stock levels, and more
- **Document editing:** Modify orders, invoices, quotes, delivery notes, credit memos after creation
- **Expanded schemas:** waehrung, internebezeichnung, versandart, ustid, lieferantennummer fields on creation
- **Procurement tools:** Purchase orders (create, edit, release, list with smart filters), purchase prices via `get-article` with `includeEinkaufspreise=true`, dashboard KPIs (open orders, monthly order volume)
- **HTTP Digest Auth** compatible with OpenXE's Xentral-API realm
- **Verified** against a live OpenXE v1.12 instance
- **73 unit tests** with Vitest

**Procurement workflow:** Find supplier -> Check purchase prices -> Create purchase order -> Release

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
| `OPENXE_MODE` | No | `router` | `router`, `full`, or `readonly` |
| `OPENXE_ALLOW_HTTP` | No | - | Set to `1` to suppress HTTP warning |
| `MCP_AUTH_TOKEN` | No | - | Bearer token for HTTP transport |
| `MCP_HTTP_HOST` | No | `127.0.0.1` | Bind address for HTTP transport |

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

## Security

### Local Operation (Default)

In the default mode (stdio), the MCP server runs as a subprocess of your AI assistant. No network ports are opened -- communication happens via stdin/stdout pipes. No additional security settings are needed for local LAN usage.

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `OPENXE_MODE` | `router` | `router` (2 tools), `full` (all tools individually), `readonly` (read-only -- no write operations) |
| `OPENXE_TIMEOUT` | `30000` | Request timeout in ms -- prevents hanging connections |
| `OPENXE_ALLOW_HTTP` | - | Set to `1` to suppress the HTTP warning (e.g. in LAN) |
| `MCP_AUTH_TOKEN` | - | Bearer token for HTTP transport (only relevant with `--http`) |
| `MCP_HTTP_HOST` | `127.0.0.1` | Bind address for HTTP transport (default: localhost only) |

### Read-Only Mode

```bash
OPENXE_MODE=readonly npx -y github:Avatarsia/openxe-mcp-server
```

Disables all write operations (create, edit, delete, release). Only reading, dashboard KPIs, and business queries are available.

### Securing HTTP Transport

When running the MCP server as a network service via `--http`:

```bash
MCP_AUTH_TOKEN=my-secret-token npx -y github:Avatarsia/openxe-mcp-server -- --http
```

- Binds to `127.0.0.1` by default (localhost only)
- `MCP_HTTP_HOST=0.0.0.0` for network access (only behind a reverse proxy with TLS!)
- `MCP_AUTH_TOKEN` enforces bearer token authentication on the HTTP endpoint

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
