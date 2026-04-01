import { OpenXEClient } from "../client/openxe-client.js";

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

export const DOCUMENT_READ_TOOL_DEFINITIONS: ToolDefinition[] = [];

export async function handleDocumentReadTool(
  _name: string,
  _args: Record<string, unknown>,
  _client: OpenXEClient
): Promise<ToolResult> {
  return {
    content: [{ type: "text", text: `Unknown document read tool: ${_name}` }],
    isError: true,
  };
}
