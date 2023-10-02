import { ethers } from "ethers";

import { Verifier } from "./verifier.js";

const { DEV_RPC = "http://127.0.0.1:8545" } = process.env;

const provider = new ethers.providers.StaticJsonRpcProvider({
  url: DEV_RPC,
  timeout: 300_000,
});

const verifier = new Verifier(provider);
await verifier.verify(...process.argv.slice(2));
