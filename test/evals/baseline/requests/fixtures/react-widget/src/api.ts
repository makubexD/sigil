export interface Product {
  sku: string;
  title: string;
}

/** Products matching what the user typed. A short term matches more and takes longer to answer. */
export async function searchProducts(term: string, signal?: AbortSignal): Promise<Product[]> {
  const response = await fetch(
    `https://search.example.com/products?q=${encodeURIComponent(term)}`,
    {
      signal,
    },
  );
  if (!response.ok) throw new Error(`search answered ${response.status}`);
  return (await response.json()) as Product[];
}
