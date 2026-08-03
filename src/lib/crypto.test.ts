import { describe, it, expect, beforeAll } from "vitest";

/**
 * Every conversation, memory and summary in the product is stored through
 * these functions. A regression here is silent and unrecoverable — old rows
 * stop decrypting — so the round-trip and the per-user key isolation are
 * pinned down here.
 *
 * A throwaway master key is set before import: the module reads
 * MASTER_ENCRYPTION_KEY at call time, and tests must never depend on the real
 * one.
 */
let crypto: typeof import("./crypto");

beforeAll(async () => {
  process.env.MASTER_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  crypto = await import("./crypto");
});

describe("deriveUserKey", () => {
  it("is deterministic for the same user", () => {
    const a = crypto.deriveUserKey("user-1");
    const b = crypto.deriveUserKey("user-1");
    expect(a.toString("hex")).toBe(b.toString("hex"));
  });

  it("gives different users different keys", () => {
    const a = crypto.deriveUserKey("user-1");
    const b = crypto.deriveUserKey("user-2");
    expect(a.toString("hex")).not.toBe(b.toString("hex"));
  });

  it("produces a 32-byte key for AES-256", () => {
    expect(crypto.deriveUserKey("user-1").byteLength).toBe(32);
  });
});

describe("encryptField / decryptField", () => {
  it("round-trips text unchanged", () => {
    const key = crypto.deriveUserKey("user-1");
    const plaintext = "Your name is Anna, and I used to call you 'pet'.";
    expect(crypto.decryptField(crypto.encryptField(plaintext, key), key)).toBe(plaintext);
  });

  it("round-trips unicode and newlines", () => {
    const key = crypto.deriveUserKey("user-1");
    const plaintext = "Dad — “go on then”\nsame as ever 🕯";
    expect(crypto.decryptField(crypto.encryptField(plaintext, key), key)).toBe(plaintext);
  });

  it("produces a different ciphertext each time (random IV)", () => {
    const key = crypto.deriveUserKey("user-1");
    const a = crypto.encryptField("same input", key);
    const b = crypto.encryptField("same input", key);
    expect(a).not.toBe(b);
  });

  it("emits the iv:tag:ciphertext envelope", () => {
    const key = crypto.deriveUserKey("user-1");
    expect(crypto.encryptField("x", key).split(":")).toHaveLength(3);
  });

  it("cannot be decrypted with another user's key", () => {
    const mine = crypto.deriveUserKey("user-1");
    const theirs = crypto.deriveUserKey("user-2");
    const ciphertext = crypto.encryptField("a private memory", mine);
    expect(() => crypto.decryptField(ciphertext, theirs)).toThrow();
  });

  it("rejects tampered ciphertext (GCM auth tag holds)", () => {
    const key = crypto.deriveUserKey("user-1");
    const [iv, tag, data] = crypto.encryptField("trust me", key).split(":");
    const flipped = Buffer.from(data!, "base64");
    flipped[0] = flipped[0]! ^ 0xff;
    const tampered = `${iv}:${tag}:${flipped.toString("base64")}`;
    expect(() => crypto.decryptField(tampered, key)).toThrow();
  });

  it("rejects a malformed envelope", () => {
    const key = crypto.deriveUserKey("user-1");
    expect(() => crypto.decryptField("not-an-envelope", key)).toThrow();
  });
});
