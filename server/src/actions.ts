// Actions for Social Desk.
// Clean Architecture: modular domain actions composed into a single typed ActionsModule.

import type { ActionsModule } from "@hatch/space-sdk";
import { systemActions } from "./modules/system";
import { accountActions } from "./modules/accounts";
import { sheetActions } from "./modules/sheet";
import { productActions } from "./modules/products";
import { groupActions } from "./modules/groups";
import { draftActions } from "./modules/drafts";
import { analyticsActions } from "./modules/analytics";
import { mediaActions } from "./modules/media";

export const Actions = {
  ...systemActions,
  ...accountActions,
  ...sheetActions,
  ...productActions,
  ...groupActions,
  ...draftActions,
  ...analyticsActions,
  ...mediaActions,
} satisfies ActionsModule;

export type Actions = typeof Actions;

// Re-export services and schemas for convenient backend access
export * from "./types";
export * from "./services/settings";
export * from "./services/drive";
export * from "./services/sheet";
export * from "./services/copywriting";
export * from "./services/groups";
export * from "./services/postingPack";
export * from "./services/analytics";
