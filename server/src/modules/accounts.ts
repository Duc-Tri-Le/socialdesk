import { accountCrudActions } from "./accounts/accountCrudActions";
import { pageActions } from "./accounts/pageActions";
import { browserLoginActions } from "./accounts/browserLoginActions";
import { oauthActions } from "./accounts/oauthActions";

export { accountCrudActions } from "./accounts/accountCrudActions";
export { pageActions } from "./accounts/pageActions";
export { browserLoginActions } from "./accounts/browserLoginActions";
export { oauthActions } from "./accounts/oauthActions";

export const accountActions = {
  ...accountCrudActions,
  ...pageActions,
  ...browserLoginActions,
  ...oauthActions,
};
