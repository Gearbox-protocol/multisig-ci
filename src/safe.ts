import assert from "node:assert/strict";

import {
  MultisendTransactionDecoded,
  SafeMultisigTransaction,
} from "./types.js";

interface TimelockTransactions {
  txs: MultisendTransactionDecoded[];
  timelock: string;
}

export async function fetchTimelockTransaction(
  safeTxHash: string,
): Promise<TimelockTransactions> {
  const { SAFE_API } = process.env;
  assert.ok(SAFE_API, "Safe API not specified");
  const resp = await fetch(
    `${SAFE_API}/api/v1/multisig-transactions/${safeTxHash}/`,
  );
  const data: SafeMultisigTransaction = await resp.json();
  // console.log(JSON.stringify(data, null, 2));

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
  for (const tx of txs) {
    assert.equal(tx.dataDecoded.method, "queueTransaction");
    assert.equal(tx.dataDecoded.parameters.length, 5);
  }
  console.log(`Fetched ${txs.length} timelock transactions`);

  return {
    txs,
    timelock: txs[0].to,
  };
}
