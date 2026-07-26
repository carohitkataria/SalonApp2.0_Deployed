/**
 * Phase 10 — Salon Store (browse + cart).
 *
 * Replaces the inquiry-only flow with a full Amazon-style storefront. Buyers
 * browse, filter, search and add products to a client-side cart (see
 * `CartContext`). Out-of-stock cards expose a "Notify me" CTA wired to
 * `POST /api/salon/store/notify-me`. Checkout itself is a separate page
 * (see CheckoutPage) that calls the reservation endpoint.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import {
  Loader2, Search, ShoppingBag, IndianRupee, Star, MapPin,
  ArrowLeft, Boxes, ChevronLeft, ChevronRight, X, BellRing, Plus, Minus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { useCart } from '@/contexts/CartContext';
import { extractErrorMessage } from '@/utils/apiError';
import CartDrawer from '@/components/store/CartDrawer';
import HomeV2Shell from '@/pages/salon/home_v2/HomeV2Shell';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const fmtMoney = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

const SORT_OPTIONS = [
  { value: 'popular',    label: 'Most popular' },
  { value: 'price_asc',  label: 'Price: low → high' },
  { value: 'price_desc', label: 'Price: high → low' },
  { value: 'newest',     label: 'Newest first' },
];

export default function MarketplacePage() {
  const navigate = useNavigate();
  const { addItem, openDrawer, summary, items } = useCart();

  // Salon meta (for shell topbar branding)
  const [salon, setSalon] = useState(null);
  const [salonId, setSalonId] = useState(null);

  const [products, setProducts] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);

  const [search, setSearch] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [category, setCategory] = useState('');
  const [brand, setBrand] = useState('');
  const [sort, setSort] = useState('popular');

  const [activeProduct, setActiveProduct] = useState(null);
  const [detailQty, setDetailQty] = useState(1);
  const [notifySent, setNotifySent] = useState({});

  const authHeaders = useMemo(() => {
    const raw = localStorage.getItem('salon_user_auth');
    let token = localStorage.getItem('salon_admin_token') || localStorage.getItem('access_token');
    if (!token && raw) {
      try { token = JSON.parse(raw).token; } catch (e) { console.debug('Bad salon_user_auth JSON:', e); }
    }
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, page_size: 24, sort };
      if (search) params.q = search;
      if (category) params.category = category;
      if (brand) params.brand = brand;
      const r = await axios.get(`${API}/salon/store/products`, { headers: authHeaders, params });
      setProducts(r.data.products || []);
      setTotal(r.data.total || 0);
      setTotalPages(r.data.total_pages || 1);
    } catch (e) {
      if (e?.response?.status === 401) {
        toast.error('Session expired. Please log in again.');
        navigate('/salon/login');
        return;
      }
      toast.error(extractErrorMessage(e, 'Failed to load store'));
    } finally { setLoading(false); }
  }, [authHeaders, page, search, category, brand, sort, navigate]);

  const fetchFilters = useCallback(async () => {
    try {
      const [c, b] = await Promise.all([
        axios.get(`${API}/salon/store/categories`, { headers: authHeaders }),
        axios.get(`${API}/salon/store/brands`,     { headers: authHeaders }),
      ]);
      setCategories(c.data.categories || []);
      setBrands(b.data.brands || []);
    } catch (e) { console.debug('Filter fetch failed (non-fatal):', e); }
  }, [authHeaders]);

  useEffect(() => { fetchFilters(); }, [fetchFilters]);
  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  // Load current salon (from auth) so the shell topbar shows the brand/branch chip.
  useEffect(() => {
    let sid = null;
    try {
      const raw = localStorage.getItem('salon_user_auth');
      if (raw) {
        const parsed = JSON.parse(raw);
        sid = parsed?.salon_id || parsed?.salonId || null;
      }
    } catch (e) { /* ignore parse */ }
    if (!sid) sid = localStorage.getItem('salon_admin_id');
    if (!sid) return;
    setSalonId(sid);
    (async () => {
      try {
        const r = await axios.get(`${API}/salons/${sid}`);
        setSalon(r.data);
      } catch (e) { /* non-fatal — shell falls back to "Your Salon" */ }
    })();
  }, []);

  const getAuthHeaders = () => authHeaders;

  const onSearch = (e) => { e?.preventDefault(); setSearch(searchDraft.trim()); setPage(1); };
  const onCategoryChange = (c) => { setCategory(c); setPage(1); };
  const onBrandChange = (b) => { setBrand(b); setPage(1); };
  const onSortChange = (s) => { setSort(s); setPage(1); };
  const clearFilters = () => { setCategory(''); setBrand(''); setSearch(''); setSearchDraft(''); setSort('popular'); setPage(1); };

  const openDetail = (p) => {
    setActiveProduct(p);
    setDetailQty(Math.max(1, Number(p?.min_order_qty || 1)));
  };
  const closeDetail = () => setActiveProduct(null);

  const handleAddToCart = (product, qty = 1) => {
    if (!product) return;
    const available = Number(product.inventory_available || 0);
    if (available <= 0) {
      toast.error('Out of stock');
      return;
    }
    if (qty > available) {
      toast.error(`Only ${available} in stock`);
      return;
    }
    addItem(product, qty);
    toast.success(`Added ${qty} × ${product.name} to cart`);
  };

  const handleNotifyMe = async (productId) => {
    try {
      await axios.post(`${API}/salon/store/notify-me`, { product_id: productId }, { headers: authHeaders });
      setNotifySent(prev => ({ ...prev, [productId]: true }));
      toast.success("We'll notify you when this is back in stock");
    } catch (e) {
      toast.error(extractErrorMessage(e, 'Could not subscribe'));
    }
  };

  return (
    <HomeV2Shell
      salon={salon}
      salonId={salonId}
      getAuthHeaders={getAuthHeaders}
      activeTab="marketplace"
    >
    <div className="min-h-screen bg-background text-foreground">
      <CartDrawer />

      {/* Header */}
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur border-b border-border">
        <div className="w-full px-3 sm:px-5 h-14 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)} data-testid="store-back-btn">
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          <div className="flex-1">
            <div className="text-sm font-bold leading-tight">Salon Store</div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground/80">Supplies & products</div>
          </div>
          <Button
            variant="default"
            size="sm"
            data-testid="store-cart-btn"
            onClick={openDrawer}
            className="relative"
          >
            <ShoppingBag className="w-4 h-4 mr-1" /> Cart
            {summary.itemCount > 0 && (
              <span data-testid="store-cart-count" className="ml-2 inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full bg-white text-primary text-[10px] font-bold">
                {summary.itemCount}
              </span>
            )}
          </Button>
        </div>

        {/* Search bar */}
        <div className="w-full px-3 sm:px-5 pb-3">
          <form onSubmit={onSearch} className="flex items-center gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                data-testid="store-search-input"
                placeholder="Search products, brands…"
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button type="submit" data-testid="store-search-btn">Search</Button>
          </form>
        </div>
      </header>

      <div className="w-full px-3 sm:px-5 py-6 grid grid-cols-12 gap-6">
        {/* Sidebar filters */}
        <aside className="col-span-12 lg:col-span-3 space-y-5">
          <FilterBlock label="Categories">
            <FilterPill active={!category} label="All" onClick={() => onCategoryChange('')} />
            {categories.map(c => (
              <FilterPill
                key={c.name}
                active={category === c.name}
                label={`${c.name} (${c.count})`}
                onClick={() => onCategoryChange(c.name)}
                testid={`store-filter-cat-${c.name}`}
              />
            ))}
          </FilterBlock>

          <FilterBlock label="Brands">
            <FilterPill active={!brand} label="All" onClick={() => onBrandChange('')} />
            {brands.slice(0, 24).map(b => (
              <FilterPill
                key={b.name}
                active={brand === b.name}
                label={`${b.name} (${b.count})`}
                onClick={() => onBrandChange(b.name)}
                testid={`store-filter-brand-${b.name}`}
              />
            ))}
          </FilterBlock>

          <Button variant="outline" size="sm" className="w-full" onClick={clearFilters} data-testid="store-clear-filters-btn">
            <X className="w-3.5 h-3.5 mr-1" /> Reset filters
          </Button>
        </aside>

        {/* Main results */}
        <main className="col-span-12 lg:col-span-9">
          <div className="flex items-center justify-between mb-4">
            <div className="text-xs text-muted-foreground">
              {loading ? 'Loading…' : `${total.toLocaleString()} products`}
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground">Sort:</label>
              <select
                data-testid="store-sort-select"
                value={sort}
                onChange={(e) => onSortChange(e.target.value)}
                className="text-xs bg-background border border-border rounded px-2 py-1.5"
              >
                {SORT_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin mr-2" /> Loading products…
            </div>
          ) : products.length === 0 ? (
            <div className="text-center py-16 border border-dashed border-border rounded-xl">
              <Boxes className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
              <div className="font-semibold mb-1">No products match your filters</div>
              <div className="text-xs text-muted-foreground mb-4">Try clearing them or searching differently.</div>
              <Button variant="outline" size="sm" onClick={clearFilters}>Reset filters</Button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
                {products.map(p => (
                  <ProductCard
                    key={p.id}
                    p={p}
                    onOpen={() => openDetail(p)}
                    onAdd={() => handleAddToCart(p, 1)}
                    onNotify={() => handleNotifyMe(p.id)}
                    notified={!!notifySent[p.id]}
                  />
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-8" data-testid="store-pagination">
                  <Button
                    variant="outline" size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    data-testid="store-page-prev"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <div className="text-xs text-muted-foreground">Page {page} / {totalPages}</div>
                  <Button
                    variant="outline" size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    data-testid="store-page-next"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* Detail modal */}
      {activeProduct && (
        <ProductDetailModal
          product={activeProduct}
          qty={detailQty}
          setQty={setDetailQty}
          onClose={closeDetail}
          onAdd={() => { handleAddToCart(activeProduct, detailQty); closeDetail(); }}
          onNotify={() => handleNotifyMe(activeProduct.id)}
          notified={!!notifySent[activeProduct.id]}
        />
      )}
    </div>
    </HomeV2Shell>
  );
}


function FilterBlock({ label, children }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground/80 mb-2">{label}</div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function FilterPill({ active, label, onClick, testid }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testid}
      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
        active
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-background text-foreground border-border hover:border-primary/50'
      }`}
    >
      {label}
    </button>
  );
}


function ProductCard({ p, onOpen, onAdd, onNotify, notified }) {
  const img = (p.images || [])[0];
  const oos = !(Number(p.inventory_available || 0) > 0);
  const supplier = p.supplier || {};
  return (
    <div className="group border border-border rounded-xl overflow-hidden bg-card hover:shadow-lg transition" data-testid={`store-product-card-${p.id}`}>
      <button type="button" onClick={onOpen} className="block w-full aspect-square bg-muted overflow-hidden">
        {img ? (
          <img src={img} alt={p.name} className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground"><Boxes className="w-8 h-8" /></div>
        )}
      </button>
      <div className="p-3 space-y-1.5">
        <div className="text-xs text-muted-foreground line-clamp-1">{p.brand || '\u00A0'}</div>
        <button type="button" onClick={onOpen} className="text-sm font-semibold leading-tight line-clamp-2 text-left hover:text-primary">
          {p.name}
        </button>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <MapPin className="w-3 h-3" />
          <span className="line-clamp-1">{supplier.business_name || 'Supplier'}</span>
          {supplier.rating_avg > 0 && (
            <span className="flex items-center gap-0.5 ml-auto">
              <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" /> {supplier.rating_avg.toFixed(1)}
            </span>
          )}
        </div>
        <div className="flex items-baseline gap-1.5">
          <div className="text-base font-extrabold flex items-center"><IndianRupee className="w-3.5 h-3.5" />{Number(p.selling_price).toLocaleString('en-IN')}</div>
          {Number(p.mrp) > Number(p.selling_price) && (
            <div className="text-xs line-through text-muted-foreground">{fmtMoney(p.mrp)}</div>
          )}
        </div>

        {oos ? (
          notified ? (
            <Button variant="outline" size="sm" className="w-full" disabled data-testid={`store-notify-done-${p.id}`}>
              <BellRing className="w-3.5 h-3.5 mr-1" /> We'll notify you
            </Button>
          ) : (
            <Button variant="outline" size="sm" className="w-full" onClick={onNotify} data-testid={`store-notify-btn-${p.id}`}>
              <BellRing className="w-3.5 h-3.5 mr-1" /> Notify me
            </Button>
          )
        ) : (
          <Button size="sm" className="w-full" onClick={onAdd} data-testid={`store-add-to-cart-${p.id}`}>
            <ShoppingBag className="w-3.5 h-3.5 mr-1" /> Add to cart
          </Button>
        )}
      </div>
    </div>
  );
}


function ProductDetailModal({ product, qty, setQty, onClose, onAdd, onNotify, notified }) {
  const img = (product.images || [])[0];
  const oos = !(Number(product.inventory_available || 0) > 0);
  const supplier = product.supplier || {};
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="grid grid-cols-1 md:grid-cols-2">
          <div className="aspect-square bg-muted">
            {img ? <img src={img} alt={product.name} className="w-full h-full object-cover" /> : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground"><Boxes className="w-12 h-12" /></div>
            )}
          </div>
          <div className="p-5 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-xs text-muted-foreground">{product.brand}</div>
                <div className="text-lg font-extrabold leading-tight">{product.name}</div>
              </div>
              <Button variant="ghost" size="sm" onClick={onClose} data-testid="store-detail-close-btn"><X className="w-4 h-4" /></Button>
            </div>
            <div className="text-xs text-muted-foreground">{product.description}</div>
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span className="px-2 py-0.5 rounded bg-muted">{product.category}</span>
              {product.pack_size && <span className="px-2 py-0.5 rounded bg-muted">{product.pack_size}</span>}
              <span className="px-2 py-0.5 rounded bg-muted">Per {product.unit}</span>
            </div>
            <div className="flex items-baseline gap-2">
              <div className="text-2xl font-extrabold flex items-center"><IndianRupee className="w-4 h-4" />{Number(product.selling_price).toLocaleString('en-IN')}</div>
              {Number(product.mrp) > Number(product.selling_price) && (
                <div className="text-sm line-through text-muted-foreground">{fmtMoney(product.mrp)}</div>
              )}
              {Number(product.gst_percent) > 0 && (
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">+ GST {product.gst_percent}%</div>
              )}
            </div>
            <div className="text-xs text-muted-foreground border-t border-border pt-2">
              <div className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {supplier.business_name || 'Supplier'}</div>
              {supplier.rating_count > 0 && (
                <div className="flex items-center gap-1">
                  <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" /> {supplier.rating_avg?.toFixed(1)} ({supplier.rating_count} reviews)
                </div>
              )}
            </div>

            {oos ? (
              notified ? (
                <Button variant="outline" className="w-full" disabled><BellRing className="w-4 h-4 mr-2" /> We'll notify you</Button>
              ) : (
                <Button variant="outline" className="w-full" onClick={onNotify} data-testid="store-detail-notify-btn">
                  <BellRing className="w-4 h-4 mr-2" /> Notify me when in stock
                </Button>
              )
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">Quantity</span>
                  <div className="flex items-center border border-border rounded-lg overflow-hidden">
                    <button
                      type="button"
                      className="px-2.5 py-1 text-muted-foreground hover:bg-muted disabled:opacity-50"
                      onClick={() => setQty(Math.max(1, qty - 1))}
                      disabled={qty <= 1}
                      data-testid="store-detail-qty-minus"
                    ><Minus className="w-3.5 h-3.5" /></button>
                    <input
                      data-testid="store-detail-qty-input"
                      type="number"
                      value={qty}
                      min={1}
                      max={Number(product.inventory_available || 1)}
                      onChange={(e) => setQty(Math.max(1, Math.min(Number(product.inventory_available || 1), Number(e.target.value) || 1)))}
                      className="w-14 text-center bg-transparent text-sm outline-none"
                    />
                    <button
                      type="button"
                      className="px-2.5 py-1 text-muted-foreground hover:bg-muted disabled:opacity-50"
                      onClick={() => setQty(Math.min(Number(product.inventory_available || 1), qty + 1))}
                      disabled={qty >= Number(product.inventory_available || 1)}
                      data-testid="store-detail-qty-plus"
                    ><Plus className="w-3.5 h-3.5" /></button>
                  </div>
                  <span className="text-xs text-muted-foreground">{product.inventory_available} available</span>
                </div>
                <Button className="w-full" onClick={onAdd} data-testid="store-detail-add-to-cart">
                  <ShoppingBag className="w-4 h-4 mr-2" /> Add to cart
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
