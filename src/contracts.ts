export const addressProviderAbi = [
  "function owner() external view returns (address)",
  "function getACL() external view returns (address)",
  "function transferOwnership(address newOwner)",
];

export const aclAbi = [
  "function owner() external view returns (address)",
  "function addPausableAdmin(address newAdmin)",
  "function addUnpausableAdmin(address newAdmin)",
  "function transferOwnership(address newOwner)",
];
