import type { Revision } from "./types.js";
import { createEventHook } from "./useEvent.js";

export enum PRState {
  SYNCING = "syncing",
  PENDING = "pending",
  CREATED = "created",
  UPDATED = "updated",
  DELETED = "deleted",
  SKIPPED = "skipped",
}

export const [emitStackEvent, useStackEvent] = createEventHook<{
  init: Revision[];
  update: {
    rev: Revision;
    state: PRState;
    prNumber?: number;
  };
}>();
