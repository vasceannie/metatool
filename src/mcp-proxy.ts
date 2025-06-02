import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  Tool,
  ListToolsResultSchema,
  ListPromptsResultSchema,
  ListResourcesResultSchema,
  ReadResourceResultSchema,
  ListResourceTemplatesRequestSchema,
  ListResourceTemplatesResultSchema,
  ResourceTemplate,
  CompatibilityCallToolResultSchema,
  GetPromptResultSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { getMcpServers } from "./fetch-metamcp.js";
import { getSessionKey, sanitizeName } from "./utils.js";
import { cleanupAllSessions, getSession, initSessions } from "./sessions.js";
import { ConnectedClient } from "./client.js";
import { reportToolsToMetaMcp } from "./report-tools.js";
import { getInactiveTools, ToolParameters } from "./fetch-tools.js";
import {
  getProfileCapabilities,
  ProfileCapability,
} from "./fetch-capabilities.js";
import { ToolLogManager } from "./tool-logs.js";

const toolToClient: Record<string, ConnectedClient> = {};
const toolToServerUuid: Record<string, string> = {};
const promptToClient: Record<string, ConnectedClient> = {};
const resourceToClient: Record<string, ConnectedClient> = {};
const inactiveToolsMap: Record<string, boolean> = {};

export const createServer = async () => {
  const server = new Server(
    {
      name: "MetaMCP",
      version: "0.6.5",
    },
    {
      capabilities: {
        prompts: {},
        resources: {},
        tools: {},
      },
    }
  );

  // Initialize sessions in the background when server starts
  initSessions().catch();

  // List Tools Handler
  server.setRequestHandler(ListToolsRequestSchema, async (request) => {
    const profileCapabilities = await getProfileCapabilities(true);
    const serverParams = await getMcpServers(true);

    // Fetch inactive tools only if tools management capability is present
    let inactiveTools: Record<string, ToolParameters> = {};
    if (profileCapabilities.includes(ProfileCapability.TOOLS_MANAGEMENT)) {
      inactiveTools = await getInactiveTools(true);
      // Clear existing inactive tools map before rebuilding
      Object.keys(inactiveToolsMap).forEach(
        (key) => delete inactiveToolsMap[key]
      );
    }

    const allTools: Tool[] = [];

    await Promise.allSettled(
      Object.entries(serverParams).map(async ([uuid, params]) => {
        const sessionKey = getSessionKey(uuid, params);
        const session = await getSession(sessionKey, uuid, params);
        if (!session) return;

        const capabilities = session.client.getServerCapabilities();
        if (!capabilities?.tools) return;

        const serverName = session.client.getServerVersion()?.name || "";
        try {
          const result = await session.client.request(
            {
              method: "tools/list",
              params: { _meta: request.params?._meta },
            },
            ListToolsResultSchema
          );

          const toolsWithSource =
            result.tools
              ?.filter((tool) => {
                // Only filter inactive tools if tools management is enabled
                if (
                  profileCapabilities.includes(
                    ProfileCapability.TOOLS_MANAGEMENT
                  )
                ) {
                  return !inactiveTools[`${uuid}:${tool.name}`];
                }
                return true;
              })
              .map((tool) => {
                const toolName = `${sanitizeName(serverName)}__${tool.name}`;
                toolToClient[toolName] = session;
                toolToServerUuid[toolName] = uuid;
                return {
                  ...tool,
                  name: toolName,
                  description: tool.description,
                };
              }) || [];

          // Update our inactive tools map only if tools management is enabled
          if (
            profileCapabilities.includes(ProfileCapability.TOOLS_MANAGEMENT)
          ) {
            result.tools?.forEach((tool) => {
              const isInactive = inactiveTools[`${uuid}:${tool.name}`];
              if (isInactive) {
                const formattedName = `${sanitizeName(serverName)}__${
                  tool.name
                }`;
                inactiveToolsMap[formattedName] = true;
              }
            });

            // Report full tools for this server
            reportToolsToMetaMcp(
              result.tools.map((tool) => ({
                name: tool.name,
                description: tool.description,
                toolSchema: tool.inputSchema,
                mcp_server_uuid: uuid,
              }))
            ).catch();
          }

          allTools.push(...toolsWithSource);
        } catch (error) {
          console.error(`Error fetching tools from: ${serverName}`, error);
        }
      })
    );

    return { tools: allTools };
  });

  // Call Tool Handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const originalToolName = name.split("__")[1];
    const clientForTool = toolToClient[name];
    const toolLogManager = ToolLogManager.getInstance();
    let logId: string | undefined;
    let startTime = Date.now();

    if (!clientForTool) {
      throw new Error(`Unknown tool: ${name}`);
    }

    // Get MCP server UUID for the tool
    const mcpServerUuid = toolToServerUuid[name] || "";

    if (!mcpServerUuid) {
      console.error(`Could not determine MCP server UUID for tool: ${name}`);
    }

    // Get profile capabilities
    const profileCapabilities = await getProfileCapabilities();

    // Only check inactive tools if tools management capability is present
    if (
      profileCapabilities.includes(ProfileCapability.TOOLS_MANAGEMENT) &&
      inactiveToolsMap[name]
    ) {
      throw new Error(`Tool is inactive: ${name}`);
    }

    // Check if TOOL_LOGS capability is enabled
    const hasToolsLogCapability = profileCapabilities.includes(
      ProfileCapability.TOOL_LOGS
    );

    try {
      // Create initial pending log only if TOOL_LOGS capability is present
      if (hasToolsLogCapability) {
        const log = await toolLogManager.createLog(
          originalToolName,
          mcpServerUuid,
          args || {}
        );
        logId = log.id;
      }

      // Reset the timer right before making the actual tool call
      startTime = Date.now();

      // Use the correct schema for tool calls
      const result = await clientForTool.client.request(
        {
          method: "tools/call",
          params: {
            name: originalToolName,
            arguments: args || {},
            _meta: {
              progressToken: request.params._meta?.progressToken,
            },
          },
        },
        CompatibilityCallToolResultSchema
      );

      const executionTime = Date.now() - startTime;

      // Update log with success result only if TOOL_LOGS capability is present
      if (hasToolsLogCapability && logId) {
        try {
          await toolLogManager.completeLog(logId, result, executionTime);
        } catch (_error) {}
      }

      return result;
    } catch (error: any) {
      const executionTime = Date.now() - startTime;

      // Update log with error only if TOOL_LOGS capability is present
      if (hasToolsLogCapability && logId) {
        try {
          await toolLogManager.failLog(
            logId,
            error.message || "Unknown error",
            executionTime
          );
        } catch (_error) {}
      }

      console.error(
        `Error calling tool "${name}" through ${
          clientForTool.client.getServerVersion()?.name || "unknown"
        }:`,
        error
      );
      throw error;
    }
  });

  // Get Prompt Handler
  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name } = request.params;
    const clientForPrompt = promptToClient[name];

    if (!clientForPrompt) {
      throw new Error(`Unknown prompt: ${name}`);
    }

    try {
      const promptName = name.split("__")[1];
      const response = await clientForPrompt.client.request(
        {
          method: "prompts/get",
          params: {
            name: promptName,
            arguments: request.params.arguments || {},
            _meta: request.params._meta,
          },
        },
        GetPromptResultSchema
      );

      return response;
    } catch (error) {
      console.error(
        `Error getting prompt through ${
          clientForPrompt.client.getServerVersion()?.name
        }:`,
        error
      );
      throw error;
    }
  });

  // List Prompts Handler
  server.setRequestHandler(ListPromptsRequestSchema, async (request) => {
    const serverParams = await getMcpServers(true);
    const allPrompts: z.infer<typeof ListPromptsResultSchema>["prompts"] = [];

    await Promise.allSettled(
      Object.entries(serverParams).map(async ([uuid, params]) => {
        const sessionKey = getSessionKey(uuid, params);
        const session = await getSession(sessionKey, uuid, params);
        if (!session) return;

        const capabilities = session.client.getServerCapabilities();
        if (!capabilities?.prompts) return;

        const serverName = session.client.getServerVersion()?.name || "";
        try {
          const result = await session.client.request(
            {
              method: "prompts/list",
              params: {
                cursor: request.params?.cursor,
                _meta: request.params?._meta,
              },
            },
            ListPromptsResultSchema
          );

          if (result.prompts) {
            const promptsWithSource = result.prompts.map((prompt) => {
              const promptName = `${sanitizeName(serverName)}__${prompt.name}`;
              promptToClient[promptName] = session;
              return {
                ...prompt,
                name: promptName,
                description: prompt.description || "",
              };
            });
            allPrompts.push(...promptsWithSource);
          }
        } catch (error) {
          console.error(`Error fetching prompts from: ${serverName}`, error);
        }
      })
    );

    return {
      prompts: allPrompts,
      nextCursor: request.params?.cursor,
    };
  });

  // List Resources Handler
  server.setRequestHandler(ListResourcesRequestSchema, async (request) => {
    const serverParams = await getMcpServers(true);
    const allResources: z.infer<typeof ListResourcesResultSchema>["resources"] =
      [];

    await Promise.allSettled(
      Object.entries(serverParams).map(async ([uuid, params]) => {
        const sessionKey = getSessionKey(uuid, params);
        const session = await getSession(sessionKey, uuid, params);
        if (!session) return;

        const capabilities = session.client.getServerCapabilities();
        if (!capabilities?.resources) return;

        const serverName = session.client.getServerVersion()?.name || "";
        try {
          const result = await session.client.request(
            {
              method: "resources/list",
              params: {
                cursor: request.params?.cursor,
                _meta: request.params?._meta,
              },
            },
            ListResourcesResultSchema
          );

          if (result.resources) {
            const resourcesWithSource = result.resources.map((resource) => {
              resourceToClient[resource.uri] = session;
              return {
                ...resource,
                name: resource.name || "",
              };
            });
            allResources.push(...resourcesWithSource);
          }
        } catch (error) {
          console.error(`Error fetching resources from: ${serverName}`, error);
        }
      })
    );

    return {
      resources: allResources,
      nextCursor: request.params?.cursor,
    };
  });

  // Read Resource Handler
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;
    const clientForResource = resourceToClient[uri];

    if (!clientForResource) {
      throw new Error(`Unknown resource: ${uri}`);
    }

    try {
      return await clientForResource.client.request(
        {
          method: "resources/read",
          params: {
            uri,
            _meta: request.params._meta,
          },
        },
        ReadResourceResultSchema
      );
    } catch (error) {
      console.error(
        `Error reading resource through ${
          clientForResource.client.getServerVersion()?.name
        }:`,
        error
      );
      throw error;
    }
  });

  // List Resource Templates Handler
  server.setRequestHandler(
    ListResourceTemplatesRequestSchema,
    async (request) => {
      const serverParams = await getMcpServers(true);
      const allTemplates: ResourceTemplate[] = [];

      await Promise.allSettled(
        Object.entries(serverParams).map(async ([uuid, params]) => {
          const sessionKey = getSessionKey(uuid, params);
          const session = await getSession(sessionKey, uuid, params);
          if (!session) return;

          const capabilities = session.client.getServerCapabilities();
          if (!capabilities?.resources) return;

          try {
            const result = await session.client.request(
              {
                method: "resources/templates/list",
                params: {
                  cursor: request.params?.cursor,
                  _meta: request.params?._meta,
                },
              },
              ListResourceTemplatesResultSchema
            );

            if (result.resourceTemplates) {
              const templatesWithSource = result.resourceTemplates.map(
                (template) => ({
                  ...template,
                  name: template.name || "",
                })
              );
              allTemplates.push(...templatesWithSource);
            }
          } catch (error) {
            return;
          }
        })
      );

      return {
        resourceTemplates: allTemplates,
        nextCursor: request.params?.cursor,
      };
    }
  );

  const cleanup = async () => {
    await cleanupAllSessions();
  };

  return { server, cleanup };
};
