import defaults from '@/content/catalogue.json';
export function catalogueFromCopy(texts: Record<string,string>) {
  return defaults.map(product => ({...product,
    name:texts[`product-${product.id}-name`] ?? product.name,
    category:texts[`product-${product.id}-category`] ?? product.category,
    summary:texts[`product-${product.id}-summary`] ?? product.summary,
  }));
}
