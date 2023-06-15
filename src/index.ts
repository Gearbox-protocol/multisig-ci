import { Contract, ethers } from "ethers";
import assert from "node:assert/strict";

import { aclAbi, addressProviderAbi } from "./contracts.js";
import { fetchTimelockTransaction } from "./safe.js";
import {
  impersonate,
  stopImpersonate,
  waitForBlock,
  warpTime,
} from "./utils.js";

const { SAFE_TX, RUN_ID, MULTISIG } = process.env;
const SIG_EXECUTE = "0x0825f38f";
const SIG_QUEUE = "0x3a66f901";
const ADDRESS_PROVIDER = "0xcF64698AFF7E5f27A11dff868AF228653ba53be0";

assert.ok(SAFE_TX, "Safe tx hash not specified");
assert.ok(MULTISIG, "Multisig address not specified");

console.log(`Run ${RUN_ID}: testing safe tx ${SAFE_TX}`);

// Wait till anvil is ready
const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
const block = await waitForBlock(provider);
console.log(`Current block number: ${block.number} at ${block.timestamp}`);

const ap = new Contract(ADDRESS_PROVIDER, addressProviderAbi, provider);
const aclAddress = await ap.getACL();
console.log("ACL address:", aclAddress);
const acl = new Contract(aclAddress, aclAbi, provider);

console.log("Impersonating multisig...");
const signer = await impersonate(provider, MULTISIG);

let eta = 0;
const { txs, timelock } = await fetchTimelockTransaction(SAFE_TX);

await signer.sendUnsigned(acl.addPausableAdmin.populateTransaction(timelock));
console.log("Added timelock to pausable admins");

await signer.sendUnsigned(acl.addUnpausableAdmin.populateTransaction(timelock));
console.log("Added timelock to unpausable admins");

await signer.sendUnsigned(acl.transferOwnership.populateTransaction(timelock));
console.log("Transfered ACL ownership to timelock");

await signer.sendUnsigned(ap.transferOwnership.populateTransaction(timelock));
console.log("Transfered Address Provider ownership to timelock");

for (let i = 0; i < txs.length; i++) {
  const tx = txs[i];
  eta = Math.max(parseInt(tx.dataDecoded.parameters[4].value, 10), eta);
  const receipt = await signer.sendUnsigned(tx);
  assert.ok(receipt?.status, "queueTransaction failed");
  console.log(`Queued ${i + 1}/${txs.length} transactions`);
}

await warpTime(provider, eta);

for (let i = 0; i < txs.length; i++) {
  const tx = txs[i];
  tx.data = tx.data.replace(SIG_QUEUE, SIG_EXECUTE);
  const receipt = await signer.sendUnsigned(tx);
  assert.ok(receipt?.status, `executeTransaction ${i + 1} failed`);
  console.log(`Executed ${i + 1}/${txs.length} transactions`);
}

await stopImpersonate(provider, MULTISIG);
console.log("Done");
