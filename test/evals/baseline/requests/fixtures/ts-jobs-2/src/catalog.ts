export interface Item {
  sku: string;
}

/** Gets one page of the supplier's catalog. The supplier allows one request at a time. */
export type FetchPage = (page: number, signal?: AbortSignal) => Promise<Item[]>;
