import { describe, expect, it } from "vitest";

import * as Deploy from "./deploy.types.js";
import {
  gatherRepos,
  getContractRepo,
  getForgeFlags,
  getGithubUrl,
  RepoMeta,
} from "./verification.js";

describe("getGithubUrl", () => {
  it("should work correctly", () => {
    expect(getGithubUrl("@gearbox-protocol/core-v3")).toBe(
      "https://github.com/gearbox-protocol/core-v3.git",
    );
  });
});

describe("getContractRepo", () => {
  it("should work correctly", () => {
    const meta: Deploy.Contract = {
      contractName: "CurveCryptoLPPriceFeed",
      contractAddress: "0x603e987f2B7d72EF3c6d4D0F32776eCfD54C483e",
      constructorArguments: [],
      verify: true,
      verified: false,
      metadata: {
        compiler: "0.8.17+commit.8df45f5f",
        optimizer: {
          enabled: true,
          runs: 10000,
        },
        source:
          "@gearbox-protocol/integrations-v3/contracts/oracles/curve/CurveCryptoLPPriceFeed.sol",
        commit: "5324a48a9e4144d5f3fa0f83e5d788e1d7336de0",
      },
      encodedConstructorArgs:
        "000000000000000000000000cf64698aff7e5f27a11dff868af228653ba53be00000000000000000000000004ebdf703948ddcea3b11f675b4d1fba9d2414a14000000000000000000000000eef0c605546958c1f899b6fb336c20671f9cd49f0000000000000000000000005f4ec3df9cbd43714fe2740f5e3616155c5b8419000000000000000000000000cd627aa160a6fa45eb793d19ef54f5062f20f33f00000000000000000000000000000000000000000000000000000000000000c000000000000000000000000000000000000000000000000000000000000000165052494345464545445f63727655534445544843525600000000000000000000",
    };
    const expected: RepoMeta = {
      repo: "@gearbox-protocol/integrations-v3",
      commit: "5324a48a9e4144d5f3fa0f83e5d788e1d7336de0",
      forgeFlags: "--use 0.8.17 --optimize --optimizer-runs 10000",
    };
    expect(getContractRepo(meta)).toEqual(expected);
  });

  it("should fail for non-whitelisted repo", () => {
    const meta: Deploy.Contract = {
      contractName: "CurveCryptoLPPriceFeed",
      contractAddress: "0x603e987f2B7d72EF3c6d4D0F32776eCfD54C483e",
      constructorArguments: [],
      verify: true,
      verified: false,
      metadata: {
        compiler: "0.8.17+commit.8df45f5f",
        optimizer: {
          enabled: true,
          runs: 10000,
        },
        source:
          "@gearbox-protocol/faucet-v3/contracts/oracles/curve/CurveCryptoLPPriceFeed.sol",
        commit: "5324a48a9e4144d5f3fa0f83e5d788e1d7336de0",
      },
      encodedConstructorArgs: "",
    };
    expect(() => getContractRepo(meta)).toThrow();
  });
});

describe("getForgeFlags", () => {
  it("should work correctly", () => {
    expect(
      getForgeFlags({
        compiler: "0.8.17+commit.8df45f5f",
        optimizer: {
          enabled: true,
          runs: 10000,
        },
        source:
          "@gearbox-protocol/integrations-v3/contracts/oracles/curve/CurveCryptoLPPriceFeed.sol",
        commit: "5324a48a9e4144d5f3fa0f83e5d788e1d7336de0",
      }),
    ).toBe("--use 0.8.17 --optimize --optimizer-runs 10000");
  });
});

describe("gatherRepos", () => {
  it("should return repos and commits", () => {
    const data: Deploy.Transaction = {
      "crvUSDETHCRV:CurveCryptoLPPriceFeed": {
        contractName: "CurveCryptoLPPriceFeed",
        contractAddress: "0x603e987f2B7d72EF3c6d4D0F32776eCfD54C483e",
        constructorArguments: [
          "0xcF64698AFF7E5f27A11dff868AF228653ba53be0",
          "0x4eBdF703948ddCEA3B11f675B4D1Fba9d2414A14",
          "0xEEf0C605546958c1f899b6fB336C20671f9cD49F",
          "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
          "0xCd627aA160A6fA45Eb793D19Ef54f5062F20f33f",
          "PRICEFEED_crvUSDETHCRV",
        ],
        verify: true,
        verified: false,
        metadata: {
          compiler: "0.8.17+commit.8df45f5f",
          optimizer: {
            enabled: true,
            runs: 10000,
          },
          source:
            "@gearbox-protocol/integrations-v3/contracts/oracles/curve/CurveCryptoLPPriceFeed.sol",
          commit: "5324a48a9e4144d5f3fa0f83e5d788e1d7336de0",
        },
        encodedConstructorArgs:
          "000000000000000000000000cf64698aff7e5f27a11dff868af228653ba53be00000000000000000000000004ebdf703948ddcea3b11f675b4d1fba9d2414a14000000000000000000000000eef0c605546958c1f899b6fb336c20671f9cd49f0000000000000000000000005f4ec3df9cbd43714fe2740f5e3616155c5b8419000000000000000000000000cd627aa160a6fa45eb793d19ef54f5062f20f33f00000000000000000000000000000000000000000000000000000000000000c000000000000000000000000000000000000000000000000000000000000000165052494345464545445f63727655534445544843525600000000000000000000",
      },
      CurveV1Adapter3Assets: {
        contractName: "CurveV1Adapter3Assets",
        contractAddress: "0xCc5f86E970DF0Eb29c6184761d8c0e2c5eC0295a",
        constructorArguments: [
          "0x4C6309fe2085EfE7A0Cfb426C16Ef3b41198cCE3",
          "0x4eBdF703948ddCEA3B11f675B4D1Fba9d2414A14",
          "0x4eBdF703948ddCEA3B11f675B4D1Fba9d2414A14",
          "0x0000000000000000000000000000000000000000",
        ],
        verify: true,
        verified: false,
        metadata: {
          compiler: "0.8.17+commit.8df45f5f",
          optimizer: {
            enabled: true,
            runs: 10000,
          },
          source:
            "@gearbox-protocol/integrations-v3/contracts/adapters/curve/CurveV1_3.sol",
          commit: "5324a48a9e4144d5f3fa0f83e5d788e1d7336de0",
        },
        encodedConstructorArgs:
          "0000000000000000000000004c6309fe2085efe7a0cfb426c16ef3b41198cce30000000000000000000000004ebdf703948ddcea3b11f675b4d1fba9d2414a140000000000000000000000004ebdf703948ddcea3b11f675b4d1fba9d2414a140000000000000000000000000000000000000000000000000000000000000000",
      },
      ConvexV1BaseRewardPoolAdapter: {
        contractName: "ConvexV1BaseRewardPoolAdapter",
        contractAddress: "0x76EC9e1c7afA52613b4a8aa18924351C2C4cef55",
        constructorArguments: [
          "0x4C6309fe2085EfE7A0Cfb426C16Ef3b41198cCE3",
          "0xF956a46DbA1A0a567168db8655bc18E9050C7738",
          "0x0Bf1626d4925F8A872801968be11c052862AC2D3",
        ],
        verify: true,
        verified: false,
        metadata: {
          compiler: "0.8.17+commit.8df45f5f",
          optimizer: {
            enabled: true,
            runs: 10000,
          },
          source:
            "@gearbox-protocol/periphery-v3/contracts/interfaces/convex/IConvexV1BaseRewardPoolAdapter.sol",
          commit: "5324a48a9e4144d5f3fa0f83e5d788e1d7000000",
        },
        encodedConstructorArgs:
          "0000000000000000000000004c6309fe2085efe7a0cfb426c16ef3b41198cce30000000000000000000000004ebdf703948ddcea3b11f675b4d1fba9d2414a140000000000000000000000004ebdf703948ddcea3b11f675b4d1fba9d2414a140000000000000000000000000000000000000000000000000000000000000000",
      },
    };
    expect(gatherRepos(data)).toEqual([
      {
        repo: "@gearbox-protocol/integrations-v3",
        commit: "5324a48a9e4144d5f3fa0f83e5d788e1d7336de0",
        forgeFlags: "--use 0.8.17 --optimize --optimizer-runs 10000",
      },
      {
        repo: "@gearbox-protocol/periphery-v3",
        commit: "5324a48a9e4144d5f3fa0f83e5d788e1d7000000",
        forgeFlags: "--use 0.8.17 --optimize --optimizer-runs 10000",
      },
    ]);
  });

  it("should throw om different commits from same repo", () => {
    const data: Deploy.Transaction = {
      "crvUSDETHCRV:CurveCryptoLPPriceFeed": {
        contractName: "CurveCryptoLPPriceFeed",
        contractAddress: "0x603e987f2B7d72EF3c6d4D0F32776eCfD54C483e",
        constructorArguments: [
          "0xcF64698AFF7E5f27A11dff868AF228653ba53be0",
          "0x4eBdF703948ddCEA3B11f675B4D1Fba9d2414A14",
          "0xEEf0C605546958c1f899b6fB336C20671f9cD49F",
          "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
          "0xCd627aA160A6fA45Eb793D19Ef54f5062F20f33f",
          "PRICEFEED_crvUSDETHCRV",
        ],
        verify: true,
        verified: false,
        metadata: {
          compiler: "0.8.17+commit.8df45f5f",
          optimizer: {
            enabled: true,
            runs: 10000,
          },
          source:
            "@gearbox-protocol/integrations-v3/contracts/oracles/curve/CurveCryptoLPPriceFeed.sol",
          commit: "5324a48a9e4144d5f3fa0f83e5d788e1d7336de0",
        },
        encodedConstructorArgs:
          "000000000000000000000000cf64698aff7e5f27a11dff868af228653ba53be00000000000000000000000004ebdf703948ddcea3b11f675b4d1fba9d2414a14000000000000000000000000eef0c605546958c1f899b6fb336c20671f9cd49f0000000000000000000000005f4ec3df9cbd43714fe2740f5e3616155c5b8419000000000000000000000000cd627aa160a6fa45eb793d19ef54f5062f20f33f00000000000000000000000000000000000000000000000000000000000000c000000000000000000000000000000000000000000000000000000000000000165052494345464545445f63727655534445544843525600000000000000000000",
      },
      CurveV1Adapter3Assets: {
        contractName: "CurveV1Adapter3Assets",
        contractAddress: "0xCc5f86E970DF0Eb29c6184761d8c0e2c5eC0295a",
        constructorArguments: [
          "0x4C6309fe2085EfE7A0Cfb426C16Ef3b41198cCE3",
          "0x4eBdF703948ddCEA3B11f675B4D1Fba9d2414A14",
          "0x4eBdF703948ddCEA3B11f675B4D1Fba9d2414A14",
          "0x0000000000000000000000000000000000000000",
        ],
        verify: true,
        verified: false,
        metadata: {
          compiler: "0.8.17+commit.8df45f5f",
          optimizer: {
            enabled: true,
            runs: 10000,
          },
          source:
            "@gearbox-protocol/integrations-v3/contracts/adapters/curve/CurveV1_3.sol",
          commit: "5324a48a9e4144d5f3fa0f83e5d788e1d7336de0",
        },
        encodedConstructorArgs:
          "0000000000000000000000004c6309fe2085efe7a0cfb426c16ef3b41198cce30000000000000000000000004ebdf703948ddcea3b11f675b4d1fba9d2414a140000000000000000000000004ebdf703948ddcea3b11f675b4d1fba9d2414a140000000000000000000000000000000000000000000000000000000000000000",
      },
      ConvexV1BaseRewardPoolAdapter: {
        contractName: "ConvexV1BaseRewardPoolAdapter",
        contractAddress: "0x76EC9e1c7afA52613b4a8aa18924351C2C4cef55",
        constructorArguments: [
          "0x4C6309fe2085EfE7A0Cfb426C16Ef3b41198cCE3",
          "0xF956a46DbA1A0a567168db8655bc18E9050C7738",
          "0x0Bf1626d4925F8A872801968be11c052862AC2D3",
        ],
        verify: true,
        verified: false,
        metadata: {
          compiler: "0.8.17+commit.8df45f5f",
          optimizer: {
            enabled: true,
            runs: 10000,
          },
          source:
            "@gearbox-protocol/integrations-v3/contracts/interfaces/convex/IConvexV1BaseRewardPoolAdapter.sol",
          commit: "5324a48a9e4144d5f3fa0f83e5d788e1d7000000",
        },
        encodedConstructorArgs:
          "0000000000000000000000004c6309fe2085efe7a0cfb426c16ef3b41198cce30000000000000000000000004ebdf703948ddcea3b11f675b4d1fba9d2414a140000000000000000000000004ebdf703948ddcea3b11f675b4d1fba9d2414a140000000000000000000000000000000000000000000000000000000000000000",
      },
    };
    expect(() => {
      gatherRepos(data);
    }).toThrow();
  });
});
