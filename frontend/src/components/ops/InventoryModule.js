import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { injectZenCss, Icon, rupee } from './opsTheme';
import BuyInventoryDrawer from './BuyInventoryDrawer';
import { ReviewOrderDrawer } from './ShopModule';
import { useOps } from './OpsContext';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const PAYMENT_MODES = [
  { v: 'cash', l: 'Cash', ico: 'cash' },
  { v: 'upi', l: 'UPI', ico: 'phone' },
  { v: 'card', l: 'Card', ico: 'card' },
  { v: 'wallet', l: 'Wallet', ico: 'wallet' },
];

const statusOf = (item) => {
  const total = item.qty_total ?? 0;
  const low = item.low_stock_threshold ?? 0;
  if (total === 0) return { level: 'out', pill: 'z-pill--bad', label: 'Out of stock' };
  if (total <= low) return { level: 'low', pill: 'z-pill--warn', label: 'Low stock' };
  return { level: 'ok', pill: 'z-pill--ok', label: 'In stock' };
};

const emojiFor = (name = '') => {
  const n = name.toLowerCase();
  if (n.includes('shamp') || n.includes('condi')) return '🧴';
  if (n.includes('color') || n.includes('dye')) return '🎨';
  if (n.includes('wax')) return '🕯️';
  if (n.includes('scissor')) return '✂️';
  if (n.includes('clip') || n.includes('trimmer') || n.includes('razor')) return '🪒';
  if (n.includes('serum') || n.includes('oil')) return '💧';
  if (n.includes('mask') || n.includes('facial') || n.includes('cream')) return '🧖';
  if (n.includes('brush') || n.includes('comb')) return '🪮';
  return '🧴';
};

export default function InventoryModule({ salonId, salonProfile, getAuthHeaders }) {
  useEffect(() => { injectZenCss(); }, []);
  const { salonCart, updateQty, removeFromCart, clearCart, showReviewDrawer, setShowReviewDrawer } = useOps();
  const [showShopDrawer, setShowShopDrawer] = useState(false);
  const [items, setItems] = useState([]);
  const [staff, setStaff] = useState([]);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showItemDrawer, setShowItemDrawer] = useState(false); // for New item
  const [editing, setEditing] = useState(null);
  const [actionDrawer, setActionDrawer] = useState(null); // {type:'sell'|'restock'|'assign', item}
  // Buy inventory jumps into Shop tab via a custom event handled by parent dashboard.

  const load = async () => {
    if (!salonId) return;
    try {
      const [inv, stf] = await Promise.all([
        axios.get(`${API}/salon/inventory`, { headers: getAuthHeaders() }),
        axios.get(`${API}/salons/${salonId}/barbers`, { headers: getAuthHeaders() }).catch(() => ({ data: [] })),
      ]);
      const invData = inv.data || {};
      const items = Array.isArray(invData) ? invData : (invData.inventory_items || invData.items || []);
      setItems(items);
      const bList = Array.isArray(stf.data) ? stf.data : (stf.data?.barbers || []);
      setStaff(bList);
    } catch (e) {
      console.error('inventory', e);
      toast.error('Failed to load inventory');
    }
  };
  useEffect(() => { load(); }, [salonId]); // eslint-disable-line

  const filtered = useMemo(() => {
    let list = items;
    if (filterStatus !== 'all') list = list.filter((i) => statusOf(i).level === filterStatus);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((i) =>
        (i.name || '').toLowerCase().includes(q) ||
        (i.brand || '').toLowerCase().includes(q) ||
        (i.category || '').toLowerCase().includes(q) ||
        (i.sku_code || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [items, search, filterStatus]);

  const totals = useMemo(() => {
    const t = { total: items.length, low: 0, out: 0, ok: 0, value: 0 };
    for (const i of items) {
      const s = statusOf(i).level;
      t[s] = (t[s] || 0) + 1;
      t.value += (i.qty_total || 0) * (i.cost_price || 0);
    }
    return t;
  }, [items]);

  const openNewItem = () => { setEditing(null); setShowItemDrawer(true); };
  const openEditItem = (item) => { setEditing(item); setShowItemDrawer(true); };
  const openAction = (type, item) => setActionDrawer({ type, item });

  const goBuyInventory = () => {
    // WS2 — open the Shop product-selection drawer (shares OpsContext cart).
    setShowShopDrawer(true);
  };

  return (
    <div className="zen">
      <div className="z-wrap">
        {/* Metrics — clickable status filters + Shop action at the end */}
        <div className="z-metrics z-metrics--compact">
          <div className={`z-metric g-blue is-clickable ${filterStatus === 'all' ? 'on' : ''}`} onClick={() => setFilterStatus('all')} role="button" tabIndex={0} data-testid="inv-metric-all">
            <div className="k"><Icon name="box" /> Products</div>
            <div className="v">{totals.total}</div>
            <div className="sub">Across all categories</div>
          </div>
          <div className={`z-metric g-mint is-clickable ${filterStatus === 'ok' ? 'on' : ''}`} onClick={() => setFilterStatus('ok')} role="button" tabIndex={0} data-testid="inv-metric-ok">
            <div className="k"><Icon name="check" /> In stock</div>
            <div className="v">{totals.ok || 0}</div>
            <div className="sub">Above reorder level</div>
          </div>
          <div className={`z-metric g-amber is-clickable ${filterStatus === 'low' ? 'on' : ''}`} onClick={() => setFilterStatus('low')} role="button" tabIndex={0} data-testid="inv-metric-low">
            <div className="k"><Icon name="alert" /> Low stock</div>
            <div className="v">{totals.low || 0}</div>
            <div className="sub">Below threshold — reorder soon</div>
          </div>
          <div className={`z-metric g-rose is-clickable ${filterStatus === 'out' ? 'on' : ''}`} onClick={() => setFilterStatus('out')} role="button" tabIndex={0} data-testid="inv-metric-out">
            <div className="k"><Icon name="alert" /> Out</div>
            <div className="v">{totals.out || 0}</div>
            <div className="sub">Zero stock right now</div>
          </div>
          <div className="z-metrics-shop">
            <button className="z-btn z-btn--pri" onClick={goBuyInventory} data-testid="inv-shop-btn">
              <Icon name="cart" /> Shop
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="z-toolbar">
          <div className="z-search"><Icon name="search" />
            <input placeholder="Search products, brands, SKUs..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="z-seg">
            {['all', 'ok', 'low', 'out'].map((s) => (
              <button key={s} className={filterStatus === s ? 'on' : ''} onClick={() => setFilterStatus(s)}>
                {s === 'all' ? 'All' : s === 'ok' ? 'In stock' : s === 'low' ? 'Low' : 'Out'}
              </button>
            ))}
          </div>
          <button className="z-btn z-btn--ghost z-toolbar-newitem" onClick={openNewItem} data-testid="inv-new-item">
            <Icon name="plus" /> New item
          </button>
        </div>

        <div className="z-inv-table">
          <div className="z-inv-head">
            <div>Product</div>
            <div>Category</div>
            <div>Stock</div>
            <div>Status</div>
            <div>Cost</div>
            <div style={{ textAlign: 'right' }}>Actions</div>
          </div>
          {filtered.length === 0 ? (
            <div className="z-empty">
              <Icon name="box" size={40} /><br />
              No items match your filter.
            </div>
          ) : filtered.map((item) => {
            const st = statusOf(item);
            return (
              <div key={item.id} className={`z-inv-row ${st.level === 'low' ? 'low' : ''} ${st.level === 'out' ? 'out' : ''}`}>
                <div className="z-inv-prod">
                  <div className="z-inv-ico">{item.image_url ? <img src={item.image_url} alt="" style={{ width: '100%', height: '100%', borderRadius: 10, objectFit: 'cover' }} /> : emojiFor(item.name)}</div>
                  <div style={{ minWidth: 0 }}>
                    <div className="nm">{item.name}</div>
                    <div className="br">{item.brand || '—'} · {item.sku_code || 'no SKU'}</div>
                  </div>
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--z-ink-soft)' }}>{item.category || 'General'}</div>
                <div>
                  <div className="z-inv-qty">{item.qty_total || 0} <span style={{ fontSize: 12, fontFamily: 'Manrope', fontWeight: 600, color: 'var(--z-muted)' }}>{item.unit || 'pcs'}</span></div>
                  <div style={{ fontSize: 11, color: 'var(--z-muted-2)' }}>Reorder at {item.low_stock_threshold || 0}</div>
                </div>
                <div><span className={`z-pill ${st.pill}`}>{st.label}</span></div>
                <div className="z-inv-money">
                  {rupee(item.cost_price)}
                  <small>MRP {rupee(item.mrp || item.selling_price)}</small>
                </div>
                <div className="z-inv-acts">
                  <button className="z-ibtn z-ibtn--sell" onClick={() => openAction('sell', item)}>
                    <Icon name="tag" /> Sell
                  </button>
                  <button className="z-ibtn" onClick={() => openAction('assign', item)}>
                    <Icon name="users" /> Assign
                  </button>
                  <button className="z-ibtn z-ibtn--buy" onClick={() => openAction('restock', item)}>
                    <Icon name="restock" /> Restock
                  </button>
                  <button className="z-ibtn" onClick={() => openEditItem(item)}>
                    <Icon name="edit" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {showItemDrawer && (
        <ItemDrawer
          initial={editing}
          getAuthHeaders={getAuthHeaders}
          onClose={() => { setShowItemDrawer(false); setEditing(null); }}
          onSaved={(saved, isNew) => {
            setItems((s) => isNew ? [saved, ...s] : s.map((x) => x.id === saved.id ? { ...x, ...saved } : x));
            setShowItemDrawer(false);
            setEditing(null);
            toast.success(isNew ? 'Item added' : 'Updated');
            // Issue 9 — always reload from server so persisted opening qty_total
            // and any server-side enrichment (branch, aliases, etc.) survive a refresh.
            load();
          }}
        />
      )}
      {actionDrawer && (
        <ActionDrawer
          {...actionDrawer}
          staff={staff}
          getAuthHeaders={getAuthHeaders}
          onClose={() => setActionDrawer(null)}
          onDone={(updated) => {
            if (updated) setItems((s) => s.map((x) => x.id === updated.id ? { ...x, ...updated } : x));
            else load();
            setActionDrawer(null);
          }}
        />
      )}

      {/* WS2 — Shop product-selection drawer + shared review order drawer */}
      {showShopDrawer && (
        <BuyInventoryDrawer
          getAuthHeaders={getAuthHeaders}
          onClose={() => setShowShopDrawer(false)}
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
            clearCart();
            toast.success('Order placed');
            load();
          }}
        />
      )}
    </div>
  );
}
function ItemDrawer({ initial, getAuthHeaders, onClose, onSaved }) {
  const isEdit = !!initial?.id;
  const [f, setF] = useState({
    name: '', brand: '', category: 'Consumable',
    sku_code: '', unit: 'pcs', qty_total: 0,
    low_stock_threshold: 0, cost_price: 0, mrp: 0, selling_price: 0,
    discount: 0, gst_percent: 18, description: '',
    supplier: '', expiry: '', image_url: '',
    ...(initial || {}),
  });
  const [saving, setSaving] = useState(false);
  const upd = (k, v) => setF((s) => ({ ...s, [k]: v }));

  const save = async () => {
    if (!f.name.trim()) return toast.error('Name required');
    setSaving(true);
    try {
      const payload = {
        name: f.name, brand: f.brand || null, category: f.category,
        sku_code: f.sku_code || null, unit: f.unit || 'pcs',
        qty_total: parseInt(f.qty_total || 0, 10),
        low_stock_threshold: parseInt(f.low_stock_threshold || 0, 10),
        cost_price: parseFloat(f.cost_price || 0),
        mrp: parseFloat(f.mrp || 0),
        selling_price: parseFloat(f.selling_price || 0),
        discount: parseFloat(f.discount || 0),
        gst_percent: parseFloat(f.gst_percent || 0),
        description: f.description || null,
        supplier: f.supplier || null,
        expiry: f.expiry || null,
        image_url: f.image_url || null,
      };
      let res;
      if (isEdit) {
        res = await axios.put(`${API}/salon/inventory/${initial.id}`, payload, { headers: getAuthHeaders() });
      } else {
        res = await axios.post(`${API}/salon/inventory`, payload, { headers: getAuthHeaders() });
      }
      onSaved(res.data?.item || res.data, !isEdit);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Save failed');
    } finally { setSaving(false); }
  };

  return (
    <>
      <div className="z-overlay" onClick={onClose} />
      <aside className="z-drawer wide">
        <div className="z-drawer-h">
          <div className="dico"><Icon name="box" size={20} /></div>
          <div>
            <div className="eyebrow">Inventory</div>
            <h3>{isEdit ? 'Edit item' : 'New item'}</h3>
            <p>Add a product outside a purchase order — for one-off stock adjustments or existing inventory.</p>
          </div>
          <button className="z-drawer-close" onClick={onClose}><Icon name="x" /></button>
        </div>
        <div className="z-drawer-body">
          <div className="z-grid2">
            <div className="z-field"><label>Product name</label>
              <input value={f.name} onChange={(e) => upd('name', e.target.value)} placeholder="Shampoo 500ml" />
            </div>
            <div className="z-field"><label>Brand</label>
              <input value={f.brand} onChange={(e) => upd('brand', e.target.value)} />
            </div>
          </div>
          <div className="z-grid3">
            <div className="z-field"><label>Category</label>
              <select value={f.category} onChange={(e) => upd('category', e.target.value)}>
                {['Consumable', 'Retail', 'Tool', 'Other'].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="z-field"><label>Unit</label>
              <select value={f.unit} onChange={(e) => upd('unit', e.target.value)}>
                {['pcs', 'ml', 'g', 'kg', 'l'].map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div className="z-field"><label>SKU</label>
              <input value={f.sku_code} onChange={(e) => upd('sku_code', e.target.value)} />
            </div>
          </div>
          <div className="z-grid2">
            <div className="z-field"><label>Opening stock</label>
              <input type="number" value={f.qty_total} onChange={(e) => upd('qty_total', e.target.value)} />
            </div>
            <div className="z-field"><label>Reorder at</label>
              <input type="number" value={f.low_stock_threshold} onChange={(e) => upd('low_stock_threshold', e.target.value)} />
            </div>
          </div>
          <div className="z-grid3">
            <div className="z-field"><label>Cost (₹)</label>
              <input type="number" value={f.cost_price} onChange={(e) => upd('cost_price', e.target.value)} />
            </div>
            <div className="z-field"><label>MRP (₹)</label>
              <input type="number" value={f.mrp} onChange={(e) => upd('mrp', e.target.value)} />
            </div>
            <div className="z-field"><label>Selling (₹)</label>
              <input type="number" value={f.selling_price} onChange={(e) => upd('selling_price', e.target.value)} />
            </div>
          </div>
          <div className="z-grid2">
            <div className="z-field"><label>Discount %</label>
              <input type="number" value={f.discount} onChange={(e) => upd('discount', e.target.value)} />
            </div>
            <div className="z-field"><label>GST %</label>
              <input type="number" value={f.gst_percent} onChange={(e) => upd('gst_percent', e.target.value)} />
            </div>
          </div>
          <div className="z-grid2">
            <div className="z-field"><label>Supplier</label>
              <input value={f.supplier} onChange={(e) => upd('supplier', e.target.value)} placeholder="Optional" />
            </div>
            <div className="z-field"><label>Expiry (YYYY-MM)</label>
              <input value={f.expiry} onChange={(e) => upd('expiry', e.target.value)} placeholder="2027-06" />
            </div>
          </div>
          <div className="z-field"><label>Description</label>
            <textarea value={f.description} onChange={(e) => upd('description', e.target.value)} />
          </div>
        </div>
        <div className="z-drawer-foot" style={{ display: 'flex', gap: 10 }}>
          <button className="z-btn z-btn--ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
          <button className="z-btn z-btn--pri" style={{ flex: 2 }} onClick={save} disabled={saving}>
            <Icon name="save" /> {saving ? 'Saving…' : (isEdit ? 'Save changes' : 'Create item')}
          </button>
        </div>
      </aside>
    </>
  );
}

/* ---------------- Action drawer (Sell / Restock / Assign) ---------------- */
function ActionDrawer({ type, item, staff, getAuthHeaders, onClose, onDone }) {
  const [sub, setSub] = useState(type); // sell | restock | assign
  const [f, setF] = useState({
    qty: 1,
    payment_mode: 'cash',
    staff_id: '',
    customer_name: '',
    customer_phone: '',
    cost_price: item?.cost_price || 0,
    supplier: item?.supplier || '',
    expiry: item?.expiry || '',
    record_finance: true,
    note: '',
    assign_qty: 0,
    assign_staff: '',
  });
  const [busy, setBusy] = useState(false);
  const upd = (k, v) => setF((s) => ({ ...s, [k]: v }));

  const sellSummary = useMemo(() => {
    const p = Number(item?.selling_price || 0);
    const q = Number(f.qty || 0);
    const disc = Number(item?.discount || 0);
    const gst = Number(item?.gst_percent || 0);
    const sub = p * q * (1 - disc / 100);
    const gstAmt = sub * gst / 100;
    return { sub: p * q, disc: (p * q) - sub, gst: gstAmt, total: sub + gstAmt };
  }, [item, f.qty]);

  const doSell = async () => {
    if (!item) return;
    setBusy(true);
    try {
      const res = await axios.post(`${API}/salon/inventory/${item.id}/sell`, {
        qty: parseInt(f.qty, 10),
        payment_mode: f.payment_mode,
        staff_id: f.staff_id || null,
        customer_name: f.customer_name || null,
        customer_phone: f.customer_phone || null,
        note: f.note || null,
      }, { headers: getAuthHeaders() });
      toast.success(res.data?.message || 'Sale recorded');
      onDone(res.data?.item);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Sell failed');
    } finally { setBusy(false); }
  };

  const doRestock = async () => {
    setBusy(true);
    try {
      const res = await axios.post(`${API}/salon/inventory/${item.id}/restock`, {
        qty: parseInt(f.qty, 10),
        cost_price: parseFloat(f.cost_price || 0) || undefined,
        supplier: f.supplier || null,
        expiry: f.expiry || null,
        note: f.note || null,
        payment_mode: f.payment_mode,
        record_finance: !!f.record_finance,
      }, { headers: getAuthHeaders() });
      toast.success('Stock added');
      onDone(res.data?.item);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Restock failed');
    } finally { setBusy(false); }
  };

  const doAssign = async () => {
    setBusy(true);
    try {
      const res = await axios.post(`${API}/salon/inventory/${item.id}/assign`, {
        staff_id: f.assign_staff || null,
        qty: parseInt(f.assign_qty || 0, 10),
      }, { headers: getAuthHeaders() });
      toast.success('Staff assignment updated');
      onDone(res.data?.item);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Assign failed');
    } finally { setBusy(false); }
  };

  return (
    <>
      <div className="z-overlay" onClick={onClose} />
      <aside className="z-drawer">
        <div className="z-drawer-h">
          <div className="dico"><Icon name={sub === 'sell' ? 'tag' : sub === 'restock' ? 'restock' : 'users'} size={20} /></div>
          <div>
            <div className="eyebrow">{item.name}</div>
            <h3>{sub === 'sell' ? 'Sell product' : sub === 'restock' ? 'Restock' : 'Assign to staff'}</h3>
            <p>Current stock: <b>{item.qty_total || 0}</b> {item.unit || 'pcs'}</p>
          </div>
          <button className="z-drawer-close" onClick={onClose}><Icon name="x" /></button>
        </div>

        <div className="z-drawer-tabs">
          <button className={`z-drawer-tab ${sub === 'sell' ? 'on' : ''}`} onClick={() => setSub('sell')}><Icon name="tag" /> Sell</button>
          <button className={`z-drawer-tab ${sub === 'restock' ? 'on' : ''}`} onClick={() => setSub('restock')}><Icon name="restock" /> Restock</button>
          <button className={`z-drawer-tab ${sub === 'assign' ? 'on' : ''}`} onClick={() => setSub('assign')}><Icon name="users" /> Assign</button>
        </div>

        <div className="z-drawer-body">
          {sub === 'sell' && (
            <>
              <div className="z-dsec">Sale details</div>
              <div className="z-grid2">
                <div className="z-field"><label>Quantity</label>
                  <div className="z-stepper" style={{ display: 'flex' }}>
                    <button onClick={() => upd('qty', Math.max(1, f.qty - 1))}><Icon name="minus" /></button>
                    <input value={f.qty} onChange={(e) => upd('qty', Math.max(1, parseInt(e.target.value || 1, 10)))} />
                    <button onClick={() => upd('qty', f.qty + 1)}><Icon name="plus" /></button>
                  </div>
                </div>
                <div className="z-field"><label>Sold by</label>
                  <select value={f.staff_id} onChange={(e) => upd('staff_id', e.target.value)}>
                    <option value="">— Unassigned —</option>
                    {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="z-dsec">Customer (optional)</div>
              <div className="z-grid2">
                <div className="z-field"><label>Name</label>
                  <input value={f.customer_name} onChange={(e) => upd('customer_name', e.target.value)} />
                </div>
                <div className="z-field"><label>Phone</label>
                  <input value={f.customer_phone} onChange={(e) => upd('customer_phone', e.target.value)} />
                </div>
              </div>

              <div className="z-dsec">Payment mode</div>
              <div className="z-pay-grid">
                {PAYMENT_MODES.map((p) => (
                  <div key={p.v} className={`z-pay-opt ${f.payment_mode === p.v ? 'on' : ''}`} onClick={() => upd('payment_mode', p.v)}>
                    <Icon name={p.ico} /> {p.l}
                  </div>
                ))}
              </div>

              <div className="z-dsec">Bill summary</div>
              <div className="z-sumrow"><span>Subtotal ({f.qty} × {rupee(item.selling_price)})</span><span>{rupee(sellSummary.sub)}</span></div>
              {sellSummary.disc > 0 && <div className="z-sumrow g"><span>Discount ({item.discount || 0}%)</span><span>-{rupee(sellSummary.disc)}</span></div>}
              {sellSummary.gst > 0 && <div className="z-sumrow"><span>GST ({item.gst_percent || 0}%)</span><span>{rupee(sellSummary.gst)}</span></div>}
              <div className="z-sumrow tot"><span>Total</span><span className="num">{rupee(sellSummary.total)}</span></div>
            </>
          )}

          {sub === 'restock' && (
            <>
              <div className="z-dsec">Stock added</div>
              <div className="z-grid2">
                <div className="z-field"><label>Quantity</label>
                  <div className="z-stepper" style={{ display: 'flex' }}>
                    <button onClick={() => upd('qty', Math.max(1, f.qty - 1))}><Icon name="minus" /></button>
                    <input value={f.qty} onChange={(e) => upd('qty', Math.max(1, parseInt(e.target.value || 1, 10)))} />
                    <button onClick={() => upd('qty', f.qty + 1)}><Icon name="plus" /></button>
                  </div>
                </div>
                <div className="z-field"><label>Unit cost (₹)</label>
                  <input type="number" value={f.cost_price} onChange={(e) => upd('cost_price', e.target.value)} />
                </div>
              </div>
              <div className="z-grid2">
                <div className="z-field"><label>Supplier</label>
                  <input value={f.supplier} onChange={(e) => upd('supplier', e.target.value)} placeholder="Vendor name" />
                </div>
                <div className="z-field"><label>Expiry</label>
                  <input value={f.expiry} onChange={(e) => upd('expiry', e.target.value)} placeholder="YYYY-MM" />
                </div>
              </div>
              <div className="z-field"><label>Payment mode</label>
                <select value={f.payment_mode} onChange={(e) => upd('payment_mode', e.target.value)}>
                  {PAYMENT_MODES.map((p) => <option key={p.v} value={p.v}>{p.l}</option>)}
                </select>
              </div>
              <div className="z-field">
                <div className="z-togrow" onClick={() => upd('record_finance', !f.record_finance)}>
                  <button className={`z-toggle ${f.record_finance ? 'on' : ''}`} />
                  <span>Log as an expense in Reports (Finance)</span>
                </div>
              </div>
              <div className="z-field"><label>Note</label>
                <textarea value={f.note} onChange={(e) => upd('note', e.target.value)} />
              </div>
              <div className="z-sumrow tot" style={{ marginTop: 16 }}>
                <span>Total cost</span>
                <span className="num">{rupee((Number(f.cost_price) || 0) * (Number(f.qty) || 0))}</span>
              </div>
            </>
          )}

          {sub === 'assign' && (
            <>
              <div className="z-dsec">Assign to a staff member</div>
              <div className="z-field"><label>Staff</label>
                <select value={f.assign_staff} onChange={(e) => upd('assign_staff', e.target.value)}>
                  <option value="">— Common pool (unassign) —</option>
                  {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="z-field"><label>Quantity assigned</label>
                <div className="z-stepper" style={{ display: 'flex' }}>
                  <button onClick={() => upd('assign_qty', Math.max(0, f.assign_qty - 1))}><Icon name="minus" /></button>
                  <input value={f.assign_qty} onChange={(e) => upd('assign_qty', Math.max(0, parseInt(e.target.value || 0, 10)))} />
                  <button onClick={() => upd('assign_qty', f.assign_qty + 1)}><Icon name="plus" /></button>
                </div>
                <div style={{ fontSize: 12, color: 'var(--z-muted)', marginTop: 6 }}>
                  Set 0 to remove the staff assignment.
                </div>
              </div>
            </>
          )}
        </div>

        <div className="z-drawer-foot" style={{ display: 'flex', gap: 10 }}>
          <button className="z-btn z-btn--ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
          {sub === 'sell' && <button className="z-btn z-btn--ok" style={{ flex: 2 }} disabled={busy} onClick={doSell}><Icon name="tag" /> Record sale</button>}
          {sub === 'restock' && <button className="z-btn z-btn--pri" style={{ flex: 2 }} disabled={busy} onClick={doRestock}><Icon name="restock" /> Add stock</button>}
          {sub === 'assign' && <button className="z-btn z-btn--pri" style={{ flex: 2 }} disabled={busy} onClick={doAssign}><Icon name="users" /> Save assignment</button>}
        </div>
      </aside>
    </>
  );
}
