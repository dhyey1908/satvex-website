import { useEffect, useState } from 'react';
import { productService } from '../services/productService';

// One shared fetch of the public catalogue for the whole session. Cart/order
// lines store a snapshot of the product photo taken when they were created;
// the catalogue is what lets the UI show the photo of the colour that was
// actually chosen (including for lines created before that was stored).
let cache = null;
let inflight = null;

export function useCatalog() {
  const [products, setProducts] = useState(cache);

  useEffect(() => {
    if (cache) return undefined;
    let alive = true;
    inflight ||= productService
      .list()
      .then((data) => {
        cache = data.products || [];
        return cache;
      })
      .catch(() => {
        inflight = null; // try again next time
        return [];
      });
    inflight.then((list) => alive && setProducts(list));
    return () => {
      alive = false;
    };
  }, []);

  return products;
}
