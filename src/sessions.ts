import { getMcpServers, ServerParameters } from "./fetch-metamcp.js";
import {
  ConnectedClient,
  createMetaMcpClient,
  connectMetaMcpClient,
} from "./client.js";
import { getSessionKey } from "./utils.js";

const _sessions: Record<string, ConnectedClient> = {};

export const getSession = async (
  sessionKey: string,
  uuid: string,
  params: ServerParameters
): Promise<ConnectedClient | undefined> => {
  if (sessionKey in _sessions) {
    return _sessions[sessionKey];
  } else {
    // Close existing session for this UUID if it exists with a different hash
    const old_session_keys = Object.keys(_sessions).filter((k) =>
      k.startsWith(`${uuid}_`)
    );

    await Promise.allSettled(
      old_session_keys.map(async (old_session_key) => {
        await _sessions[old_session_key].cleanup();
        delete _sessions[old_session_key];
      })
    );

    const { client, transport } = createMetaMcpClient(params);
    if (!client || !transport) {
      return;
    }

    const newClient = await connectMetaMcpClient(client, transport);
    if (!newClient) {
      return;
    }

    _sessions[sessionKey] = newClient;

    return newClient;
  }
};

export const initSessions = async (): Promise<void> => {
  const serverParams = await getMcpServers(true);

  await Promise.allSettled(
    Object.entries(serverParams).map(async ([uuid, params]) => {
      const sessionKey = getSessionKey(uuid, params);
      try {
        await getSession(sessionKey, uuid, params);
      } catch (_error) {}
    })
  );
};

export const cleanupAllSessions = async (): Promise<void> => {
  await Promise.allSettled(
    Object.entries(_sessions).map(async ([sessionKey, session]) => {
      await session.cleanup();
      delete _sessions[sessionKey];
    })
  );
};
