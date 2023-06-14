import { Contract, ethers } from "ethers";
import assert from "node:assert/strict";

import { aclAbi, addressProviderAbi } from "./contracts.js";
import { SafeMultisigTransaction } from "./types.js";
import {
  impersonate,
  stopImpersonate,
  waitForBlockNumber,
  warpTime,
} from "./utils.js";

const { SAFE_API, SAFE_TX, RUN_ID, MULTISIG } = process.env;
const SIG_EXECUTE = "0x0825f38f";
const SIG_QUEUE = "0x3a66f901";
const ADDRESS_PROVIDER = "0xcF64698AFF7E5f27A11dff868AF228653ba53be0";

assert.ok(SAFE_API, "Safe API not specified");
assert.ok(SAFE_TX, "Safe tx hash not specified");
assert.ok(MULTISIG, "Multisig address not specified");

console.log(`Run ${RUN_ID}: testing safe tx ${SAFE_TX}`);

// Wait till anvil is ready
const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
const blockNumber = await waitForBlockNumber(provider);
console.log(`Current block number: ${blockNumber}`);

const resp = await fetch(
  `${SAFE_API}/api/v1/multisig-transactions/${SAFE_TX}/`,
);
const data: SafeMultisigTransaction = await resp.json();
console.log(JSON.stringify(data, null, 2));

assert.equal(
  data.dataDecoded.method,
  "multiSend",
  "expected multiSend transaction",
);
assert.equal(
  data.dataDecoded.parameters.length,
  1,
  "expected multiSend transaction with 1 parameter",
);
assert.equal(
  data.dataDecoded.parameters[0].name,
  "transactions",
  "expected multiSend transactions",
);
const txs = data.dataDecoded.parameters[0].valueDecoded;
assert.notEqual(txs.length, 0, "expected some transactions");

console.log("Impersonating multisig...");
const signer = await impersonate(provider, MULTISIG);

let eta = 0;
let timelockAddress = "";
for (let i = 0; i < txs.length; i++) {
  const tx = txs[i];
  timelockAddress = tx.to;
  assert.equal(tx.dataDecoded.method, "queueTransaction");
  assert.equal(tx.dataDecoded.parameters.length, 5);
  const txEta = parseInt(tx.dataDecoded.parameters[4].value, 10);
  eta = Math.max(txEta, eta);
  const resp = await signer.sendUncheckedTransaction({
    ...tx,
    gasLimit: 30_000_000,
  });

  const receipt = await provider.waitForTransaction(resp);
  console.log(`Queued ${i + 1}/${txs.length}`, receipt?.status);
}

console.log("warping time to", eta);
await warpTime(provider, eta);
const latestBlock = await provider.getBlock("latest");
assert.ok(latestBlock);
console.log(
  `warped time, latest block #${latestBlock.number} at ${latestBlock.timestamp}`,
);

const addressProvider = new Contract(
  ADDRESS_PROVIDER,
  addressProviderAbi,
  signer,
);
const aclAddress = await addressProvider.getACL();
const acl = new Contract(aclAddress, aclAbi, signer);
await signer.sendUncheckedTransaction(
  await acl.addPausableAdmin.populateTransaction(timelockAddress, {
    gasLimit: 30_000_000,
  }),
);
console.log("Added timelock to pausable admins");
await signer.sendUncheckedTransaction(
  await acl.addUnpausableAdmin.populateTransaction(timelockAddress, {
    gasLimit: 30_000_000,
  }),
);
console.log("Added timelock to unpausable admins");
await signer.sendUncheckedTransaction(
  await acl.transferOwnership.populateTransaction(timelockAddress, {
    gasLimit: 30_000_000,
  }),
);
console.log("Transfered ACL ownership to timelock");
await signer.sendUncheckedTransaction(
  await addressProvider.transferOwnership.populateTransaction(timelockAddress, {
    gasLimit: 30_000_000,
  }),
);
console.log("Transfered Address Provider ownership to timelock");

for (let i = 0; i < txs.length; i++) {
  const tx = txs[i];
  tx.data = tx.data.replace(SIG_QUEUE, SIG_EXECUTE);
  const resp = await signer.sendUncheckedTransaction({
    ...tx,
    gasLimit: 30_000_000,
  });

  const receipt = await provider.waitForTransaction(resp);
  console.log(`Executed ${i + 1}/${txs.length}`, receipt?.status);
}

await stopImpersonate(provider, MULTISIG);
console.log("Done");
