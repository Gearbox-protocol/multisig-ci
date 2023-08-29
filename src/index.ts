import { exportVariable } from "@actions/core";
import chalk from "chalk";
import { ethers } from "ethers";

import report from "./report.js";
import SafeHelper from "./safe.js";
import { waitForBlock } from "./utils.js";

const { SAFE_TX, RUN_ID, DEV_RPC = "http://127.0.0.1:8545" } = process.env;
const isTenderly = DEV_RPC.includes("tenderly");
if (isTenderly) {
  console.log(chalk.red("running on tenderly"));
}
console.log(
  `run ${chalk.green(RUN_ID)}: testing safe tx ${chalk.white(SAFE_TX)}`,
);

const provider = new ethers.providers.StaticJsonRpcProvider({
  url: DEV_RPC,
  timeout: 120_000,
});
const block = await waitForBlock(provider);
console.log(`current block number: ${block.number} at ${block.timestamp}`);

const safeHelper = new SafeHelper(provider, isTenderly);
await safeHelper.init();
await safeHelper.impersonateSafe();
const executed = await safeHelper.run();

try {
  exportVariable("EXECUTED_TRANSACTIONS", executed.join(","));
} catch (e) {
  console.warn(`Failed to set EXECUTED_TRANSACTIONS: ${e}`);
}

console.log("done");

await report(provider);
