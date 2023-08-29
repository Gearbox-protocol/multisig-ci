import {
  ADDRESS_PROVIDER,
  CreditManagerData,
  IAddressProvider__factory,
  IDataCompressor__factory,
  IPriceOracleV2__factory,
  MCall,
  safeMulticall,
  tokenSymbolByAddress,
} from "@gearbox-protocol/sdk";
import chalk from "chalk";
import { ethers } from "ethers";

const oracle = IPriceOracleV2__factory.createInterface();

export default async function report(
  provider: ethers.providers.JsonRpcProvider,
): Promise<void> {
  const ap = IAddressProvider__factory.connect(
    ADDRESS_PROVIDER.Mainnet,
    provider,
  );
  const [oracleAddr, dcAddr] = await Promise.all([
    ap.getPriceOracle(),
    ap.getDataCompressor(),
  ]);
  const dc = IDataCompressor__factory.connect(dcAddr, provider);
  const cms = await dc.getCreditManagersList();

  // gather collateral tokens from all cms to get price feeds
  const tokens = new Set<string>([]);
  for (const cm of cms) {
    if (cm.version < 2) {
      continue;
    }
    cm.collateralTokens.forEach(t => tokens.add(t));
  }
  // get price feed and make mapping token -> feed
  const calls: MCall<any>[] = Array.from(tokens)
    .map(t => ({
      address: oracleAddr,
      interface: oracle,
      method: "priceFeeds(address)" as const,
      params: [t],
    }))
    .filter(c => c.address.startsWith("0x"));
  const raw = await safeMulticall<string>(calls, provider);
  const feeds = new Map<string, string | undefined>(
    calls.map((c, i) => [c.params[0].toLowerCase(), raw[i].value]),
  );

  for (const cm of cms) {
    if (cm.version < 2) {
      continue;
    }
    reportCm(new CreditManagerData(cm), feeds);
  }
}

function reportCm(
  cm: CreditManagerData,
  feeds: Map<string, string | undefined>,
): void {
  console.info(`${"".padStart(138, "-")}
Credit manager ${chalk.green(cm.address)} (${chalk.green(
    tokenSymbolByAddress[cm.underlyingToken],
  )})
${"".padStart(138, "-")}`);
  console.log(
    [
      "Symbol".padStart(20),
      "Token".padEnd(44),
      "LT".padStart(5),
      "Forbidden",
      "Feed".padEnd(20),
    ].join("\t"),
  );
  console.info("".padStart(138, "-"));

  for (let i = 0; i < cm.collateralTokens.length; i++) {
    const t = cm.collateralTokens[i];
    const tokenMask = BigInt(1) << BigInt(i);

    const isForbidden = (cm.forbiddenTokenMask & tokenMask) > 0;
    const lt = cm.liquidationThresholds[t];
    const line = [
      tokenSymbolByAddress[t]?.padStart(20),
      t,
      lt?.toString(10).padStart(5),
      (isForbidden ? "x" : "").padEnd(9),
      feeds.get(t),
    ].join("\t");

    console.log(isForbidden || lt <= 1n ? chalk.red(line) : line);
  }
}
