# MetaMCP MCP Server

[![smithery badge](https://smithery.ai/badge/@metatool-ai/mcp-server-metamcp)](https://smithery.ai/server/@metatool-ai/mcp-server-metamcp)
[https://metamcp.com](https://metamcp.com): The One MCP to manage all your MCPs

MetaMCP MCP Server is a proxy server that joins multiple MCP⁠ servers into one. It fetches tool/prompt/resource configurations from MetaMCP App⁠ and routes tool/prompt/resource requests to the correct underlying server.

## Installation

### Installing via Smithery

To install MetaMCP MCP Server for Claude Desktop automatically via [Smithery](https://smithery.ai/server/@metatool-ai/mcp-server-metamcp):

```bash
npx -y @smithery/cli install @metatool-ai/mcp-server-metamcp --client claude
```

### Manual Installation
```bash
export METATOOL_API_KEY=<env>
npx -y @metamcp/mcp-server-metamcp
```

## Highlights

- Compatible with ANY MCP Client
- Multi-Workspaces layer enables you to switch to another set of MCP configs within one-click.
- GUI dynamic updates of MCP configs.
- Namespace isolation for joined MCPs.

## Environment Variables

- METATOOL_API_KEY: Required. Obtained from MetaMCP App’s “API Keys” page (https://metamcp.com/api-keys).
- METATOOL_API_BASE_URL: Optional override for MetaMCP App URL (e.g. http://localhost:12005).

## Architecture Overview

```mermaid
sequenceDiagram
    participant MCPClient as MCP Client (e.g. Claude Desktop)
    participant MetaMCP-mcp-server as MetaMCP MCP Server
    participant MetaMCPApp as MetaMCP App
    participant MCPServers as Installed MCP Servers in Metatool App

    MCPClient ->> MetaMCP-mcp-server: Request list tools
    MetaMCP-mcp-server ->> MetaMCPApp: Get tools configuration & status
    MetaMCPApp ->> MetaMCP-mcp-server: Return tools configuration & status

    loop For each listed MCP Server
        MetaMCP-mcp-server ->> MCPServers: Request list_tools
        MCPServers ->> MetaMCP-mcp-server: Return list of tools
    end

    MetaMCP-mcp-server ->> MetaMCP-mcp-server: Aggregate tool lists
    MetaMCP-mcp-server ->> MCPClient: Return aggregated list of tools

    MCPClient ->> MetaMCP-mcp-server: Call tool
    MetaMCP-mcp-server ->> MCPServers: call_tool to target MCP Server
    MCPServers ->> MetaMCP-mcp-server: Return tool response
    MetaMCP-mcp-server ->> MCPClient: Return tool response
```

## Credits

- Inspirations and some code (refactored in this project) from https://github.com/adamwattis/mcp-proxy-server/
