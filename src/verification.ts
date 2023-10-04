import chalk from "chalk";
import { ethers } from "ethers";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

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

export interface ContractMeta {
  /**
   * repo name with '@' prefix
   */
  repo: string;
  commit?: string;
  forgeFlags?: string;
}

export function getContractRepo(meta: Deploy.Contract): ContractMeta {
  const [org, name] = meta.metadata.source
    .split("/")
    .filter(p => p !== "node_modules")
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
  // if (!meta.metadata.commit) {
  // throw new Error(`Commit not found for source '${meta.metadata.source}'`);
  // }

  return {
    repo: `${org}/${name}`,
    commit: meta.metadata.commit,
    forgeFlags: getForgeBuildFlags(meta.metadata),
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
export function getForgeBuildFlags(meta: Deploy.CompilerInfo): string {
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
 * Gets CLI flags to pass to `forge create`
 * https://book.getfoundry.sh/reference/forge/forge-build
 * @param contract
 */
export function getForgeCreateFlags(meta: Deploy.Contract): string {
  const buildFlags = getForgeBuildFlags(meta.metadata);
  // forge create src/Contract.sol:MyToken --constructor-args "My Token" "MT"
  const { repo } = getContractRepo(meta);
  const src =
    meta.metadata.source.replace(repo + "/", "") + ":" + meta.contractName;

  return [
    buildFlags,
    "--unlocked",
    "--from",
    "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", // well-known
    "--json",
    src,
    "--constructor-args",
    ...meta.constructorArguments.map(a => {
      // strings with spaces in quotes
      if (a.includes(" ")) {
        return `"${a}"`;
      }
      // rest (addresses, numbers) as-is
      return a;
    }),
  ].join(" ");
}

/**
 * gatherRepos gets metadata file and returns map between repo name and commit to checkout
 * it throws if there're different commit from same repo
 **/
export function gatherRepos(metadata: Deploy.Transaction): ContractMeta[] {
  const contracts = Object.values(metadata);
  const repos = new Map<string, ContractMeta>();
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
  { repo, commit }: ContractMeta,
  sandboxDir: string,
): Promise<void> {
  // const prefix = chalk.cyan(`[clone][${repo}]`);
  // const to = commit ? ` to ${chalk.white(commit.slice(0, 8))}` : "";
  // console.log(`${prefix} cloning...`);
  // const git: SimpleGit = simpleGit({
  //   baseDir: sandboxDir,
  // });
  // await git.clone(getGithubUrl(repo));
  // console.log(`${prefix} cloned`);
  // if (commit) {
  //   const git = simpleGit({
  //     baseDir: path.resolve(sandboxDir, repo.split("/")[1]),
  //   });
  //   await git.reset(["--hard", commit]);
  //   console.log(`${prefix} reset ${to}`);
  // }
}

/**
 * buildRepo installs deps and runs forge build
 * Set bytecodeHash to true to add metadata hash to bytecode
 */
export async function buildRepo(
  { repo, forgeFlags }: ContractMeta,
  sandboxDir: string,
  bytecodeHash = false,
): Promise<void> {
  const prefix = chalk.cyan(`[build][${repo}]`);
  const dir = path.resolve(sandboxDir, repo.split("/")[1]);
  console.log(`${prefix} yarn install in ${dir}`);
  spawnSync("yarn", ["install", "--frozen-lockfile", "--silent"], {
    stdio: "inherit",
    cwd: dir,
  });
  // Use latest forge-std
  // await fs.rm(path.resolve(dir, "lib/forge-std"), {
  //   force: true,
  //   recursive: true,
  // });
  // await fs.rm(path.resolve(dir, ".gitmodules"), {
  //   force: true,
  //   recursive: true,
  // });
  // spawnSync("forge", ["install", "foundry-rs/forge-std@v1.6.1", "--no-git"], {
  //   stdio: "inherit",
  //   cwd: dir,
  // });

  console.log(`${prefix} forge build ${forgeFlags} in ${dir}`);
  spawnSync("forge", ["build", ...(forgeFlags?.split(" ") ?? [])], {
    stdio: "inherit",
    cwd: dir,
    env: {
      ...process.env,
      ...(bytecodeHash ? {} : { FOUNDRY_BYTECODE_HASH: "none" }),
    },
  });
}

export async function deployContract(
  provider: ethers.providers.JsonRpcProvider,
  contract: Deploy.Contract,
  sandboxDir: string,
): Promise<string> {
  const { repo } = getContractRepo(contract);
  const dir = path.resolve(sandboxDir, repo.split("/")[1]);
  const prefix = chalk.cyan(`[deploy][${contract.contractName}]`);
  const deployFlags = getForgeCreateFlags(contract);
  console.log(`${prefix} forge create ${deployFlags} in ${dir}`);

  const { status, stdout, stderr } = spawnSync(
    "forge",
    ["create", ...(deployFlags?.split(" ") ?? [])],
    {
      cwd: dir,
      encoding: "utf-8",
    },
  );
  if (status !== 0) {
    throw new Error(stderr);
  }
  const { transactionHash } = JSON.parse(stdout);
  console.info(`${prefix} deployed in tx ${chalk.yellow(transactionHash)}`);
  const tx = await provider.getTransaction(transactionHash);
  return tx.data;
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
        // console.warn(`File ${f} is not forge meta: ${e}`);
      }
    }
  }
}

export async function clearDir(dir: string): Promise<void> {
  // for (const file of await fs.readdir(dir)) {
  //   await fs.rm(path.resolve(dir, file), { force: true, recursive: true });
  // }
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
