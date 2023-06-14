import { ethers } from "ethers";
import retry, { Options } from "p-retry";

export async function impersonate(
  provider: ethers.JsonRpcProvider,
  address: string,
): Promise<ethers.JsonRpcSigner> {
  await provider.send("hardhat_impersonateAccount", [address]);
  await provider.send("hardhat_setBalance", [
    address,
    "0x10000000000000000000",
  ]);
  // return provider.getSigner(address);
  return new ethers.JsonRpcSigner(provider, address);
}

export async function stopImpersonate(
  provider: ethers.JsonRpcProvider,
  address: string,
): Promise<void> {
  await provider.send("hardhat_stopImpersonatingAccount", [address]);
}

export async function waitForBlockNumber(
  provider: ethers.JsonRpcProvider,
  options: Options = {},
): Promise<number> {
  const blockNumber = await retry(() => provider.getBlockNumber(), {
    ...options,
    retries: options.retries ?? 5,
    minTimeout: options.minTimeout ?? 3000,
    factor: options.factor ?? 1,
  });
  return blockNumber;
}

export async function warpTime(
  provider: ethers.JsonRpcProvider,
  time: number,
): Promise<void> {
  await provider.send("evm_mine", [time + 1]);
}
