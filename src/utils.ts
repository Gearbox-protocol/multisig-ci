import { decode as bytecodeDecode } from "@ethereum-sourcify/bytecode-utils";
import { CheckedContract, PathBuffer } from "@ethereum-sourcify/lib-sourcify";
import { ethers } from "ethers";
import sortedUniqBy from "lodash-es/sortedUniqBy.js";
import retry, { Options } from "p-retry";

import * as Batch from "./batch.types.js";
import {
  DecodedTx,
  MultisendTransactionDecoded,
  MultisendTx,
  SingleTx,
  TxInfo,
} from "./types.js";

const CREATE2_FACTORY_ADDR = "0x59b7B8Dd9E6e1F934C9c3Def4a1Eb69Bc17Ec9cc";
const create2factory = new ethers.utils.Interface([
  {
    inputs: [
      {
        internalType: "bytes32",
        name: "salt",
        type: "bytes32",
      },
      {
        internalType: "bytes",
        name: "bytecode",
        type: "bytes",
      },
    ],
    name: "deploy",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
]);

export async function impersonate(
  provider: ethers.providers.JsonRpcProvider,
  address: string,
): Promise<ethers.providers.JsonRpcSigner> {
  await provider.send("hardhat_impersonateAccount", [address]);
  await provider.send("hardhat_setBalance", [
    address,
    "0x10000000000000000000",
  ]);
  return provider.getSigner(address);
}

export async function stopImpersonate(
  provider: ethers.providers.JsonRpcProvider,
  address: string,
): Promise<void> {
  await provider.send("hardhat_stopImpersonatingAccount", [address]);
}

export async function waitForBlock(
  provider: ethers.providers.JsonRpcProvider,
  options: Options = {},
): Promise<ethers.providers.Block> {
  const block = await retry(
    async () => {
      const b = await provider.getBlock("latest");
      if (!b) {
        throw new Error("null block");
      }
      return b;
    },
    {
      ...options,
      retries: options.retries ?? 5,
      minTimeout: options.minTimeout ?? 3000,
      factor: options.factor ?? 1,
    },
  );
  return block;
}

export async function warpTime(
  provider: ethers.providers.JsonRpcProvider,
  time: number,
  tenderly = false,
): Promise<void> {
  let latestBlock = await provider.getBlock("latest");
  if (latestBlock.timestamp >= time) {
    // time warp is not needed
    return;
  }

  if (tenderly) {
    await provider.send("evm_increaseTime", [
      ethers.utils.hexValue(time - latestBlock.timestamp + 1),
    ]);
  } else {
    await provider.send("evm_mine", [time + 1]);
  }
  latestBlock = await provider.getBlock("latest");
  console.log(
    `warped time, latest block #${latestBlock.number} at ${latestBlock.timestamp}`,
  );
}

interface SortableTx {
  nonce: number;
  submissionDate: string;
}

interface SortableTxList<T extends SortableTx> {
  results: T[];
}

/**
 * Given a list of pending transactions, returns an array of transactions to execute on fork
 * Sorted by nonce ASC
 * If two txs with same nonce exist, most recent one is selected
 * @param resp
 * @returns
 */
export function getTransactionsToExecute<
  T extends SortableTx,
  L extends SortableTxList<T>,
>(resp: L): T[] {
  return sortedUniqBy(
    resp.results.sort((a: T, b: T) => {
      if (a.nonce !== b.nonce) {
        return a.nonce - b.nonce;
      } else {
        return (
          new Date(b.submissionDate).getTime() -
          new Date(a.submissionDate).getTime()
        );
      }
    }),
    "nonce",
  );
}

export function txType(tx: TxInfo): string {
  let t = "safe tx";
  if (tx.isQueue) {
    t = "timelock queue tx";
  } else if (tx.isExecute) {
    t = "timelock execute tx";
  }
  if (tx.multisend) {
    t = "multisend " + t;
  }
  return t;
}

export interface Create2Tx {
  salt: string;
  bytecode: string;
}

export function create2Address(tx: Create2Tx): string {
  return ethers.utils.getCreate2Address(
    CREATE2_FACTORY_ADDR,
    tx.salt,
    ethers.utils.keccak256(tx.bytecode),
  );
}

export function getCreate2transactions(
  tx: DecodedTx | Batch.Batch,
): Create2Tx[] {
  let result: Array<Create2Tx | undefined> = [];

  try {
    if ("createdAt" in tx) {
      result = tx.transactions.map(unwrapBatchTx);
    } else {
      // Actions without dataDecoded: pending transactions where safe api bugged
      if (!tx.dataDecoded) {
        return [];
      }
      const isMultiSend = tx.dataDecoded.method === "multiSend";
      if (isMultiSend) {
        const mTx = tx as MultisendTx;
        result = mTx.dataDecoded.parameters[0].valueDecoded.map(unwrapTimelock);
      } else {
        const sTx = tx as SingleTx;
        result = [unwrapTimelock(sTx)];
      }
    }
  } catch (e) {
    console.warn(e);
    return [];
  }
  return result.filter(Boolean) as Create2Tx[];
}

function unwrapBatchTx({
  contractInputsValues,
}: Batch.Transaction): Create2Tx | undefined {
  const { data, target, signature } = contractInputsValues;
  return unwrapCreate2tx(target, signature, data);
}

/**
 * Extracts actual create2 transaction, returns undefined if it's some other transaction
 * @param tx
 * @returns
 */
function unwrapTimelock(
  tx: MultisendTransactionDecoded | SingleTx,
): Create2Tx | undefined {
  let data = tx.dataDecoded;
  if (
    ["queueTransaction", "executeTransaction", "cancelTransaction"].includes(
      data.method,
    )
  ) {
    const target = data.parameters[0].value;
    const signature = data.parameters[2].value;
    const rawData = data.parameters[3].value;
    // In timelock tx:
    // Arg 2 is signature, e.g. "addPriceFeed(address,address)"
    // Arg 3 is data, without 4-byte function signature
    // we need to construct calldata to decode gearbox contract action
    return unwrapCreate2tx(target, signature, rawData);
  }
}

function unwrapCreate2tx(
  target: string,
  signature: string,
  rawData: string,
): Create2Tx | undefined {
  if (target !== CREATE2_FACTORY_ADDR) {
    return;
  }
  if (signature !== "deploy(bytes32,bytes)") {
    return;
  }
  const fourbyte = ethers.utils.id(signature).substring(0, 10);
  const calldata = rawData.replace("0x", fourbyte);

  const tx = create2factory.parseTransaction({ data: calldata });
  return { salt: tx.args[0], bytecode: tx.args[1] };
}

export function extractFilesFromJSON(
  files: Record<string, string>,
): PathBuffer[] {
  return Object.entries(files).map(([path, file]) => ({
    path,
    buffer: Buffer.isBuffer(file) ? file : Buffer.from(file),
  }));
}

export function stringifyInvalidAndMissing(contract: CheckedContract): string {
  const errors = [
    ...Object.keys(contract.invalid),
    ...Object.keys(contract.missing),
  ];
  return `${contract.name} (${errors.join(", ")})`;
}

/**
 * Checks if there's a CBOR encoded metadata hash appended to the bytecode.
 *
 * @param bytecode
 * @returns bool - true if there's a metadata hash
 */
export function doesContainMetadataHash(bytecode: string): boolean {
  let containsMetadata: boolean;
  try {
    const decodedCBOR = bytecodeDecode(bytecode);
    containsMetadata =
      !!decodedCBOR.ipfs || !!decodedCBOR["bzzr0"] || !!decodedCBOR["bzzr1"];
  } catch (e) {
    containsMetadata = false;
  }
  return containsMetadata;
}

export function extractAbiEncodedConstructorArguments(
  onchainCreationBytecode: string,
  compiledCreationBytecode: string,
) {
  if (onchainCreationBytecode.length === compiledCreationBytecode.length)
    return undefined;

  const startIndex = onchainCreationBytecode.indexOf(compiledCreationBytecode);
  return (
    "0x" +
    onchainCreationBytecode.slice(startIndex + compiledCreationBytecode.length)
  );
}
