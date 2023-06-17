import SafeApiKit from "@safe-global/api-kit";
import Safe, { EthersAdapter } from "@safe-global/protocol-kit";
import { ethers } from "ethers";
import assert from "node:assert/strict";

import { MultisigTx } from "./types.js";
import { impersonate, stopImpersonate } from "./utils.js";

const SIG_EXECUTE = "0x0825f38f";
const SIG_QUEUE = "0x3a66f901";

class SafeHelper {
  #provider: ethers.providers.JsonRpcProvider;
  #service!: SafeApiKit.default;
  #signer!: ethers.providers.JsonRpcSigner;
  #safeTxHash: string;
  #safeAddress: string;
  #safe!: Safe.default;

  constructor(provider: ethers.providers.JsonRpcProvider) {
    this.#provider = provider;
    const { SAFE_TX, MULTISIG } = process.env;
    assert.ok(SAFE_TX, "safe tx hash not specified");
    assert.ok(MULTISIG, "multisig address not specified");
    this.#safeTxHash = SAFE_TX;
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
  }

  /**
   * Checks that a transcaction is a timelock transaction that queues other transactions
   */
  public async validateTransaction(): Promise<number> {
    const data = (await this.#service.getTransaction(
      this.#safeTxHash,
    )) as unknown as MultisigTx;

    assert.ok(!data.isExecuted, "safe tx already executed");

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

    let eta = 0;
    for (const tx of txs) {
      eta = Math.max(parseInt(tx.dataDecoded.parameters[4].value, 10), eta);
    }
    console.log(
      `multisig transaction contains ${txs.length} timelock transactions and eta is ${eta}`,
    );

    return eta;
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

  /**
   * Before timelock transactions can be executed, it must be given some permissions
   * - acl.addPausableAdmin
   * - acl.addUnpausableAdmin
   * - acl.transferOwnership
   * - addressProvider.transferOwnership
   * There's multisig tx with safe tx hash 0x5c649bc2ed3069f8b39989f37d7396838263bb60bddb912b065989029e7c09e8
   * that performs this changes
   * @returns
   */
  public async ensurePermissions(): Promise<void> {
    const permissionsTx = await this.#service.getTransaction(
      "0x5c649bc2ed3069f8b39989f37d7396838263bb60bddb912b065989029e7c09e8",
    );
    if (permissionsTx.isExecuted) {
      console.log("pemissions tx is already executed");
      return;
    }
    const tx = await this.#safe.executeTransaction(permissionsTx, {
      gasLimit: 30_000_000,
    });
    const receipt = await tx.transactionResponse?.wait();
    assert.ok(receipt?.status, "failed to execute permissions tx");
    console.log("executed permissions tx");
  }

  /**
   * Executes multisig that contains timelock.queueTransaction calls
   */
  public async timelockQueue(): Promise<void> {
    const tx = await this.#service.getTransaction(this.#safeTxHash);
    const executeTxResponse = await this.#safe.executeTransaction(tx, {
      gasLimit: 30_000_000,
    });
    const receipt = await Promise.resolve(
      executeTxResponse.transactionResponse?.wait(),
    );
    assert.ok(receipt?.status, "failed to execute transaction");
    console.log("executed timelock queue transaction");
  }

  /**
   * Executes multisig that contains timelock.executeTransaction calls
   * It's manufacture from queueTransaction multisig tx by replacing call signatures
   */
  public async timelockExecute() {
    const queueTx = (await this.#service.getTransaction(
      this.#safeTxHash,
    )) as unknown as MultisigTx;

    const tx = await this.#safe.createTransaction({
      safeTransactionData: queueTx.dataDecoded.parameters[0].valueDecoded.map(
        v => ({
          ...v,
          data: v.data.replace(SIG_QUEUE, SIG_EXECUTE),
        }),
      ),
    });

    const resp = await this.#safe.executeTransaction(tx, {
      gasLimit: 30_000_000,
    });
    const receipt = await Promise.resolve(resp.transactionResponse?.wait());
    assert.ok(receipt?.status, "failed to execute queued transaction");
    console.log("executed timelock execute transaction");
  }
}

export default SafeHelper;
