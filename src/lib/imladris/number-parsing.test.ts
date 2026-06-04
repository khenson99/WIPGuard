import { describe, expect, it } from "vitest";
import { parseImladrisNumber } from "@/lib/imladris/number-parsing";

describe("parseImladrisNumber", () => {
  it("parses word-scale currency strings", () => {
    expect(parseImladrisNumber("USD 1.2 million")).toBe(1_200_000);
    expect(parseImladrisNumber("EUR 1,2 million")).toBe(1_200_000);
    expect(parseImladrisNumber("$2.5 thousand")).toBe(2_500);
    expect(parseImladrisNumber("(EUR 3.4 billion)")).toBe(-3_400_000_000);
  });

  it("parses finance shorthand scale suffixes", () => {
    expect(parseImladrisNumber("USD 1.2MM")).toBe(1_200_000);
    expect(parseImladrisNumber("$2.5bn")).toBe(2_500_000_000);
    expect(parseImladrisNumber("(EUR 3.4tn)")).toBe(-3_400_000_000_000);
  });

  it("parses spaced finance shorthand before trailing ISO currency codes", () => {
    expect(parseImladrisNumber("1.2 M USD")).toBe(1_200_000);
    expect(parseImladrisNumber("2.5 bn EUR")).toBe(2_500_000_000);
    expect(parseImladrisNumber("(3.4 MM USD)")).toBe(-3_400_000);
  });

  it("parses amounts with trailing parenthesized ISO currency codes", () => {
    expect(parseImladrisNumber("1.2M (USD)")).toBe(1_200_000);
    expect(parseImladrisNumber("2,5 bn (EUR)")).toBe(2_500_000_000);
    expect(parseImladrisNumber("(3.4MM) (USD)")).toBe(-3_400_000);
  });

  it("parses decimal-comma finance shorthand scale suffixes", () => {
    expect(parseImladrisNumber("EUR 1,2MM")).toBe(1_200_000);
    expect(parseImladrisNumber("€2,5bn")).toBe(2_500_000_000);
    expect(parseImladrisNumber("(CHF 3,4tn)")).toBe(-3_400_000_000_000);
  });

  it("parses million shorthand used in finance exports", () => {
    expect(parseImladrisNumber("USD 1.2mn")).toBe(1_200_000);
    expect(parseImladrisNumber("EUR 1,2mn")).toBe(1_200_000);
    expect(parseImladrisNumber("$2.5mil")).toBe(2_500_000);
    expect(parseImladrisNumber("(GBP 3.4mn)")).toBe(-3_400_000);
  });

  it("parses leading negative signs before ISO currency codes", () => {
    expect(parseImladrisNumber("-USD 1.2M")).toBe(-1_200_000);
    expect(parseImladrisNumber("-EUR 1,2 million")).toBe(-1_200_000);
    expect(parseImladrisNumber("-GBP 3.4bn")).toBe(-3_400_000_000);
  });

  it("parses percent-formatted metric values", () => {
    expect(parseImladrisNumber("12.5%")).toBe(12.5);
    expect(parseImladrisNumber("12,5 percent")).toBe(12.5);
    expect(parseImladrisNumber("(8 pct)")).toBe(-8);
  });

  it("parses accounting debit and credit suffixes", () => {
    expect(parseImladrisNumber("1,200.50 DR")).toBe(-1_200.5);
    expect(parseImladrisNumber("1,200.50 CR")).toBe(1_200.5);
    expect(parseImladrisNumber("USD 2.5k debit")).toBe(-2_500);
    expect(parseImladrisNumber("EUR 3,4k credit")).toBe(3_400);
  });
});
