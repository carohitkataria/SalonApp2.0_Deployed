import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { useOps } from './OpsContext';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const CSS_ID = 'buy-inv-drawer-css';
const injectCss = () => {
  if (document.getElementById(CSS_ID)) return;
  const el = document.createElement('style');
  el.id = CSS_ID;
  el.textContent = `
  .bid-overlay{position:fixed;inset:0;z-index:1200;background:rgba(24,20,40,.42);
    display:flex;justify-content:flex-end;animation:bidFade .18s ease}
  @keyframes bidFade{from{opacity:0}to{opacity:1}}
  .bid{width:min(480px,100vw);height:100%;background:#F7F6FB;display:flex;flex-direction:column;
    box-shadow:-12px 0 40px rgba(24,20,40,.18);animation:bidSlide .22s cubic-bezier(.22,1,.36,1)}
  @keyframes bidSlide{from{transform:translateX(40px);opacity:.6}to{transform:translateX(0);opacity:1}}
  .bid-head{background:#fff;padding:16px 18px 12px;border-bottom:1px solid #ECEAF3}
  .bid-head-top{display:flex;align-items:center;justify-content:space-between}
  .bid-title{font-size:19px;font-weight:800;color:#1C1830;letter-spacing:-.01em}
  .bid-sub{font-size:12.5px;color:#8B879C;margin-top:2px}
  .bid-x{width:34px;height:34px;border-radius:10px;border:1px solid #ECEAF3;background:#fff;
    cursor:pointer;font-size:18px;color:#6b6780;display:flex;align-items:center;justify-content:center}
  .bid-x:hover{background:#F4F2FA}
  .bid-search{margin-top:12px;width:100%;border:1px solid #E4E1EE;border-radius:11px;
    padding:10px 12px;font-size:14px;background:#FBFAFE;outline:none}
  .bid-search:focus{border-color:#6D28D9;box-shadow:0 0 0 3px rgba(109,40,217,.12)}
  .bid-chips{display:flex;gap:8px;overflow-x:auto;padding:12px 18px 4px;background:#fff;border-bottom:1px solid #ECEAF3}
  .bid-chip{white-space:nowrap;border:1px solid #E4E1EE;background:#fff;color:#5b5772;
    padding:6px 13px;border-radius:999px;font-size:12.5px;font-weight:600;cursor:pointer}
  .bid-chip.on{background:#6D28D9;border-color:#6D28D9;color:#fff}
  .bid-body{flex:1;overflow-y:auto;padding:14px 18px 8px;display:flex;flex-direction:column;gap:10px}
  .bid-card{background:#fff;border:1px solid #EEECF6;border-radius:14px;padding:12px;display:flex;gap:12px;align-items:center}
  .bid-thumb{width:56px;height:56px;border-radius:12px;background:#F1EEFA;display:flex;
    align-items:center;justify-content:center;font-size:26px;overflow:hidden;flex-shrink:0}
  .bid-thumb img{width:100%;height:100%;object-fit:cover}
  .bid-info{flex:1;min-width:0}
  .bid-name{font-size:14px;font-weight:700;color:#231F38;line-height:1.25}
  .bid-brand{font-size:11.5px;color:#9A96AB;margin-top:1px}
  .bid-priceRow{display:flex;align-items:center;gap:7px;margin-top:5px}
  .bid-price{font-size:14.5px;font-weight:800;color:#1C1830}
  .bid-mrp{font-size:11.5px;color:#B4B0C2;text-decoration:line-through}
  .bid-badge{font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:999px;margin-left:auto}
  .bid-badge.ok{background:#E7F7EE;color:#0E9F6E}
  .bid-badge.low{background:#FEF3E2;color:#C2760B}
  .bid-badge.out{background:#FDE8E8;color:#D64545}
  .bid-act{flex-shrink:0}
  .bid-add{border:1px solid #6D28D9;background:#6D28D9;color:#fff;border-radius:10px;
    padding:8px 14px;font-size:13px;font-weight:700;cursor:pointer}
  .bid-add:disabled{opacity:.45;cursor:not-allowed}
  .bid-step{display:flex;align-items:center;gap:0;border:1px solid #6D28D9;border-radius:10px;overflow:hidden}
  .bid-step button{width:32px;height:34px;border:0;background:#F3EEFC;color:#6D28D9;font-size:16px;font-weight:800;cursor:pointer}
  .bid-step button:disabled{opacity:.4;cursor:not-allowed}
  .bid-step span{min-width:30px;text-align:center;font-size:13.5px;font-weight:800;color:#1C1830}
  .bid-empty{text-align:center;color:#9A96AB;font-size:13.5px;padding:40px 0}
  .bid-foot{background:#fff;border-top:1px solid #ECEAF3;padding:14px 18px;
    box-shadow:0 -8px 24px rgba(24,20,40,.05)}
  .bid-foot-row{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
  .bid-foot-lab{font-size:12.5px;color:#8B879C;font-weight:600}
  .bid-foot-tot{font-size:18px;font-weight:800;color:#1C1830}
  .bid-cta{width:100%;border:0;background:#6D28D9;color:#fff;border-radius:12px;
    padding:13px;font-size:15px;font-weight:800;cursor:pointer}
  .bid-cta:disabled{opacity:.45;cursor:not-allowed}
  `;
  document.head.appendChild(el);
};

const rupee = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const emojiFor = (name = '') => {
  const n = name.toLowerCase();
  if (n.includes('shamp') || n.includes('condi')) return '🧴';
  if (n.includes('color') || n.includes('dye')) return '🎨';
  if (n.includes('wax')) return '🕯️';
  if (n.includes('serum') || n.includes('oil')) return '💧';
  if (n.includes('mask') || n.includes('facial') || n.includes('cream')) return '🧖';
  if (n.includes('brush') || n.includes('comb')) return '🪮';
  return '🧴';
};

const stockOf = (p) => {
  const s = Number.isFinite(p.inventory_available) ? p.inventory_available : null;
  return s;
};

export default function BuyInventoryDrawer({ getAuthHeaders, onClose }) {
  const { salonCart, addToCart, updateQty, cartCount, subtotal, setShowReviewDrawer } = useOps();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => { injectCss(); }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [p, c] = await Promise.all([
          axios.get(`${API}/salon/store/products`, { headers: getAuthHeaders() }),
          axios.get(`${API}/salon/store/categories`, { headers: getAuthHeaders() }).catch(() => ({ data: { categories: [] } })),
        ]);
        setProducts(p.data?.products || p.data || []);
        setCategories(c.data?.categories || []);
      } catch (e) {
        toast.error('Failed to load shop products');
      } finally {
        setLoading(false);
      }
    })();
  }, [getAuthHeaders]);

  const filtered = useMemo(() => {
    let list = products;
    if (cat !== 'all') {
      list = list.filter((p) => (p.category_id === cat) || (p.category === cat));
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((p) =>
        (p.name || '').toLowerCase().includes(q) ||
        (p.brand || '').toLowerCase().includes(q));
    }
    return list;
  }, [products, cat, search]);

  const qtyInCart = (id) => salonCart.find((x) => x.product_id === id)?.qty || 0;

  const proceed = () => {
    if (!cartCount) return toast.error('Add at least one product');
    onClose?.();
    setShowReviewDrawer(true);
  };

  return (
    <div className="bid-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="bid" role="dialog" aria-label="Shop" data-testid="buy-inventory-drawer">
        <div className="bid-head">
          <div className="bid-head-top">
            <div>
              <div className="bid-title">Shop</div>
              <div className="bid-sub">Restock supplies from verified suppliers</div>
            </div>
            <button className="bid-x" onClick={onClose} aria-label="Close" data-testid="bid-close">×</button>
          </div>
          <input
            className="bid-search"
            placeholder="Search products or brands…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="bid-search"
          />
        </div>

        <div className="bid-chips">
          <button className={`bid-chip ${cat === 'all' ? 'on' : ''}`} onClick={() => setCat('all')}>All</button>
          {categories.map((c) => (
            <button
              key={c.id || c.name}
              className={`bid-chip ${cat === (c.id || c.name) ? 'on' : ''}`}
              onClick={() => setCat(c.id || c.name)}
            >{c.name}</button>
          ))}
        </div>

        <div className="bid-body">
          {loading && <div className="bid-empty">Loading products…</div>}
          {!loading && filtered.length === 0 && <div className="bid-empty">No products found</div>}
          {!loading && filtered.map((p) => {
            const img = (p.images && p.images[0]) || p.image_url;
            const stock = stockOf(p);
            const out = stock !== null && stock <= 0;
            const low = stock !== null && stock > 0 && stock <= (p.low_stock_threshold || 0);
            const inCart = qtyInCart(p.id);
            const sp = p.selling_price ?? p.price ?? 0;
            const mrp = p.mrp ?? 0;
            return (
              <div className="bid-card" key={p.id} data-testid="bid-product">
                <div className="bid-thumb">
                  {img ? <img src={img} alt={p.name} /> : <span>{emojiFor(p.name)}</span>}
                </div>
                <div className="bid-info">
                  <div className="bid-name">{p.name}</div>
                  {p.brand && <div className="bid-brand">{p.brand}</div>}
                  <div className="bid-priceRow">
                    <span className="bid-price">{rupee(sp)}</span>
                    {mrp > sp && <span className="bid-mrp">{rupee(mrp)}</span>}
                    {stock !== null && (
                      <span className={`bid-badge ${out ? 'out' : low ? 'low' : 'ok'}`}>
                        {out ? 'Out of stock' : low ? `Low · ${stock}` : `In stock`}
                      </span>
                    )}
                  </div>
                </div>
                <div className="bid-act">
                  {inCart > 0 ? (
                    <div className="bid-step">
                      <button onClick={() => updateQty(p.id, Math.max(0, inCart - 1))}>−</button>
                      <span>{inCart}</span>
                      <button
                        onClick={() => updateQty(p.id, inCart + 1)}
                        disabled={stock !== null && inCart >= stock}
                      >+</button>
                    </div>
                  ) : (
                    <button className="bid-add" disabled={out} onClick={() => addToCart(p, 1)} data-testid="bid-add">
                      {out ? 'Out' : 'Add'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="bid-foot">
          <div className="bid-foot-row">
            <span className="bid-foot-lab">{cartCount} item{cartCount === 1 ? '' : 's'} in cart</span>
            <span className="bid-foot-tot">{rupee(subtotal)}</span>
          </div>
          <button className="bid-cta" disabled={!cartCount} onClick={proceed} data-testid="bid-proceed">
            Proceed to review
          </button>
        </div>
      </div>
    </div>
  );
}
