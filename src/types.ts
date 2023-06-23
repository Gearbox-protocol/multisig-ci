import {
  SafeMultisigTransactionResponse,
  SafeTransaction,
} from "@safe-global/safe-core-sdk-types";

export type MultisendTx = Omit<
  SafeMultisigTransactionResponse,
  "dataDecoded"
> & {
  dataDecoded: MultisendDataDecoded;
};

export type SingleTx = Omit<SafeMultisigTransactionResponse, "dataDecoded"> & {
  dataDecoded: TransactionData;
};

export interface MultisendDataDecoded {
  method: string;
  parameters: MultisendParameter[];
}

export interface MultisendParameter {
  name: string;
  type: string;
  value: string;
  valueDecoded: MultisendTransactionDecoded[];
}

export interface MultisendTransactionDecoded {
  operation: number;
  to: string;
  value: string;
  data: string;
  dataDecoded: TransactionData;
}

export interface TransactionData {
  method: string;
  parameters: TransactionParameter[];
}

export interface TransactionParameter {
  name: string;
  type: string;
  value: string;
}

export interface TxInfo {
  multisend: boolean;
  isQueue: boolean;
  isExecute: boolean;
  eta: number;
}

export interface TimelockExecute {
  tx: SafeTransaction;
  eta: number;
}
