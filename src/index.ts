#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./mcp-proxy.js";
import { Command } from "commander";

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
  .parse(process.argv);

const options = program.opts();

// Set environment variables from command line arguments
if (options.metamcpApiKey) {
  process.env.METAMCP_API_KEY = options.metamcpApiKey;
}
if (options.metamcpApiBaseUrl) {
  process.env.METAMCP_API_BASE_URL = options.metamcpApiBaseUrl;
}

async function main() {
  const transport = new StdioServerTransport();
  const { server, cleanup } = await createServer();

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

main().catch((error) => {
  console.error("Server error:", error);
});
