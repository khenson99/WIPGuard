import { describe, expect, it } from "vitest";
import { validateGrantedScopes } from "@/lib/integrations/scope-validation";

describe("scope validation", () => {
  it("treats Google userinfo.email as satisfying email", () => {
    const result = validateGrantedScopes(
      ["email"],
      ["https://www.googleapis.com/auth/userinfo.email"]
    );

    expect(result.valid).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it("treats Google userinfo.profile as satisfying profile", () => {
    const result = validateGrantedScopes(
      ["profile"],
      ["https://www.googleapis.com/auth/userinfo.profile"]
    );

    expect(result.valid).toBe(true);
    expect(result.missing).toEqual([]);
  });
});

