import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * The billing webhook, which is the only thing standing between a successful
 * payment and an account that works.
 *
 * Three failure modes are pinned here, all of which left a paying customer
 * locked out with nothing coming to fix it: a write that failed while the
 * route answered 200 (so Stripe never retried), an event delivered out of
 * order overwriting newer state, and a subscription with no metadata silently
 * matching no user at all.
 *
 * Everything below drives the real handler. The Supabase client is a fake that
 * records what was asked of it, because the point of these tests is which
 * calls happen and which do not.
 */

vi.mock("server-only", () => ({}));

// The signature check is Stripe's; what matters here is what happens after it.
const constructEvent = vi.fn();
vi.mock("stripe", () => ({
  default: class {
    webhooks = { constructEvent };
  },
}));

vi.mock("@/lib/env", () => ({
  env: {
    STRIPE_SECRET_KEY: "sk_test",
    STRIPE_WEBHOOK_SECRET: "whsec_test",
    SUPABASE_SERVICE_ROLE_KEY: "service",
  },
}));

type Row = Record<string, unknown> | null;

interface TableState {
  /** What a select on this table resolves to. */
  row?: Row;
  /** Error returned by the next insert, e.g. a unique violation. */
  insertError?: { code?: string } | null;
  /** Error returned by the next update. */
  updateError?: { message: string } | null;
}

const state: Record<string, TableState> = {};
const calls: Array<{ table: string; op: string; payload?: unknown }> = [];

function table(name: string) {
  const config = state[name] ?? {};
  const result = <T>(value: T) => Promise.resolve(value);

  const selectChain = {
    eq() {
      return selectChain;
    },
    maybeSingle: () => result({ data: config.row ?? null, error: null }),
    single: () => result({ data: config.row ?? null, error: null }),
  };

  return {
    select() {
      calls.push({ table: name, op: "select" });
      return selectChain;
    },
    insert(payload: unknown) {
      calls.push({ table: name, op: "insert", payload });
      return result({ error: config.insertError ?? null });
    },
    update(payload: unknown) {
      calls.push({ table: name, op: "update", payload });
      return {
        eq: () => result({ error: config.updateError ?? null }),
      };
    },
    delete() {
      calls.push({ table: name, op: "delete" });
      return { eq: () => result({ error: null }) };
    },
  };
}

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ from: (name: string) => table(name) }),
}));

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://example.supabase.co";

const { POST } = await import("./route");

const NOW = Math.floor(Date.parse("2026-08-17T12:00:00Z") / 1000);

function request() {
  return new Request("https://eternavoice.com/api/stripe/webhook", {
    method: "POST",
    headers: { "stripe-signature": "sig" },
    body: "{}",
  });
}

function subscriptionEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "evt_1",
    type: "customer.subscription.updated",
    created: NOW,
    data: {
      object: {
        id: "sub_1",
        status: "active",
        trial_end: null,
        customer: "cus_1",
        metadata: { supabase_user_id: "user-1" },
        ...overrides,
      },
    },
  };
}

beforeEach(() => {
  calls.length = 0;
  for (const key of Object.keys(state)) delete state[key];
  constructEvent.mockReset();
});

const updates = () => calls.filter((c) => c.table === "profiles" && c.op === "update");

describe("stripe webhook", () => {
  it("applies a subscription update to the named user", async () => {
    constructEvent.mockReturnValue(subscriptionEvent());
    state.profiles = { row: { subscription_event_at: null } };

    const res = await POST(request());

    expect(res.status).toBe(200);
    expect(updates()).toHaveLength(1);
    expect(updates()[0]!.payload).toMatchObject({
      subscription_status: "active",
      subscription_id: "sub_1",
    });
  });

  it("does not replay an event it has already handled", async () => {
    constructEvent.mockReturnValue(subscriptionEvent());
    // 23505 is unique_violation on the events table's primary key.
    state.stripe_events = { insertError: { code: "23505" } };

    const res = await POST(request());

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ duplicate: true });
    expect(updates()).toHaveLength(0);
  });

  it("ignores an event older than the state already written", async () => {
    // The exact case that locked accounts: an `incomplete` overtaking the
    // `active` behind it, with no third event ever coming to correct it.
    constructEvent.mockReturnValue(
      subscriptionEvent({ status: "incomplete" }),
    );
    state.profiles = {
      row: { subscription_event_at: new Date((NOW + 60) * 1000).toISOString() },
    };

    const res = await POST(request());

    expect(res.status).toBe(200);
    expect(updates()).toHaveLength(0);
  });

  it("applies an event newer than the state already written", async () => {
    constructEvent.mockReturnValue(subscriptionEvent());
    state.profiles = {
      row: { subscription_event_at: new Date((NOW - 60) * 1000).toISOString() },
    };

    await POST(request());

    expect(updates()).toHaveLength(1);
  });

  it("finds the user by customer id when the subscription carries no metadata", async () => {
    // A subscription created from the Stripe dashboard has no metadata. This
    // used to do nothing at all: the customer paid and got no access, and
    // nothing raised an error, because "no user id" and "nothing to do" were
    // the same branch.
    constructEvent.mockReturnValue(subscriptionEvent({ metadata: {} }));
    state.profiles = { row: { id: "user-1", subscription_event_at: null } };

    await POST(request());

    expect(updates()).toHaveLength(1);
  });

  it("asks Stripe to retry when the write fails, instead of claiming success", async () => {
    constructEvent.mockReturnValue(subscriptionEvent());
    state.profiles = {
      row: { subscription_event_at: null },
      updateError: { message: "connection reset" },
    };

    const res = await POST(request());

    expect(res.status).toBe(500);
  });

  it("releases its claim on the event when the write fails", async () => {
    // Otherwise the retry Stripe is about to send arrives, is read as a
    // duplicate, and is dropped — leaving the account permanently wrong and
    // the delivery permanently marked as handled.
    constructEvent.mockReturnValue(subscriptionEvent());
    state.profiles = {
      row: { subscription_event_at: null },
      updateError: { message: "connection reset" },
    };

    await POST(request());

    expect(calls.some((c) => c.table === "stripe_events" && c.op === "delete")).toBe(true);
  });

  it("records a cancellation as canceled rather than the status on the object", async () => {
    constructEvent.mockReturnValue({
      ...subscriptionEvent(),
      type: "customer.subscription.deleted",
    });
    state.profiles = { row: { subscription_event_at: null } };

    await POST(request());

    expect(updates()[0]!.payload).toMatchObject({ subscription_status: "canceled" });
  });

  it("rejects a request with no signature before touching anything", async () => {
    const res = await POST(
      new Request("https://eternavoice.com/api/stripe/webhook", {
        method: "POST",
        body: "{}",
      }),
    );

    expect(res.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it("rejects an invalid signature", async () => {
    constructEvent.mockImplementation(() => {
      throw new Error("no match");
    });

    const res = await POST(request());

    expect(res.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it("does not blank a real subscription id when a payment fails", async () => {
    constructEvent.mockReturnValue({
      id: "evt_2",
      type: "invoice.payment_failed",
      created: NOW,
      data: { object: { customer: "cus_1" } },
    });
    state.profiles = {
      row: { id: "user-1", subscription_id: null, subscription_event_at: null },
    };

    await POST(request());

    const payload = updates()[0]!.payload as Record<string, unknown>;
    expect(payload.subscription_status).toBe("past_due");
    expect(payload).not.toHaveProperty("subscription_id");
  });
});
