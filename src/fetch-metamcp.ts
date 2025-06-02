import axios from "axios";
import {
  getDefaultEnvironment,
  getMetaMcpApiBaseUrl,
  getMetaMcpApiKey,
} from "./utils.js";

// Define IOType for stderr handling
export type IOType = "overlapped" | "pipe" | "ignore" | "inherit";

// Define a new interface for server parameters that can be STDIO, SSE or STREAMABLE_HTTP
export interface ServerParameters {
  uuid: string;
  name: string;
  description: string;
  type?: "STDIO" | "SSE" | "STREAMABLE_HTTP"; // Optional field, defaults to "STDIO" when undefined
  command?: string | null;
  args?: string[] | null;
  env?: Record<string, string> | null;
  stderr?: IOType; // Optional field for stderr handling, defaults to "ignore"
  url?: string | null;
  created_at: string;
  profile_uuid: string;
  status: string;
  oauth_tokens?: {
    access_token: string;
    token_type: string;
    expires_in?: number | undefined;
    scope?: string | undefined;
    refresh_token?: string | undefined;
  } | null;
}

let _mcpServersCache: Record<string, ServerParameters> | null = null;
let _mcpServersCacheTimestamp: number = 0;
const CACHE_TTL_MS = 1000; // 1 second cache TTL

export async function getMcpServers(
  forceRefresh: boolean = false
): Promise<Record<string, ServerParameters>> {
  const currentTime = Date.now();
  const cacheAge = currentTime - _mcpServersCacheTimestamp;

  // Use cache if it exists, is not null, and either:
  // 1. forceRefresh is false, or
  // 2. forceRefresh is true but cache is less than 1 second old
  if (_mcpServersCache !== null && (!forceRefresh || cacheAge < CACHE_TTL_MS)) {
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

    const serverDict: Record<string, ServerParameters> = {};
    for (const serverParams of data) {
      const params: ServerParameters = {
        ...serverParams,
        type: serverParams.type || "STDIO",
      };

      // Process based on server type
      if (params.type === "STDIO") {
        if ("args" in params && !params.args) {
          params.args = undefined;
        }

        params.env = {
          ...getDefaultEnvironment(),
          ...(params.env || {}),
        };
      } else if (params.type === "SSE" || params.type === "STREAMABLE_HTTP") {
        // For SSE or STREAMABLE_HTTP servers, ensure url is present
        if (!params.url) {
          console.warn(
            `${params.type} server ${params.uuid} is missing url field, skipping`
          );
          continue;
        }
      }

      const uuid = params.uuid;
      if (uuid) {
        serverDict[uuid] = params;
      }
    }

    _mcpServersCache = serverDict;
    _mcpServersCacheTimestamp = currentTime;
    return serverDict;
  } catch (_error) {
    if (_mcpServersCache !== null) {
      return _mcpServersCache;
    }
    return {};
  }
}
