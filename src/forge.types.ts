export interface JSON {
  abi: unknown;
  bytecode: Bytecode;
  deployedBytecode: Bytecode;
  methodIdentifiers: unknown;
  rawMetadata: string;
  metadata: Metadata;
  ast: Ast;
  id: number;
}

export interface Ast {
  absolutePath: string;
}

export interface Bytecode {
  object: string;
  sourceMap: string;
  linkReferences: unknown;
}

export interface Metadata {
  compiler: Compiler;
  language: string;
  output: unknown;
  settings: Settings;
  sources: unknown;
  version: number;
}

export interface Compiler {
  version: string;
}

export interface Settings {
  remappings: string[];
  optimizer: Optimizer;
  metadata: SettingsMetadata;
  compilationTarget: CompilationTarget;
  libraries: unknown;
}

export interface Optimizer {
  enabled: boolean;
  runs: number;
}

export interface SettingsMetadata {
  bytecodeHash: string;
}

export interface CompilationTarget {
  // contracts/oracles/curve/CurveCryptoLPPriceFeed.sol
  // "contracts/test/config/AdapterData.sol": string;
  [solfile: string]: string;
}
