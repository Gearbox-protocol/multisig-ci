/**
 * Transaction describes json found in deploy-v2/deploy-v3 repos
 */
export interface Transaction {
  [key: string]: Contract;
}

export interface Contract {
  contractName: string;
  contractAddress: string;
  constructorArguments: string[];
  verify: boolean;
  verified: boolean;
  metadata: CompilerInfo;
  encodedConstructorArgs: string;
}

export interface CompilerInfo {
  compiler: string;
  optimizer: OptimizerInfo;
  source: string;
  commit?: string;
}

export interface OptimizerInfo {
  enabled: boolean;
  runs: number;
}
