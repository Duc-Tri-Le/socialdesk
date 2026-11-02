import { metricScanActions } from "./interactions/metricScanActions";
import { commentActions } from "./interactions/commentActions";
import { messagingActions } from "./interactions/messagingActions";

export const interactionActions = {
  ...metricScanActions,
  ...commentActions,
  ...messagingActions,
};
