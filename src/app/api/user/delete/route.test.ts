import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Erasing an account.
 *
 * The rule under test is that "deleted" is only ever said when it happened.
 * Every step here used to run unchecked: a failed delete looked exactly like a
 * successful one, the login was removed anyway, and the response said
 * `{ deleted: true }` — so someone exercising their right to erasure was told
 * their data was gone while it sat in Postgres, with no account left that
 * could ever reach it to try again.
 *
 * The order is the other half of it. Anything that fails must leave the login
 * intact, because that is the only thing that makes a retry possible.
 */

vi.mock("server-only", () => ({}));

vi.mock("@/lib/env", () => ({
  env: { STRIPE_SECRET_KEY: "sk_test", SUPABASE_SERVICE_ROLE_KEY: "service" },
}));

const cancelSubscription = vi.fn();
vi.mock("stripe", () => ({
  default: class {
    subscriptions = { cancel: cancelSubscription };
  },
}));

const deleteVoice = vi.fn();
vi.mock("@/lib/elevenlabs", () => ({
  elevenlabs: () => ({ voices: { delete: deleteVoice } }),
}));

interface Scenario {
  user: { id: string } | null;
  subjects: Array<{ voice_id: string | null }> | null;
  subjectsError: unknown;
  /** Table name whose delete should fail. */
  failDeleteOn: string | null;
  authDeleteError: unknown;
}

const scenario: Scenario = {
  user: { id: "user-1" },
  subjects: [],
  subjectsError: null,
  failDeleteOn: null,
  authDeleteError: null,
};

const deleted: string[] = [];

function userClient() {
  const chain = {
    select: () => chain,
    eq: () => chain,
    not: () => Promise.resolve({ data: scenario.subjects, error: scenario.subjectsError }),
    maybeSingle: () => Promise.resolve({ data: { subscription_id: "sub_1" }, error: null }),
  };
  return {
    auth: { getUser: () => Promise.resolve({ data: { user: scenario.user } }) },
    from: () => chain,
  };
}

function adminClient() {
  return {
    from: (name: string) => ({
      delete: () => ({
        eq: () => {
          deleted.push(name);
          return Promise.resolve({
            error: scenario.failDeleteOn === name ? { message: "boom" } : null,
          });
        },
      }),
    }),
    auth: {
      admin: {
        deleteUser: () => {
          deleted.push("auth.user");
          return Promise.resolve({ error: scenario.authDeleteError });
        },
      },
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({ createClient: () => userClient() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => adminClient() }));

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://example.supabase.co";

const { POST } = await import("./route");

function request(confirm: unknown = "DELETE MY ACCOUNT") {
  return new Request("https://eternavoice.com/api/user/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirm }),
  });
}

beforeEach(() => {
  deleted.length = 0;
  scenario.user = { id: "user-1" };
  scenario.subjects = [];
  scenario.subjectsError = null;
  scenario.failDeleteOn = null;
  scenario.authDeleteError = null;
  deleteVoice.mockReset().mockResolvedValue(undefined);
  cancelSubscription.mockReset().mockResolvedValue(undefined);
});

describe("account deletion", () => {
  it("removes everything, login last", async () => {
    const res = await POST(request());

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ deleted: true });
    expect(deleted).toContain("profiles");
    expect(deleted).toContain("readings");
    expect(deleted).toContain("usage_counters");
    expect(deleted[deleted.length - 1]).toBe("auth.user");
  });

  it("refuses without the exact confirmation", async () => {
    const res = await POST(request("delete"));
    expect(res.status).toBe(400);
    expect(deleted).toHaveLength(0);
  });

  it("refuses when nobody is signed in", async () => {
    scenario.user = null;
    const res = await POST(request());
    expect(res.status).toBe(401);
    expect(deleted).toHaveLength(0);
  });

  it("deletes the cloned voices before anything local", async () => {
    scenario.subjects = [{ voice_id: "voice_a" }, { voice_id: "voice_b" }];

    await POST(request());

    expect(deleteVoice).toHaveBeenCalledTimes(2);
  });

  it("stops rather than stranding a voice at the provider", async () => {
    // "Delete my account" must not leave a clone of a dead person's voice on a
    // third party's servers with the account that knew about it erased.
    scenario.subjects = [{ voice_id: "voice_a" }];
    deleteVoice.mockRejectedValue(new Error("provider down"));

    const res = await POST(request());

    expect(res.status).toBe(502);
    expect(deleted).toHaveLength(0);
  });

  it("leaves the account intact when a table fails", async () => {
    scenario.failDeleteOn = "memories";

    const res = await POST(request());

    expect(res.status).toBe(500);
    expect(deleted).not.toContain("auth.user");
    expect(deleted).not.toContain("profiles");
  });

  it("does not claim success when the profile itself fails", async () => {
    scenario.failDeleteOn = "profiles";

    const res = await POST(request());

    expect(res.status).toBe(500);
    expect(deleted).not.toContain("auth.user");
  });

  it("keeps going when Stripe cannot be reached", async () => {
    // Billing state at a third party must not block erasure, or the user can
    // never delete anything at all.
    cancelSubscription.mockRejectedValue(new Error("stripe down"));

    const res = await POST(request());

    expect(res.status).toBe(200);
    expect(deleted).toContain("profiles");
  });

  it("still reports the data gone if only the login removal fails", async () => {
    scenario.authDeleteError = { message: "auth down" };

    const res = await POST(request());
    const json = (await res.json()) as { deleted?: boolean; note?: string };

    expect(res.status).toBe(200);
    expect(json.deleted).toBe(true);
    // Telling someone to "try again" about a sign-in they can no longer use
    // would be nonsense; everything they made is already gone.
    expect(json.note).toBeTruthy();
  });
});
