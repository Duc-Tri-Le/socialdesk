import { z } from "zod";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";

export { z };

export interface ActionDefinition<
  TReq extends z.ZodTypeAny = z.ZodTypeAny,
  TRes extends z.ZodTypeAny = z.ZodTypeAny,
> {
  request?: TReq;
  response?: TRes;
  privileged?: any;
  handler: (
    ctx: Ctx,
    args: z.infer<TReq>,
  ) => Promise<z.infer<TRes>> | z.infer<TRes>;
}

export function defineAction<
  TReq extends z.ZodTypeAny = z.ZodTypeAny,
  TRes extends z.ZodTypeAny = z.ZodTypeAny,
>(
  def: {
    request?: TReq;
    response?: TRes;
    privileged?: any;
    handler: (ctx: Ctx, args: z.infer<TReq>) => Promise<z.infer<TRes>> | z.infer<TRes>;
  },
): ActionDefinition<TReq, TRes> {
  return def as any;
}

export function definePrivilegedContracts<T>(def: T): T {
  return def;
}

export function definePrivilegedHandlers<
  TContracts extends Record<string, any>,
>(
  _contracts: TContracts,
  handlers: {
    [K in keyof TContracts]?: (
      args: TContracts[K] extends { request: z.ZodTypeAny }
        ? z.infer<TContracts[K]["request"]>
        : any,
    ) => any;
  },
): any {
  return handlers;
}

export type ActionsModule = Record<string, any>;

export interface Ctx {
  db<TSchema extends Record<string, unknown> = Record<string, any>>(): BunSQLiteDatabase<TSchema>;
  executePrivileged(contract: any, args: any): Promise<any>;
  invalidateQueries(): void;
  inference: {
    complete(prompt: string, opts?: any): Promise<any>;
  };
  agent: {
    spawnTask(msg: string, opts?: any): Promise<any>;
  };
  blobs: {
    getUrl(key: string): Promise<string>;
    put(key: string, data: any, opts?: any): Promise<any>;
    delete(key: string): Promise<void>;
  };
}
