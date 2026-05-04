declare module "node:sqlite" {
  export type DatabaseSyncOptions = {
    readonly?: boolean;
  };

  export class StatementSync {
    all(...params: unknown[]): unknown[];
    get(...params: unknown[]): unknown;
  }

  export class DatabaseSync {
    constructor(path: string, options?: DatabaseSyncOptions);
    prepare(sql: string): StatementSync;
    close(): void;
  }
}
