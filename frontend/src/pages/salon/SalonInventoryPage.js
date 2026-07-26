/**
 * Phase 14 — Salon Inventory page.
 *
 * Two tabs:
 *   - "All items"  : grid + filter + actions per row (Edit / Assign / Reserve /
 *                    Release / Consume / Sell / Movements)
 *   - "Movements"  : flat audit log (filter by item, type, branch)
 *
 * Top banner: low-stock items count + reset filter pill.
 *
 * Actions open small modals. Each modal calls the appropriate
 * /api/salon/inventory/{id}/{action} endpoint and re-fetches.
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  ArrowLeft, Loader2, Search, Boxes, Plus, Filter, Edit3, Truck, ShoppingCart,
  AlertTriangle, History, X, Save, UserCheck, Minus,
  ScanLine,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { extractErrorMessage } from '@/utils/apiError';
import SalonHamburgerMenu from '@/components/salon/SalonHamburgerMenu';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const fmt = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const AVAILABILITY_OPTIONS = [
  { value: 'both',          label: 'Both (sale + internal)' },
  { value: 'sale_only',     label: 'Sale only' },
  { value: 'internal_only', label: 'Internal only' },
];
const UNIT_OPTIONS = ['piece', 'ml', 'g', 'kg', 'litre', 'pack', 'bottle', 'tube', 'jar', 'kit', 'set'];

const MOVEMENT_TYPE_LABELS = {
  purchase_in:           { label: 'Purchase in',         cls: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/40' },
  manual_add:            { label: 'Manual add',          cls: 'bg-blue-500/15 text-blue-600 border-blue-500/40' },
  sale_to_customer:      { label: 'Sale to customer',    cls: 'bg-violet-500/15 text-violet-600 border-violet-500/40' },
  internal_consumption:  { label: 'Internal consumed',   cls: 'bg-amber-500/15 text-amber-600 border-amber-500/40' },
  assign_to_staff:       { label: 'Assigned to staff',   cls: 'bg-indigo-500/15 text-indigo-600 border-indigo-500/40' },
  reserve_internal:      { label: 'Reserved internal',   cls: 'bg-slate-500/15 text-slate-600 border-slate-500/40' },
  release_reserve:       { label: 'Released reserve',    cls: 'bg-slate-500/15 text-slate-600 border-slate-500/40' },
  adjustment:            { label: 'Adjustment',          cls: 'bg-rose-500/15 text-rose-600 border-rose-500/40' },
  return:                { label: 'Return',              cls: 'bg-cyan-500/15 text-cyan-600 border-cyan-500/40' },
};

export default function SalonInventoryPage() {
  return <InventoryView />;
}

/**
 * The inventory UI. Rendered standalone by SalonInventoryPage (with its own
 * page chrome) OR embedded inside the dashboard as a tab (embedded=true), in
 * which case the page-level hamburger + back button + full-screen wrapper are
 * omitted since the dashboard already provides them.
 */
export function InventoryView({ embedded = false }) {
  const navigate = useNavigate();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  // Jul 2026 — Staff list for dropdowns
  const [staffList, setStaffList] = useState([]);

  const [search, setSearch] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [filterAvailability, setFilterAvailability] = useState('');
  const [filterLowStock, setFilterLowStock] = useState(false);

  const [activeAction, setActiveAction] = useState(null); // {type, item}
  const [showCreate, setShowCreate] = useState(false);
  const [detailItem, setDetailItem] = useState(null); // item clicked → detail+logs modal

  const authHeaders = useMemo(() => {
    const raw = localStorage.getItem('salon_user_auth');
    let token = localStorage.getItem('salon_admin_token') || localStorage.getItem('access_token');
    if (!token && raw) { try { token = JSON.parse(raw).token; } catch (e) { console.debug('Bad salon_user_auth JSON:', e); } }
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const salonId = useMemo(() => {
    try {
      const raw = localStorage.getItem('salon_user_auth');
      if (raw) { const j = JSON.parse(raw); return j?.salon_id || j?.salonId || null; }
    } catch (e) { console.debug('bad auth json', e); }
    return null;
  }, []);

  const fetchStaff = useCallback(async () => {
    if (!salonId) return;
    try {
      const r = await axios.get(`${API}/salons/${salonId}/barbers`, { headers: authHeaders });
      setStaffList(Array.isArray(r.data) ? r.data : (r.data?.barbers || []));
    } catch (e) { console.debug('staff list fetch failed', e); }
  }, [authHeaders, salonId]);

  useEffect(() => { fetchStaff(); }, [fetchStaff]);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page_size: 200 };
      if (search) params.q = search;
      if (filterAvailability) params.availability = filterAvailability;
      if (filterLowStock) params.low_stock_only = true;
      const r = await axios.get(`${API}/salon/inventory`, { headers: authHeaders, params });
      setItems(r.data.inventory_items || []);
    } catch (e) {
      if (e?.response?.status === 401) { toast.error('Session expired'); navigate('/salon/login'); return; }
      toast.error(extractErrorMessage(e, 'Failed to load inventory'));
    } finally { setLoading(false); }
  }, [authHeaders, search, filterAvailability, filterLowStock, navigate]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const lowStockCount = useMemo(() => items.filter(i => i.is_low_stock).length, [items]);

  return (
    <div className={embedded ? '' : 'min-h-screen bg-background'}>
      <header className={embedded ? 'bg-background/80 backdrop-blur border-b border-border' : 'sticky top-0 z-30 bg-background/80 backdrop-blur border-b border-border'}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">
          {!embedded && <SalonHamburgerMenu activeId="inventory" />}
          {!embedded && (
            <Button variant="ghost" size="sm" onClick={() => navigate('/salon/dashboard')} data-testid="inv-back-btn">
              <ArrowLeft className="w-4 h-4 mr-1" /> Back
            </Button>
          )}
          <div className="flex-1">
            <div className="text-sm font-bold">Inventory</div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground/80">Keep & manage stock · Phase 14</div>
          </div>
          <Button size="sm" variant="outline" onClick={() => navigate('/salon/orders')} data-testid="inv-view-orders-btn">
            <Truck className="w-4 h-4 mr-1" /> Orders
          </Button>
          <Button size="sm" onClick={() => setShowCreate(true)} data-testid="inv-create-btn">
            <Plus className="w-4 h-4 mr-1" /> Add item
          </Button>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-3 flex items-center gap-2">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground/80 font-bold" data-testid="inv-count-pill">
            <Boxes className="w-3.5 h-3.5 inline mr-1" /> All items ({items.length})
          </div>
          {lowStockCount > 0 && (
            <span data-testid="inv-low-stock-banner" className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/15 border border-amber-500/40 text-amber-600">
              <AlertTriangle className="w-3.5 h-3.5" /> {lowStockCount} low-stock items
            </span>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <>
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-2 mb-4">
              <form
                className="flex-1 flex gap-2"
                onSubmit={(e) => { e.preventDefault(); setSearch(searchDraft.trim()); }}
              >
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name, brand, SKU…"
                    value={searchDraft}
                    onChange={(e) => setSearchDraft(e.target.value)}
                    data-testid="inv-search-input"
                    className="pl-9"
                  />
                </div>
                <Button type="submit" data-testid="inv-search-btn"><Filter className="w-4 h-4" /></Button>
              </form>
              <select
                value={filterAvailability}
                onChange={(e) => setFilterAvailability(e.target.value)}
                data-testid="inv-filter-availability"
                className="bg-background border border-border rounded px-3 py-2 text-sm"
              >
                <option value="">All availabilities</option>
                {AVAILABILITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <label className="inline-flex items-center gap-2 text-xs px-3 py-2 border border-border rounded cursor-pointer">
                <input type="checkbox" checked={filterLowStock} onChange={(e) => setFilterLowStock(e.target.checked)} data-testid="inv-filter-low-stock" />
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> Low stock only
              </label>
            </div>

            {loading ? (
              <div className="text-center py-16 text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin inline mr-2" /> Loading…</div>
            ) : items.length === 0 ? (
              <div className="text-center py-16 border border-dashed border-border rounded-xl">
                <Boxes className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
                <div className="font-semibold mb-1">No inventory yet</div>
                <div className="text-xs text-muted-foreground mb-4">Items added manually or delivered from the store will show up here.</div>
                <div className="flex justify-center gap-2">
                  <Button onClick={() => setShowCreate(true)} data-testid="inv-empty-create-btn"><Plus className="w-4 h-4 mr-1" /> Add item</Button>
                  <Button variant="outline" onClick={() => navigate('/salon/marketplace')}>Shop store</Button>
                </div>
              </div>
            ) : (
              <div className="border border-border rounded-xl overflow-hidden bg-card divide-y divide-border" data-testid="inv-list">
                {items.map(it => (
                  <InventoryRow
                    key={it.id}
                    it={it}
                    onClick={() => setDetailItem(it)}
                    onAction={(type) => setActiveAction({ type, item: it })}
                  />
                ))}
              </div>
            )}
          </>
      </main>

      {/* Modals */}
      {showCreate && (
        <CreateItemModal
          onClose={() => setShowCreate(false)}
          authHeaders={authHeaders}
          onSaved={() => { setShowCreate(false); fetchItems(); }}
        />
      )}
      {activeAction && (
        <ActionModal
          action={activeAction.type}
          item={activeAction.item}
          staffList={staffList}
          onClose={() => setActiveAction(null)}
          authHeaders={authHeaders}
          onSaved={() => { setActiveAction(null); fetchItems(); }}
        />
      )}
      {detailItem && (
        <ItemDetailModal
          item={detailItem}
          authHeaders={authHeaders}
          staffList={staffList}
          onClose={() => setDetailItem(null)}
          onAction={(type) => { setActiveAction({ type, item: detailItem }); setDetailItem(null); }}
        />
      )}
    </div>
  );
}


function InventoryRow({ it, onClick, onAction }) {
  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors cursor-pointer ${it.is_low_stock ? 'border-l-4 border-l-amber-500' : ''}`}
      data-testid={`inv-row-${it.id}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
    >
      {/* Thumbnail */}
      <div className="w-11 h-11 rounded bg-muted overflow-hidden flex items-center justify-center flex-shrink-0">
        {it.image_url
          ? <img src={it.image_url} alt={it.name} className="w-full h-full object-cover" />
          : <Boxes className="w-4 h-4 text-muted-foreground" />}
      </div>
      {/* Name + brand + meta */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="text-sm font-bold truncate" data-testid={`inv-row-name-${it.id}`}>{it.name}</div>
          {it.product_id_source && (
            <span className="text-[10px] px-1.5 py-0.5 bg-emerald-500/15 text-emerald-600 rounded">From supplier</span>
          )}
          {it.is_low_stock && (
            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-amber-500/15 text-amber-600 rounded">
              <AlertTriangle className="w-3 h-3" /> Low
            </span>
          )}
        </div>
        <div className="text-[11px] text-muted-foreground truncate">
          {(it.brand || '—')} · {(it.category || 'Uncategorised')} · {it.unit}
          {it.sku_code ? ` · SKU: ${it.sku_code}` : ''}
        </div>
      </div>
      {/* Stock breakdown */}
      <div className="hidden md:flex items-center gap-4 text-[11px]">
        <div className="text-right">
          <div className="text-lg font-extrabold leading-none">{it.qty_total}</div>
          <div className="text-[9px] uppercase tracking-wider text-muted-foreground">in stock</div>
        </div>
        <div className="text-right">
          <div className="text-emerald-600 font-semibold">{it.qty_available_for_customer}</div>
          <div className="text-[9px] uppercase tracking-wider text-muted-foreground">sellable</div>
        </div>
        <div className="text-right">
          <div className="text-slate-600 dark:text-slate-300 font-semibold">{fmt(it.selling_price)}</div>
          <div className="text-[9px] uppercase tracking-wider text-muted-foreground">price</div>
        </div>
      </div>
      {/* Compact stock col for mobile */}
      <div className="md:hidden text-right">
        <div className="text-lg font-extrabold leading-none">{it.qty_total}</div>
        <div className="text-[9px] uppercase tracking-wider text-muted-foreground">stock</div>
      </div>
      {/* Inline action buttons */}
      <div className="flex items-center gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
        <RowActionBtn icon={UserCheck} label="Assign / Consume" onClick={() => onAction('assign_consume')} testid={`inv-row-assign-${it.id}`} />
        <RowActionBtn icon={ShoppingCart} label="Sell" onClick={() => onAction('sell')} testid={`inv-row-sell-${it.id}`} />
        <RowActionBtn icon={Edit3} label="Edit" onClick={() => onAction('edit')} testid={`inv-row-edit-${it.id}`} />
      </div>
    </div>
  );
}


function RowActionBtn({ icon: Icon, label, onClick, testid }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      data-testid={testid}
      className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded border border-border hover:border-primary/60 hover:bg-muted transition-colors"
    >
      <Icon className="w-3 h-3" />
      <span className="hidden lg:inline">{label}</span>
    </button>
  );
}


function Stat({ label, value, cls }) {
  return (
    <div className={`rounded px-2 py-1 ${cls}`}>
      <div className="font-bold">{value}</div>
      <div className="opacity-80">{label}</div>
    </div>
  );
}

function ActionBtn({ icon: Icon, label, onClick, testid }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testid}
      className="inline-flex items-center justify-center gap-1 text-[11px] font-semibold py-1.5 rounded border border-border hover:border-primary/60 hover:bg-muted transition-colors"
    >
      <Icon className="w-3 h-3" /> {label}
    </button>
  );
}


function ActionModal({ action, item, staffList = [], onClose, authHeaders, onSaved }) {
  const [qty, setQty] = useState(1);
  const [paymentMode, setPaymentMode] = useState('cash');
  const [note, setNote] = useState('');
  const [staffId, setStaffId] = useState(item.assigned_to_staff_id || '');
  const [saving, setSaving] = useState(false);
  // For merged assign/consume mode selector
  const [assignMode, setAssignMode] = useState('assign'); // 'assign' | 'consume'
  // Sell → optional customer fields
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');

  // Edit-specific
  const [editForm, setEditForm] = useState({
    name: item.name,
    brand: item.brand || '',
    category: item.category || '',
    selling_price: item.selling_price || 0,
    cost_price: item.cost_price || 0,
    gst_percent: item.gst_percent || 0,
    mrp: item.mrp || 0,
    discount: item.discount || 0,
    availability: item.availability,
    low_stock_threshold: item.low_stock_threshold,
    sku_code: item.sku_code || '',
    unit: item.unit,
  });

  const titleMap = {
    edit:            'Edit item',
    assign_consume:  'Assign to staff / Consume stock',
    sell:            'Sell over the counter',
  };

  const staffOptions = useMemo(() => (
    [{ value: '', label: 'Common pool (not assigned)' }].concat(
      (staffList || []).map((s) => ({ value: s.id, label: s.name || 'Staff' }))
    )
  ), [staffList]);

  const submit = async (e) => {
    e?.preventDefault();
    setSaving(true);
    try {
      if (action === 'edit') {
        await axios.put(`${API}/salon/inventory/${item.id}`, editForm, { headers: authHeaders });
        toast.success('Item updated');
      } else if (action === 'assign_consume') {
        if (assignMode === 'assign') {
          await axios.post(`${API}/salon/inventory/${item.id}/assign`, { staff_id: staffId || null, qty }, { headers: authHeaders });
          toast.success('Assignment updated');
        } else {
          await axios.post(`${API}/salon/inventory/${item.id}/consume`, { qty, staff_id: staffId || null, note }, { headers: authHeaders });
          toast.success('Stock consumed');
        }
      } else if (action === 'sell') {
        const r = await axios.post(
          `${API}/salon/inventory/${item.id}/sell`,
          {
            qty,
            payment_mode: paymentMode,
            staff_id: staffId || null,
            note,
            customer_name: customerName.trim() || null,
            customer_phone: customerPhone.trim() || null,
          },
          { headers: authHeaders }
        );
        toast.success(r.data.message || 'POS sale recorded');
      }
      onSaved();
    } catch (e) {
      toast.error(extractErrorMessage(e, 'Action failed'));
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <form
        className="bg-card border border-border rounded-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <header className="px-5 py-3 border-b border-border flex items-center justify-between">
          <div>
            <div className="text-base font-bold">{titleMap[action] || action}</div>
            <div className="text-[11px] text-muted-foreground">{item.name}</div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded hover:bg-muted" data-testid="inv-action-close-btn"><X className="w-4 h-4" /></button>
        </header>

        <div className="p-5 space-y-3">
          {action === 'edit' && (
            <>
              <FormRow label="Name" value={editForm.name} onChange={(v) => setEditForm(f => ({ ...f, name: v }))} disabled={!!item.product_id_source} testid="inv-edit-name" />
              <div className="grid grid-cols-2 gap-3">
                <FormRow label="Brand" value={editForm.brand} onChange={(v) => setEditForm(f => ({ ...f, brand: v }))} disabled={!!item.product_id_source} />
                <FormRow label="Category" value={editForm.category} onChange={(v) => setEditForm(f => ({ ...f, category: v }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FormRow label="Cost price" type="number" value={editForm.cost_price} onChange={(v) => setEditForm(f => ({ ...f, cost_price: Number(v) }))} />
                <FormRow label="Selling price" type="number" value={editForm.selling_price} onChange={(v) => setEditForm(f => ({ ...f, selling_price: Number(v) }))} testid="inv-edit-price" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <FormRow label="MRP" type="number" value={editForm.mrp} onChange={(v) => setEditForm(f => ({ ...f, mrp: Number(v) }))} />
                <FormRow label="GST %" type="number" value={editForm.gst_percent} onChange={(v) => setEditForm(f => ({ ...f, gst_percent: Number(v) }))} />
                <FormRow label="Discount %" type="number" value={editForm.discount} onChange={(v) => setEditForm(f => ({ ...f, discount: Number(v) }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FormSelect label="Unit" value={editForm.unit} onChange={(v) => setEditForm(f => ({ ...f, unit: v }))} options={UNIT_OPTIONS.map(u => ({ value: u, label: u }))} disabled={!!item.product_id_source} />
                <FormSelect label="Availability" value={editForm.availability} onChange={(v) => setEditForm(f => ({ ...f, availability: v }))} options={AVAILABILITY_OPTIONS} testid="inv-edit-availability" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FormRow label="Low-stock threshold" type="number" value={editForm.low_stock_threshold} onChange={(v) => setEditForm(f => ({ ...f, low_stock_threshold: Number(v) }))} />
                <FormRow label="SKU code" value={editForm.sku_code} onChange={(v) => setEditForm(f => ({ ...f, sku_code: v }))} />
              </div>
            </>
          )}

          {action === 'assign_consume' && (
            <>
              {/* Mode chooser */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setAssignMode('assign')}
                  data-testid="inv-assign-mode-assign"
                  className={`text-xs font-semibold py-2 rounded border ${assignMode === 'assign' ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border'}`}
                >
                  <UserCheck className="w-3.5 h-3.5 inline mr-1" /> Assign to staff
                </button>
                <button
                  type="button"
                  onClick={() => setAssignMode('consume')}
                  data-testid="inv-assign-mode-consume"
                  className={`text-xs font-semibold py-2 rounded border ${assignMode === 'consume' ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border'}`}
                >
                  <Minus className="w-3.5 h-3.5 inline mr-1" /> Consume from stock
                </button>
              </div>

              <FormSelect
                label="Staff"
                value={staffId}
                onChange={setStaffId}
                options={staffOptions}
                testid="inv-assign-staff-select"
              />
              <FormRow
                label={assignMode === 'assign' ? 'Quantity to reserve for this staff' : 'Quantity to consume'}
                type="number"
                value={qty}
                onChange={(v) => setQty(Number(v))}
                testid="inv-assign-qty"
              />
              {assignMode === 'consume' && (
                <FormTextarea label="Note (optional)" value={note} onChange={setNote} />
              )}
              <Hint text={
                assignMode === 'assign'
                  ? `Currently reserved internally: ${item.qty_reserved_for_internal}. Available outside customer reservations: ${item.qty_total - item.qty_reserved_for_customer_orders}.`
                  : `Reduces total stock. Will not eat into customer reservations. Available: ${item.qty_total - item.qty_reserved_for_customer_orders}.`
              } />
            </>
          )}

          {action === 'sell' && (
            <>
              <FormRow label="Quantity sold" type="number" value={qty} onChange={(v) => setQty(Number(v))} testid="inv-sell-qty" />
              <FormSelect label="Payment mode" value={paymentMode} onChange={setPaymentMode} options={[
                { value: 'cash', label: 'Cash' },
                { value: 'card', label: 'Card' },
                { value: 'upi',  label: 'UPI' },
                { value: 'wallet', label: 'Wallet' },
                { value: 'other', label: 'Other' },
              ]} testid="inv-sell-payment-mode" />
              <FormSelect label="Staff who sold (optional)" value={staffId} onChange={setStaffId} options={staffOptions} testid="inv-sell-staff-select" />
              {/* Optional customer info */}
              <div className="grid grid-cols-2 gap-3">
                <FormRow label="Customer name (optional)" value={customerName} onChange={setCustomerName} testid="inv-sell-customer-name" />
                <FormRow label="Customer mobile (optional)" value={customerPhone} onChange={setCustomerPhone} testid="inv-sell-customer-phone" />
              </div>
              <FormTextarea label="Note (optional)" value={note} onChange={setNote} />
              <Hint text={`Estimated total: ${fmt(item.selling_price * qty * (1 - (item.discount || 0) / 100) * (1 + (item.gst_percent || 0) / 100))}`} />
            </>
          )}
        </div>

        <footer className="px-5 py-3 border-t border-border flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving} data-testid="inv-action-submit-btn">
            {saving ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Saving…</> : <><Save className="w-4 h-4 mr-1" /> Confirm</>}
          </Button>
        </footer>
      </form>
    </div>
  );
}


function CreateItemModal({ onClose, authHeaders, onSaved }) {
  const [form, setForm] = useState({
    name: '', brand: '', category: '', unit: 'piece', pack_size: '',
    cost_price: 0, selling_price: 0, gst_percent: 18, mrp: 0, discount: 0,
    qty_total: 0, availability: 'both', low_stock_threshold: 5, sku_code: '',
    // Jul 2026 — payment mode for auto financial entry on manual add
    purchase_payment_mode: 'none',
    purchase_note: '',
  });
  const [saving, setSaving] = useState(false);
  const submit = async (e) => {
    e?.preventDefault();
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      const res = await axios.post(`${API}/salon/inventory`, form, { headers: authHeaders });
      const finId = res?.data?.financial_transaction_id;
      toast.success(finId ? 'Item added — purchase entry recorded in Financials' : 'Item added');
      onSaved();
    } catch (e) { toast.error(extractErrorMessage(e, 'Failed to add item')); }
    finally { setSaving(false); }
  };
  const purchaseAmount = Number(form.cost_price || 0) * Number(form.qty_total || 0);
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <form className="bg-card border border-border rounded-2xl w-full max-w-xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <header className="px-5 py-3 border-b border-border flex items-center justify-between">
          <div className="text-base font-bold">Add inventory item</div>
          <button type="button" onClick={onClose} className="p-1.5 rounded hover:bg-muted"><X className="w-4 h-4" /></button>
        </header>
        <div className="p-5 space-y-3">
          <FormRow label="Name *" value={form.name} onChange={(v) => setForm(f => ({ ...f, name: v }))} testid="inv-create-name" />
          <div className="grid grid-cols-2 gap-3">
            <FormRow label="Brand" value={form.brand} onChange={(v) => setForm(f => ({ ...f, brand: v }))} />
            <FormRow label="Category" value={form.category} onChange={(v) => setForm(f => ({ ...f, category: v }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormSelect label="Unit" value={form.unit} onChange={(v) => setForm(f => ({ ...f, unit: v }))} options={UNIT_OPTIONS.map(u => ({ value: u, label: u }))} />
            <FormRow label="Pack size" value={form.pack_size} onChange={(v) => setForm(f => ({ ...f, pack_size: v }))} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <FormRow label="Cost price" type="number" value={form.cost_price} onChange={(v) => setForm(f => ({ ...f, cost_price: Number(v) }))} />
            <FormRow label="Selling price" type="number" value={form.selling_price} onChange={(v) => setForm(f => ({ ...f, selling_price: Number(v) }))} testid="inv-create-price" />
            <FormRow label="MRP" type="number" value={form.mrp} onChange={(v) => setForm(f => ({ ...f, mrp: Number(v) }))} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <FormRow label="GST %" type="number" value={form.gst_percent} onChange={(v) => setForm(f => ({ ...f, gst_percent: Number(v) }))} />
            <FormRow label="Discount %" type="number" value={form.discount} onChange={(v) => setForm(f => ({ ...f, discount: Number(v) }))} />
            <FormRow label="Qty in stock" type="number" value={form.qty_total} onChange={(v) => setForm(f => ({ ...f, qty_total: Number(v) }))} testid="inv-create-qty" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormSelect label="Availability" value={form.availability} onChange={(v) => setForm(f => ({ ...f, availability: v }))} options={AVAILABILITY_OPTIONS} />
            <FormRow label="Low-stock threshold" type="number" value={form.low_stock_threshold} onChange={(v) => setForm(f => ({ ...f, low_stock_threshold: Number(v) }))} />
          </div>
          <FormRow label="SKU code (optional)" value={form.sku_code} onChange={(v) => setForm(f => ({ ...f, sku_code: v }))} />

          {/* Jul 2026 — Financial entry section */}
          <div className="border-t border-border pt-3 mt-3">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-2">Auto-record purchase in Financials?</div>
            <FormSelect
              label="Payment mode for purchase"
              value={form.purchase_payment_mode}
              onChange={(v) => setForm(f => ({ ...f, purchase_payment_mode: v }))}
              options={[
                { value: 'none', label: 'Do not record purchase entry' },
                { value: 'cash', label: 'Cash' },
                { value: 'upi',  label: 'UPI' },
                { value: 'bank', label: 'Bank transfer' },
              ]}
              testid="inv-create-purchase-payment-mode"
            />
            {form.purchase_payment_mode !== 'none' && (
              <>
                <FormRow label="Purchase note (optional)" value={form.purchase_note} onChange={(v) => setForm(f => ({ ...f, purchase_note: v }))} />
                <Hint text={`A financial outflow of ${fmt(purchaseAmount)} will be recorded automatically (${form.cost_price} × ${form.qty_total}).`} />
              </>
            )}
          </div>
        </div>
        <footer className="px-5 py-3 border-t border-border flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving} data-testid="inv-create-submit-btn">
            {saving ? 'Saving…' : <><Plus className="w-4 h-4 mr-1" /> Add</>}
          </Button>
        </footer>
      </form>
    </div>
  );
}


function ItemDetailModal({ item, authHeaders, staffList = [], onClose, onAction }) {
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      try {
        const r = await axios.get(`${API}/salon/inventory/${item.id}/movements`, { headers: authHeaders });
        setMovements(r.data.movements || []);
      } catch (e) {
        toast.error(extractErrorMessage(e, 'Failed to load movements'));
      } finally { setLoading(false); }
    })();
  }, [item.id, authHeaders]);

  const assignedStaff = (staffList || []).find(s => s.id === item.assigned_to_staff_id);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} data-testid="inv-detail-modal">
        <header className="px-5 py-4 border-b border-border flex items-start justify-between gap-3 sticky top-0 bg-card z-10">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="w-14 h-14 rounded bg-muted overflow-hidden flex items-center justify-center flex-shrink-0">
              {item.image_url
                ? <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                : <Boxes className="w-6 h-6 text-muted-foreground" />}
            </div>
            <div className="min-w-0">
              <div className="text-lg font-bold leading-tight">{item.name}</div>
              <div className="text-[11px] text-muted-foreground">{(item.brand || '—')} · {(item.category || 'Uncategorised')} · {item.unit}</div>
              {item.product_id_source && (
                <span className="mt-1 inline-block text-[10px] px-1.5 py-0.5 bg-emerald-500/15 text-emerald-600 rounded">From supplier</span>
              )}
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded hover:bg-muted" data-testid="inv-detail-close-btn"><X className="w-4 h-4" /></button>
        </header>

        {/* Detail grid */}
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            <DetailCell label="Total Qty" value={item.qty_total} />
            <DetailCell label="Sellable" value={item.qty_available_for_customer} cls="text-emerald-600" />
            <DetailCell label="Reserved (internal)" value={item.qty_reserved_for_internal} />
            <DetailCell label="Reserved (customers)" value={item.qty_reserved_for_customer_orders} />
            <DetailCell label="Cost price" value={fmt(item.cost_price)} />
            <DetailCell label="Selling price" value={fmt(item.selling_price)} />
            <DetailCell label="MRP" value={fmt(item.mrp)} />
            <DetailCell label="Discount" value={`${item.discount || 0}%`} />
            <DetailCell label="GST" value={`${item.gst_percent || 0}%`} />
            <DetailCell label="Availability" value={item.availability} />
            <DetailCell label="Low-stock at" value={item.low_stock_threshold} />
            <DetailCell label="SKU" value={item.sku_code || '—'} />
            <DetailCell label="Pack size" value={item.pack_size || '—'} />
            <DetailCell label="Assigned to" value={assignedStaff?.name || (item.assigned_to_staff_id ? 'Staff' : 'Common pool')} />
            <DetailCell label="Created" value={item.created_at ? new Date(item.created_at).toLocaleDateString() : '—'} />
            <DetailCell label="Updated" value={item.updated_at ? new Date(item.updated_at).toLocaleDateString() : '—'} />
          </div>

          {/* Quick actions */}
          <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
            <Button size="sm" onClick={() => onAction('sell')} data-testid="inv-detail-sell-btn">
              <ShoppingCart className="w-3.5 h-3.5 mr-1" /> Sell
            </Button>
            <Button size="sm" variant="outline" onClick={() => onAction('assign_consume')} data-testid="inv-detail-assign-btn">
              <UserCheck className="w-3.5 h-3.5 mr-1" /> Assign / Consume
            </Button>
            <Button size="sm" variant="outline" onClick={() => onAction('edit')} data-testid="inv-detail-edit-btn">
              <Edit3 className="w-3.5 h-3.5 mr-1" /> Edit
            </Button>
          </div>

          {/* Logs */}
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground/80 mb-2">
              <History className="w-3.5 h-3.5" /> Item logs ({movements.length})
            </div>
            {loading ? (
              <div className="text-center py-6 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Loading…</div>
            ) : movements.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-xs">No movements yet.</div>
            ) : (
              <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1" data-testid="inv-detail-logs">
                {movements.map(m => {
                  const cfg = MOVEMENT_TYPE_LABELS[m.movement_type] || { label: m.movement_type, cls: 'bg-muted' };
                  return (
                    <div key={m.id} className="flex items-start gap-3 py-2 border-b border-border last:border-b-0">
                      <span className={`flex-shrink-0 inline-flex items-center text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 rounded-full border ${cfg.cls}`}>{cfg.label}</span>
                      <div className="flex-1 min-w-0 text-xs">
                        <div className="text-muted-foreground">{new Date(m.created_at).toLocaleString()}</div>
                        {m.note && <div className="text-foreground">{m.note}</div>}
                      </div>
                      <div className="text-right">
                        <div className={`text-sm font-bold ${m.qty_delta < 0 ? 'text-rose-500' : 'text-emerald-500'}`}>{m.qty_delta > 0 ? '+' : ''}{m.qty_delta}</div>
                        <div className="text-[10px] text-muted-foreground">after: {m.qty_after}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


function DetailCell({ label, value, cls = '' }) {
  return (
    <div className="border border-border rounded-lg px-2.5 py-2 bg-background">
      <div className="text-[9px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`text-sm font-semibold ${cls}`}>{value}</div>
    </div>
  );
}


function FormRow({ label, value, onChange, type = 'text', disabled, testid }) {
  return (
    <div>
      <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</Label>
      <Input
        type={type}
        value={value ?? ''}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        data-testid={testid}
        className="mt-1"
      />
    </div>
  );
}

function FormSelect({ label, value, onChange, options, disabled, testid }) {
  return (
    <div>
      <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</Label>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        data-testid={testid}
        className="mt-1 w-full bg-background border border-border rounded px-3 py-2 text-sm"
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function FormTextarea({ label, value, onChange }) {
  return (
    <div>
      <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</Label>
      <Textarea value={value || ''} onChange={(e) => onChange(e.target.value)} className="mt-1" />
    </div>
  );
}

function Hint({ text }) {
  return (
    <div className="text-[11px] text-muted-foreground bg-muted/50 rounded px-3 py-2 flex items-start gap-2">
      <ScanLine className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
      <span>{text}</span>
    </div>
  );
}
