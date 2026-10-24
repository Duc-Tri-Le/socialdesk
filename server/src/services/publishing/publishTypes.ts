export type PublishResultItem = {
  kind: "page" | "instagram" | "group" | "account";
  name: string;
  status:
    | "published"
    | "failed"
    | "unsupported"
    | "skipped"
    | "queued"
    | "needs_login";
  message: string;
  post_url: string;
};

export type PublishDraftArgs = {
  id: number;
  group_ids: number[];
  page_ids: number[];
  instagram_account_ids: number[];
};

export type PublishDraftResponse = {
  ok: boolean;
  message: string;
  results: PublishResultItem[];
};

export type BrowserQueueItem = {
  recordId: number;
  kind: "group" | "page";
  name: string;
  url: string;
  via: string[];
  note: string;
};

export type IgQueueItem = {
  recordId: number;
  name: string;
  accountId: string;
  username: string;
  files: string[];
  hadUncertain: boolean;
};
