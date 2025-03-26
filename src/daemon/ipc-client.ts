/**
 * Tempo CLI Daemon IPC Client Utilities
 *
 * Client-side utilities for communicating with the daemon process.
 * Used by the CLI commands to interact with the daemon.
 */

import { IPCClient, StatusResponse } from "./ipc";
import { getCurrentBranch, findGitRoot } from "../git";
import chalk from "chalk";
import path from "path";
import os from "os";
import fs from "fs";

// Singleton IPC client instance
let ipcClient: IPCClient | null = null;

/**
 * Get the IPC client instance
 */
export function getIPCClient(): IPCClient {
  if (!ipcClient) {
    ipcClient = new IPCClient();

    // Set up process exit handler to clean up properly
    process.once("exit", () => {
      if (ipcClient) {
        try {
          // Note: synchronous operations only in 'exit' handler
          console.log("Cleaning up IPC connection");
        } catch (e) {
          // Ignore errors during cleanup
        }
      }
    });
  }
  return ipcClient;
}

/**
 * Ensure the client is disconnected when done
 */
export async function ensureClientDisconnected(): Promise<void> {
  if (ipcClient) {
    try {
      await ipcClient.disconnect();
    } catch (e) {
      // Ignore errors during cleanup
    }
  }
}

/**
 * Check if the daemon is running
 */
export async function isDaemonRunning(): Promise<boolean> {
  // First check if the socket file exists
  const socketPath = path.join(os.tmpdir(), "tempo-daemon", "ipc.sock");
  const socketExists = fs.existsSync(socketPath);

  if (!socketExists) {
    console.log(chalk.yellow(`Daemon socket not found at ${socketPath}`));
    return false;
  } else {
    console.log(chalk.blue(`Found daemon socket at ${socketPath}`));
  }

  // Then try to connect to the daemon
  const client = getIPCClient();

  // Set a timeout to prevent the function from hanging indefinitely
  console.log(chalk.blue("Attempting to connect to daemon..."));
  const connected = await client.connect();

  if (!connected) {
    console.log(chalk.yellow("Socket exists but connection failed"));
    return false;
  } else {
    console.log(chalk.green("Successfully connected to daemon"));

    // Test the connection with a simple status request
    let result: boolean;
    console.log(chalk.blue("Testing connection with status request..."));
    let testTimeout: NodeJS.Timeout;
    const statusPromise = client.getStatus().then((status) => {
      clearTimeout(testTimeout);
      console.log(chalk.green("Received status response from daemon"));
      return true;
    });
    const timeoutPromise = new Promise<boolean>((resolve) => {
      testTimeout = setTimeout(async () => {
        console.log(chalk.yellow("Connection test timed out"));
        await client.disconnect();
        resolve(false);
      }, 5000);
    });
    try {
      result = await Promise.race([statusPromise, timeoutPromise]);
    } catch (testError: any) {
      console.log(chalk.yellow(`Status request failed: ${testError.message}`));
      result = false;
    } finally {
      // Always disconnect after testing the connection
      await client.disconnect();
    }
    return result;
  }
}

/**
 * Start tracking in the current directory via daemon
 */
export async function startTrackingViaDaemon(options: {
  description?: string;
  issueId?: number;
}): Promise<void> {
  // Get the current working directory
  const cwd = process.cwd();

  // Check if we're in a git repository
  const gitRoot = findGitRoot(cwd);
  if (!gitRoot) {
    throw new Error(
      "Not in a git repository. Please navigate to a git repository to start tracking."
    );
  }

  // Get the current branch
  const branch = await getCurrentBranch(gitRoot);

  // Connect to daemon
  const client = getIPCClient();
  if (!(await client.connect())) {
    throw new Error(
      "Daemon is not running. Start it with 'tempo daemon start' first."
    );
  }

  try {
    // Start tracking
    await client.startTracking(
      gitRoot,
      branch,
      options.issueId,
      options.description
    );

    console.log(
      chalk.green("✓ Started tracking time on branch:"),
      chalk.cyan(branch)
    );
    if (options.issueId) {
      console.log(`  Issue: ${chalk.cyan(options.issueId)}`);
    }
    if (options.description) {
      console.log(`  Description: ${chalk.cyan(options.description)}`);
    }
    console.log(
      chalk.blue("  Tracking is being managed by the daemon process.")
    );
  } catch (error: any) {
    // Ensure we disconnect on error
    await client.disconnect();
    throw error;
  } finally {
    // Always ensure we disconnect when done
    await client.disconnect();
  }
}

/**
 * Stop tracking in the current directory via daemon
 */
export async function stopTrackingViaDaemon(): Promise<void> {
  // Get the current working directory
  const cwd = process.cwd();

  // Check if we're in a git repository
  const gitRoot = findGitRoot(cwd);
  if (!gitRoot) {
    throw new Error(
      "Not in a git repository. Please navigate to a git repository to stop tracking."
    );
  }

  // Connect to daemon
  const client = getIPCClient();
  if (!(await client.connect())) {
    throw new Error(
      "Daemon is not running. Start it with 'tempo daemon start' first."
    );
  }

  try {
    // Stop tracking
    await client.stopTracking(gitRoot);

    console.log(chalk.green("✓ Stopped tracking time."));
    console.log(chalk.blue("  Activity saved and ready to sync with Tempo."));
  } catch (error: any) {
    // Ensure we disconnect on error
    await client.disconnect();
    throw error;
  } finally {
    // Always ensure we disconnect when done
    await client.disconnect();
  }
}

/**
 * Get tracking status from daemon
 */
export async function getStatusFromDaemon(): Promise<StatusResponse> {
  // Connect to daemon
  const client = getIPCClient();
  if (!(await client.connect())) {
    throw new Error(
      "Daemon is not running. Start it with 'tempo daemon start' first."
    );
  }

  try {
    // Get status
    const status = await client.getStatus();
    return status;
  } catch (error: any) {
    // Ensure we disconnect on error
    await client.disconnect();
    throw error;
  } finally {
    // Always ensure we disconnect when done
    await client.disconnect();
  }
}

/**
 * Sync with Tempo via daemon
 */
export async function syncTempoViaDaemon(options: {
  date?: string;
}): Promise<void> {
  // Connect to daemon
  const client = getIPCClient();
  if (!(await client.connect())) {
    throw new Error(
      "Daemon is not running. Start it with 'tempo daemon start' first."
    );
  }

  try {
    // Sync with Tempo
    await client.syncTempo(options.date);

    console.log(chalk.green("✓ Synced with Tempo successfully."));
  } catch (error: any) {
    // Ensure we disconnect on error
    await client.disconnect();
    throw error;
  } finally {
    // Always ensure we disconnect when done
    await client.disconnect();
  }
}
