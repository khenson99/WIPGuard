import { decodeOAuthStateCookie } from "./src/lib/integrations/oauth";

const testPayload = {
    state: "test-state",
    userId: "test-user-id",
    codeVerifier: null
};

const encoded = Buffer.from(JSON.stringify(testPayload), "utf8").toString("base64url");
console.log("Encoded:", encoded);
console.log("Decoded:", decodeOAuthStateCookie(encoded));

