import { splitAuxdata } from "@ethereum-sourcify/bytecode-utils";
import {
  CheckedContract,
  checkFiles,
  Match,
  Metadata,
} from "@ethereum-sourcify/lib-sourcify";
import { defaultAbiCoder as abiCoder, ParamType } from "@ethersproject/abi";
import { AbiConstructor } from "abitype";
import chalk from "chalk";
import fs from "node:fs/promises";
import path from "node:path";

import * as Batch from "./batch.types.js";
import * as Deploy from "./deploy.types.js";
import { SafeBase } from "./safe-base.js";
import { DecodedTx } from "./types.js";
import {
  create2Address,
  Create2Tx,
  doesContainMetadataHash,
  extractAbiEncodedConstructorArguments,
  extractFilesFromJSON,
  getCreate2transactions,
  getTransactionsToExecute,
  stringifyInvalidAndMissing,
} from "./utils.js";
import {
  clearDir,
  cloneRepo,
  DEPLOY_REPOS,
  getDeployMeta,
} from "./verification.js";

const SANDBOX = path.resolve(process.cwd(), "sandbox");

type VerificationResult =
  | {
      contract: string;
      match: "perfect" | "partial";
    }
  | {
      contract: string;
      error: string;
    };

export class Verifier extends SafeBase {
  public async verify(...args: string[]): Promise<void> {
    await this.init();
    if (args.length === 0) {
      // ger all pending txs from safe and verify each
      const pendingTransactions = await this.service.getPendingTransactions(
        this.safeAddress,
      );
      const pending = getTransactionsToExecute(pendingTransactions);
      for (const tx of pending) {
        await this.#verifySafeTx(tx as any);
      }
    } else if (args.length === 2 && args.every(a => a.endsWith(".json"))) {
      // if given to .json arguments, will verify them as batch file and deploy meta file
      await this.#verifyBatchAndMeta(args[0], args[1]);
      return;
    } else {
      // ptherwise accept list of safe tx hashes
      for (const safeTxHash of args) {
        const tx = await this.service.getTransaction(safeTxHash);
        if (!tx) {
          throw new Error(`safe tx ${safeTxHash} not found`);
        }
        await this.#verifySafeTx(tx as any);
      }
    }
  }

  /**
   * Verifies that batch file (the one that is uploaded to gnosis safe ui) matches deploy metadata
   * @param batchFile
   * @param metaFile
   */
  async #verifyBatchAndMeta(
    batchFile: string,
    metaFile: string,
  ): Promise<void> {
    await clearDir(SANDBOX);
    await Promise.all(
      DEPLOY_REPOS.map(r =>
        cloneRepo({ repo: `@gearbox-protocol/${r}` }, SANDBOX),
      ),
    );

    const batchContent = await fs.readFile(batchFile, "utf-8");
    const metaContent = await fs.readFile(metaFile, "utf-8");
    const batch: Batch.Batch = JSON.parse(batchContent);
    const meta: Deploy.Transaction = JSON.parse(metaContent);
    const create2txs = getCreate2transactions(batch);
    await this.#verify(create2txs, meta);
  }

  /**
   * Verifies gnosis safe transaction, will look up deploy metadata by safeTxHash
   * @param tx
   */
  async #verifySafeTx(tx: DecodedTx): Promise<void> {
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
    const create2txs = getCreate2transactions(tx);
    await this.#verify(create2txs, meta);
  }

  async #verify(
    create2txs: Create2Tx[],
    meta: Deploy.Transaction,
  ): Promise<void> {
    const addressToMeta = new Map<string, Deploy.Contract>(
      Object.values(meta).map(c => [c.contractAddress, c]),
    );

    for (const tx2 of create2txs) {
      const address = create2Address(tx2);
      const metaContract = addressToMeta.get(address);

      if (!metaContract) {
        throw new Error(
          `contract meta not found for create2 transaction with address ${address}`,
        );
      }

      const match = await this.#verifyCreate2Tx(tx2, metaContract);
      console.log(match);
    }
  }

  async #verifyCreate2Tx(
    tx: Create2Tx,
    meta: Deploy.Contract,
  ): Promise<VerificationResult> {
    const result: Pick<VerificationResult, "contract"> = {
      contract: meta.contractName + "@" + meta.contractAddress,
    };
    try {
      if (!meta.files) {
        return {
          ...result,
          error: "files not provided",
        };
      }
      const files = extractFilesFromJSON(meta.files);
      const contracts: CheckedContract[] = await checkFiles(files);
      const errors = contracts
        .filter(contract => !CheckedContract.isValid(contract, false))
        .map(stringifyInvalidAndMissing);
      if (errors.length) {
        return {
          ...result,
          error: "Invalid or missing sources in:\n" + errors.join("\n"),
        };
      }
      if (contracts.length !== 1) {
        return {
          ...result,
          error: "ambiguous metadata",
        };
      }
      const [contract] = contracts;
      const recompiled = await contract.recompile();
      if (
        recompiled.deployedBytecode === "0x" ||
        recompiled.creationBytecode === "0x"
      ) {
        return {
          ...result,
          error: `The compiled contract bytecode is "0x". Are you trying to verify an abstract contract?`,
        };
      }

      // Since we're dealing with creation transaction, the code below is based on
      // matchWithCreationTx function from @ethereum-sourcify/lib-sourcify
      const match: Match = {
        address: meta.contractAddress,
        chainId: "7878",
        status: null,
      };
      const creatorTxData = tx.bytecode;
      const recompiledCreationBytecode = recompiled.creationBytecode;
      // Skipping addLibraryAddresses here: we don't use them in gearbox

      if (creatorTxData.startsWith(recompiledCreationBytecode)) {
        // if the bytecode doesn't contain metadata then "partial" match
        if (doesContainMetadataHash(recompiledCreationBytecode)) {
          match.status = "perfect";
        } else {
          match.status = "partial";
        }
      } else {
        // Match without metadata hashes
        const [trimmedCreatorTxData] = splitAuxdata(creatorTxData); // In the case of creationTxData (not deployed bytecode) it is actually not CBOR encoded because of the appended constr. args., but splitAuxdata returns the whole bytecode if it's not CBOR encoded, so will work with startsWith.
        const [trimmedRecompiledCreationBytecode] = splitAuxdata(
          recompiledCreationBytecode,
        );
        if (
          trimmedCreatorTxData.startsWith(trimmedRecompiledCreationBytecode)
        ) {
          match.status = "partial";
        }
      }

      if (match.status) {
        const abiEncodedConstructorArguments =
          extractAbiEncodedConstructorArguments(
            creatorTxData,
            recompiledCreationBytecode,
          );
        if (
          abiEncodedConstructorArguments?.replace("0x", "") !==
          meta.encodedConstructorArgs
        ) {
          return {
            ...result,
            error: `Encoded constructor arguments mismatch: meta ${meta.encodedConstructorArgs} tx ${abiEncodedConstructorArguments}`,
          };
        }
        const recompiledMetadata: Metadata = JSON.parse(recompiled.metadata);
        const constructorAbiParamInputs = (
          recompiledMetadata?.output?.abi?.find(
            param => param.type === "constructor",
          ) as AbiConstructor
        )?.inputs as ParamType[];
        if (abiEncodedConstructorArguments) {
          if (!constructorAbiParamInputs) {
            return {
              ...result,
              error: `Failed to match with creation bytecode: constructor ABI Inputs are missing`,
            };
          }
          // abiCoder doesn't break if called with a wrong `abiEncodedConstructorArguments`
          // so in order to successfuly check if the constructor arguments actually match
          // we need to re-encode it and compare them
          const decodeResult = abiCoder.decode(
            constructorAbiParamInputs,
            abiEncodedConstructorArguments,
          );
          const encodeResult = abiCoder.encode(
            constructorAbiParamInputs,
            decodeResult,
          );
          if (encodeResult !== abiEncodedConstructorArguments) {
            return {
              ...result,
              error: `Failed to match with creation bytecode: constructor arguments ABI decoding failed ${encodeResult} vs ${abiEncodedConstructorArguments}`,
            };
          }
        }
      }

      if (match.status === "perfect" || match.status === "partial") {
        return { ...result, match: match.status };
      }
      return { ...result, error: `match is ${match.status}` };
    } catch (e: any) {
      return { ...result, error: `${e}` };
    }
  }
}
