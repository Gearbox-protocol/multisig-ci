import chalk from "chalk";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

import * as Forge from "./forge.types.js";
import { SafeBase } from "./safe-base.js";
import { DecodedTx } from "./types.js";
import {
  create2Address,
  getCreate2transactions,
  getTransactionsToExecute,
} from "./utils.js";
import {
  buildRepo,
  clearDir,
  cloneRepo,
  DEPLOY_REPOS,
  gatherRepos,
  getDeployMeta,
  traverseForgeOut,
} from "./verification.js";

const SANDBOX = path.resolve(process.cwd(), "sandbox");

export class Verifier extends SafeBase {
  public async verify(...args: string[]): Promise<void> {
    await this.init();
    // TODO: modify input to accept not only safe tx hashes, but also jsons that are uploaded to safe
    if (args.length === 0) {
      await this.#verifyPending();
    }
    for (const safeTxHash of args) {
      await this.#verifySafeTx(safeTxHash);
    }
  }

  async #verifyPending(): Promise<void> {
    const pendingTransactions = await this.service.getPendingTransactions(
      this.safeAddress,
    );
    const pending = getTransactionsToExecute(pendingTransactions);
    for (const tx of pending) {
      await this.#verify(tx as any);
    }
  }

  async #verifySafeTx(safeTxHash: string): Promise<void> {
    const tx = await this.service.getTransaction(safeTxHash);
    if (!tx) {
      throw new Error(`safe tx ${safeTxHash} not found`);
    }
    await this.#verify(tx as any);
  }

  async #verify(tx: DecodedTx): Promise<void> {
    console.info(`Verifying tx ${chalk.green(tx.safeTxHash)}...`);
    await fs.writeFile(
      path.resolve(SANDBOX, `${tx.safeTxHash}.tx.json`),
      JSON.stringify(tx, null, 2),
    );
    await clearDir(SANDBOX);

    await Promise.all(
      DEPLOY_REPOS.map(r =>
        cloneRepo({ repo: `@gearbox-protocol/${r}` }, SANDBOX),
      ),
    );
    // find metadata for safe tx
    const meta = await getDeployMeta(tx.safeTxHash, SANDBOX);
    const repos = gatherRepos(meta);
    await Promise.all(
      repos.map(async r => {
        await cloneRepo(r, SANDBOX);
        await buildRepo(r, SANDBOX);
      }),
    );

    // Mapping metadata.source -> forge-out json file path
    const meta2file = new Map<string, string>();
    for (const { repo } of repos) {
      await traverseForgeOut(
        repo + "/",
        path.resolve(SANDBOX, repo.split("/")[1], "forge-out"),
        meta2file,
      );
    }

    const create2txs = getCreate2transactions(tx);
    const metaDeploys = Object.values(meta);
    for (const tx2 of create2txs) {
      const address = create2Address(tx2);
      const metaDeploy = metaDeploys.find(
        d => d.contractAddress.toLowerCase() === address.toLowerCase(),
      );

      if (!metaDeploy) {
        throw new Error("meta not found for create2 transaction");
      }

      const forgeFile = meta2file.get(metaDeploy.metadata.source);
      if (!forgeFile) {
        throw new Error("forge file not found for create2 transaction");
      }

      const forgeData: Forge.JSON = JSON.parse(
        readFileSync(forgeFile, "utf-8"),
      );

      const log = `----------- CREATE2 TRANSACTION BYTECODE -----------------
${tx2.bytecode}
      

----------- FORGE BYTECODE -----------------
${forgeData.bytecode.object}
      

----------- CONSTRUCTOR ARGS -----------------
${metaDeploy.encodedConstructorArgs}`;

      await fs.writeFile(path.resolve(SANDBOX, `${address}.log`), log);
    }
  }
}
