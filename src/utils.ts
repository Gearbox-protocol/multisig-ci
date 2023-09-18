import { ethers } from "ethers";
import sortedUniqBy from "lodash-es/sortedUniqBy.js";
import type { Options } from "p-retry";
import retry from "p-retry";

import type { TxInfo } from "./types.js";

export async function impersonate(
  provider: ethers.providers.JsonRpcProvider,
  address: string,
): Promise<ethers.providers.JsonRpcSigner> {
  await provider.send("hardhat_impersonateAccount", [address]);
  await provider.send("hardhat_setBalance", [
    address,
    "0x10000000000000000000",
  ]);
  return provider.getSigner(address);
}

export async function stopImpersonate(
  provider: ethers.providers.JsonRpcProvider,
  address: string,
): Promise<void> {
  await provider.send("hardhat_stopImpersonatingAccount", [address]);
}

export async function waitForBlock(
  provider: ethers.providers.JsonRpcProvider,
  options: Options = {},
): Promise<ethers.providers.Block> {
  const block = await retry(
    async () => {
      const b = await provider.getBlock("latest");
      if (!b) {
        throw new Error("null block");
      }
      return b;
    },
    {
      ...options,
      retries: options.retries ?? 5,
      minTimeout: options.minTimeout ?? 3000,
      factor: options.factor ?? 1,
    },
  );
  return block;
}

export async function warpTime(
  provider: ethers.providers.JsonRpcProvider,
  time: number,
  tenderly = false,
): Promise<void> {
  let latestBlock = await provider.getBlock("latest");
  if (latestBlock.timestamp >= time) {
    // time warp is not needed
    return;
  }

  if (tenderly) {
    await provider.send("evm_increaseTime", [
      ethers.utils.hexValue(time - latestBlock.timestamp + 1),
    ]);
  } else {
    await provider.send("evm_mine", [time + 1]);
  }
  latestBlock = await provider.getBlock("latest");
  console.log(
    `warped time, latest block #${latestBlock.number} at ${latestBlock.timestamp}`,
  );
}

interface SortableTx {
  nonce: number;
  submissionDate: string;
}

interface SortableTxList<T extends SortableTx> {
  results: T[];
}

/**
 * Given a list of pending transactions, returns an array of transactions to execute on fork
 * Sorted by nonce ASC
 * If two txs with same nonce exist, most recent one is selected
 * @param resp
 * @returns
 */
export function getTransactionsToExecute<
  T extends SortableTx,
  L extends SortableTxList<T>,
>(resp: L): T[] {
  return sortedUniqBy(
    resp.results.sort((a: T, b: T) => {
      if (a.nonce !== b.nonce) {
        return a.nonce - b.nonce;
      } else {
        return (
          new Date(b.submissionDate).getTime() -
          new Date(a.submissionDate).getTime()
        );
      }
    }),
    "nonce",
  );
}

export function txType(tx: TxInfo): string {
  let t = "safe tx";
  if (tx.isQueue) {
    t = "timelock queue tx";
  } else if (tx.isExecute) {
    t = "timelock execute tx";
  }
  if (tx.multisend) {
    t = "multisend " + t;
  }
  return t;
}
