#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./mcp-proxy.js";
import { Command } from "commander";
import { reportAllTools } from "./report-tools.js";
import { cleanupAllSessions } from "./sessions.js";
import { startSSEServer } from "./sse.js";
import { startStreamableHTTPServer } from "./streamable-http.js";
import { IOType } from "./fetch-metamcp.js";

const program = new Command();

program
  .name("mcp-server-metamcp")
  .description("MetaMCP MCP Server - The One MCP to manage all your MCPs")
  .option(
    "--metamcp-api-key <key>",
    "API key for MetaMCP (can also be set via METAMCP_API_KEY env var)"
  )
  .option(
    "--metamcp-api-base-url <url>",
    "Base URL for MetaMCP API (can also be set via METAMCP_API_BASE_URL env var)"
  )
  .option(
    "--report",
    "Fetch all MCPs, initialize clients, and report tools to MetaMCP API"
  )
  .option("--transport <type>", "Transport type to use (stdio, sse, or streamable-http)", "stdio")
  .option("--port <port>", "Port to use for SSE or Streamable HTTP transport, defaults to 12006", "12006")
  .option("--require-api-auth", "Require API key in SSE or Streamable HTTP URL path")
  .option("--stateless", "Use stateless mode for Streamable HTTP transport")
  .option(
    "--use-docker-host",
    "Transform localhost URLs to use host.docker.internal (can also be set via USE_DOCKER_HOST env var)"
  )
  .option(
    "--stderr <type>",
    "Stderr handling for STDIO transport (overlapped, pipe, ignore, inherit)",
    "ignore"
  )
  .parse(process.argv);

const options = program.opts();

// Validate stderr option
const validStderrTypes: IOType[] = ["overlapped", "pipe", "ignore", "inherit"];
if (!validStderrTypes.includes(options.stderr as IOType)) {
  console.error(`Invalid stderr type: ${options.stderr}. Must be one of: ${validStderrTypes.join(", ")}`);
  process.exit(1);
}

// Set environment variables from command line arguments
if (options.metamcpApiKey) {
  process.env.METAMCP_API_KEY = options.metamcpApiKey;
}
if (options.metamcpApiBaseUrl) {
  process.env.METAMCP_API_BASE_URL = options.metamcpApiBaseUrl;
}
if (options.useDockerHost) {
  process.env.USE_DOCKER_HOST = "true";
}
if (options.stderr) {
  process.env.METAMCP_STDERR = options.stderr;
}

async function main() {
  // If --report flag is set, run the reporting function instead of starting the server
  if (options.report) {
    await reportAllTools();
    await cleanupAllSessions();
    return;
  }

  const { server, cleanup } = await createServer();

  if (options.transport.toLowerCase() === "sse") {
    // Start SSE server
    const port = parseInt(options.port) || 12006;
    const sseCleanup = await startSSEServer(server, {
      port,
      requireApiAuth: options.requireApiAuth,
    });

    // Cleanup on exit
    const handleExit = async () => {
      await cleanup();
      await sseCleanup();
      await server.close();
      process.exit(0);
    };

    process.on("SIGINT", handleExit);
    process.on("SIGTERM", handleExit);
  } else if (options.transport.toLowerCase() === "streamable-http") {
    // Start Streamable HTTP server
    const port = parseInt(options.port) || 12006;
    const streamableHttpCleanup = await startStreamableHTTPServer(server, {
      port,
      requireApiAuth: options.requireApiAuth,
      stateless: options.stateless,
    });

    // Cleanup on exit
    const handleExit = async () => {
      await cleanup();
      await streamableHttpCleanup();
      await server.close();
      process.exit(0);
    };

    process.on("SIGINT", handleExit);
    process.on("SIGTERM", handleExit);
  } else {
    // Default: Start stdio server
    const transport = new StdioServerTransport();
    await server.connect(transport);

    const handleExit = async () => {
      await cleanup();
      await transport.close();
      await server.close();
      process.exit(0);
    };

    // Cleanup on exit
    process.on("SIGINT", handleExit);
    process.on("SIGTERM", handleExit);

    process.stdin.resume();
    process.stdin.on("end", handleExit);
    process.stdin.on("close", handleExit);
  }
}

main().catch((error) => {
  console.error("Server error:", error);
});
