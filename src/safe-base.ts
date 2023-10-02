import SafeApiKit from "@safe-global/api-kit";
import Safe, { EthersAdapter } from "@safe-global/protocol-kit";
import { ethers } from "ethers";
import assert from "node:assert/strict";

export abstract class SafeBase {
  protected provider: ethers.providers.JsonRpcProvider;
  protected service!: SafeApiKit.default;
  protected signer!: ethers.providers.JsonRpcSigner;
  protected safeAddress: string;
  protected safe!: Safe.default;

  constructor(provider: ethers.providers.JsonRpcProvider) {
    this.provider = provider;
    const { MULTISIG } = process.env;
    assert.ok(MULTISIG, "multisig address not specified");
    this.safeAddress = MULTISIG;
  }

  protected async init(): Promise<void> {
    const { SAFE_API } = process.env;
    assert.ok(SAFE_API, "safe API not specified");

    this.signer = this.provider.getSigner();
    const ethAdapter = new EthersAdapter({
      ethers: ethers as any,
      signerOrProvider: this.signer,
    });

    // eslint-disable-next-line new-cap
    this.service = new SafeApiKit.default({
      txServiceUrl: SAFE_API,
      ethAdapter,
    });

    this.safe = await Safe.default.create({
      ethAdapter,
      safeAddress: this.safeAddress,
    });
    const signerAddress = await this.signer.getAddress();

    console.log("initialized safe helper with signer:", signerAddress);
  }
}
