import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { randomUUID } from "crypto";

export interface StreamableHTTPServerOptions {
  port: number;
  requireApiAuth?: boolean;
  stateless?: boolean;
}

// Starts a Streamable HTTP server and returns a cleanup function
export async function startStreamableHTTPServer(
  server: Server,
  options: StreamableHTTPServerOptions
): Promise<() => Promise<void>> {
  const app = express();
  app.use(express.json());
  
  const port = options.port || 12006;
  const requireApiAuth = options.requireApiAuth || false;
  const stateless = options.stateless || false;
  const apiKey = process.env.METAMCP_API_KEY;
  
  // Map to store transports by session ID (when using stateful mode)
  const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};
  
  // Define the MCP endpoint path based on authentication requirement
  const mcpEndpoint = requireApiAuth ? `/:apiKey/mcp` : `/mcp`;
  
  // Handle all HTTP methods for the MCP endpoint
  app.all(mcpEndpoint, async (req: express.Request, res: express.Response) => {
    // If API auth is required, validate the API key
    if (requireApiAuth) {
      const requestApiKey = req.params.apiKey;
      if (!apiKey || requestApiKey !== apiKey) {
        res.status(401).send("Unauthorized: Invalid API key");
        return;
      }
    }
    
    if (stateless) {
      // Stateless mode: Create a new transport for each request
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // No session management
      });
      
      res.on("close", () => {
        transport.close();
      });
      
      try {
        // Connect to the server
        await server.connect(transport);
        // Handle the request
        await transport.handleRequest(req, res, req.body);
      } catch (error) {
        console.error("Error handling streamable HTTP request:", error);
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: "2.0",
            error: {
              code: -32603,
              message: "Internal server error",
            },
            id: null,
          });
        }
      }
    } else {
      // Stateful mode: Use session management
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      let transport: StreamableHTTPServerTransport;
      
      if (sessionId && transports[sessionId]) {
        // Reuse existing transport
        transport = transports[sessionId];
      } else if (!sessionId && req.method === "POST") {
        // New initialization request
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sessionId) => {
            // Store the transport by session ID
            transports[sessionId] = transport;
          }
        });
        
        // Clean up transport when closed
        transport.onclose = () => {
          if (transport.sessionId) {
            delete transports[transport.sessionId];
          }
        };
        
        // Connect to the server
        await server.connect(transport);
      } else {
        // Invalid request
        res.status(400).json({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "Bad Request: No valid session ID provided",
          },
          id: null,
        });
        return;
      }
      
      try {
        // Handle the request
        await transport.handleRequest(req, res, req.body);
      } catch (error) {
        console.error("Error handling streamable HTTP request:", error);
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: "2.0",
            error: {
              code: -32603,
              message: "Internal server error",
            },
            id: null,
          });
        }
      }
    }
  });
  
  const serverInstance = app.listen(port, () => {
    const baseUrl = `http://localhost:${port}`;
    const mcpUrl = requireApiAuth ? `${baseUrl}/${apiKey}/mcp` : `${baseUrl}/mcp`;
    console.log(`Streamable HTTP server listening on port ${port}`);
    console.log(`MCP endpoint: ${mcpUrl}`);
    console.log(`Mode: ${stateless ? "Stateless" : "Stateful"}`);
  });
  
  // Return cleanup function
  return async () => {
    // Close all active transports
    await Promise.all(
      Object.values(transports).map((transport) => transport.close())
    );
    serverInstance.close();
  };
} 