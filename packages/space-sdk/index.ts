import { z } from "zod";

export { z };

export function defineAction<T>(def: T): T {
  return def;
}

export function definePrivilegedContracts<T>(def: T): T {
  return def;
}

export function definePrivilegedHandlers(contracts: any, handlers: any): any {
  return handlers;
}

export type ActionsModule = Record<string, any>;

export interface Ctx {
  db<T = any>(): any;
  executePrivileged?(contract: any, args: any): Promise<any>;
  invalidateQueries(): void;
  inference?: {
    complete(prompt: string, opts?: any): Promise<any>;
  };
  agent?: {
    spawnTask(msg: string, opts?: any): Promise<any>;
  };
  blobs?: {
    getUrl(key: string): Promise<string>;
    put(key: string, data: any, opts?: any): Promise<any>;
    delete(key: string): Promise<void>;
  };
}
