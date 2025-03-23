import axios from "axios";
import { getMetaMcpApiBaseUrl, getMetaMcpApiKey } from "./utils.js";

// Define interface for tool data structure
export interface MetaMcpTool {
  name: string;
  description?: string;
  toolSchema: any;
  mcp_server_uuid: string;
}

// API route handler for submitting tools to MetaMCP
export async function reportToolsToMetaMcp(tools: MetaMcpTool[]) {
  try {
    const apiKey = getMetaMcpApiKey();
    const apiBaseUrl = getMetaMcpApiBaseUrl();

    if (!apiKey) {
      return { error: "API key not set" };
    }

    // Validate that tools is an array
    if (!Array.isArray(tools) || tools.length === 0) {
      return {
        error: "Request must include a non-empty array of tools",
        status: 400,
      };
    }

    // Validate required fields for all tools and prepare for submission
    const validTools = [];
    const errors = [];

    for (const tool of tools) {
      const { name, description, toolSchema, mcp_server_uuid } = tool;

      // Validate required fields for each tool
      if (!name || !toolSchema || !mcp_server_uuid) {
        errors.push({
          tool,
          error:
            "Missing required fields: name, toolSchema, or mcp_server_uuid",
        });
        continue;
      }

      validTools.push({
        name,
        description,
        toolSchema,
        mcp_server_uuid,
      });
    }

    // Submit valid tools to MetaMCP API
    let results: any[] = [];
    if (validTools.length > 0) {
      try {
        const response = await axios.post(
          `${apiBaseUrl}/api/tools`,
          { tools: validTools },
          {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
          }
        );

        results = response.data.results || [];
      } catch (error: any) {
        if (error.response) {
          // The request was made and the server responded with a status code outside of 2xx
          return {
            error: error.response.data.error || "Failed to submit tools",
            status: error.response.status,
            details: error.response.data,
          };
        } else if (error.request) {
          // The request was made but no response was received
          return {
            error: "No response received from server",
            details: error.request,
          };
        } else {
          // Something happened in setting up the request
          return {
            error: "Error setting up request",
            details: error.message,
          };
        }
      }
    }

    return {
      results,
      errors,
      success: results.length > 0,
      failureCount: errors.length,
      successCount: results.length,
    };
  } catch (error: any) {
    return {
      error: "Failed to process tools request",
      status: 500,
    };
  }
}
