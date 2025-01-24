import {DirectClient} from "@elizaos/client-direct";
import {
  AgentRuntime,
  elizaLogger,
  settings,
  stringToUuid,
  type Character,
} from "@elizaos/core";
import {bootstrapPlugin} from "@elizaos/plugin-bootstrap";
import {createNodePlugin} from "@elizaos/plugin-node";
import {solanaPlugin} from "@elizaos/plugin-solana";
import fs from "fs";
import net from "net";
import path from "path";
import {fileURLToPath} from "url";
import {initializeDbCache} from "./cache/index.ts";
import {character} from "./character.ts";
import {startChat} from "./chat/index.ts";
import {initializeClients} from "./clients/index.ts";
import {
  getTokenForProvider,
  loadCharacters,
  parseArguments,
} from "./config/index.ts";
import {initializeDatabase} from "./database/index.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const wait = (minTime: number = 1000, maxTime: number = 3000) => {
  const waitTime =
    Math.floor(Math.random() * (maxTime - minTime + 1)) + minTime;
  return new Promise((resolve) => setTimeout(resolve, waitTime));
};

let nodePlugin: any | undefined;

export function createAgent(
  character: Character,
  db: any,
  cache: any,
  token: string,
) {
  elizaLogger.success(
    elizaLogger.successesTitle,
    "Creating runtime for character",
    character.name,
  );

  nodePlugin ??= createNodePlugin();

  return new AgentRuntime({
    databaseAdapter: db,
    token,
    modelProvider: character.modelProvider,
    evaluators: [],
    character,
    plugins: [
      bootstrapPlugin,
      nodePlugin,
      character.settings?.secrets?.WALLET_PUBLIC_KEY ? solanaPlugin : null,
    ].filter(Boolean),
    providers: [],
    actions: [],
    services: [],
    managers: [],
    cacheManager: cache,
  });
}

async function startAgent(character: Character, directClient: DirectClient) {
  try {
    character.id ??= stringToUuid(character.name);
    character.username ??= character.name;

    const token = getTokenForProvider(character.modelProvider, character);
    const dataDir = path.join(__dirname, "../data");

    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, {recursive: true});
    }

    const db = await initializeDatabase(dataDir);
    const cache = initializeDbCache(character, db);
    const runtime = createAgent(character, db, cache, token);

    await runtime.initialize();
    runtime.clients = await initializeClients(character, runtime);
    directClient.registerAgent(runtime);

    // report to console
    elizaLogger.debug(`Started ${character.name} as ${runtime.agentId}`);

    return runtime;
  } catch (error) {
    elizaLogger.error(
      "Failed to start agent",
      character.name,
      error instanceof Error ? error.message : error,
    );
    throw error;
  }
}

const checkPortAvailable = (port: number): Promise<boolean> => {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        resolve(false);
      }
    });

    server.once("listening", () => {
      server.close();
      resolve(true);
    });

    server.listen(port);
  });
};

const startAgents = async () => {
  const directClient = new DirectClient();
  let serverPort = parseInt(settings.SERVER_PORT || "3000");
  const args = parseArguments();

  let charactersArg = args.characters || args.character;
  let characters = [character];

  console.log("charactersArg", charactersArg);
  if (charactersArg) {
    characters = await loadCharacters(charactersArg);
  }
  console.log("characters", characters);

  // Initialize agents first
  const agents = [];
  try {
    for (const character of characters) {
      const agent = await startAgent(character, directClient as DirectClient);
      agents.push(agent);
    }
  } catch (error) {
    elizaLogger.error("Error starting agents:", error);
    throw error; // Re-throw to trigger proper cleanup
  }

  // Start server only if agents initialized successfully
  while (!(await checkPortAvailable(serverPort))) {
    elizaLogger.warn(`Port ${serverPort} is in use, trying ${serverPort + 1}`);
    serverPort++;
  }

  directClient.startAgent = async (character: Character) => {
    return startAgent(character, directClient);
  };

  try {
    directClient.start(serverPort);

    if (serverPort !== parseInt(settings.SERVER_PORT || "3000")) {
      elizaLogger.log(`Server started on alternate port ${serverPort}`);
    }

    // Only start chat interface if not running in Docker
    const isDockerProcess = process.env.DOCKER_PROCESS === "true";
    const isDaemonProcess = process.env.DAEMON_PROCESS === "true";
    if (!isDaemonProcess && !isDockerProcess && agents.length > 0) {
      elizaLogger.log("Chat started. Type 'exit' to quit.");
      const chat = startChat(characters);
      await chat(); // Wait for chat to initialize
    }
  } catch (error) {
    elizaLogger.error("Error in server/chat initialization:", error);
    throw error;
  }
};

startAgents().catch((error) => {
  elizaLogger.error("Unhandled error in startAgents:", error);
  process.exit(1);
});
