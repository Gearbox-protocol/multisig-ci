import SafeApiKit from "@safe-global/api-kit";
import Safe, { EthersAdapter } from "@safe-global/protocol-kit";
import {
  SafeMultisigTransactionResponse,
  SafeTransaction,
} from "@safe-global/safe-core-sdk-types";
import { ethers } from "ethers";
import assert from "node:assert/strict";

import { MultisendTx, SingleTx, TimelockExecute, TxInfo } from "./types.js";
import {
  getTransactionsToExecute,
  impersonate,
  stopImpersonate,
  warpTime,
} from "./utils.js";

const SIG_EXECUTE = "0x0825f38f";
const SIG_QUEUE = "0x3a66f901";

class SafeHelper {
  #provider: ethers.providers.JsonRpcProvider;
  #service!: SafeApiKit.default;
  #signer!: ethers.providers.JsonRpcSigner;
  #safeAddress: string;
  #safe!: Safe.default;
  #pending: SafeMultisigTransactionResponse[] = [];
  #timelockExecutions: TimelockExecute[] = [];

  constructor(provider: ethers.providers.JsonRpcProvider) {
    this.#provider = provider;
    const { MULTISIG } = process.env;
    assert.ok(MULTISIG, "multisig address not specified");
    this.#safeAddress = MULTISIG;
  }

  public async init(): Promise<void> {
    const { SAFE_API } = process.env;
    assert.ok(SAFE_API, "safe API not specified");

    this.#signer = this.#provider.getSigner();
    const ethAdapter = new EthersAdapter({
      ethers: ethers as any,
      signerOrProvider: this.#signer,
    });

    // eslint-disable-next-line new-cap
    this.#service = new SafeApiKit.default({
      txServiceUrl: SAFE_API,
      ethAdapter,
    });

    this.#safe = await Safe.default.create({
      ethAdapter,
      safeAddress: this.#safeAddress,
    });
    const signerAddress = await this.#signer.getAddress();

    console.log("initialized safe helper with signer:", signerAddress);
    const pendingTransactions = await this.#service.getPendingTransactions(
      this.#safeAddress,
    );
    this.#pending = getTransactionsToExecute(pendingTransactions);
  }

  /**
   * Impersonates safe and:
   * - adds new owner: wallet from testnet
   * - sets threshold to 1
   * All the following safe interactions will be done via test wallet
   */
  public async impersonateSafe(): Promise<void> {
    const impersonatedSafe = await impersonate(
      this.#provider,
      this.#safeAddress,
    );
    const ownerAddress = await this.#signer.getAddress();
    const addOwnerTx = await this.#safe.createAddOwnerTx({
      ownerAddress,
      threshold: 1,
    });
    const hash = await impersonatedSafe.sendUncheckedTransaction({
      to: addOwnerTx.data.to,
      data: addOwnerTx.data.data,
    });
    const receipt = await this.#provider.getTransactionReceipt(hash);
    assert.ok(receipt.status, "failed to add owner to safe");
    const owners = await this.#safe.getOwners();
    assert.ok(owners.includes(ownerAddress), "owner was not added");
    console.log("added fake owner to safe and set threshold to 1");
    await stopImpersonate(this.#provider, this.#safeAddress);
  }

  public async run(): Promise<void> {
    // iterate through pending transactions
    for (const tx of this.#pending) {
      const { timestamp } = await this.#provider.getBlock("latest");
      const { multisend, isExecute, isQueue, eta } = this.#validateTransaction(
        timestamp,
        tx,
      );
      if (isExecute) {
        await warpTime(this.#provider, eta + 1);
      }
      await this.#execute(tx);
      if (isQueue) {
        this.#timelockExecutions.push(
          await this.#getTimelockExecute(tx, multisend, eta),
        );
      }
    }
    // iterate through "executeTransaction" timelock
    for (const tx of this.#timelockExecutions) {
      await warpTime(this.#provider, tx.eta + 1);
      await this.#execute(tx.tx);
    }
  }

  #validateTransaction(
    timestamp: number,
    data: SafeMultisigTransactionResponse,
  ): TxInfo {
    assert.ok(!data.isExecuted, "safe tx already executed");
    if ((data.dataDecoded as any)?.method === "multiSend") {
      return this.#validateMultisend(timestamp, data as unknown as MultisendTx);
    }
    return this.#validateSingle(timestamp, data as unknown as SingleTx);
  }

  #validateMultisend(timestamp: number, data: MultisendTx): TxInfo {
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
    let eta = 0;
    let isQueue = false;
    let isExecute = false;
    for (const tx of txs) {
      const method = tx.dataDecoded.method;
      if (method === "queueTransaction" || method === "executeTransaction") {
        assert.equal(tx.dataDecoded.parameters.length, 5);
        eta = Math.max(parseInt(tx.dataDecoded.parameters[4].value, 10), eta);
        isQueue ||= method === "queueTransaction";
        isExecute ||= method === "executeTransaction";
      }
    }

    if (eta) {
      assert.ok(eta > timestamp, "ETA is outdated");
    }

    return {
      multisend: true,
      isQueue,
      isExecute,
      eta,
    };
  }

  #validateSingle(timestamp: number, data: SingleTx): TxInfo {
    const method = data.dataDecoded.method;
    if (method === "queueTransaction" || method === "executeTransaction") {
      const isQueue = method === "queueTransaction";
      assert.equal(data.dataDecoded.parameters.length, 5);
      const etaP = data.dataDecoded.parameters.find(p => p.name === "eta");
      assert.ok(etaP, "eta parameter not found");
      const eta = parseInt(data.dataDecoded.parameters[4].value, 10);
      assert.ok(eta > timestamp, "ETA is outdated");
      return {
        isQueue,
        isExecute: !isQueue,
        multisend: false,
        eta,
      };
    }
    return {
      isQueue: false,
      isExecute: false,
      multisend: false,
      eta: timestamp,
    };
  }

  /**
   * Executes transaction as is
   */
  async #execute(
    tx: SafeMultisigTransactionResponse | SafeTransaction,
  ): Promise<void> {
    const executeTxResponse = await this.#safe.executeTransaction(tx, {
      gasLimit: 30_000_000,
    });
    const receipt = await Promise.resolve(
      executeTxResponse.transactionResponse?.wait(),
    );
    assert.ok(receipt?.status, "failed to execute transaction");
    if ("safeTxHash" in tx) {
      console.log(`executed safe tx ${tx.safeTxHash} with nonce ${tx.nonce}`);
    } else {
      console.log(`executed safe tx with nonce ${tx.data.nonce}`);
    }
  }

  /**
   * Replaces `queue` with `execute` in multisend and single timelock transactions
   * @param data
   * @param multisend
   * @param eta
   * @returns
   */
  async #getTimelockExecute(
    data: SafeMultisigTransactionResponse,
    multisend: boolean,
    eta: number,
  ): Promise<TimelockExecute> {
    let tx: SafeTransaction;
    if (multisend) {
      tx = await this.#safe.createTransaction({
        safeTransactionData: (
          data as unknown as MultisendTx
        ).dataDecoded.parameters[0].valueDecoded.map(v => ({
          ...v,
          data: v.data.replace(SIG_QUEUE, SIG_EXECUTE),
        })),
      });
    } else {
      const t = data as unknown as SingleTx;
      tx = await this.#safe.createTransaction({
        safeTransactionData: {
          to: t.to,
          data: t.data!.replace(SIG_QUEUE, SIG_EXECUTE),
          value: t.value,
        },
      });
    }
    console.log(
      `Created timelock execute tx for ${
        multisend ? "multisend" : "single"
      } safe tx ${data.safeTxHash}: nonce ${tx.data.nonce} and eta ${eta}`,
    );
    return { tx, eta };
  }
}

export default SafeHelper;
