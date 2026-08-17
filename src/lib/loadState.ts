/**
 * Telling "we could not reach your account" apart from "there is nothing here".
 *
 * Three screens collapsed both into the same render, so a dropped connection
 * announced that someone's dead relatives had been removed: the people library
 * said "No one here yet", and the person hub and re-record screen said
 * "Person not found — They may have been removed". /conversations already
 * distinguishes them and carries a comment about why; these never got it.
 *
 * There is no worse sentence this product could show by accident.
 */
export type LoadState = "loading" | "ready" | "failed";

/** Said as a fact about the connection, never about their data. */
export const LOAD_FAILED_TITLE = "We couldn\u2019t reach your account";
export const LOAD_FAILED_BODY =
  "Nothing is lost \u2014 we just couldn\u2019t load it right now. Check your connection and try again.";
