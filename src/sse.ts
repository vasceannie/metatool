import express from "express";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";

export interface SSEServerOptions {
  port: number;
}

// Starts an SSE server and returns a cleanup function
export async function startSSEServer(
  server: Server,
  options: SSEServerOptions
): Promise<() => Promise<void>> {
  const app = express();
  const port = options.port || 12006;

  // to support multiple simultaneous connections we have a lookup object from
  // sessionId to transport
  const transports: { [sessionId: string]: SSEServerTransport } = {};

  app.get("/sse", async (_: express.Request, res: express.Response) => {
    const transport = new SSEServerTransport("/messages", res);
    transports[transport.sessionId] = transport;
    res.on("close", () => {
      delete transports[transport.sessionId];
    });
    await server.connect(transport);
  });

  app.post("/messages", async (req: express.Request, res: express.Response) => {
    const sessionId = req.query.sessionId as string;
    const transport = transports[sessionId];
    if (transport) {
      await transport.handlePostMessage(req, res);
    } else {
      res.status(400).send("No transport found for sessionId");
    }
  });

  const serverInstance = app.listen(port, () => {
    console.log(`SSE server listening on port ${port}`);
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
