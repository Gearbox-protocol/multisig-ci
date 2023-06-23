import { ethers } from "ethers";

import SafeHelper from "./safe.js";
import { waitForBlock } from "./utils.js";

const { SAFE_TX, RUN_ID } = process.env;
console.log(`run ${RUN_ID}: testing safe tx ${SAFE_TX}`);

const provider = new ethers.providers.JsonRpcProvider("http://127.0.0.1:8545");
const block = await waitForBlock(provider);
console.log(`current block number: ${block.number} at ${block.timestamp}`);

const safeHelper = new SafeHelper(provider);
await safeHelper.init();
await safeHelper.impersonateSafe();
await safeHelper.run();

console.log("done");
