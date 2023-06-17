import { ethers } from "ethers";
import assert from "node:assert/strict";
import retry, { Options } from "p-retry";

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
): Promise<void> {
  await provider.send("evm_mine", [time + 1]);
  const latestBlock = await provider.getBlock("latest");
  assert.ok(latestBlock);
  console.log(
    `warped time, latest block #${latestBlock.number} at ${latestBlock.timestamp}`,
  );
}
