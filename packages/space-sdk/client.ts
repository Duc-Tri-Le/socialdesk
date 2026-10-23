import { QueryClient } from "@tanstack/react-query";
import { type z } from "zod";

export const spaceQueryClient = new QueryClient();

type InferZod<T> = T extends z.ZodType ? z.infer<T> : any;

export type ActionClient<TActions> = {
  [K in keyof TActions]: (
    args?: TActions[K] extends { request?: infer TReq } ? InferZod<TReq> : any,
  ) => Promise<
    TActions[K] extends { response?: infer TRes } ? InferZod<TRes> : any
  >;
};

export type ApiRequest<TClient, TAction extends keyof TClient | string> =
  TAction extends keyof TClient
    ? TClient[TAction] extends (args?: infer TArgs) => any
      ? TArgs
      : any
    : any;

export type ApiResponse<TClient, TAction extends keyof TClient | string> =
  TAction extends keyof TClient
    ? TClient[TAction] extends (...args: any[]) => Promise<infer TRes>
      ? TRes
      : any
    : any;

export function createActionClient<TActions = any>(): ActionClient<TActions> {
  return new Proxy(
    {},
    {
      get(_, actionName: string) {
        return async (args: any = {}) => {
          const res = await fetch("/actions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: actionName, args: args ?? {} }),
          });
          if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Action ${actionName} failed (${res.status}): ${errText}`);
          }
          return await res.json();
        };
      },
    },
  ) as any;
}
