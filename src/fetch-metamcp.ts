import axios from "axios";
import { StdioServerParameters } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  getDefaultEnvironment,
  getMetaMcpApiBaseUrl,
  getMetaMcpApiKey,
} from "./utils.js";

let _mcpServersCache: Record<string, StdioServerParameters> | null = null;

export async function getMcpServers(
  forceRefresh: boolean = false
): Promise<Record<string, StdioServerParameters>> {
  if (!forceRefresh && _mcpServersCache !== null) {
    return _mcpServersCache;
  }

  try {
    const apiKey = getMetaMcpApiKey();
    const apiBaseUrl = getMetaMcpApiBaseUrl();

    if (!apiKey) {
      console.error(
        "METAMCP_API_KEY is not set. Please set it via environment variable or command line argument."
      );
      return _mcpServersCache || {};
    }

    const headers = { Authorization: `Bearer ${apiKey}` };
    const response = await axios.get(`${apiBaseUrl}/api/mcp-servers`, {
      headers,
    });
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
