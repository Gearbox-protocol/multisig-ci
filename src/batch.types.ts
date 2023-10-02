export interface Batch {
  version: string;
  chainId: string;
  createdAt: number;
  meta: Meta;
  transactions: Transaction[];
}

export interface Meta {
  name: string;
  description: string;
  txBuilderVersion: string;
  createdFromSafeAddress: string;
  createdFromOwnerAddress: string;
  checksum: string;
}

export interface Transaction {
  to: string;
  value: string;
  contractMethod: ContractMethod;
  contractInputsValues: ContractInputsValues;
}

export interface ContractMethod {
  inputs: Input[];
  name: string;
  payable: boolean;
}

export interface Input {
  type: string;
  name: string;
  internalType?: string;
}

export interface ContractInputsValues {
  target: string;
  value: string;
  signature: string;
  data: string;
  eta: string;
}
