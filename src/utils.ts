import { Block, ethers, TransactionReceipt } from "ethers";
import assert from "node:assert/strict";
import retry, { Options } from "p-retry";

import { TransactionRequest } from "../node_modules/ethers/src.ts/providers/provider.js";

class ImpersonatedSigner extends ethers.JsonRpcSigner {
  public async sendUnsigned(
    tx: TransactionRequest | Promise<TransactionRequest>,
  ): Promise<TransactionReceipt | null> {
    const txObj = await Promise.resolve(tx);
    const hash = await super.sendUncheckedTransaction({
      ...txObj,
      gasLimit: 30_000_000,
    });
    return retry(() => this.provider.waitForTransaction(hash, 1, 2000));
  }
}

export async function impersonate(
  provider: ethers.JsonRpcProvider,
  address: string,
): Promise<ImpersonatedSigner> {
  await provider.send("hardhat_impersonateAccount", [address]);
  await provider.send("hardhat_setBalance", [
    address,
    "0x10000000000000000000",
  ]);
  return new ImpersonatedSigner(provider, address);
}

export async function stopImpersonate(
  provider: ethers.JsonRpcProvider,
  address: string,
): Promise<void> {
  await provider.send("hardhat_stopImpersonatingAccount", [address]);
}

export async function waitForBlock(
  provider: ethers.JsonRpcProvider,
  options: Options = {},
): Promise<Block> {
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
  provider: ethers.JsonRpcProvider,
  time: number,
): Promise<void> {
  await provider.send("evm_mine", [time + 1]);
  const latestBlock = await provider.getBlock("latest");
  assert.ok(latestBlock);
  console.log(
    `warped time, latest block #${latestBlock.number} at ${latestBlock.timestamp}`,
  );
}
