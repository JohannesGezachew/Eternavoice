import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * The conversation server actions, which are public HTTP endpoints — every
 * export of a "use server" module is one.
 *
 * The rule pinned hardest here is that deleting a conversation removes its
 * rolling summary too. Without that, the chat route keeps reading the summary
 * as a "previous session" and the persona brings up, by name, in the voice of
 * someone who died, a conversation the user deleted because they could not
 * bear to have it again. Nothing about that is visible from the screen: the
 * conversation disappears exactly as expected, and the consequence arrives
 * days later inside a sentence.
 *
 * The other rule is ownership. Every one of these must scope by user_id as
 * well as by row id, because RLS is the backstop, not the check.
 */

vi.mock("server-only", () => ({}));

interface Call {
  table: string;
  op: "delete" | "update";
  payload?: unknown;
  filters: Record<string, unknown>;
}

const calls: Call[] = [];
let user: { id: string } | null = { id: "user-1" };
let failOn: string | null = null;

function builder(table: string, op: Call["op"], payload?: unknown) {
  const filters: Record<string, unknown> = {};
  const chain = {
    eq(column: string, value: unknown) {
      filters[column] = value;
      return chain;
    },
    then(resolve: (v: { error: unknown }) => unknown) {
      calls.push({ table, op, payload, filters });
      return Promise.resolve({
        error: failOn === table ? { message: "boom" } : null,
      }).then(resolve);
    },
  };
  return chain;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: { getUser: () => Promise.resolve({ data: { user } }) },
    from: (table: string) => ({
      delete: () => builder(table, "delete"),
      update: (payload: unknown) => builder(table, "update", payload),
    }),
  }),
}));

vi.mock("@/lib/crypto", () => ({
  deriveUserKey: () => Buffer.alloc(32),
  encryptField: (v: string) => `enc:${v}`,
  decryptField: (v: string) => v.replace(/^enc:/, ""),
}));

const { deleteConversationDb, renameConversationDb, pinConversationDb } =
  await import("./conversations");

beforeEach(() => {
  calls.length = 0;
  user = { id: "user-1" };
  failOn = null;
});

const on = (table: string) => calls.filter((c) => c.table === table);

describe("deleteConversationDb", () => {
  it("removes the session summary as well as the conversation", async () => {
    await deleteConversationDb("conv-1");

    expect(on("session_summaries")).toHaveLength(1);
    expect(on("conversations")).toHaveLength(1);
  });

  it("removes the summary first", async () => {
    // The foreign key is `on delete set null`, so leaving it to the cascade
    // would strand the summary with nothing tying it to the conversation it
    // came from — unreachable, unattributable, and still read aloud.
    await deleteConversationDb("conv-1");

    expect(calls[0]!.table).toBe("session_summaries");
  });

  it("deletes rather than marking deleted_at", async () => {
    // The dialog promises the transcript is permanently removed, and turns
    // cascade from the conversation row.
    await deleteConversationDb("conv-1");

    expect(on("conversations")[0]!.op).toBe("delete");
  });

  it("scopes both deletes to the signed-in user", async () => {
    await deleteConversationDb("conv-1");

    for (const call of calls) {
      expect(call.filters.user_id).toBe("user-1");
    }
    expect(on("conversations")[0]!.filters.id).toBe("conv-1");
  });

  it("does not delete the conversation if the summary could not be removed", async () => {
    // Otherwise the conversation vanishes while the thing that makes the
    // persona remember it survives — the exact state this fix exists to
    // prevent, reached by a different route.
    failOn = "session_summaries";

    await expect(deleteConversationDb("conv-1")).rejects.toBeTruthy();
    expect(on("conversations")).toHaveLength(0);
  });

  it("refuses when nobody is signed in", async () => {
    user = null;
    await expect(deleteConversationDb("conv-1")).rejects.toThrow("Unauthorized");
    expect(calls).toHaveLength(0);
  });
});

describe("renameConversationDb", () => {
  it("scopes to the owner and caps the title", async () => {
    await renameConversationDb("conv-1", "x".repeat(500));

    const call = on("conversations")[0]!;
    expect(call.filters.user_id).toBe("user-1");
    expect((call.payload as { title: string }).title).toHaveLength(200);
  });

  it("refuses when nobody is signed in", async () => {
    user = null;
    await expect(renameConversationDb("conv-1", "New")).rejects.toThrow("Unauthorized");
  });
});

describe("pinConversationDb", () => {
  it("scopes to the owner", async () => {
    await pinConversationDb("conv-1", true);

    const call = on("conversations")[0]!;
    expect(call.filters.user_id).toBe("user-1");
    expect(call.payload).toMatchObject({ pinned: true });
  });

  it("refuses when nobody is signed in", async () => {
    user = null;
    await expect(pinConversationDb("conv-1", true)).rejects.toThrow("Unauthorized");
  });
});
