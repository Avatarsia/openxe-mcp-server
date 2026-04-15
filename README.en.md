# OpenXE MCP Server

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server that exposes **OpenXE ERP** functionality to LLM-based agents. Reads go through the REST v1 API (resources), writes go through the Legacy API (tools).

## Features

- **52+ MCP tools** for creating and editing ERP records (documents, addresses, procurement, subscriptions, reports)
- **19 MCP resources** for reading articles, orders, invoices, stock levels, and more
- **Document editing:** Modify orders, invoices, quotes, delivery notes, credit memos after creation
- **Expanded schemas:** waehrung, internebezeichnung, versandart, ustid, lieferantennummer fields on creation
- **Procurement tools:** Purchase orders (create, edit, release, list with smart filters), purchase prices via `get-article` with `includeEinkaufspreise=true`, dashboard KPIs (open orders, monthly order volume)
- **Reports:** Revenue, Open Items, Aging Analysis, Stock Overview, Reorder Alerts, Stock Value, Procurement, Period Comparison
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
| `MCP_ALLOWED_ORIGINS` | No | - | Comma-separated allowed origins for HTTP transport (DNS rebinding protection) |
| `OPENXE_AUDIT_LOG` | No | - | Set to `1` to enable audit logging of all tool calls to stderr |

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

## Alternative: Local build with `.env` file (Claude Desktop / file-based clients)

If you cloned the repo and built it locally (`npm install && npm run build`), you can keep credentials in a `.env` file inside the project directory instead of hard-coding them into your MCP client configuration. This applies to clients that read a JSON config file (Claude Desktop, Cursor, Cline). For Claude Code use `claude mcp add` as shown above.

A typical `mcpServers` entry looks like this:

```json
{
  "mcpServers": {
    "openxe": {
      "command": "node",
      "args": [
        "<ABSOLUTE-PATH>/openxe-mcp-server/dist/index.js"
      ],
      "cwd": "<ABSOLUTE-PATH>/openxe-mcp-server"
    }
  }
}
```

Important:

- **No `env` block** in the MCP client configuration -- inline values would otherwise override the entries from `.env`.
- **`cwd` is mandatory** and must point at the project directory (`openxe-mcp-server`). `dotenv` loads `.env` from the **current working directory of the process**, not from the directory where `index.js` lives. Without `cwd`, the MCP client launches Node from its own install folder and the `.env` file will not be found.
- **Use `node`, not `npx`** -- `npx -y github:...` would pull the GitHub package into a cache folder every time and ignore your local build.
- Run `npm run build` after any code changes -- the entry point is `dist/index.js`, not the TypeScript sources.

## Smart Filters

All list queries support client-side filters:

- **where:** `{plz: {startsWith: "2"}}`, `{gesamtsumme: {gt: 100}}`, `{land: {equals: "DE"}}`, `{"positionen.nummer": {containsAny: ["ART-001", "ART-002"]}}`
- **New where operators:** `in` (field matches any value in a list), `containsAny` (array field contains at least one of the values), `containsAll` (array field contains all values, AND semantics). All three compare case-insensitively.
- **Dot notation:** field names like `positionen.nummer` iterate over nested array fields of a document. A single condition matches "at least one element". Multiple conditions sharing the same array prefix (e.g. `positionen.nummer` + `positionen.menge`) are paired element-wise — the document only matches if the **same** array element satisfies all of them.
- **sort / limit:** sort results and cap the number of rows
- **zeitraum:** `dieser-monat`, `letzter-monat`, `letzte-30-tage`, `Q1-2026`, `2025`
- **status_preset** — entity-specific; unknown / unsupported values are rejected by the handler:
  - `list-quotes`: `offen` | `angenommen` | `abgelehnt`
  - `list-orders`: `offen` | `entwurf`
  - `list-invoices`: `offen` | `unbezahlt` | `bezahlt` | `ueberfaellig` | `entwurf` | `mahnkandidaten`
  - `list-delivery-notes`, `list-credit-memos`: not supported
  - `list-purchase-orders`: `offen` | `freigegeben` | `bestellt` | `angemahnt` | `empfangen` | `aktiv`
  - For business-query presets (`offene-rechnungen`, `nicht-versendet`, `ueberfaellige-rechnungen`, `ueberfaellige-lieferungen` etc.) use the separate `openxe-business-query` tool / `business-query` action.
- **aggregate:** `count`, `sum_feld`, `avg_feld`, `groupBy_feld`
- **format:** `table`, `csv`, `ids`, `csv-positions` (for documents: emits one CSV row per line item instead of per document, with header fields as a prefix followed by line item fields. When the where filter targets `positionen.*`, only the matching positions are exported.)

Example (router mode) -- find invoices containing article `ART-001` or `ART-002` and export only the matching positions as a line-item-level CSV:

```json
{
  "action": "list-invoices",
  "params": {
    "zeitraum": "2025",
    "where": {
      "positionen.nummer": {"containsAny": ["ART-001", "ART-002"]}
    },
    "format": "csv-positions"
  }
}
```

In `full` mode the same call is invoked directly as the `openxe-list-invoices` tool with the inner `params` object as its arguments.

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
| `MCP_ALLOWED_ORIGINS` | - | Comma-separated allowed origins for HTTP transport (DNS rebinding protection) |
| `OPENXE_AUDIT_LOG` | - | Set to `1` to enable audit logging of all tool calls to stderr |

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

### Audit Logging

```bash
OPENXE_AUDIT_LOG=1 npx -y github:Avatarsia/openxe-mcp-server
```

Logs every tool call with timestamp and parameters to stderr. Sensitive fields (IBAN, PayPal, password) are automatically redacted as `[REDACTED]`.

### Tool Annotations

All tools include MCP Tool Annotations (readOnlyHint, destructiveHint, idempotentHint). MCP clients can use these to automatically warn before destructive actions or execute read-only tools without confirmation.

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
