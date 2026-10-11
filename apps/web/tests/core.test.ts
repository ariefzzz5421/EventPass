import { describe, expect, it } from "vitest";
import { feeFor, formatUsdc, parseUsdc } from "@eventpass/shared";
import { decodeCredential, encodeCredential } from "@/server/qr";
const secret="test-qr-secret-must-be-long-and-distinct-123";
describe("integer USDC accounting",()=>{
  it("round-trips six decimal values",()=>{expect(parseUsdc("25.123456")).toBe(25_123_456n);expect(formatUsdc(25_123_456n)).toBe("25.123456");expect(()=>parseUsdc("1.0000001")).toThrow()});
  it("calculates a two percent fee without floating point",()=>{expect(feeFor(25_000_000n)).toBe(500_000n);expect(feeFor(1n)).toBe(0n)});
});
describe("live QR credentials",()=>{
  const payload={v:1 as const,ticketId:"ticket-1",eventId:"event-1",tokenId:"42",owner:"0x1111111111111111111111111111111111111111",nonce:"0123456789abcdef0123456789abcdef",exp:Date.now()+45_000};
  it("accepts a current signed code",()=>{const code=encodeCredential(payload,secret);expect(decodeCredential(code,secret)?.tokenId).toBe("42")});
  it("rejects tampering, wrong keys, and expiry",()=>{const code=encodeCredential(payload,secret);expect(decodeCredential(code,"other-secret")).toBeNull();expect(decodeCredential(code+"x",secret)).toBeNull();expect(decodeCredential(code,secret,payload.exp)).toBeNull()});
});
