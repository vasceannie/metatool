import axios from "axios";
import { StdioServerParameters } from "@modelcontextprotocol/sdk/client/stdio.js";
import { getDefaultEnvironment } from "./utils.js";

let _mcpServersCache: Record<string, StdioServerParameters> | null = null;
const METAMCP_API_BASE_URL =
  process.env.METAMCP_API_BASE_URL || "https://metamcp.com";

export async function getMcpServers(
  forceRefresh: boolean = false
): Promise<Record<string, StdioServerParameters>> {
  if (!forceRefresh && _mcpServersCache !== null) {
    return _mcpServersCache;
  }

  try {
    const headers = { Authorization: `Bearer ${process.env.METAMCP_API_KEY}` };
    const response = await axios.get(
      `${METAMCP_API_BASE_URL}/api/mcp-servers`,
      { headers }
    );
    const data = response.data;

    const serverDict: Record<string, StdioServerParameters> = {};
    for (const params of data) {
      if ("args" in params && !params.args) {
        params.args = undefined;
      }

      params.env = {
        ...getDefaultEnvironment(),
        ...(params.env || {}),
      };

      const serverParams: StdioServerParameters = {
        ...params,
        env: {
          ...getDefaultEnvironment(),
          ...(params.env || {}),
        },
      };
      const uuid = params.uuid;
      if (uuid) {
        serverDict[uuid] = serverParams;
      }
    }

    _mcpServersCache = serverDict;
    return serverDict;
  } catch (error) {
    if (_mcpServersCache !== null) {
      return _mcpServersCache;
    }
    return {};
  }
}
