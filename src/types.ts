import { SafeMultisigTransactionResponse } from "@safe-global/safe-core-sdk-types";

export type MultisigTx = Omit<
  SafeMultisigTransactionResponse,
  "dataDecoded"
> & {
  dataDecoded: MultisendDataDecoded;
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
  dataDecoded: MultisendTransactionData;
}

export interface MultisendTransactionData {
  method: string;
  parameters: MultisendTransactionParameter[];
}

export interface MultisendTransactionParameter {
  name: string;
  type: string;
  value: string;
}
