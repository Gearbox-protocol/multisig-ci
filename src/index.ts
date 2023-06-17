import { ethers } from "ethers";

import SafeHelper from "./safe.js";
import { waitForBlock, warpTime } from "./utils.js";

const { SAFE_TX, RUN_ID } = process.env;
console.log(`run ${RUN_ID}: testing safe tx ${SAFE_TX}`);

const provider = new ethers.providers.JsonRpcProvider("http://127.0.0.1:8545");
const block = await waitForBlock(provider);
console.log(`current block number: ${block.number} at ${block.timestamp}`);

const safeHelper = new SafeHelper(provider);
await safeHelper.init();
const eta = await safeHelper.validateTransaction();
await safeHelper.impersonateSafe();
await safeHelper.ensurePermissions();
await safeHelper.timelockQueue();
await warpTime(provider, eta + 1);
await safeHelper.timelockExecute();

console.log("done");
