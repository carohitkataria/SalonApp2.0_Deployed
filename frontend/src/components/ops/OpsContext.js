import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

/** Shared salon cart + navigation state for Ops modules (Inventory / Shop / Orders). */
const OpsCtx = createContext(null);

export function OpsProvider({ children }) {
  const [salonCart, setSalonCart] = useState([]); // [{product_id, name, brand, price, mrp, qty, image_url, moq, supplier}]
  const [showOrdersPage, setShowOrdersPage] = useState(false);
  const [showReviewDrawer, setShowReviewDrawer] = useState(false);
  const [openProduct, setOpenProduct] = useState(null); // for PDP

  const addToCart = useCallback((product, qty = 1) => {
    setSalonCart((prev) => {
      const found = prev.find((x) => x.product_id === product.id);
      if (found) {
        return prev.map((x) =>
          x.product_id === product.id ? { ...x, qty: (x.qty || 1) + qty } : x
        );
      }
      return [
        ...prev,
        {
          product_id: product.id,
          name: product.name,
          brand: product.brand,
          price: product.selling_price ?? product.price ?? 0,
          mrp: product.mrp ?? 0,
          qty: qty,
          image_url: (product.images && product.images[0]) || product.image_url,
          moq: product.low_stock_threshold || product.moq || 1,
          supplier: product.supplier_name || product.supplier,
        },
      ];
    });
  }, []);

  const updateQty = useCallback((product_id, qty) => {
    setSalonCart((prev) =>
      prev.map((x) => (x.product_id === product_id ? { ...x, qty: Math.max(1, qty) } : x))
    );
  }, []);

  const removeFromCart = useCallback((product_id) => {
    setSalonCart((prev) => prev.filter((x) => x.product_id !== product_id));
  }, []);

  const clearCart = useCallback(() => setSalonCart([]), []);

  const cartCount = useMemo(
    () => salonCart.reduce((s, x) => s + (x.qty || 1), 0),
    [salonCart]
  );

  const subtotal = useMemo(
    () => salonCart.reduce((s, x) => s + (x.price || 0) * (x.qty || 1), 0),
    [salonCart]
  );

  const value = {
    salonCart, addToCart, updateQty, removeFromCart, clearCart,
    cartCount, subtotal,
    showOrdersPage, setShowOrdersPage,
    showReviewDrawer, setShowReviewDrawer,
    openProduct, setOpenProduct,
  };

  return <OpsCtx.Provider value={value}>{children}</OpsCtx.Provider>;
}

export function useOps() {
  const ctx = useContext(OpsCtx);
  if (!ctx) throw new Error('useOps must be used within OpsProvider');
  return ctx;
}
