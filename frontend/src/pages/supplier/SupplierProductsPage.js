/**
 * Phase 9 — Supplier Products page.
 * Tabs: "My Catalog" + "Browse Samples" (30 seeded templates).
 * Actions: add manual, add from sample, edit, restock, delete.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import {
  Loader2, Plus, Search, Pencil, Trash2, PackagePlus, Sparkles,
  AlertTriangle, X, Boxes, Tag, IndianRupee, Check,
} from 'lucide-react';
import { useSupplierAuth } from '@/contexts/SupplierAuthContext';
import SupplierLayout from '@/components/supplier/SupplierLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const UNITS = ['piece', 'ml', 'g', 'kg', 'litre', 'pack'];
const fmt = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

const emptyForm = {
  name: '', description: '', brand: '', category: '', sub_category: '',
  images: [], unit: 'piece', pack_size: '',
  mrp: '', selling_price: '', gst_percent: 18, hsn_code: '',
  inventory_available: 0, low_stock_threshold: 5, min_order_qty: 1, is_active: true,
};

export default function SupplierProductsPage() {
  const { authHeaders } = useSupplierAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('action') === 'samples' ? 'samples' : 'catalog';
  const [tab, setTab] = useState(initialTab);

  // catalog state
  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');

  // samples state
  const [samples, setSamples] = useState([]);
  const [loadingSamples, setLoadingSamples] = useState(false);
  const [sampleSearch, setSampleSearch] = useState('');
  const [sampleCat, setSampleCat] = useState('');

  // modals
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState('create'); // 'create' | 'edit'
  const [editorForm, setEditorForm] = useState(emptyForm);
  const [editorBusy, setEditorBusy] = useState(false);

  const [restockOpen, setRestockOpen] = useState(false);
  const [restockProduct, setRestockProduct] = useState(null);
  const [restockQty, setRestockQty] = useState('');

  const [deleteId, setDeleteId] = useState(null);

  // ---------- Loaders ----------
  const loadProducts = useCallback(async () => {
    if (!authHeaders) return;
    setLoadingProducts(true);
    try {
      const params = {};
      if (search) params.q = search;
      if (filterCat) params.category = filterCat;
      const r = await axios.get(`${API}/supplier/products`, { headers: authHeaders, params });
      setProducts(r.data.products || []);
    } catch (e) {
      toast.error('Failed to load products');
    } finally { setLoadingProducts(false); }
  }, [authHeaders, search, filterCat]);

  const loadSamples = useCallback(async () => {
    if (!authHeaders) return;
    setLoadingSamples(true);
    try {
      const params = {};
      if (sampleSearch) params.q = sampleSearch;
      if (sampleCat) params.category = sampleCat;
      const r = await axios.get(`${API}/supplier/product-samples`, { headers: authHeaders, params });
      setSamples(r.data.samples || []);
    } catch (e) {
      toast.error('Failed to load samples');
    } finally { setLoadingSamples(false); }
  }, [authHeaders, sampleSearch, sampleCat]);

  useEffect(() => {
    if (tab === 'catalog') loadProducts();
    else loadSamples();
  }, [tab, loadProducts, loadSamples]);

  // ?action=add deep-link: open create modal once
  useEffect(() => {
    if (searchParams.get('action') === 'add') {
      openCreate();
      const sp = new URLSearchParams(searchParams);
      sp.delete('action');
      setSearchParams(sp, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // category list (derived)
  const allCats = useMemo(() => {
    const s = new Set(products.map(p => p.category).filter(Boolean));
    return [...s];
  }, [products]);

  const sampleCats = useMemo(() => {
    const s = new Set(samples.map(p => p.category).filter(Boolean));
    return [...s];
  }, [samples]);

  // ---------- Editor ----------
  const openCreate = () => {
    setEditorMode('create');
    setEditorForm(emptyForm);
    setEditorOpen(true);
  };

  const openEdit = (p) => {
    setEditorMode('edit');
    setEditorForm({
      id: p.id,
      name: p.name || '', description: p.description || '', brand: p.brand || '',
      category: p.category || '', sub_category: p.sub_category || '',
      images: p.images || [], unit: p.unit || 'piece', pack_size: p.pack_size || '',
      mrp: p.mrp ?? '', selling_price: p.selling_price ?? '',
      gst_percent: p.gst_percent ?? 18, hsn_code: p.hsn_code || '',
      inventory_available: p.inventory_available ?? 0,
      low_stock_threshold: p.low_stock_threshold ?? 5,
      min_order_qty: p.min_order_qty ?? 1,
      is_active: !!p.is_active,
    });
    setEditorOpen(true);
  };

  const setF = (k, v) => setEditorForm((f) => ({ ...f, [k]: v }));

  const validateEditor = () => {
    const f = editorForm;
    if (!f.name || f.name.trim().length < 2) return 'Name required';
    if (!f.category) return 'Category required';
    if (!f.unit) return 'Unit required';
    if (!f.mrp || Number(f.mrp) <= 0) return 'MRP must be > 0';
    if (!f.selling_price || Number(f.selling_price) <= 0) return 'Selling price must be > 0';
    if (Number(f.selling_price) > Number(f.mrp)) return 'Selling price cannot exceed MRP';
    return null;
  };

  const saveEditor = async () => {
    const err = validateEditor();
    if (err) { toast.error(err); return; }
    setEditorBusy(true);
    try {
      const f = editorForm;
      const payload = {
        name: f.name.trim(),
        description: f.description || null,
        brand: f.brand || null,
        category: f.category,
        sub_category: f.sub_category || null,
        images: (f.images || []).filter(Boolean),
        unit: f.unit,
        pack_size: f.pack_size || null,
        mrp: Number(f.mrp),
        selling_price: Number(f.selling_price),
        gst_percent: Number(f.gst_percent) || 0,
        hsn_code: f.hsn_code || null,
        inventory_available: Number(f.inventory_available) || 0,
        low_stock_threshold: Number(f.low_stock_threshold) || 0,
        min_order_qty: Number(f.min_order_qty) || 1,
        is_active: !!f.is_active,
      };
      if (editorMode === 'create') {
        await axios.post(`${API}/supplier/products`, payload, { headers: authHeaders });
        toast.success('Product added to your catalog');
      } else {
        await axios.put(`${API}/supplier/products/${f.id}`, payload, { headers: authHeaders });
        toast.success('Product updated');
      }
      setEditorOpen(false);
      loadProducts();
    } catch (e) {
      const detail = e?.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Save failed');
    } finally { setEditorBusy(false); }
  };

  // ---------- Sample → Product ----------
  const addFromSample = async (sample) => {
    try {
      await axios.post(`${API}/supplier/products/from-sample/${sample.id}`, {}, { headers: authHeaders });
      toast.success(`"${sample.name}" added as draft. Review pricing & stock.`);
      setTab('catalog');
    } catch (e) {
      toast.error('Could not add sample');
    }
  };

  // ---------- Restock ----------
  const submitRestock = async () => {
    if (!restockProduct || !restockQty || Number(restockQty) <= 0) {
      toast.error('Enter a quantity > 0'); return;
    }
    try {
      await axios.post(
        `${API}/supplier/products/${restockProduct.id}/restock`,
        { qty: Number(restockQty) },
        { headers: authHeaders },
      );
      toast.success(`Added ${restockQty} units`);
      setRestockOpen(false);
      setRestockQty('');
      loadProducts();
    } catch (e) {
      toast.error('Restock failed');
    }
  };

  // ---------- Delete ----------
  const confirmDelete = async () => {
    if (!deleteId) return;
    try {
      await axios.delete(`${API}/supplier/products/${deleteId}`, { headers: authHeaders });
      toast.success('Product removed');
      setDeleteId(null);
      loadProducts();
    } catch (e) {
      toast.error('Delete failed');
    }
  };

  // ---------- Render ----------
  return (
    <SupplierLayout>
      <div className="flex items-start justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Products</h1>
          <p className="text-sm text-muted-foreground/80 mt-1">Manage your catalog &amp; explore samples to add quickly.</p>
        </div>
        <Button onClick={openCreate} data-testid="add-product-btn" className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold">
          <Plus className="w-4 h-4 mr-1" /> Add product
        </Button>
      </div>

      <ShippingTaxCard authHeaders={authHeaders} />

      <div className="flex border border-border rounded-lg overflow-hidden mb-5 text-xs font-bold max-w-md">
        <button
          onClick={() => setTab('catalog')}
          data-testid="tab-catalog"
          className={`flex-1 py-2.5 flex items-center justify-center gap-1.5 ${
            tab === 'catalog' ? 'bg-primary text-primary-foreground' : 'bg-transparent text-muted-foreground hover:text-foreground'
          }`}
        ><Boxes className="w-3.5 h-3.5" /> MY CATALOG ({products.length})</button>
        <button
          onClick={() => setTab('samples')}
          data-testid="tab-samples"
          className={`flex-1 py-2.5 flex items-center justify-center gap-1.5 ${
            tab === 'samples' ? 'bg-primary text-primary-foreground' : 'bg-transparent text-muted-foreground hover:text-foreground'
          }`}
        ><Sparkles className="w-3.5 h-3.5" /> BROWSE SAMPLES</button>
      </div>

      {tab === 'catalog' ? (
        <CatalogTab
          products={products}
          loading={loadingProducts}
          search={search} setSearch={setSearch}
          filterCat={filterCat} setFilterCat={setFilterCat}
          cats={allCats}
          onEdit={openEdit}
          onRestock={(p) => { setRestockProduct(p); setRestockOpen(true); }}
          onDelete={(id) => setDeleteId(id)}
          onSwitchSamples={() => setTab('samples')}
        />
      ) : (
        <SamplesTab
          samples={samples}
          loading={loadingSamples}
          search={sampleSearch} setSearch={setSampleSearch}
          filterCat={sampleCat} setFilterCat={setSampleCat}
          cats={sampleCats}
          onAdd={addFromSample}
        />
      )}

      {editorOpen && (
        <EditorModal
          mode={editorMode}
          form={editorForm}
          setF={setF}
          busy={editorBusy}
          onClose={() => setEditorOpen(false)}
          onSave={saveEditor}
        />
      )}

      {restockOpen && restockProduct && (
        <Modal title={`Restock — ${restockProduct.name}`} onClose={() => setRestockOpen(false)}>
          <p className="text-xs text-muted-foreground mb-3">Current available: <span className="text-foreground font-mono">{restockProduct.inventory_available}</span></p>
          <label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Add quantity</label>
          <Input
            type="number"
            min="1"
            value={restockQty}
            onChange={(e) => setRestockQty(e.target.value)}
            placeholder="e.g. 50"
            data-testid="restock-qty-input"
            className="mt-1 bg-background border-border text-foreground"
          />
          <div className="flex justify-end gap-2 mt-5">
            <Button variant="outline" onClick={() => setRestockOpen(false)}>Cancel</Button>
            <Button data-testid="restock-submit-btn" onClick={submitRestock} className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold">
              <PackagePlus className="w-4 h-4 mr-1" /> Add stock
            </Button>
          </div>
        </Modal>
      )}

      {deleteId && (
        <Modal title="Remove product?" onClose={() => setDeleteId(null)}>
          <p className="text-sm text-foreground/80">This will hide the product from the marketplace. You can re-activate it later by editing.</p>
          <div className="flex justify-end gap-2 mt-5">
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button data-testid="confirm-delete-btn" onClick={confirmDelete} className="bg-rose-500 hover:bg-rose-600 text-foreground font-bold">
              <Trash2 className="w-4 h-4 mr-1" /> Remove
            </Button>
          </div>
        </Modal>
      )}
    </SupplierLayout>
  );
}

// ---------- Catalog Tab ----------
function CatalogTab({ products, loading, search, setSearch, filterCat, setFilterCat, cats, onEdit, onRestock, onDelete, onSwitchSamples }) {
  return (
    <div>
      <div className="flex gap-2 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/80" />
          <Input
            data-testid="catalog-search-input"
            placeholder="Search by name or brand"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-card border-border text-foreground"
          />
        </div>
        <select
          data-testid="catalog-category-filter"
          value={filterCat}
          onChange={(e) => setFilterCat(e.target.value)}
          className="bg-card border border-border text-foreground rounded-md px-3 py-2 text-sm"
        >
          <option value="">All categories</option>
          {cats.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="py-20 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : products.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card/40 p-10 text-center">
          <Boxes className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-foreground">No products yet</h3>
          <p className="text-sm text-muted-foreground mt-1">Start by browsing our 30 sample products — add any with one click.</p>
          <Button onClick={onSwitchSamples} className="mt-4 bg-primary hover:bg-primary/90 text-primary-foreground font-bold">
            <Sparkles className="w-4 h-4 mr-1" /> Browse samples
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map((p) => (
            <div key={p.id} data-testid={`product-card-${p.id}`} className="rounded-2xl border border-border bg-card/40 overflow-hidden hover:border-primary/40 transition-colors flex flex-col">
              <div className="aspect-square bg-background relative">
                {p.images?.[0] ? (
                  <img src={p.images[0]} alt={p.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center"><Boxes className="w-12 h-12 text-muted-foreground/40" /></div>
                )}
                {!p.is_active && (
                  <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-muted/80 border border-border text-[10px] font-bold uppercase tracking-widest text-foreground/80">Draft</div>
                )}
                {p.is_low_stock && (
                  <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-rose-500/15 border border-rose-500/40 text-[10px] font-bold uppercase tracking-widest text-rose-300 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> Low
                  </div>
                )}
              </div>
              <div className="p-3 flex-1 flex flex-col">
                <div className="text-[10px] uppercase tracking-widest font-bold text-primary">{p.category}{p.sub_category ? ` · ${p.sub_category}` : ''}</div>
                <h3 className="text-sm font-bold text-foreground mt-1 line-clamp-2">{p.name}</h3>
                {p.brand && <div className="text-xs text-muted-foreground/80">{p.brand}{p.pack_size ? ` · ${p.pack_size}` : ''}</div>}
                <div className="flex items-center justify-between mt-2">
                  <div className="text-sm font-bold text-primary flex items-center"><IndianRupee className="w-3 h-3" />{Number(p.selling_price).toLocaleString('en-IN')}</div>
                  <div className="text-[11px] text-muted-foreground/80 line-through">{fmt(p.mrp)}</div>
                </div>
                <div className="text-xs text-muted-foreground mt-1.5">
                  Stock: <span className="font-mono text-foreground">{p.inventory_available}</span>
                  {p.inventory_reserved > 0 && <span className="text-muted-foreground/80"> (+{p.inventory_reserved} reserved)</span>}
                </div>
                <div className="grid grid-cols-3 gap-1 mt-3">
                  <Button data-testid={`edit-product-${p.id}`} onClick={() => onEdit(p)} variant="outline" size="sm" className="text-xs"><Pencil className="w-3 h-3" /></Button>
                  <Button data-testid={`restock-product-${p.id}`} onClick={() => onRestock(p)} variant="outline" size="sm" className="text-xs"><PackagePlus className="w-3 h-3" /></Button>
                  <Button data-testid={`delete-product-${p.id}`} onClick={() => onDelete(p.id)} variant="outline" size="sm" className="text-xs text-rose-300 hover:text-rose-200 hover:bg-rose-500/10"><Trash2 className="w-3 h-3" /></Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Samples Tab ----------
function SamplesTab({ samples, loading, search, setSearch, filterCat, setFilterCat, cats, onAdd }) {
  return (
    <div>
      <div className="flex gap-2 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/80" />
          <Input
            data-testid="samples-search-input"
            placeholder="Search samples"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-card border-border text-foreground"
          />
        </div>
        <select
          data-testid="samples-category-filter"
          value={filterCat}
          onChange={(e) => setFilterCat(e.target.value)}
          className="bg-card border border-border text-foreground rounded-md px-3 py-2 text-sm"
        >
          <option value="">All categories</option>
          {cats.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="py-20 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {samples.map((s) => (
            <div key={s.id} data-testid={`sample-card-${s.id}`} className="rounded-2xl border border-border bg-card/40 overflow-hidden hover:border-primary/40 transition-colors flex flex-col">
              <div className="aspect-square bg-background">
                {s.sample_image_url ? (
                  <img src={s.sample_image_url} alt={s.name} className="w-full h-full object-cover" loading="lazy"
                       onError={(e) => { e.target.style.display = 'none'; }} />
                ) : (
                  <div className="w-full h-full flex items-center justify-center"><Boxes className="w-12 h-12 text-muted-foreground/40" /></div>
                )}
              </div>
              <div className="p-3 flex-1 flex flex-col">
                <div className="text-[10px] uppercase tracking-widest font-bold text-primary flex items-center gap-1">
                  <Tag className="w-3 h-3" /> {s.category}
                </div>
                <h3 className="text-sm font-bold text-foreground mt-1 line-clamp-2">{s.name}</h3>
                <div className="text-xs text-muted-foreground/80">{s.brand_placeholder}{s.pack_size ? ` · ${s.pack_size}` : ''}</div>
                {s.description && <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{s.description}</p>}
                <div className="flex items-center justify-between mt-2">
                  <div className="text-xs text-muted-foreground">Suggested MRP</div>
                  <div className="text-sm font-bold text-primary">{fmt(s.suggested_mrp)}</div>
                </div>
                <Button
                  data-testid={`add-sample-${s.id}`}
                  onClick={() => onAdd(s)}
                  className="mt-3 w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs"
                >
                  <Plus className="w-3 h-3 mr-1" /> Add to catalog
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Editor Modal ----------
function EditorModal({ mode, form, setF, busy, onClose, onSave }) {
  return (
    <Modal title={mode === 'create' ? 'Add new product' : 'Edit product'} onClose={onClose} wide>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Name *" testid="editor-name">
          <Input value={form.name} onChange={(e) => setF('name', e.target.value)} placeholder="Sulfate-Free Shampoo" data-testid="editor-name-input" className="bg-background border-border text-foreground" />
        </Field>
        <Field label="Brand">
          <Input value={form.brand} onChange={(e) => setF('brand', e.target.value)} placeholder="Salon Pro" className="bg-background border-border text-foreground" />
        </Field>
        <Field label="Category *">
          <Input value={form.category} onChange={(e) => setF('category', e.target.value)} placeholder="haircare / tools / skincare …" data-testid="editor-category-input" className="bg-background border-border text-foreground" />
        </Field>
        <Field label="Sub-category">
          <Input value={form.sub_category} onChange={(e) => setF('sub_category', e.target.value)} placeholder="shampoo / scissors / mask" className="bg-background border-border text-foreground" />
        </Field>
        <Field label="Unit *">
          <select value={form.unit} onChange={(e) => setF('unit', e.target.value)} data-testid="editor-unit-select" className="w-full bg-background border border-border text-foreground rounded-md px-3 py-2 text-sm">
            {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </Field>
        <Field label="Pack size">
          <Input value={form.pack_size} onChange={(e) => setF('pack_size', e.target.value)} placeholder="500 ml / 1 unit" className="bg-background border-border text-foreground" />
        </Field>
        <Field label="MRP (₹) *">
          <Input type="number" min="1" value={form.mrp} onChange={(e) => setF('mrp', e.target.value)} data-testid="editor-mrp-input" className="bg-background border-border text-foreground" />
        </Field>
        <Field label="Selling price (₹) *">
          <Input type="number" min="1" value={form.selling_price} onChange={(e) => setF('selling_price', e.target.value)} data-testid="editor-selling-input" className="bg-background border-border text-foreground" />
        </Field>
        <Field label="GST %">
          <Input type="number" min="0" max="28" value={form.gst_percent} onChange={(e) => setF('gst_percent', e.target.value)} className="bg-background border-border text-foreground" />
        </Field>
        <Field label="HSN code">
          <Input value={form.hsn_code} onChange={(e) => setF('hsn_code', e.target.value)} placeholder="3305" className="bg-background border-border text-foreground font-mono" />
        </Field>
        <Field label="Available stock">
          <Input type="number" min="0" value={form.inventory_available} onChange={(e) => setF('inventory_available', e.target.value)} data-testid="editor-stock-input" className="bg-background border-border text-foreground" />
        </Field>
        <Field label="Low-stock threshold">
          <Input type="number" min="0" value={form.low_stock_threshold} onChange={(e) => setF('low_stock_threshold', e.target.value)} className="bg-background border-border text-foreground" />
        </Field>
        <Field label="Min order qty">
          <Input type="number" min="1" value={form.min_order_qty} onChange={(e) => setF('min_order_qty', e.target.value)} className="bg-background border-border text-foreground" />
        </Field>
        <Field label="Status">
          <button
            type="button"
            onClick={() => setF('is_active', !form.is_active)}
            data-testid="editor-active-toggle"
            className={`w-full px-3 py-2 rounded-md border text-xs font-bold uppercase tracking-widest text-left flex items-center gap-2 ${
              form.is_active ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300' : 'border-border bg-background text-muted-foreground'
            }`}
          >
            {form.is_active ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
            {form.is_active ? 'Active (Live)' : 'Draft (Hidden)'}
          </button>
        </Field>
      </div>
      <Field label="Image URL" className="mt-3">
        <Input
          value={form.images?.[0] || ''}
          onChange={(e) => setF('images', e.target.value ? [e.target.value] : [])}
          placeholder="https://…"
          className="bg-background border-border text-foreground"
        />
      </Field>
      <Field label="Description" className="mt-3">
        <textarea
          rows={2}
          value={form.description}
          onChange={(e) => setF('description', e.target.value)}
          placeholder="Short product description shown on marketplace"
          className="w-full bg-background border border-border text-foreground rounded-md px-3 py-2 text-sm"
        />
      </Field>

      <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-border">
        <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button onClick={onSave} disabled={busy} data-testid="editor-save-btn" className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold">
          {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {mode === 'create' ? 'Create product' : 'Save changes'}
        </Button>
      </div>
    </Modal>
  );
}

function Field({ label, children, className = '' }) {
  return (
    <div className={className}>
      <label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

// ---------- Modal shell ----------
function Modal({ title, children, onClose, wide }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full ${wide ? 'max-w-3xl' : 'max-w-md'} max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-background p-5 shadow-2xl`}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-foreground">{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground/80 hover:text-foreground hover:bg-muted" data-testid="modal-close-btn">
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}


/* ---------- Shipping & Tax card (Issue 4) ---------- */
function ShippingTaxCard({ authHeaders }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    shipping_charge: '',
    free_shipping_min_order_value: '',
    gst_pricing_mode: 'exclusive',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API}/supplier/me`, { headers: authHeaders });
      setForm({
        shipping_charge: r.data?.shipping_charge ?? 0,
        free_shipping_min_order_value: r.data?.free_shipping_min_order_value ?? 0,
        gst_pricing_mode: r.data?.gst_pricing_mode || 'exclusive',
      });
    } catch (_) {
      // silent — supplier probably not logged in yet
    } finally { setLoading(false); }
  }, [authHeaders]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        shipping_charge: Number(form.shipping_charge) || 0,
        free_shipping_min_order_value: Number(form.free_shipping_min_order_value) || 0,
        gst_pricing_mode: form.gst_pricing_mode || 'exclusive',
      };
      await axios.put(`${API}/supplier/me`, payload, { headers: authHeaders });
      toast.success('Shipping & tax settings saved');
    } catch (e) {
      const d = e?.response?.data?.detail;
      toast.error(typeof d === 'string' ? d : (d?.message || 'Could not save'));
    } finally { setSaving(false); }
  };

  return (
    <div className="bg-card/60 border border-border rounded-2xl p-5 mb-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-base font-bold text-foreground flex items-center gap-2">
            <IndianRupee className="w-4 h-4 text-primary" /> Shipping &amp; tax
          </h2>
          <p className="text-xs text-muted-foreground/80 mt-1">
            These apply to every order salons place from your catalog.
          </p>
        </div>
        {loading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="text-xs uppercase tracking-widest text-muted-foreground/80 font-bold">Shipping charge (₹)</label>
          <Input
            type="number" min={0}
            value={form.shipping_charge}
            onChange={(e) => setForm({ ...form, shipping_charge: e.target.value })}
            className="mt-1 bg-card border-border"
            placeholder="0"
          />
        </div>
        <div>
          <label className="text-xs uppercase tracking-widest text-muted-foreground/80 font-bold">Free shipping above (₹)</label>
          <Input
            type="number" min={0}
            value={form.free_shipping_min_order_value}
            onChange={(e) => setForm({ ...form, free_shipping_min_order_value: e.target.value })}
            className="mt-1 bg-card border-border"
            placeholder="e.g. 1500 (0 = never)"
          />
        </div>
        <div>
          <label className="text-xs uppercase tracking-widest text-muted-foreground/80 font-bold">GST pricing mode</label>
          <div className="mt-1 flex border border-border rounded-lg overflow-hidden text-xs font-bold">
            {['exclusive', 'inclusive'].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setForm({ ...form, gst_pricing_mode: m })}
                className={`flex-1 py-2 capitalize ${
                  form.gst_pricing_mode === m
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex justify-end mt-3">
        <Button size="sm" onClick={save} disabled={saving || loading}>
          {saving ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Check className="w-3 h-3 mr-1" />}
          Save
        </Button>
      </div>
    </div>
  );
}
