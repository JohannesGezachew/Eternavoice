"use client";

import { conversationToText, conversationFilename } from "./conversations";
import { trackEvent } from "./analytics";
import type { ConversationRecord } from "./types";

/**
 * Save a conversation as something you can keep outside the app.
 *
 * "Download my data" already exists and returns JSON — a compliance artifact,
 * not a keepsake. Nobody prints JSON and puts it in a drawer. This is the
 * readable version of one conversation, which is the thing people actually
 * want when they say they want to keep it.
 */
export function exportConversation(
  conversation: ConversationRecord,
  personName: string,
): void {
  const text = conversationToText(conversation, personName);
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = conversationFilename(conversation, personName);
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
  trackEvent("conversation_exported", { turns: conversation.turns.length });
}
