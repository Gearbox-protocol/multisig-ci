import chalk from "chalk";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { SimpleGit, simpleGit } from "simple-git";

import * as Deploy from "./deploy.types.js";
import * as Forge from "./forge.types.js";

export const DEPLOY_REPOS = ["deploy-v2", "deploy-v3"];
export const WHITELISTED_REPOS = [
  "core-v2",
  "core-v3",
  "governance",
  "integrations-v2",
  "integrations-v3",
  "oracles-v3",
  "periphery-v3",
  "router-v3",
  "router",
];

export interface RepoMeta {
  /**
   * repo name with '@' prefix
   */
  repo: string;
  commit?: string;
  forgeFlags?: string;
}

export function getContractRepo(meta: Deploy.Contract): RepoMeta {
  const [org, name] = meta.metadata.source
    .split("/")
    .slice(0, 2)
    .map(s => s.toLowerCase());

  if (!name) {
    throw new Error(`Unknown repo for source '${meta.metadata.source}'`);
  }
  if (org !== "@gearbox-protocol") {
    throw new Error(`Unknown org for source '${meta.metadata.source}'`);
  }
  if (!WHITELISTED_REPOS.includes(name)) {
    throw new Error(
      `Non-whitelisted repo for source '${meta.metadata.source}'`,
    );
  }
  if (!meta.metadata.commit) {
    throw new Error(`Commit not found for source '${meta.metadata.source}'`);
  }

  return {
    repo: `${org}/${name}`,
    commit: meta.metadata.commit,
    forgeFlags: getForgeFlags(meta.metadata),
  };
}

export function getGithubUrl(repo: string): string {
  const path = repo.replace(/^@/, "").replace(/\/$/, "");
  return `https://github.com/${path}.git`;
}

/**
 * Gets CLI flags to pass to `forge build`
 * https://book.getfoundry.sh/reference/forge/forge-build
 * @param contract
 */
export function getForgeFlags(meta: Deploy.CompilerInfo): string {
  const flags: string[] = [];
  if (meta.compiler) {
    flags.push("--use", meta.compiler.split("+")[0]);
  }
  if (meta.optimizer.enabled) {
    flags.push("--optimize");
    if (meta.optimizer.runs) {
      flags.push("--optimizer-runs", meta.optimizer.runs.toString(10));
    }
  }
  return flags.join(" ");
}

/**
 * gatherRepos gets metadata file and returns map between repo name and commit to checkout
 * it throws if there're different commit from same repo
 **/
export function gatherRepos(metadata: Deploy.Transaction): RepoMeta[] {
  const contracts = Object.values(metadata);
  const repos = new Map<string, RepoMeta>();
  for (const contract of contracts) {
    const repo = getContractRepo(contract);
    const old = repos.get(repo.repo);

    if (!!old && old.commit !== repo.commit) {
      throw new Error(`Deploy uses multiple commits from repo ${repo.repo}`);
    }

    if (!!old && old.forgeFlags !== repo.forgeFlags) {
      throw new Error(
        `Deploy uses different forge settings within repo ${repo.repo}`,
      );
    }

    repos.set(repo.repo, repo);
  }
  return Array.from(repos.values());
}

/**
 * cloneRepo will clone given repo inside given sandbox directory
 * @param repo
 */
export async function cloneRepo(
  { repo, commit }: RepoMeta,
  sandboxDir: string,
): Promise<void> {
  const prefix = chalk.cyan(`[clone][${repo}]`);
  const to = commit ? ` to ${chalk.white(commit.slice(0, 8))}` : "";
  console.log(`${prefix} cloning...`);
  const git: SimpleGit = simpleGit({
    baseDir: sandboxDir,
  });
  await git.clone(getGithubUrl(repo));
  console.log(`${prefix} cloned`);
  if (commit) {
    const git = simpleGit({
      baseDir: path.resolve(sandboxDir, repo.split("/")[1]),
    });
    await git.reset(["--hard", commit]);
    console.log(`${prefix} reset ${to}`);
  }
}

/**
 * buildRepo installs deps and runs forge build
 */
export function buildRepo(
  { repo, forgeFlags }: RepoMeta,
  sandboxDir: string,
): void {
  const prefix = chalk.cyan(`[build][${repo}]`);
  const dir = path.resolve(sandboxDir, repo.split("/")[1]);
  console.log(`${prefix} yarn install in ${dir}`);
  spawnSync("yarn", ["install", "--frozen-lockfile", "--silent"], {
    stdio: "inherit",
    cwd: dir,
  });
  console.log(`${prefix} forge build ${forgeFlags} in ${dir}`);
  spawnSync("forge", ["build", ...(forgeFlags?.split(" ") ?? [])], {
    stdio: "inherit",
    cwd: dir,
  });
}

/**
 * traverseForgeOut traverses json files generated in forge-out dir of a repo and builds
 * mapping betwen (prefixed) absolutePath found in json file and json file path
 * By adding "<repo_name>/" prefix we'll have metadata.source as mapping keys
 * @param prefix
 * @param dir forge-out dir
 * @param out metadata.source -> forge-out json file path
 */
export async function traverseForgeOut(
  prefix: string,
  dir: string,
  out: Map<string, string>,
): Promise<void> {
  for (const i of await fs.readdir(dir, { withFileTypes: true })) {
    const f = path.resolve(dir, i.name);
    if (i.isDirectory()) {
      await traverseForgeOut(prefix, f, out);
    } else {
      try {
        const content = await fs.readFile(f, "utf8");
        const forgeMeta: Forge.JSON = JSON.parse(content);
        if (out.has(prefix + forgeMeta.ast.absolutePath)) {
          throw new Error(
            `duplicate absolutePath ${
              forgeMeta.ast.absolutePath
            } found in ${f} and ${out.get(forgeMeta.ast.absolutePath)}`,
          );
        }
        out.set(prefix + forgeMeta.ast.absolutePath, f);
      } catch (e) {
        console.warn(`File ${f} is not forge meta: ${e}`);
      }
    }
  }
}

export async function clearDir(dir: string): Promise<void> {
  for (const file of await fs.readdir(dir)) {
    await fs.rm(path.resolve(dir, file), { force: true, recursive: true });
  }
}

/**
 * Finds deploy metadata file in deploy repos and returns its content
 * @param safeTxHash
 * @returns
 */
export async function getDeployMeta(
  safeTxHash: string,
  sandboxDir: string,
): Promise<Deploy.Transaction> {
  const files = DEPLOY_REPOS.map(r =>
    path.resolve(sandboxDir, r, "deploys", `${safeTxHash}.json`),
  );
  for (const f of files) {
    try {
      const content = await fs.readFile(f, "utf-8");
      return JSON.parse(content);
    } catch {}
  }
  throw new Error(`metadata file for safe tx ${safeTxHash} not found`);
}