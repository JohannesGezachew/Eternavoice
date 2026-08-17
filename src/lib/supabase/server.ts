import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseUrl, supabaseAnonKey } from "@/lib/env";

/**
 * There used to be a `createServiceClient` here, unused by anything. It built
 * a client on the SERVICE ROLE key while still wiring up the user's cookies —
 * so anything that reached for it, expecting the ordinary client's shape,
 * would have got an RLS bypass with a user session attached to it. Deleted
 * rather than fixed: the two admin clients in this codebase are built inline
 * at their call sites, where the choice is visible.
 */

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    supabaseUrl(),
    supabaseAnonKey(),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // setAll called from a Server Component — cookies will be set by middleware
          }
        },
      },
    },
  );
}
