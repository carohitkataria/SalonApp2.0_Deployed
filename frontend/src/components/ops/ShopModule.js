import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { injectZenCss, Icon, rupee } from './opsTheme';
import { useOps } from './OpsContext';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Helpers (Issue 3 + 8) — canonical MOQ resolver + status accessor.
const moqOf = (p) => Math.max(1, parseInt(p?.min_order_qty ?? p?.moq ?? 1, 10));
const STEP_INDEX = { pending_payment: 0, confirmed: 1, shipped: 2, in_transit: 3, delivered: 4, placed: 0, processing: 1 };
const statusOf = (o) => o?.order_status || o?.status || 'pending_payment';
const detailMsg = (d, fallback) => {
  if (!d) return fallback;
  if (typeof d === 'string') return d;
  return d?.message || fallback;
};

/**
 * ShopModule
 * - Product grid with brand, rating, MOQ, add-to-cart stepper
 * - Product detail (PDP) drawer with gallery + specs
 * - Review-order drawer with editable address/phone/qty, coupons, COD/Prepaid
 * - Header actions: Orders (with badge) + Cart badge
 * - Orders page opens as a full overlay (accessed here or from ribbon)
 */
export default function ShopModule({ salonId, salonProfile, getAuthHeaders }) {
  useEffect(() => { injectZenCss(); }, []);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [selCat, setSelCat] = useState('all');
  const [selBrand, setSelBrand] = useState('all');
  const [search, setSearch] = useState('');
  const [ordersUnseen, setOrdersUnseen] = useState(0);
  // Inline "orders" view flag — driven by ?view=orders URL parameter.
  // When true, we render the full Orders history page inline (keeping the
  // left rail visible) instead of the products grid.
  const [inlineOrders, setInlineOrders] = useState(false);

  const {
    salonCart, addToCart, updateQty, removeFromCart, cartCount,
    showReviewDrawer, setShowReviewDrawer,
    openProduct, setOpenProduct,
    showOrdersPage, setShowOrdersPage,
  } = useOps();

  // Read `?view=orders` on mount + whenever the URL changes so the Shop
  // page can flip between the product grid and the full orders history
  // without leaving the rail-and-ribbon shell.
  const location = useLocation();
  useEffect(() => {
    try {
      const p = new URLSearchParams(location.search || window.location.search);
      setInlineOrders(p.get('view') === 'orders');
      if (p.get('orders') === '1') {
        window.dispatchEvent(new CustomEvent('salon:open-orders-drawer'));
      }
    } catch (_) { /* noop */ }
  }, [location.search]);

  const load = useCallback(async () => {
    try {
      const [p, c, b] = await Promise.all([
        axios.get(`${API}/salon/store/products`, { headers: getAuthHeaders() }),
        axios.get(`${API}/salon/store/categories`, { headers: getAuthHeaders() }).catch(() => ({ data: { categories: [] } })),
        axios.get(`${API}/salon/store/brands`, { headers: getAuthHeaders() }).catch(() => ({ data: { brands: [] } })),
      ]);
      setProducts(p.data?.products || p.data || []);
      setCategories(c.data?.categories || []);
      setBrands(b.data?.brands || []);
      // Recent orders unseen count
      try {
        const o = await axios.get(`${API}/salon/store/orders`, { headers: getAuthHeaders() });
        const list = o.data?.orders || o.data || [];
        setOrdersUnseen(list.filter((x) => ['shipped', 'in_transit', 'processing', 'placed'].includes(x.status)).length);
      } catch (_) { /* noop */ }
    } catch (e) {
      console.error('shop', e);
      toast.error('Failed to load shop');
    }
  }, [getAuthHeaders]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    let list = products;
    if (selCat !== 'all') list = list.filter((p) => (p.category || '') === selCat);
    if (selBrand !== 'all') list = list.filter((p) => (p.brand || '') === selBrand);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((p) =>
        (p.name || '').toLowerCase().includes(q) ||
        (p.brand || '').toLowerCase().includes(q));
    }
    return list;
  }, [products, selCat, selBrand, search]);

  return (
    <div className="zen">
      <div className="z-wrap">
        <div className="z-phead">
          <div>
            {inlineOrders && <div className="eyebrow">Shop · Orders</div>}
            <h1>{inlineOrders ? 'Your orders' : 'Shop'}</h1>
            {inlineOrders && <p>Full order history — track delivery, cancel, return, replace or raise a concern.</p>}
          </div>
          <div className="z-actions">
            {inlineOrders ? (
              <button
                className="z-btn z-btn--ghost"
                data-testid="shop-back-to-products"
                onClick={() => {
                  const url = new URL(window.location.href);
                  url.searchParams.delete('view');
                  window.history.pushState({}, '', url.toString());
                  setInlineOrders(false);
                }}
              >
                <Icon name="chevL" /> Back to shop
              </button>
            ) : (
              <>
                <button
                  className="z-btn z-btn--ghost"
                  data-testid="shop-orders-btn"
                  onClick={() => window.dispatchEvent(new CustomEvent('salon:open-orders-drawer'))}
                  style={{ position: 'relative' }}
                >
                  <Icon name="truck" /> Orders
                  {ordersUnseen > 0 && (
                    <span className="z-cart-badge" style={{ position: 'static', marginLeft: 4 }}>
                      {ordersUnseen}
                    </span>
                  )}
                </button>
                <button
                  className="z-btn z-btn--pri"
                  onClick={() => setShowReviewDrawer(true)}
                  disabled={cartCount === 0}
                  style={{ position: 'relative' }}
                >
                  <Icon name="cart" /> Cart
                  {cartCount > 0 && <span className="z-cart-badge">{cartCount}</span>}
                </button>
              </>
            )}
          </div>
        </div>

        {inlineOrders ? (
          <OrdersInline salonId={salonId} getAuthHeaders={getAuthHeaders} />
        ) : (
          <>
            {/* Filters */}
            <div className="z-toolbar">
              <div className="z-search"><Icon name="search" />
                <input placeholder="Search products, brands..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: 6, overflowX: 'auto', maxWidth: '100%' }}>
                <button className={`z-chip ${selCat === 'all' ? 'on' : ''}`} onClick={() => setSelCat('all')}>All categories</button>
                {categories.slice(0, 8).map((c) => {
                  const label = typeof c === 'string' ? c : (c.name || c.category);
                  const cnt = typeof c === 'object' ? c.count : null;
                  return (
                    <button key={label} className={`z-chip ${selCat === label ? 'on' : ''}`} onClick={() => setSelCat(label)}>
                      {label}{cnt ? ` (${cnt})` : ''}
                    </button>
                  );
                })}
              </div>
            </div>
            {brands.length > 0 && (
              <div className="z-toolbar" style={{ marginTop: -6 }}>
                <div style={{ display: 'flex', gap: 6, overflowX: 'auto', maxWidth: '100%' }}>
                  <button className={`z-chip ${selBrand === 'all' ? 'on' : ''}`} onClick={() => setSelBrand('all')}>All brands</button>
                  {brands.slice(0, 12).map((b) => {
                    const label = typeof b === 'string' ? b : (b.name || b.brand);
                    return (
                      <button key={label} className={`z-chip ${selBrand === label ? 'on' : ''}`} onClick={() => setSelBrand(label)}>
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {filtered.length === 0 ? (
              <div className="z-empty z-card" data-testid="shop-empty-state">
                <Icon name="bag" size={40} /><br />
                <div style={{ fontSize: 16, fontWeight: 700, marginTop: 8 }}>No products added yet</div>
                <div style={{ fontSize: 13, color: 'var(--z-muted)', marginTop: 4 }}>Products will appear here as suppliers add them.</div>
              </div>
            ) : (
              <div className="z-shop-grid">
                {filtered.map((p) => (
                  <ShopCard
                    key={p.id}
                    product={p}
                    inCart={salonCart.find((x) => x.product_id === p.id)}
                    onOpen={() => setOpenProduct(p)}
                    onAdd={() => addToCart(p, moqOf(p))}
                    onQty={(q) => updateQty(p.id, q)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {openProduct && (
        <ProductDetailDrawer
          product={openProduct}
          inCart={salonCart.find((x) => x.product_id === openProduct.id)}
          onClose={() => setOpenProduct(null)}
          onAdd={(qty) => { addToCart(openProduct, qty); setOpenProduct(null); setShowReviewDrawer(true); }}
        />
      )}
      {showReviewDrawer && (
        <ReviewOrderDrawer
          salonId={salonId}
          salonProfile={salonProfile}
          getAuthHeaders={getAuthHeaders}
          items={salonCart}
          onUpdateQty={updateQty}
          onRemove={removeFromCart}
          onClose={() => setShowReviewDrawer(false)}
          onPlaced={() => {
            setShowReviewDrawer(false);
            // Push ?view=orders so the shell keeps the rail visible and Shop renders inline orders.
            const url = new URL(window.location.href);
            url.searchParams.set('view', 'orders');
            window.history.pushState({}, '', url.toString());
            setInlineOrders(true);
            load();
          }}
        />
      )}
    </div>
  );
}

/* ------------ Shop Card ------------ */
function ShopCard({ product, inCart, onOpen, onAdd, onQty }) {
  const img = product.images?.[0] || product.image_url;
  const mrp = product.mrp || 0;
  const sp = product.selling_price ?? mrp;
  const off = mrp > sp ? Math.round(((mrp - sp) / mrp) * 100) : 0;
  const rating = product.rating || product.avg_rating || 0;
  const moq = moqOf(product);
  const stock = Number.isFinite(product.inventory_available) ? product.inventory_available : (product.inventory_available ?? null);
  const outOfStock = stock !== null && stock <= 0;
  return (
    <div className="z-shop-card">
      <div className="z-shop-img" onClick={onOpen}>
        {img ? <img src={img} alt={product.name} /> : <span>🧴</span>}
        {off > 0 && <span className="z-shop-badge">{off}% OFF</span>}
        {rating > 0 && <span className="z-shop-rate"><Icon name="star" size={12} /> {rating.toFixed(1)}</span>}
      </div>
      <div className="z-shop-info">
        <div className="z-shop-brand">{product.brand || '—'}</div>
        <div className="z-shop-name" onClick={onOpen}>{product.name}</div>
        <div className="z-shop-meta">{product.pack_size || product.unit} · {product.supplier_business_name || product.supplier_name || 'Supplier'}</div>
        <div className="z-shop-price">
          <span className="p">{rupee(sp)}</span>
          {mrp > sp && <><span className="mrp">{rupee(mrp)}</span><span className="off">{off}% off</span></>}
        </div>
        <div className="z-shop-moq">MOQ · {moq} {product.unit || 'pcs'}</div>
        {stock !== null && (
          <div style={{ fontSize: 11.5, color: outOfStock ? 'var(--z-danger, #c53030)' : 'var(--z-muted)', marginTop: 2 }}>
            {outOfStock ? 'Out of stock' : `In stock: ${stock}`}
          </div>
        )}
        <div className="z-shop-add">
          {inCart ? (
            <div className="z-stepper" style={{ display: 'flex' }}>
              <button
                onClick={() => onQty(Math.max(moq, (inCart.qty || moq) - 1))}
                disabled={(inCart.qty || moq) <= moq}
              ><Icon name="minus" /></button>
              <div className="q" style={{ width: 50, display: 'grid', placeItems: 'center' }}>{inCart.qty}</div>
              <button
                onClick={() => {
                  const next = (inCart.qty || moq) + 1;
                  const cap = stock !== null ? stock : next;
                  onQty(Math.min(cap, next));
                }}
                disabled={stock !== null && (inCart.qty || moq) >= stock}
              ><Icon name="plus" /></button>
            </div>
          ) : (
            <button
              className="z-btn z-btn--soft"
              style={{ width: '100%' }}
              onClick={onAdd}
              disabled={outOfStock}
            >
              <Icon name="cart" /> {outOfStock ? 'Out of stock' : 'Add to cart'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------ Product Detail (PDP) Drawer ------------ */
function ProductDetailDrawer({ product, inCart, onClose, onAdd }) {
  const imgs = (product.images && product.images.length) ? product.images : [product.image_url].filter(Boolean);
  const [pic, setPic] = useState(0);
  const moq = moqOf(product);
  const stock = Number.isFinite(product.inventory_available) ? product.inventory_available : (product.inventory_available ?? null);
  const outOfStock = stock !== null && stock <= 0;
  const [qty, setQty] = useState(inCart?.qty || moq);
  const mrp = product.mrp || 0;
  const sp = product.selling_price ?? mrp;
  const off = mrp > sp ? Math.round(((mrp - sp) / mrp) * 100) : 0;
  return (
    <>
      <div className="z-overlay" onClick={onClose} />
      <aside className="z-drawer wide">
        <div className="z-drawer-h">
          <div className="dico"><Icon name="bag" size={20} /></div>
          <div>
            <div className="eyebrow">{product.brand || 'Supplier'}</div>
            <h3>{product.name}</h3>
            <p>{product.pack_size || product.unit} · {product.supplier_business_name || product.supplier_name || 'Verified supplier'}</p>
          </div>
          <button className="z-drawer-close" onClick={onClose}><Icon name="x" /></button>
        </div>
        <div className="z-drawer-body">
          <div style={{ aspectRatio: 1.2, background: 'var(--z-line-2)', borderRadius: 12, display: 'grid', placeItems: 'center', overflow: 'hidden', marginBottom: 10 }}>
            {imgs[pic] ? <img src={imgs[pic]} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : <span style={{ fontSize: 60 }}>🧴</span>}
          </div>
          {imgs.length > 1 && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
              {imgs.map((im, i) => (
                <div key={i} onClick={() => setPic(i)}
                     style={{ width: 52, height: 52, borderRadius: 8, background: 'var(--z-line-2)', overflow: 'hidden',
                              border: `2px solid ${pic === i ? 'var(--z-primary)' : 'transparent'}`, cursor: 'pointer' }}>
                    <img src={im} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              ))}
            </div>
          )}
          <div className="z-shop-price" style={{ margin: '0 0 6px' }}>
            <span className="p">{rupee(sp)}</span>
            {mrp > sp && <><span className="mrp">{rupee(mrp)}</span><span className="off">{off}% off</span></>}
          </div>
          {(product.rating || product.avg_rating) && (
            <div style={{ fontSize: 12.5, color: 'var(--z-muted)' }}>
              <Icon name="star" size={14} /> {(product.rating || product.avg_rating).toFixed(1)} · {product.review_count || 0} reviews
            </div>
          )}
          {product.description && (
            <>
              <div className="z-dsec">About</div>
              <p style={{ fontSize: 13.5, color: 'var(--z-ink-soft)', lineHeight: 1.55 }}>{product.description}</p>
            </>
          )}
          {(product.specs || product.attributes) && (
            <>
              <div className="z-dsec">Specifications</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 13 }}>
                {Object.entries(product.specs || product.attributes || {}).slice(0, 12).map(([k, v]) => (
                  <div key={k} style={{ padding: '5px 0', borderBottom: '1px solid var(--z-line-2)' }}>
                    <span style={{ color: 'var(--z-muted)' }}>{k}:</span> <b>{String(v)}</b>
                  </div>
                ))}
              </div>
            </>
          )}
          <div className="z-dsec">Quantity</div>
          <div className="z-stepper" style={{ display: 'inline-flex' }}>
            <button onClick={() => setQty(Math.max(moq, qty - 1))} disabled={qty <= moq}><Icon name="minus" /></button>
            <input value={qty} onChange={(e) => {
              const v = Math.max(moq, parseInt(e.target.value || moq, 10));
              setQty(stock !== null ? Math.min(stock, v) : v);
            }} />
            <button
              onClick={() => setQty(stock !== null ? Math.min(stock, qty + 1) : qty + 1)}
              disabled={stock !== null && qty >= stock}
            ><Icon name="plus" /></button>
          </div>
          <div style={{ fontSize: 12, color: 'var(--z-muted)', marginTop: 4 }}>
            MOQ · {moq}{stock !== null ? ` · In stock: ${stock}` : ''}
          </div>
        </div>
        <div className="z-drawer-foot" style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: 'var(--z-muted)' }}>Subtotal</div>
            <div className="num" style={{ fontFamily: 'Bebas Neue', fontSize: 26, color: 'var(--z-primary)' }}>{rupee(sp * qty)}</div>
          </div>
          <button className="z-btn z-btn--pri" style={{ flex: 2 }} onClick={() => onAdd(qty)} disabled={outOfStock}>
            <Icon name="cart" /> {outOfStock ? 'Out of stock' : 'Add & review order'}
          </button>
        </div>
      </aside>
    </>
  );
}

/* ------------ Review Order Drawer ------------ */
function ReviewOrderDrawer({ salonId, salonProfile, getAuthHeaders, items, onUpdateQty, onRemove, onClose, onPlaced }) {
  const p = salonProfile || {};
  const [addr, setAddr] = useState({
    name: p.owner_name || p.salon_name || '',
    phone: p.phone || '',
    line1: p.address || '',
    line2: '',
    city: p.city || '',
    state: p.state || '',
    pincode: p.pincode || '',
  });
  const [editingAddr, setEditingAddr] = useState(false);
  const [coupon, setCoupon] = useState('');
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [pay, setPay] = useState('cod'); // cod | cashfree
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState('');

  const subtotal = items.reduce((s, x) => s + (x.price || 0) * (x.qty || 1), 0);
  const shipping = 40;
  const gst = subtotal * 0.18;
  const total = Math.max(0, subtotal + shipping + gst - couponDiscount);

  const applyCoupon = () => {
    // simple stub — 10% off for "WELCOME10", 5% for anything else
    if (!coupon.trim()) return setCouponDiscount(0);
    const upper = coupon.trim().toUpperCase();
    if (upper === 'WELCOME10') setCouponDiscount(Math.round(subtotal * 0.1));
    else setCouponDiscount(Math.round(subtotal * 0.05));
    toast.success('Coupon applied');
  };

  const place = async () => {
    if (items.length === 0) return toast.error('Cart is empty');
    if (!addr.name || !addr.phone || !addr.line1 || !addr.city || !addr.pincode) {
      setEditingAddr(true);
      return toast.error('Complete delivery address');
    }
    setBusy(true);
    try {
      const payload = {
        items: items.map((x) => ({ product_id: x.product_id, qty: x.qty })),
        shipping_address: {
          name: addr.name, phone: addr.phone,
          line1: addr.line1, line2: addr.line2 || null,
          city: addr.city, state: addr.state,
          pincode: addr.pincode,
        },
        payment_mode: pay === 'cod' ? 'cod' : 'cashfree',
        notes: notes || null,
      };
      const res = await axios.post(`${API}/salon/store/checkout`, payload, { headers: getAuthHeaders() });
      toast.success('Order placed');
      // if cashfree returns a session, ideally redirect. We surface via URL.
      const payUrl = res.data?.payment_session_url || res.data?.payment_url;
      if (payUrl) window.open(payUrl, '_blank');
      onPlaced();
    } catch (e) {
      const d = e?.response?.data?.detail;
      const msg = detailMsg(d, 'Checkout failed');
      toast.error(msg);
      if (d && typeof d === 'object') {
        if (d.available_qty != null) toast(`Only ${d.available_qty} in stock`);
        if (d.code === 'below_moq' && d.min_order_qty != null) toast(`Minimum order qty is ${d.min_order_qty}`);
      }
    } finally { setBusy(false); }
  };

  const updA = (k, v) => setAddr((s) => ({ ...s, [k]: v }));

  return (
    <>
      <div className="z-overlay" onClick={onClose} />
      <aside className="z-drawer wide">
        <div className="z-drawer-h">
          <div className="dico"><Icon name="cart" size={20} /></div>
          <div>
            <div className="eyebrow">Review</div>
            <h3>Confirm your order</h3>
            <p>{items.length} item{items.length === 1 ? '' : 's'} · Delivery in 3–5 business days</p>
          </div>
          <button className="z-drawer-close" onClick={onClose}><Icon name="x" /></button>
        </div>
        <div className="z-drawer-body">
          <div className="z-dsec">Delivery address</div>
          {!editingAddr ? (
            <div className="z-card" style={{ padding: 14, borderRadius: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 800 }}>{addr.name || '—'}</div>
                  <div style={{ fontSize: 13, color: 'var(--z-ink-soft)', marginTop: 3 }}>
                    {addr.line1}{addr.line2 && `, ${addr.line2}`}<br />
                    {addr.city}, {addr.state} · {addr.pincode}
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--z-muted)', marginTop: 5 }}>
                    <Icon name="phone" size={12} /> {addr.phone || '—'}
                  </div>
                </div>
                <button className="z-btn z-btn--soft z-btn--sm" onClick={() => setEditingAddr(true)}>
                  <Icon name="edit" /> Change
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div className="z-grid2">
                <div className="z-field"><label>Name</label><input value={addr.name} onChange={(e) => updA('name', e.target.value)} /></div>
                <div className="z-field"><label>Phone</label><input value={addr.phone} onChange={(e) => updA('phone', e.target.value)} /></div>
              </div>
              <div className="z-field"><label>Address line 1</label><input value={addr.line1} onChange={(e) => updA('line1', e.target.value)} /></div>
              <div className="z-field"><label>Landmark (optional)</label><input value={addr.line2} onChange={(e) => updA('line2', e.target.value)} /></div>
              <div className="z-grid3">
                <div className="z-field"><label>City</label><input value={addr.city} onChange={(e) => updA('city', e.target.value)} /></div>
                <div className="z-field"><label>State</label><input value={addr.state} onChange={(e) => updA('state', e.target.value)} /></div>
                <div className="z-field"><label>Pincode</label><input value={addr.pincode} onChange={(e) => updA('pincode', e.target.value)} /></div>
              </div>
              <button className="z-btn z-btn--pri z-btn--sm" style={{ marginTop: 8 }} onClick={() => setEditingAddr(false)}>
                <Icon name="check" /> Save address
              </button>
            </div>
          )}

          <div className="z-dsec">Items ({items.length})</div>
          {items.map((x) => (
            <div key={x.product_id} className="z-cline">
              <div className="ci">{x.image_url ? <img src={x.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '🧴'}</div>
              <div className="cn">
                <div className="t">{x.name}</div>
                <div className="s">{x.brand} · {rupee(x.price)} × {x.qty}</div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 5 }}>
                  <div className="z-stepper" style={{ display: 'inline-flex' }}>
                    <button onClick={() => onUpdateQty(x.product_id, Math.max(1, (x.qty || 1) - 1))}><Icon name="minus" size={12} /></button>
                    <div className="q">{x.qty}</div>
                    <button onClick={() => onUpdateQty(x.product_id, (x.qty || 1) + 1)}><Icon name="plus" size={12} /></button>
                  </div>
                  <button className="z-link danger" onClick={() => onRemove(x.product_id)}><Icon name="trash" /> Remove</button>
                </div>
              </div>
              <div className="cp">{rupee(x.price * x.qty)}</div>
            </div>
          ))}

          <div className="z-dsec">Coupon</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={coupon} onChange={(e) => setCoupon(e.target.value)} placeholder="Enter code (e.g., WELCOME10)"
                   style={{ flex: 1, padding: '9px 12px', border: '1px solid var(--z-line)', borderRadius: 10 }} />
            <button className="z-btn z-btn--soft" onClick={applyCoupon}>Apply</button>
          </div>
          {couponDiscount > 0 && <div style={{ fontSize: 12, color: 'var(--z-ok)', marginTop: 6 }}>Saved {rupee(couponDiscount)} with &quot;{coupon}&quot;</div>}

          <div className="z-dsec">Payment method</div>
          <div className="z-pay-grid">
            <div className={`z-pay-opt ${pay === 'cod' ? 'on' : ''}`} onClick={() => setPay('cod')}>
              <Icon name="cash" /> Cash on Delivery
            </div>
            <div className={`z-pay-opt ${pay === 'cashfree' ? 'on' : ''}`} onClick={() => setPay('cashfree')}>
              <Icon name="card" /> Pay online (Cashfree)
            </div>
          </div>

          <div className="z-dsec">Order notes (optional)</div>
          <div className="z-field">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Delivery instructions…" />
          </div>

          <div className="z-dsec">Bill summary</div>
          <div className="z-sumrow"><span>Subtotal</span><span>{rupee(subtotal)}</span></div>
          <div className="z-sumrow"><span>Shipping</span><span>{rupee(shipping)}</span></div>
          <div className="z-sumrow"><span>GST 18%</span><span>{rupee(gst)}</span></div>
          {couponDiscount > 0 && <div className="z-sumrow g"><span>Coupon discount</span><span>-{rupee(couponDiscount)}</span></div>}
          <div className="z-sumrow tot"><span>Total payable</span><span className="num">{rupee(total)}</span></div>
        </div>
        <div className="z-drawer-foot" style={{ display: 'flex', gap: 10 }}>
          <button className="z-btn z-btn--ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
          <button className="z-btn z-btn--pri" style={{ flex: 2 }} disabled={busy || items.length === 0} onClick={place}>
            <Icon name="truck" /> {busy ? 'Placing…' : (pay === 'cod' ? 'Place COD order' : 'Pay & place')}
          </button>
        </div>
      </aside>
    </>
  );
}

/* ------------ Orders Inline (renders inside Shop, keeps left rail visible) ------------ */
export function OrdersInline({ salonId, getAuthHeaders }) {
  useEffect(() => { injectZenCss(); }, []);
  const [orders, setOrders] = useState([]);
  const [selected, setSelected] = useState(null);
  const [tab, setTab] = useState('all');

  const load = async () => {
    try {
      const res = await axios.get(`${API}/salon/store/orders`, { headers: getAuthHeaders() });
      setOrders(res.data?.orders || res.data || []);
    } catch (e) { console.error(e); toast.error('Could not load orders'); }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line

  const filtered = useMemo(() => {
    if (tab === 'all') return orders;
    const map = { active: ['pending_payment', 'confirmed', 'shipped', 'in_transit'],
                  delivered: ['delivered'], cancelled: ['cancelled'], returned: ['returned', 'refunded'] };
    return orders.filter((o) => (map[tab] || []).includes(statusOf(o)));
  }, [orders, tab]);

  const doCancel = async (orderId) => {
    if (!window.confirm('Cancel this order?')) return;
    try {
      await axios.post(`${API}/salon/store/orders/${orderId}/cancel`, {}, { headers: getAuthHeaders() });
      toast.success('Order cancelled');
      load();
    } catch (e) { toast.error(detailMsg(e?.response?.data?.detail, 'Cancel failed')); }
  };

  return (
    <>
      <div className="z-toolbar">
        <div className="z-seg">
          {['all', 'active', 'delivered', 'cancelled', 'returned'].map((t) => (
            <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="z-empty z-card">
          <Icon name="bag" size={40} /><br />
          No orders here.
        </div>
      ) : filtered.map((o) => (
        <OrderCard key={o.id} order={o} onOpen={() => setSelected(o)} onCancel={() => doCancel(o.id)} />
      ))}

      {selected && (
        <OrderDetail
          order={selected}
          getAuthHeaders={getAuthHeaders}
          onClose={() => setSelected(null)}
          onChanged={load}
        />
      )}
    </>
  );
}

/* ------------ Orders Full Overlay (legacy — kept for backwards compatibility) ------------ */
export function OrdersOverlay({ salonId, getAuthHeaders, onClose }) {
  useEffect(() => { injectZenCss(); }, []);
  return (
    <div className="zen" style={{ position: 'fixed', inset: 0, background: 'var(--z-bg)', zIndex: 1200, overflowY: 'auto' }}>
      <div className="z-wrap">
        <div className="z-phead">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="z-btn z-btn--ghost" onClick={onClose}><Icon name="chevL" /> Back</button>
            <div>
              <div className="eyebrow">Shop</div>
              <h1>Your orders</h1>
              <p>Track delivery, cancel, request replacement or raise a concern.</p>
            </div>
          </div>
        </div>
        <OrdersInline salonId={salonId} getAuthHeaders={getAuthHeaders} />
      </div>
    </div>
  );
}

/* ------------ Order Card ------------ */
function OrderCard({ order, onOpen, onCancel }) {
  const idx = STEP_INDEX[statusOf(order)] ?? 0;
  const stepLabels = ['Placed', 'Confirmed', 'Shipped', 'In transit', 'Delivered'];
  const st = statusOf(order);
  const canCancel = ['pending_payment', 'confirmed'].includes(st);
  const supPhone = order.supplier_phone;

  return (
    <div className="z-order-card">
      <div className="z-order-top">
        <div>
          <div style={{ fontWeight: 800, fontSize: 15 }}>Order #{(order.id || '').slice(0, 8).toUpperCase()}</div>
          <div style={{ fontSize: 12, color: 'var(--z-muted)' }}>
            {order.items?.length || 0} items · Placed {new Date(order.created_at || order.date).toLocaleDateString()}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="num" style={{ fontFamily: 'Bebas Neue', fontSize: 22, color: 'var(--z-primary)' }}>{rupee(order.total_amount)}</div>
          <span className={`z-pill ${st === 'cancelled' ? 'z-pill--bad' : idx >= 4 ? 'z-pill--ok' : 'z-pill--blue'}`}>
            {(st || 'placed').replace('_', ' ')}
          </span>
        </div>
      </div>

      {st !== 'cancelled' && (
        <div style={{ padding: '4px 17px 0' }}>
          <div className="z-track">
            {stepLabels.map((lbl, i) => (
              <div key={lbl} className={`z-track-step ${i <= idx ? 'done' : ''} ${i === idx ? 'active' : ''}`}>
                <div className="dot"><Icon name={i <= idx ? 'check' : 'clock'} size={12} /></div>
                <div className="lbl">{lbl}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="z-order-foot">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="z-btn z-btn--ghost z-btn--sm" onClick={onOpen}><Icon name="eye" /> Details</button>
          {supPhone && (
            <a className="z-btn z-btn--ghost z-btn--sm" href={`tel:${supPhone}`}>
              <Icon name="phone" /> Call supplier
            </a>
          )}
          {canCancel && (
            <button className="z-btn z-btn--danger z-btn--sm" onClick={onCancel}><Icon name="x" /> Cancel</button>
          )}
        </div>
        <div style={{ fontSize: 12, color: 'var(--z-muted)' }}>{order.supplier_name || order.supplier_business_name || 'Supplier order'}</div>
      </div>
    </div>
  );
}

/* ------------ Order Detail Drawer ------------ */
function OrderDetail({ order, getAuthHeaders, onClose, onChanged }) {
  const [action, setAction] = useState(null); // 'return' | 'replacement' | 'concern'
  const [note, setNote] = useState('');
  const [savingPm, setSavingPm] = useState(false);
  const [pmDraft, setPmDraft] = useState(order.payment_mode || '');
  const st = statusOf(order);
  const supPhone = order.supplier_phone;

  const submit = async () => {
    if (!action) return;
    if (!note.trim()) { toast.error('Please add a note'); return; }
    try {
      await axios.post(`${API}/salon/store/orders/${order.id}/concern`,
        { type: action, note }, { headers: getAuthHeaders() });
      toast.success('Request submitted');
      setAction(null); setNote(''); onChanged?.();
    } catch (e) {
      toast.error(detailMsg(e?.response?.data?.detail, 'Could not submit'));
    }
  };

  const changePaymentMode = async () => {
    if (!pmDraft || pmDraft === order.payment_mode) return;
    setSavingPm(true);
    try {
      await axios.patch(`${API}/salon/store/orders/${order.id}/payment-mode`,
        { payment_mode: pmDraft }, { headers: getAuthHeaders() });
      toast.success('Payment mode updated');
      onChanged?.();
    } catch (e) {
      toast.error(detailMsg(e?.response?.data?.detail, 'Could not update payment mode'));
    } finally { setSavingPm(false); }
  };

  return (
    <>
      <div className="z-overlay" onClick={onClose} />
      <aside className="z-drawer wide">
        <div className="z-drawer-h">
          <div className="dico"><Icon name="bag" size={20} /></div>
          <div>
            <div className="eyebrow">Order #{(order.id || '').slice(0, 8).toUpperCase()}</div>
            <h3>{(st || 'placed').replace('_', ' ')}</h3>
            <p>{order.items?.length || 0} items · {rupee(order.total_amount)}</p>
          </div>
          <button className="z-drawer-close" onClick={onClose}><Icon name="x" /></button>
        </div>
        <div className="z-drawer-body">
          {supPhone && (
            <div style={{ marginBottom: 10 }}>
              <a className="z-btn z-btn--ghost" href={`tel:${supPhone}`}>
                <Icon name="phone" /> Call supplier ({supPhone})
              </a>
            </div>
          )}

          <div className="z-dsec">Items</div>
          {(order.items || []).map((x, i) => (
            <div key={i} className="z-cline">
              <div className="ci">{x.image_url ? <img src={x.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '🧴'}</div>
              <div className="cn">
                <div className="t">{x.name}</div>
                <div className="s">{x.brand}{x.sku_code ? ` · SKU ${x.sku_code}` : ''} · {rupee(x.selling_price || x.line_total / x.qty)} × {x.qty}</div>
              </div>
              <div className="cp">{rupee(x.line_total)}</div>
            </div>
          ))}
          <div className="z-dsec">Shipping to</div>
          {order.shipping_address && (
            <div className="z-card" style={{ padding: 12, borderRadius: 10 }}>
              <div style={{ fontWeight: 800 }}>{order.shipping_address.name}</div>
              <div style={{ fontSize: 12.5, color: 'var(--z-ink-soft)' }}>
                {order.shipping_address.line1}, {order.shipping_address.city} · {order.shipping_address.pincode}
              </div>
              <div style={{ fontSize: 12, color: 'var(--z-muted)' }}>{order.shipping_address.phone}</div>
            </div>
          )}

          <div className="z-dsec">Bill</div>
          <div className="z-sumrow"><span>Subtotal</span><span>{rupee(order.subtotal)}</span></div>
          {order.gst_amount ? <div className="z-sumrow"><span>GST</span><span>{rupee(order.gst_amount)}</span></div> : null}
          {order.shipping_fee ? <div className="z-sumrow"><span>Shipping</span><span>{rupee(order.shipping_fee)}</span></div> : null}
          <div className="z-sumrow tot"><span>Total</span><span className="num">{rupee(order.total_amount)}</span></div>

          {st === 'delivered' && (
            <>
              <div className="z-dsec">Payment mode</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13 }}>Current: <b>{order.payment_mode || '—'}</b></span>
                <select value={pmDraft} onChange={(e) => setPmDraft(e.target.value)} className="z-input" style={{ minWidth: 140 }}>
                  <option value="">Select…</option>
                  {['cash', 'upi', 'card', 'bank_transfer', 'cod', 'cashfree', 'other'].map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <button className="z-btn z-btn--soft" onClick={changePaymentMode}
                        disabled={savingPm || !pmDraft || pmDraft === order.payment_mode}>
                  <Icon name="save" /> Update
                </button>
              </div>
            </>
          )}

          <div className="z-dsec">Get help</div>
          {!action ? (
            <div style={{ display: 'grid', gap: 8 }}>
              {st === 'delivered' && (
                <>
                  <button className="z-btn z-btn--ghost" onClick={() => setAction('return')}><Icon name="ret" /> Return</button>
                  <button className="z-btn z-btn--ghost" onClick={() => setAction('replacement')}><Icon name="restock" /> Replacement</button>
                </>
              )}
              <button className="z-btn z-btn--ghost" onClick={() => setAction('concern')}><Icon name="alert" /> Raise concern</button>
            </div>
          ) : (
            <>
              <div className="z-field">
                <label>{action === 'return' ? 'Return reason' : action === 'replacement' ? 'Replacement reason' : 'Describe the issue'}</label>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add details..." />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="z-btn z-btn--ghost" onClick={() => { setAction(null); setNote(''); }}>Back</button>
                <button className="z-btn z-btn--pri" onClick={submit}><Icon name="save" /> Submit</button>
              </div>
            </>
          )}

          {Array.isArray(order.concerns) && order.concerns.length > 0 && (
            <>
              <div className="z-dsec">Your concerns</div>
              <div style={{ display: 'grid', gap: 8 }}>
                {order.concerns.map((c) => (
                  <div key={c.id} className="z-card" style={{ padding: 10, borderRadius: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                      <b style={{ textTransform: 'capitalize' }}>{c.type}</b>
                      <span className="z-pill z-pill--blue" style={{ fontSize: 11 }}>{c.status || 'open'}</span>
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--z-ink-soft)', marginTop: 4 }}>{c.note}</div>
                    <div style={{ fontSize: 11, color: 'var(--z-muted)', marginTop: 2 }}>
                      {c.created_at ? new Date(c.created_at).toLocaleString() : ''}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
