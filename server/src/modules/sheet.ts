import { sheetConfigActions } from "./sheet/sheetConfigActions";
import { sheetSyncActions } from "./sheet/sheetSyncActions";

export { sheetConfigActions } from "./sheet/sheetConfigActions";
export { sheetSyncActions } from "./sheet/sheetSyncActions";

export const sheetActions = {
  ...sheetConfigActions,
  ...sheetSyncActions,
};
