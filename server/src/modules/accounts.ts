import { accountCrudActions } from "./accounts/accountCrudActions";
import { pageActions } from "./accounts/pageActions";
import { browserLoginActions } from "./accounts/browserLoginActions";

export { accountCrudActions } from "./accounts/accountCrudActions";
export { pageActions } from "./accounts/pageActions";
export { browserLoginActions } from "./accounts/browserLoginActions";

export const accountActions = {
  ...accountCrudActions,
  ...pageActions,
  ...browserLoginActions,
};
