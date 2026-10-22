import { QueryClient } from "@tanstack/react-query";

export const spaceQueryClient = new QueryClient();

export type ApiRequest<TClient, TAction extends string> = any;
export type ApiResponse<TClient, TAction extends string> = any;

export function createActionClient<T = any>() {
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
