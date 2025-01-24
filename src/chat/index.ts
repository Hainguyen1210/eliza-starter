import { settings } from "@elizaos/core";
import readline from "readline";

const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.on("SIGINT", () => {
  console.log("\nGracefully shutting down...");
        rl.close();
      process.exit(0);
    });

async function handleUserInput(input: string, agentId: string): Promise<void> {
  if (input.toLowerCase() === "exit") {
    console.log("Exiting chat...");
      rl.close();
    process.exit(0);
  }

  try {
    const serverPort = parseInt(settings.SERVER_PORT || "3000");
    const response = await fetch(
      `http://localhost:${serverPort}/${agentId}/message`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: input,
          userId: "user",
          userName: "User",
        }),
      }
    );

    const data = await response.json();
    data.forEach((message) => console.log(`${"Agent"}: ${message.text}`));
  } catch (error) {
    console.error("Error fetching response:", error);
  }
}

export function startChat(characters: any[]) {
  return async function chat() {
    const agentId = characters[0].name ?? "Agent";
    
    // Convert readline.question to a promise
    const getInput = () => new Promise<string>((resolve) => {
      rl.question("You: ", resolve);
    });

    try {
      while (true) {
        const input = await getInput();
        if (input.toLowerCase() === "exit") {
          console.log("Exiting chat...");
            rl.close();
          process.exit(0);
        }
        await handleUserInput(input, agentId);
      }
    } catch (error) {
      console.error("Error in chat:", error);
        rl.close();
      throw error;
    }
  };
}
