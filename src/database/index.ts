import {PostgresDatabaseAdapter} from "@elizaos/adapter-postgres";
import {SqliteDatabaseAdapter} from "@elizaos/adapter-sqlite";
import Database from "better-sqlite3";
import path from "path";
import { elizaLogger } from "@elizaos/core";

const MAX_RETRIES = 5;
const RETRY_DELAY = 3000;

// Singleton database instance
let dbInstance: any = null;

async function connectWithRetry(db: any, retries = MAX_RETRIES): Promise<void> {
    try {
        await db.init();
        elizaLogger.success("Database connection established successfully");
    } catch (error) {
        if (retries > 0) {
            elizaLogger.warn(`Database connection failed, retrying... (${retries} attempts remaining)`);
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
            return connectWithRetry(db, retries - 1);
        }
        throw error;
    }
}

export async function initializeDatabase(dataDir: string) {
    // Return existing instance if already initialized
    if (dbInstance) {
        elizaLogger.info("Using existing database connection");
        return dbInstance;
    }

    if (process.env.POSTGRES_URL) {
        elizaLogger.info("Using POSTGRES_URL", process.env.POSTGRES_URL);
        dbInstance = new PostgresDatabaseAdapter({
            connectionString: process.env.POSTGRES_URL,
            max: 20, // connection pool max size
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 5000,
        });

        await connectWithRetry(dbInstance);
    } else {
        const filePath = process.env.SQLITE_FILE ?? path.resolve(dataDir, "db.sqlite");
        elizaLogger.info("Using SQLITE_FILE", filePath);
        dbInstance = new SqliteDatabaseAdapter(new Database(filePath));
        await dbInstance.init();
    }

    return dbInstance;
}
