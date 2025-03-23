import simpleGit from "simple-git";
import path from "path";
import fs from "fs";

export async function isGitDirectory(directory: string): Promise<boolean> {
  try {
    const git = simpleGit(directory);
    await git.checkIsRepo();
    return true;
  } catch (error) {
    return false;
  }
}

export async function getCurrentBranch(directory: string): Promise<string> {
  try {
    const git = simpleGit(directory);
    return await git.revparse(["--abbrev-ref", "HEAD"]);
  } catch (error: unknown) {
    throw new Error(
      `Failed to get current branch: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

export async function getRepositoryName(directory: string): Promise<string> {
  try {
    const git = simpleGit(directory);
    const remotes = await git.getRemotes(true);

    if (remotes.length === 0) {
      // No remote, use directory name
      return path.basename(directory);
    }

    // Find origin or first remote
    const remote = remotes.find((r) => r.name === "origin") || remotes[0];

    // Extract repo name from URL
    const match = remote.refs.fetch.match(/([^\/]+)(?:\.git)?$/);
    return match ? match[1] : path.basename(directory);
  } catch (error) {
    return path.basename(directory);
  }
}

export function findGitRoot(startDirectory: string): string | null {
  let currentDir = startDirectory;

  // Traverse up until we find .git directory or hit root
  while (currentDir !== path.parse(currentDir).root) {
    if (fs.existsSync(path.join(currentDir, ".git"))) {
      return currentDir;
    }
    currentDir = path.dirname(currentDir);
  }

  return null;
}
