"use client";

import { useEffect, useRef } from "react";
import { useSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/client";
import type { SubjectRow } from "@/lib/db/subjects";
import type { MemoryItem, ConversationRecord } from "@/lib/types";

interface UserDataResponse {
  subjects?: SubjectRow[];
  memories?: MemoryItem[];
  conversations?: ConversationRecord[];
  error?: string;
}

export function DbHydrator() {
  const hydrateFromDb = useSession((s) => s.hydrateFromDb);
  const markDbSettled = useSession((s) => s.markDbSettled);
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;

    const run = async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const res = await fetch("/api/user/data");
        if (!res.ok) return;
        const data = (await res.json()) as UserDataResponse;

        hydrateFromDb({
          subjects: data.subjects ?? [],
          memories: data.memories ?? [],
          conversations: data.conversations ?? [],
        });
      } catch {
        // Non-fatal — localStorage data remains active
      } finally {
        // In a finally, and not only on success: screens hold their skeleton
        // until this flips, so a signed-out visitor or a failed read must
        // still end the wait rather than leave them staring at a placeholder.
        markDbSettled();
      }
    };

    void run();
  }, [hydrateFromDb, markDbSettled]);

  return null;
}
