export const BASE_SEPOLIA_CHAIN_ID = 84532;
export const BASE_MAINNET_CHAIN_ID = 8453;
export const PLATFORM_FEE_BPS = 200n;
export const BPS = 10_000n;
export const USDC_DECIMALS = 6;

export function formatUsdc(atomic: bigint | string): string {
  const value = BigInt(atomic);
  const whole = value / 1_000_000n;
  const fraction = (value % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function parseUsdc(value: string): bigint {
  if (!/^(0|[1-9]\d*)(\.\d{1,6})?$/.test(value)) throw new Error("Enter a valid USDC amount with up to six decimals");
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
}

export function feeFor(priceAtomic: bigint): bigint {
  return priceAtomic * PLATFORM_FEE_BPS / BPS;
}
