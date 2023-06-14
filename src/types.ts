export interface SafeMultisigConfirmationResponse {
  owner: string;
  submissionDate: string;
  transactionHash?: any;
  signature: string;
  signatureType: string;
}

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

export interface SafeMultisigTransaction {
  // safe: string;
  // to: string;
  // value: string;
  data: string;
  // operation: number;
  // gasToken: string;
  // safeTxGas: number;
  // baseGas: number;
  // gasPrice: string;
  // refundReceiver: string;
  // nonce: number;
  executionDate?: string;
  submissionDate: string;
  // modified: Date;
  // blockNumber?: number;
  transactionHash: string;
  safeTxHash: string;
  // executor: string;
  isExecuted: boolean;
  // isSuccessful?: boolean;
  // ethGasPrice: string;
  // maxFeePerGas: string;
  // maxPriorityFeePerGas: string;
  // gasUsed?: number;
  // fee: string;
  // origin: string;
  dataDecoded: MultisendDataDecoded;
  confirmationsRequired: number;
  confirmations: SafeMultisigConfirmationResponse[];
  // trusted: boolean;
  // signatures: string;
}
