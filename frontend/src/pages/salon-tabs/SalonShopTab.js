/**
 * Phase 15 — Customer Shop tab (unified products + memberships).
 *
 * Replaces the membership-only flow with a full salon storefront:
 *   - Browse all sellable inventory + membership plans
 *   - Search / filter (category, brand)
 *   - Add to cart with qty controls
 *   - Checkout with payment mode picker (cash/upi/wallet/pay_at_salon/card)
 *   - Saves the cart to localStorage keyed on salonId so the customer can
 *     navigate back without losing it.
 *
 * Stock is reserved on checkout; salon fulfils the order at the counter.
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ShoppingBag, Search, Plus, Minus, X, Crown, CheckCircle, Loader2,
  Banknote, Smartphone, Wallet, CreditCard, Store, ChevronLeft, BellRing, History,
} from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;
const fmt = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const PAYMENT_MODES = [
  { value: 'pay_at_salon', label: 'Pay at salon', icon: Store, hint: 'Pay when you collect' },
  { value: 'upi',          label: 'UPI',          icon: Smartphone, hint: 'PhonePe / GPay / Paytm' },
  { value: 'cash',         label: 'Cash',         icon: Banknote, hint: 'Hand-over cash' },
  { value: 'card',         label: 'Card',         icon: CreditCard, hint: 'Debit / Credit' },
  { value: 'wallet',       label: 'Salon Wallet', icon: Wallet, hint: 'Use your salon balance' },
];

function cartStorageKey(salonId, phone) {
  return `salon_shop_cart_${salonId}_${phone || 'guest'}`;
}

export default function SalonShopTab({ salonId }) {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [qDraft, setQDraft] = useState('');
  const [category, setCategory] = useState('');
  const [brand, setBrand] = useState('');
  const [step, setStep] = useState('browse'); // browse | checkout | success | orders
  const [cart, setCart] = useState([]);  // [{id, item_type, qty, snapshot}]
  const [paymentMode, setPaymentMode] = useState('pay_at_salon');
  const [submitting, setSubmitting] = useState(false);
  const [lastOrderId, setLastOrderId] = useState(null);
  const [myOrders, setMyOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [notifyMeSent, setNotifyMeSent] = useState({});

  const phone = useMemo(() => (user?.phone || '').replace(/^\+91/, ''), [user]);

  const cartKey = useMemo(() => cartStorageKey(salonId, phone), [salonId, phone]);

  // Hydrate cart from localStorage.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(cartKey);
      if (raw) setCart(JSON.parse(raw));
    } catch (e) { console.debug('Cart hydrate failed:', e); }
  }, [cartKey]);

  useEffect(() => {
    try { localStorage.setItem(cartKey, JSON.stringify(cart)); } catch (e) { console.debug('Cart persist failed:', e); }
  }, [cart, cartKey]);

  const fetchProducts = useCallback(async () => {
    if (!salonId) return;
    setLoading(true);
    try {
      const params = { include_memberships: true };
      if (q) params.q = q;
      if (category) params.category = category;
      if (brand) params.brand = brand;
      const r = await axios.get(`${API}/customer/salon/${salonId}/shop/products`, { params });
      setProducts(r.data.products || []);
    } catch (e) {
      console.error('Error loading shop products:', e);
      toast.error('Failed to load products');
    } finally {
      setLoading(false);
    }
  }, [salonId, q, category, brand]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  const categories = useMemo(() => {
    const set = new Set();
    products.forEach(p => { if (p.item_type === 'product' && p.category) set.add(p.category); });
    return Array.from(set);
  }, [products]);

  const brands = useMemo(() => {
    const set = new Set();
    products.forEach(p => { if (p.item_type === 'product' && p.brand) set.add(p.brand); });
    return Array.from(set);
  }, [products]);

  // Cart helpers
  const cartCount = cart.reduce((s, l) => s + l.qty, 0);
  const cartTotal = cart.reduce((s, l) => s + (l.qty * (l.snapshot?.selling_price || 0)), 0);

  const addToCart = (product) => {
    if (!product.in_stock) {
      toast.error('Out of stock');
      return;
    }
    setCart((prev) => {
      const idx = prev.findIndex(l => l.id === product.id && l.item_type === product.item_type);
      if (idx >= 0) {
        const updated = [...prev];
        const max = product.qty_available;
        const newQty = Math.min(max, updated[idx].qty + 1);
        if (newQty === updated[idx].qty) {
          toast.warning(`Only ${max} units available`);
          return prev;
        }
        updated[idx] = { ...updated[idx], qty: newQty };
        return updated;
      }
      return [...prev, { id: product.id, item_type: product.item_type, qty: 1, snapshot: product }];
    });
  };

  const adjustQty = (line, delta) => {
    setCart((prev) => prev.map(l => {
      if (l.id !== line.id || l.item_type !== line.item_type) return l;
      const max = l.snapshot?.qty_available || 9999;
      const next = Math.max(0, Math.min(max, l.qty + delta));
      return next === 0 ? null : { ...l, qty: next };
    }).filter(Boolean));
  };

  const removeFromCart = (line) => {
    setCart((prev) => prev.filter(l => !(l.id === line.id && l.item_type === line.item_type)));
  };

  const submitNotifyMe = async (product) => {
    if (!user?.phone) { toast.error('Please login first'); return; }
    try {
      await axios.post(`${API}/customer/salon/${salonId}/shop/notify-me`, {
        customer_phone: phone,
        item_id: product.id,
        item_type: product.item_type,
      });
      setNotifyMeSent(p => ({ ...p, [product.id]: true }));
      toast.success("We'll notify you when it's back in stock");
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to subscribe');
    }
  };

  const handleCheckout = async () => {
    if (!user?.phone) {
      toast.error('Please login to place an order');
      return;
    }
    if (cart.length === 0) {
      toast.error('Cart is empty');
      return;
    }
    setSubmitting(true);
    try {
      const r = await axios.post(`${API}/customer/salon/${salonId}/shop/checkout`, {
        customer_phone: phone,
        customer_name: user?.name || '',
        items: cart.map(l => ({ item_id: l.id, qty: l.qty, item_type: l.item_type })),
        payment_mode: paymentMode,
      });
      setLastOrderId(r.data?.order?.id);
      setCart([]);
      try { localStorage.removeItem(cartKey); } catch (e) { console.debug('Cart remove failed:', e); }
      setStep('success');
      toast.success('Order placed!');
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Checkout failed');
    } finally {
      setSubmitting(false);
    }
  };

  const fetchMyOrders = useCallback(async () => {
    if (!user?.phone) return;
    setOrdersLoading(true);
    try {
      const r = await axios.get(`${API}/customer/shop/orders`, {
        params: { customer_phone: phone, salon_id: salonId },
      });
      setMyOrders(r.data?.orders || []);
    } catch (e) {
      console.error(e);
    } finally {
      setOrdersLoading(false);
    }
  }, [user, phone, salonId]);

  useEffect(() => {
    if (step === 'orders') fetchMyOrders();
  }, [step, fetchMyOrders]);

  const cancelOrder = async (orderId) => {
    if (!window.confirm('Cancel this order?')) return;
    try {
      await axios.post(`${API}/customer/shop/orders/${orderId}/cancel`, null, {
        params: { customer_phone: phone },
      });
      toast.success('Order cancelled');
      fetchMyOrders();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Cancel failed');
    }
  };

  // ===== Render =====
  if (step === 'success') {
    return (
      <div className="flex items-center justify-center py-16">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-center space-y-4 max-w-md"
        >
          <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle className="w-12 h-12 text-green-500" />
          </div>
          <h2 className="text-2xl font-bold">Order Placed!</h2>
          <p className="text-muted-foreground">
            Your order has been received by the salon. We'll notify you when it's ready for pickup.
          </p>
          <div className="text-xs text-muted-foreground">Order ID: {lastOrderId?.slice(0, 8)}</div>
          <div className="flex gap-2 justify-center">
            <Button variant="outline" onClick={() => setStep('orders')}>View my orders</Button>
            <Button onClick={() => setStep('browse')}>Continue shopping</Button>
          </div>
        </motion.div>
      </div>
    );
  }

  if (step === 'orders') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setStep('browse')}>
            <ChevronLeft className="w-4 h-4 mr-1" /> Back to shop
          </Button>
          <h2 className="text-lg font-bold flex items-center gap-2"><History className="w-5 h-5" /> My Orders</h2>
        </div>
        {ordersLoading ? (
          <div className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
        ) : myOrders.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">No orders yet.</div>
        ) : (
          <div className="space-y-3">
            {myOrders.map(o => (
              <div key={o.id} className="bg-card border border-border rounded-lg p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="text-xs text-muted-foreground">#{o.id.slice(0, 8)} · {new Date(o.created_at).toLocaleString()}</div>
                    <div className="font-semibold mt-0.5">{o.items?.length || 0} item(s) · {fmt(o.total_amount)}</div>
                    <div className="mt-1">
                      <StatusBadge status={o.order_status} />
                    </div>
                  </div>
                  {o.order_status === 'placed' && (
                    <Button size="sm" variant="outline" onClick={() => cancelOrder(o.id)}>Cancel</Button>
                  )}
                </div>
                <div className="mt-2 text-sm space-y-0.5">
                  {(o.items || []).map((l, i) => (
                    <div key={`${l.product_id || l.name}-${i}`} className="flex justify-between text-muted-foreground">
                      <span>{l.name} × {l.qty}{l.qty_final !== undefined && l.qty_final !== l.qty ? ` (fulfilled ${l.qty_final})` : ''}</span>
                      <span>{fmt(l.line_total)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (step === 'checkout') {
    return (
      <div className="space-y-4 max-w-2xl mx-auto">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setStep('browse')}>
            <ChevronLeft className="w-4 h-4 mr-1" /> Back to cart
          </Button>
          <h2 className="text-lg font-bold">Checkout</h2>
        </div>

        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground">Order Summary</h3>
          {cart.map(l => (
            <div key={`${l.item_type}_${l.id}`} className="flex justify-between text-sm">
              <span>{l.snapshot?.name} × {l.qty}</span>
              <span>{fmt(l.qty * (l.snapshot?.selling_price || 0))}</span>
            </div>
          ))}
          <div className="border-t border-border pt-2 flex justify-between font-bold">
            <span>Total</span>
            <span className="text-gold">{fmt(cartTotal)}</span>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold text-muted-foreground mb-3">Payment mode</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {PAYMENT_MODES.map(p => {
              const Icon = p.icon;
              const active = paymentMode === p.value;
              return (
                <button
                  key={p.value}
                  data-testid={`pay-${p.value}`}
                  onClick={() => setPaymentMode(p.value)}
                  className={`p-3 rounded-lg border text-left transition-colors ${
                    active ? 'border-gold bg-gold/10' : 'border-border hover:bg-muted'
                  }`}
                >
                  <Icon className="w-5 h-5 mb-1" />
                  <div className="font-semibold text-sm">{p.label}</div>
                  <div className="text-xs text-muted-foreground">{p.hint}</div>
                </button>
              );
            })}
          </div>
          <div className="mt-3 text-xs text-muted-foreground">
            Payment will be collected by the salon when you pick up your order.
          </div>
        </div>

        <Button
          className="w-full bg-gold text-black hover:bg-gold/90"
          disabled={submitting}
          onClick={handleCheckout}
          data-testid="checkout-place-order-btn"
        >
          {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
          Place order · {fmt(cartTotal)}
        </Button>
      </div>
    );
  }

  // ===== Browse step =====
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <h2 className="text-xl font-bold flex items-center gap-2"><ShoppingBag className="w-5 h-5" /> Salon Shop</h2>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setStep('orders')} data-testid="my-orders-btn">
            <History className="w-4 h-4 mr-1" /> My Orders
          </Button>
          {cartCount > 0 && (
            <Button size="sm" onClick={() => setStep('checkout')} data-testid="cart-checkout-btn">
              <ShoppingBag className="w-4 h-4 mr-1" /> Checkout · {cartCount}
            </Button>
          )}
        </div>
      </div>

      {/* Search + filter row */}
      <div className="space-y-2">
        <form onSubmit={(e) => { e.preventDefault(); setQ(qDraft); }} className="flex gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              data-testid="shop-search-input"
              placeholder="Search products & memberships..."
              value={qDraft}
              onChange={(e) => setQDraft(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button type="submit">Search</Button>
        </form>
        {(categories.length > 0 || brands.length > 0) && (
          <div className="flex flex-wrap gap-2">
            <FilterPill active={!category && !brand} label="All" onClick={() => { setCategory(''); setBrand(''); }} />
            {categories.map(c => (
              <FilterPill key={c} active={category === c} label={c} onClick={() => setCategory(category === c ? '' : c)} />
            ))}
            {brands.slice(0, 6).map(b => (
              <FilterPill key={b} active={brand === b} label={b} onClick={() => setBrand(brand === b ? '' : b)} />
            ))}
          </div>
        )}
      </div>

      {/* Cart preview strip */}
      <AnimatePresence>
        {cart.length > 0 && step === 'browse' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="bg-gold/5 border border-gold/30 rounded-lg p-3"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm">
                <span className="font-semibold">{cartCount}</span> items · <span className="font-bold">{fmt(cartTotal)}</span>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setCart([])}>Clear</Button>
            </div>
            <div className="mt-2 space-y-1">
              {cart.map(l => (
                <div key={`${l.item_type}_${l.id}`} className="flex items-center gap-2 text-xs">
                  <span className="flex-1 truncate">{l.snapshot?.name}</span>
                  <button onClick={() => adjustQty(l, -1)} className="p-1 rounded hover:bg-muted"><Minus className="w-3 h-3" /></button>
                  <span className="font-semibold w-5 text-center">{l.qty}</span>
                  <button onClick={() => adjustQty(l, +1)} className="p-1 rounded hover:bg-muted"><Plus className="w-3 h-3" /></button>
                  <button onClick={() => removeFromCart(l)} className="p-1 rounded hover:bg-muted"><X className="w-3 h-3" /></button>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Product grid */}
      {loading ? (
        <div className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
      ) : products.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground" data-testid="shop-empty-state">
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>No products added yet</div>
          <div style={{ fontSize: 13 }}>Products will appear here as suppliers add them.</div>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3" data-testid="shop-product-grid">
          {products.map(p => (
            <ProductCard
              key={`${p.item_type}_${p.id}`}
              product={p}
              onAdd={() => addToCart(p)}
              onNotify={() => submitNotifyMe(p)}
              notifySent={notifyMeSent[p.id]}
              cartLine={cart.find(l => l.id === p.id && l.item_type === p.item_type)}
              onAdjust={(d) => {
                const line = cart.find(l => l.id === p.id && l.item_type === p.item_type);
                if (line) adjustQty(line, d);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterPill({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 text-xs rounded-full border transition-colors ${
        active ? 'bg-gold text-black border-gold' : 'bg-card border-border hover:bg-muted'
      }`}
    >{label}</button>
  );
}

function ProductCard({ product, onAdd, onNotify, notifySent, cartLine, onAdjust }) {
  const isMembership = product.item_type === 'membership';
  const fallback = isMembership
    ? `https://placehold.co/400x400/d4af37/000?text=${encodeURIComponent(product.name || 'Membership')}`
    : `https://placehold.co/400x400/333/fff?text=${encodeURIComponent(product.name || 'Product')}`;
  return (
    <div
      className="bg-card border border-border rounded-xl overflow-hidden flex flex-col"
      data-testid={`shop-product-card-${product.id}`}
    >
      <div className="aspect-square bg-muted relative overflow-hidden">
        <img
          src={product.image_url || fallback}
          alt={product.name}
          className="w-full h-full object-cover"
          onError={(e) => { e.currentTarget.src = fallback; }}
        />
        {isMembership && (
          <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-gold/90 text-black text-[10px] font-bold flex items-center gap-1">
            <Crown className="w-3 h-3" /> Membership
          </div>
        )}
        {!product.in_stock && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
            <span className="text-white text-xs font-bold uppercase">Out of stock</span>
          </div>
        )}
      </div>
      <div className="p-3 flex-1 flex flex-col">
        <div className="text-sm font-semibold line-clamp-2 min-h-[2.5rem]">{product.name}</div>
        {!isMembership && product.brand && (
          <div className="text-xs text-muted-foreground mt-0.5">{product.brand}</div>
        )}
        {isMembership && (
          <div className="text-xs text-muted-foreground mt-0.5">
            ₹{product.credit} credit · {product.validity_months} months
          </div>
        )}
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-base font-bold text-gold">{fmt(product.selling_price)}</span>
          {!isMembership && product.mrp > product.selling_price && (
            <span className="text-xs text-muted-foreground line-through">{fmt(product.mrp)}</span>
          )}
        </div>
        <div className="mt-3">
          {!product.in_stock ? (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={onNotify}
              disabled={notifySent}
              data-testid={`shop-notify-${product.id}`}
            >
              <BellRing className="w-3.5 h-3.5 mr-1" />
              {notifySent ? "We'll notify you" : 'Notify me'}
            </Button>
          ) : cartLine ? (
            <div className="flex items-center justify-between gap-2 bg-muted rounded-lg p-1">
              <button onClick={() => onAdjust(-1)} className="p-1.5 rounded hover:bg-background"><Minus className="w-4 h-4" /></button>
              <span className="font-semibold text-sm">{cartLine.qty}</span>
              <button onClick={() => onAdjust(+1)} className="p-1.5 rounded hover:bg-background"><Plus className="w-4 h-4" /></button>
            </div>
          ) : (
            <Button
              size="sm"
              className="w-full bg-gold text-black hover:bg-gold/90"
              onClick={onAdd}
              data-testid={`shop-add-${product.id}`}
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> Add
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    placed:         { label: 'Placed',         cls: 'bg-blue-500/15 text-blue-600 border-blue-500/40' },
    fulfilled:      { label: 'Fulfilled',      cls: 'bg-green-500/15 text-green-600 border-green-500/40' },
    cancelled:      { label: 'Cancelled',      cls: 'bg-gray-500/15 text-gray-600 border-gray-500/40' },
    refund_pending: { label: 'Refund pending', cls: 'bg-amber-500/15 text-amber-600 border-amber-500/40' },
    refunded:       { label: 'Refunded',       cls: 'bg-purple-500/15 text-purple-600 border-purple-500/40' },
  };
  const s = map[status] || { label: status, cls: 'bg-muted text-muted-foreground border-border' };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${s.cls}`}>{s.label}</span>;
}
