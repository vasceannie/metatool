import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  StdioClientTransport,
  StdioServerParameters,
} from "@modelcontextprotocol/sdk/client/stdio.js";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

const sleep = (time: number) =>
  new Promise<void>((resolve) => setTimeout(() => resolve(), time));
export interface ConnectedClient {
  client: Client;
  cleanup: () => Promise<void>;
}

export const createMetaMcpClient = (
  serverParams: StdioServerParameters
): { client: Client | undefined; transport: Transport | undefined } => {
  const transport = new StdioClientTransport(serverParams);
  const client = new Client(
    {
      name: "MetaMCP",
      version: "0.0.7",
    },
    {
      capabilities: {
        prompts: {},
        resources: { subscribe: true },
        tools: {},
      },
    }
  );
  return { client, transport };
};

export const connectMetaMcpClient = async (
  client: Client,
  transport: Transport
): Promise<ConnectedClient | undefined> => {
  const waitFor = 2500;
  const retries = 3;
  let count = 0;
  let retry = true;

  while (retry) {
    try {
      await client.connect(transport);

      return {
        client,
        cleanup: async () => {
          await transport.close();
          await client.close();
        },
      };
    } catch (error) {
      count++;
      retry = count < retries;
      if (retry) {
        try {
          await client.close();
        } catch {}
        await sleep(waitFor);
      }
    }
  }
};
