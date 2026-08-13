import React, { useState, useEffect, useMemo, useRef } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { injectZenCss, Icon, rupee } from './opsTheme';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;
const CATEGORIES = ['Services', 'Packages'];
const GENDERS = ['Men', 'Women', 'Unisex'];

/** Blank service template. */
const BLANK = {
  id: null,
  service_name: '',
  description: '',
  category: 'Services',
  sub_category: '',
  gender_tag: 'Unisex',
  default_duration: 30,
  base_price: 0,
  price_type: 'fixed',
  is_favorite: false,
  available_at_home: false,
  home_price: 0,
  thumbnail_url: '',
  images: [],
  gst_rate: null,
  hsn_code: '',
};

function fmtCompactINR(n) {
  const v = Number(n || 0);
  if (v >= 10000000) return '₹' + (v / 10000000).toFixed(2).replace(/\.00$/, '') + ' Cr';
  if (v >= 100000) return '₹' + (v / 100000).toFixed(2).replace(/\.00$/, '') + ' L';
  if (v >= 1000) return '₹' + (v / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return '₹' + v.toLocaleString('en-IN');
}

export default function ServicesModule({ salonId, getAuthHeaders }) {
  useEffect(() => { injectZenCss(); }, []);
  const [services, setServices] = useState([]);
  const [subs, setSubs] = useState({ Services: [], Packages: [] });
  const [cats, setCats] = useState([]); // WS4 — canonical categories from the endpoint
  const [selCat, setSelCat] = useState('Services');
  const [selSub, setSelSub] = useState(null); // null = all
  const [search, setSearch] = useState('');
  const [subFilter, setSubFilter] = useState('');   // filter chips in left rail
  const [openCats, setOpenCats] = useState({ Services: true, Packages: true });
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null); // service being edited
  const [addingSubFor, setAddingSubFor] = useState(null); // category being added-to
  const [newSubName, setNewSubName] = useState('');
  // Toolbar (right pane)
  const [genderTab, setGenderTab] = useState('all'); // all | Men | Women
  const [sortMode, setSortMode] = useState('default'); // default | price_asc | price_desc | bookings_desc

  // Upload drawer state
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [batches, setBatches] = useState([]);
  const [batchesLoading, setBatchesLoading] = useState(false);

  // Metrics
  const [overview, setOverview] = useState(null);
  const [metByServiceId, setMetByServiceId] = useState({});
  // Metrics detail drawer
  const [metricsFor, setMetricsFor] = useState(null); // service being viewed

  // Feb 2026 — bulk selection state (Set of service ids). Enables the
  // floating action bar for Delete / Enable / Disable across many services.
  const [bulkSelected, setBulkSelected] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const toggleBulk = (id) => setBulkSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const selectAllInList = (list) => setBulkSelected((prev) => {
    const next = new Set(prev);
    list.forEach((s) => next.add(s.id));
    return next;
  });
  const clearBulk = () => setBulkSelected(new Set());

  const authHeadersRef = useRef(getAuthHeaders);
  useEffect(() => { authHeadersRef.current = getAuthHeaders; }, [getAuthHeaders]);

  const fetchBatches = async () => {
    if (!salonId) return;
    setBatchesLoading(true);
    try {
      const res = await axios.get(
        `${API}/salons/${salonId}/services/upload-batches`,
        { headers: authHeadersRef.current() },
      );
      setBatches(Array.isArray(res.data?.batches) ? res.data.batches : []);
    } catch (_) { /* keep prior list */ }
    finally { setBatchesLoading(false); }
  };

  const openUploadDrawer = () => { setUploadOpen(true); fetchBatches(); };

  const handleUploadCsv = async (file) => {
    if (!file || !salonId) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await axios.post(
        `${API}/salons/${salonId}/services/upload-csv`,
        fd,
        { headers: { ...authHeadersRef.current(), 'Content-Type': 'multipart/form-data' } },
      );
      const added = res.data?.created ?? 0;
      const skipped = res.data?.skipped_duplicates ?? 0;
      const errs = Array.isArray(res.data?.errors) ? res.data.errors.length : 0;
      toast.success(`Uploaded — added ${added}${skipped ? `, skipped ${skipped}` : ''}${errs ? `, ${errs} error(s)` : ''}`);
      await Promise.all([load(), fetchBatches(), loadMetrics()]);
    } catch (err) {
      const msg = err?.response?.data?.detail || 'Upload failed';
      toast.error(typeof msg === 'string' ? msg : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleRollbackBatch = async (batchId) => {
    if (!salonId || !batchId) return;
    if (!window.confirm('Undo this upload? Services created by this batch will be removed.')) return;
    try {
      const res = await axios.delete(
        `${API}/salons/${salonId}/services/upload-batches/${batchId}`,
        { headers: authHeadersRef.current() },
      );
      const removed = res.data?.removed ?? 0;
      toast.success(`Rolled back — removed ${removed} service(s)`);
      await Promise.all([load(), fetchBatches(), loadMetrics()]);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Rollback failed');
    }
  };

  const downloadTemplateUrl = `${API}/services/upload-template.csv`;

  const load = async () => {
    if (!salonId) return;
    try {
      const [svc, sub] = await Promise.all([
        axios.get(`${API}/salons/${salonId}/services/all`, { headers: authHeadersRef.current() }),
        axios.get(`${API}/salons/${salonId}/services/subcategories`),
      ]);
      const raw = svc.data;
      const list = Array.isArray(raw) ? raw : (raw?.services || raw?.data || []);
      setServices(list);
      setSubs({
        Services: sub.data?.Services || [],
        Packages: sub.data?.Packages || [],
      });
      // WS4 — canonical category list (single source of truth, shared with customer + staff)
      try {
        const cr = await axios.get(`${API}/salons/${salonId}/categories?type=service`, { headers: authHeadersRef.current() });
        setCats(cr.data?.categories || []);
      } catch (_) { /* fall back to derived names */ }
    } catch (e) {
      console.error('load services', e);
      toast.error('Failed to load services');
    }
  };

  const loadMetrics = async () => {
    if (!salonId) return;
    try {
      const res = await axios.get(
        `${API}/salons/${salonId}/services/metrics-overview`,
        { headers: authHeadersRef.current() },
      );
      setOverview(res.data?.overview || null);
      const map = {};
      for (const r of (res.data?.per_service || [])) {
        map[r.service_id] = r;
      }
      setMetByServiceId(map);
    } catch (e) {
      // Metrics are best-effort; don't spam a toast on failure.
    }
  };

  useEffect(() => { load(); loadMetrics(); /* eslint-disable-line */ }, [salonId]);

  const filtered = useMemo(() => {
    // "Services" (default) is a catch-all: any service NOT explicitly tagged
    // as a "Packages" category belongs here. This preserves legacy rows
    // that used generic category names like "General".
    let list = services.filter((s) => {
      const c = s.category || 'Services';
      return selCat === 'Packages' ? c === 'Packages' : c !== 'Packages';
    });
    if (selSub) list = list.filter((s) => (s.sub_category || '') === selSub);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (s) => (s.service_name || '').toLowerCase().includes(q) ||
               (s.description || '').toLowerCase().includes(q) ||
               (s.sub_category || '').toLowerCase().includes(q)
      );
    }
    if (genderTab !== 'all') {
      list = list.filter((s) => {
        const t = (s.gender_tag || 'Unisex');
        return t === genderTab || t === 'Unisex';
      });
    }
    // Sort
    if (sortMode === 'price_asc') list = [...list].sort((a, b) => (a.base_price || 0) - (b.base_price || 0));
    else if (sortMode === 'price_desc') list = [...list].sort((a, b) => (b.base_price || 0) - (a.base_price || 0));
    else if (sortMode === 'bookings_desc') {
      list = [...list].sort((a, b) => (metByServiceId[b.id]?.bookings_30d || 0) - (metByServiceId[a.id]?.bookings_30d || 0));
    }
    return list;
  }, [services, selCat, selSub, search, genderTab, sortMode, metByServiceId]);

  const grouped = useMemo(() => {
    if (selSub) return { [selSub]: filtered };
    const g = {};
    for (const s of filtered) {
      const k = s.sub_category || 'General';
      g[k] = g[k] || [];
      g[k].push(s);
    }
    return g;
  }, [filtered, selSub]);

  const countInCat = (cat) => services.filter((s) => {
    const c = s.category || 'Services';
    return cat === 'Packages' ? c === 'Packages' : c !== 'Packages';
  }).length;
  const countInSub = (cat, sub) => services.filter((s) => {
    const c = s.category || 'Services';
    const inCat = cat === 'Packages' ? c === 'Packages' : c !== 'Packages';
    return inCat && (s.sub_category || '') === sub;
  }).length;

  const openNew = () => {
    const chosenCat = selCat || 'Services';
    const chosenSub = selSub || '';
    // If user is filtered to a sub-category, prefill BOTH category + sub-category
    // so it saves correctly on first click.
    setEditing({ ...BLANK, category: chosenCat, sub_category: chosenSub });
    setShowAdd(true);
  };
  const openEdit = (svc) => { setEditing({ ...BLANK, ...svc }); setShowAdd(true); };

  const saveSubcat = async (category) => {
    const name = newSubName.trim();
    if (!name) return;
    try {
      await axios.post(
        `${API}/salons/${salonId}/services/subcategories`,
        { category, name },
        { headers: authHeadersRef.current() }
      );
      setSubs((s) => ({ ...s, [category]: Array.from(new Set([...(s[category] || []), name])).sort() }));
      setNewSubName('');
      setAddingSubFor(null);
      toast.success(`Added "${name}"`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to add');
    }
  };

  const toggleFav = async (svc) => {
    try {
      await axios.put(
        `${API}/services/${svc.id}/favorite`,
        { is_favorite: !svc.is_favorite },
        { headers: authHeadersRef.current() }
      );
      setServices((s) => s.map((x) => (x.id === svc.id ? { ...x, is_favorite: !svc.is_favorite } : x)));
    } catch (e) {
      try {
        await axios.put(`${API}/services/${svc.id}/favorite?is_favorite=${!svc.is_favorite}`, null, { headers: authHeadersRef.current() });
        setServices((s) => s.map((x) => (x.id === svc.id ? { ...x, is_favorite: !svc.is_favorite } : x)));
      } catch (_) {
        toast.error('Could not update favourite');
      }
    }
  };

  const deleteSvc = async (svc) => {
    if (!window.confirm(`Delete "${svc.service_name}"?`)) return;
    try {
      await axios.delete(`${API}/services/${svc.id}`, { headers: authHeadersRef.current() });
      setServices((s) => s.filter((x) => x.id !== svc.id));
      loadMetrics();
      toast.success('Deleted');
    } catch (e) {
      toast.error('Failed to delete');
    }
  };

  // ---- Bulk actions ------------------------------------------------------
  const bulkDelete = async () => {
    const ids = Array.from(bulkSelected);
    if (!ids.length) return;
    if (!window.confirm(`Delete ${ids.length} service(s)? Salon-owned services are removed permanently; global services are hidden from your menu only.`)) return;
    setBulkBusy(true);
    try {
      await axios.post(`${API}/salons/${salonId}/services/bulk-delete`,
        { service_ids: ids }, { headers: authHeadersRef.current() });
      // Refetch to reflect hard-delete + global disable in one hit.
      const res = await axios.get(`${API}/salons/${salonId}/services/all`, { headers: authHeadersRef.current() });
      setServices(Array.isArray(res.data) ? res.data : (res.data?.services || []));
      loadMetrics();
      clearBulk();
      toast.success(`Removed ${ids.length} service(s)`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Bulk delete failed');
    } finally { setBulkBusy(false); }
  };
  const bulkSetEnabled = async (isEnabled) => {
    const ids = Array.from(bulkSelected);
    if (!ids.length) return;
    setBulkBusy(true);
    try {
      await axios.post(`${API}/salons/${salonId}/services/bulk-toggle`,
        { service_ids: ids, is_enabled: isEnabled }, { headers: authHeadersRef.current() });
      // Locally patch is_enabled so UI updates instantly.
      setServices((s) => s.map((x) => (bulkSelected.has(x.id) ? { ...x, is_enabled: isEnabled } : x)));
      clearBulk();
      toast.success(`${isEnabled ? 'Enabled' : 'Disabled'} ${ids.length} service(s)`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Bulk toggle failed');
    } finally { setBulkBusy(false); }
  };

  // ---- KPI cards ---------------------------------------------------------
  const kpi = overview || {
    total_menu: services.length,
    services_count: services.filter((s) => (s.category || 'Services') !== 'Packages').length,
    packages_count: services.filter((s) => (s.category || 'Services') === 'Packages').length,
    revenue_30d: 0, bookings_30d: 0, avg_rating: 0, total_reviews: 0,
    at_home_count: services.filter((s) => s.available_at_home).length,
    favorites_count: services.filter((s) => s.is_favorite).length,
  };

  // ---- Search box context label (e.g., "within Hair Colour") ------------
  const searchPlaceholder = selSub
    ? `Search within ${selSub}...`
    : `Search within ${selCat}...`;

  const filteredSubs = (subs[selCat] || []).filter((s) => (
    subFilter.trim() === '' || s.toLowerCase().includes(subFilter.trim().toLowerCase())
  ));

  return (
    <div className="zen">
      {/* Feb 2026 — Bulk action bar (appears when 1+ services are selected) */}
      {bulkSelected.size > 0 && (
        <div
          data-testid="services-bulk-bar"
          style={{
            position: 'sticky', top: 0, zIndex: 20,
            display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
            padding: '10px 14px', background: '#141C2E', color: '#fff',
            borderRadius: 12, margin: '0 auto 12px', maxWidth: 1200,
            boxShadow: '0 8px 30px rgba(20,28,46,.24)',
          }}
        >
          <span style={{ fontWeight: 800 }}>{bulkSelected.size} selected</span>
          <button
            className="z-btn z-btn--ghost z-btn--sm"
            style={{ background: 'rgba(255,255,255,.12)', border: 'none', color: '#fff' }}
            onClick={() => bulkSetEnabled(true)}
            disabled={bulkBusy}
            data-testid="services-bulk-enable"
          >
            Enable
          </button>
          <button
            className="z-btn z-btn--ghost z-btn--sm"
            style={{ background: 'rgba(255,255,255,.12)', border: 'none', color: '#fff' }}
            onClick={() => bulkSetEnabled(false)}
            disabled={bulkBusy}
            data-testid="services-bulk-disable"
          >
            Disable
          </button>
          <button
            className="z-btn z-btn--sm"
            style={{ background: '#E5484D', color: '#fff', border: 'none' }}
            onClick={bulkDelete}
            disabled={bulkBusy}
            data-testid="services-bulk-delete"
          >
            Delete
          </button>
          <button
            className="z-btn z-btn--ghost z-btn--sm"
            style={{ marginLeft: 'auto', background: 'transparent', border: '1px solid rgba(255,255,255,.3)', color: '#fff' }}
            onClick={clearBulk}
            data-testid="services-bulk-clear"
          >
            Clear
          </button>
        </div>
      )}
      <div className="z-wrap">
        {/* ================= Page head ================= */}
        <div className="z-phead">
          <div>
            <div className="eyebrow">Salon menu</div>
            <h1>Menu &amp; Services</h1>
          </div>
          <div className="z-actions">
            <button
              className="z-btn z-btn--ghost"
              onClick={openUploadDrawer}
              data-testid="services-upload-btn"
              title="Bulk-add services from a CSV file"
            >
              <Icon name="upload" /> Upload template
            </button>
            <button className="z-btn z-btn--pri" onClick={openNew} data-testid="services-new-btn">
              <Icon name="plus" /> New service
            </button>
          </div>
        </div>

        {/* ================= KPI Metrics row ================= */}
        <div className="z-metrics">
          <div className="z-metric g-blue">
            <div className="k"><Icon name="layers" size={12} /> Total Menu</div>
            <div className="v">{kpi.total_menu}</div>
            <div className="sub">{kpi.services_count} services · {kpi.packages_count} packages</div>
          </div>
          <div className="z-metric g-mint">
            <div className="k"><Icon name="chart" size={12} /> Revenue (30D)</div>
            <div className="v">{fmtCompactINR(kpi.revenue_30d)}</div>
            <div className="sub">across all bookings</div>
          </div>
          <div className="z-metric g-amber">
            <div className="k"><Icon name="star" size={12} /> Favourites</div>
            <div className="v">{kpi.favorites_count || 0}</div>
            <div className="sub">marked as favourite</div>
          </div>
          <div className="z-metric g-rose">
            <div className="k"><Icon name="home" size={12} /> At-Home</div>
            <div className="v">{kpi.at_home_count}</div>
            <div className="sub">services offered at home</div>
          </div>
        </div>

        <div className="z-split">
          {/* ============ Left rail — categories ============ */}
          <div className="z-cats z-card">
            <div className="z-cats-h">
              <div className="cats-lbl">Categories</div>
              <div className="z-cats-filter">
                <Icon name="search" />
                <input
                  placeholder="Filter sub-categories..."
                  value={subFilter}
                  onChange={(e) => setSubFilter(e.target.value)}
                  data-testid="filter-subcategories-input"
                />
              </div>
            </div>
            <div className="z-cat-list">
              {CATEGORIES.map((cat) => (
                <div key={cat}>
                  <div
                    className={`z-cat-row ${selCat === cat ? 'sel' : ''} ${openCats[cat] ? 'open' : ''}`}
                    onClick={() => {
                      setSelCat(cat); setSelSub(null);
                      setOpenCats((o) => ({ ...o, [cat]: !o[cat] || selCat !== cat }));
                    }}
                    data-testid={`cat-row-${cat.toLowerCase()}`}
                  >
                    <Icon name="chevR" className="chev" size={14} />
                    <div className="z-cat-ico"><Icon name={cat === 'Services' ? 'scissors' : 'gift'} /></div>
                    <div className="z-cat-name">{cat}</div>
                    <div className="z-cat-count">{countInCat(cat)}</div>
                  </div>
                  {openCats[cat] && (
                    <div className="z-subs">
                      <div
                        className={`z-sub-row ${selCat === cat && !selSub ? 'sel' : ''}`}
                        onClick={() => { setSelCat(cat); setSelSub(null); }}
                      >
                        All <span className="cnt">{countInCat(cat)}</span>
                      </div>
                      {filteredSubs.map((sub) => (
                        <div
                          key={sub}
                          className={`z-sub-row ${selCat === cat && selSub === sub ? 'sel' : ''}`}
                          onClick={() => { setSelCat(cat); setSelSub(sub); }}
                          data-testid={`sub-row-${sub.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                        >
                          {sub} <span className="cnt">{countInSub(cat, sub)}</span>
                        </div>
                      ))}
                      {(subs[cat] || []).length === 0 && !subFilter && (
                        <div style={{ fontSize: 11.5, color: 'var(--z-muted-2)', padding: '4px 10px' }}>
                          No sub-categories yet.
                        </div>
                      )}
                      {addingSubFor === cat ? (
                        <div className="z-sub-add-field">
                          <input
                            autoFocus
                            placeholder="Sub-category name..."
                            value={newSubName}
                            onChange={(e) => setNewSubName(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') saveSubcat(cat); if (e.key === 'Escape') { setAddingSubFor(null); setNewSubName(''); } }}
                          />
                          <button className="z-btn z-btn--pri z-btn--sm" onClick={() => saveSubcat(cat)}>
                            <Icon name="check" />
                          </button>
                        </div>
                      ) : (
                        <div className="z-sub-add" onClick={() => { setAddingSubFor(cat); setNewSubName(''); }}>
                          <Icon name="plus" /> New sub-category
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* ============ Right — services list ============ */}
          <div>
            {/* Sticky-style toolbar */}
            <div className="z-toolbar-2">
              <div className="z-search grow">
                <Icon name="search" />
                <input
                  placeholder={searchPlaceholder}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  data-testid="services-search-input"
                />
              </div>
              <div className="z-seg" role="tablist" aria-label="Filter by gender">
                {[
                  { id: 'all', label: 'All' },
                  { id: 'Men', label: 'Men' },
                  { id: 'Women', label: 'Women' },
                ].map((t) => (
                  <button
                    key={t.id}
                    className={genderTab === t.id ? 'on' : ''}
                    onClick={() => setGenderTab(t.id)}
                    data-testid={`gender-tab-${t.id.toLowerCase()}`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <select
                className="z-select"
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value)}
                data-testid="services-sort-select"
              >
                <option value="default">Sort: Default</option>
                <option value="price_asc">Price: Low → High</option>
                <option value="price_desc">Price: High → Low</option>
                <option value="bookings_desc">Most booked (30D)</option>
              </select>
            </div>

            {Object.keys(grouped).length === 0 ? (
              <div className="z-empty z-card">
                <Icon name="scissors" size={40} /><br />
                No services in this category yet.<br />
                <button className="z-btn z-btn--pri" style={{ marginTop: 12 }} onClick={openNew}>
                  <Icon name="plus" /> Add your first service
                </button>
              </div>
            ) : (
              Object.entries(grouped).map(([subName, list]) => (
                <div key={subName}>
                  <div className="z-group-h">
                    <h3>{subName}</h3>
                    <span className="cnt">{list.length} service{list.length === 1 ? '' : 's'}</span>
                    <button
                      className="z-btn z-btn--ghost z-btn--sm"
                      style={{ marginLeft: 'auto' }}
                      onClick={() => selectAllInList(list)}
                      data-testid={`bulk-select-group-${subName}`}
                    >
                      Select all
                    </button>
                  </div>
                  <div className="z-svc-grid">
                    {list.map((svc) => (
                      <ServiceCard
                        key={svc.id}
                        svc={svc}
                        metrics={metByServiceId[svc.id] || null}
                        onEdit={(e) => { e.stopPropagation(); openEdit(svc); }}
                        onDelete={(e) => { e.stopPropagation(); deleteSvc(svc); }}
                        onToggleFav={(e) => { e.stopPropagation(); toggleFav(svc); }}
                        onClick={() => setMetricsFor(svc)}
                        bulkChecked={bulkSelected.has(svc.id)}
                        onToggleBulk={(e) => { e.stopPropagation(); toggleBulk(svc.id); }}
                      />
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Add / Edit drawer */}
      {showAdd && (
        <ServiceDrawer
          initial={editing}
          salonId={salonId}
          getAuthHeaders={authHeadersRef.current}
          subs={subs[editing?.category] || []}
          allServices={services}
          onSubCategoryCreate={(name) => saveSubcatForDrawer(editing?.category, name)}
          onClose={() => { setShowAdd(false); setEditing(null); }}
          onSaved={(saved, isNew) => {
            setServices((s) => {
              if (isNew) return [saved, ...s];
              return s.map((x) => (x.id === saved.id ? { ...x, ...saved } : x));
            });
            setShowAdd(false);
            setEditing(null);
            loadMetrics();
            toast.success(isNew ? 'Service added' : 'Service updated');
          }}
        />
      )}

      {/* Upload drawer — sample + upload + history w/ rollback */}
      <UploadServicesDrawer
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        uploading={uploading}
        onFilePicked={handleUploadCsv}
        templateHref={downloadTemplateUrl}
        batches={batches}
        loading={batchesLoading}
        onRollback={handleRollbackBatch}
      />

      {/* Service metrics detail drawer */}
      {metricsFor && (
        <ServiceMetricsDrawer
          salonId={salonId}
          getAuthHeaders={authHeadersRef.current}
          svc={metricsFor}
          summaryMetrics={metByServiceId[metricsFor.id] || null}
          onEdit={() => { openEdit(metricsFor); setMetricsFor(null); }}
          onClose={() => setMetricsFor(null)}
        />
      )}
    </div>
  );

  async function saveSubcatForDrawer(category, name) {
    if (!name) return null;
    try {
      await axios.post(
        `${API}/salons/${salonId}/services/subcategories`,
        { category, name },
        { headers: authHeadersRef.current() }
      );
      setSubs((s) => ({ ...s, [category]: Array.from(new Set([...(s[category] || []), name])).sort() }));
      return name;
    } catch (e) {
      toast.error('Failed to add sub-category');
      return null;
    }
  }
}

function TrendPill({ pct }) {
  if (pct == null || Number.isNaN(pct)) return <span className="tr flat">—</span>;
  const p = Number(pct);
  if (Math.abs(p) < 0.05) return <span className="tr flat">0%</span>;
  const up = p > 0;
  return (
    <span className={`tr ${up ? '' : 'dn'}`}>
      <Icon name={up ? 'trendUp' : 'trendDn'} size={11} /> {up ? '+' : ''}{p}%
    </span>
  );
}

function ServiceCard({ svc, metrics, onEdit, onDelete, onToggleFav, onClick, bulkChecked, onToggleBulk }) {
  const emoji = (svc.category === 'Packages') ? '🎁' : '✂️';
  return (
    <div className={`z-svc-card ${bulkChecked ? 'z-svc-card--picked' : ''}`} onClick={onClick} data-testid={`service-card-${svc.id}`}>
      {/* Bulk-select checkbox (Feb 2026) */}
      <label
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute', top: 10, left: 10, zIndex: 3,
          background: 'rgba(255,255,255,.92)', borderRadius: 6, padding: 3,
          border: '1px solid var(--z-line, #E6EBF4)',
          display: 'inline-flex', alignItems: 'center', cursor: 'pointer',
        }}
        data-testid={`svc-bulk-checkbox-label-${svc.id}`}
      >
        <input
          type="checkbox"
          checked={!!bulkChecked}
          onChange={onToggleBulk}
          data-testid={`svc-bulk-checkbox-${svc.id}`}
          style={{ margin: 0, cursor: 'pointer', width: 15, height: 15 }}
        />
      </label>
      <div className="z-svc-main">
        <div className="z-svc-thumb">
          {svc.thumbnail_url ? <img src={svc.thumbnail_url} alt="" /> : <span>{emoji}</span>}
        </div>
        <div className="z-svc-body">
          <div className="z-svc-title">
            <h4>{svc.service_name}</h4>
            <div className="z-svc-price">
              {rupee(svc.base_price)}
              {svc.price_type === 'onwards' && <span className="onwards">ONWARDS</span>}
            </div>
          </div>
          {svc.description && <p className="z-svc-desc">{svc.description}</p>}
          <div className="z-svc-tags">
            <span className="z-pill z-pill--blue">{svc.gender_tag || 'Unisex'}</span>
            <span className="z-pill"><Icon name="clock" size={12} /> {svc.default_duration || 30} min</span>
            {svc.sub_category && <span className="z-pill">{svc.sub_category}</span>}
            {svc.available_at_home && <span className="z-pill z-pill--ok">At-home</span>}
          </div>
        </div>
      </div>

      {/* Metrics strip */}
      <div className="z-svc-mets">
        <div className="z-svc-met">
          <div className="k">Bookings 30D</div>
          <div className="v">{metrics?.bookings_30d ?? 0}</div>
        </div>
        <div className="z-svc-met">
          <div className="k">Revenue</div>
          <div className="v">{fmtCompactINR(metrics?.revenue_30d || 0)}</div>
        </div>
        <div className="z-svc-met">
          <div className="k">Trend</div>
          <div className="v" style={{ fontFamily: 'inherit', fontSize: 12 }}>
            <TrendPill pct={metrics?.trend_pct} />
          </div>
        </div>
      </div>

      <div className="z-svc-actions">
        <button className={`z-link fav ${svc.is_favorite ? 'on' : ''}`} onClick={onToggleFav}>
          <Icon name="star" /> {svc.is_favorite ? 'Favourited' : 'Favourite'}
        </button>
        <div className="sp" />
        <button className="z-link" onClick={onEdit}><Icon name="edit" /> Edit</button>
        <button className="z-link danger" onClick={onDelete}><Icon name="trash" /> Remove</button>
      </div>
    </div>
  );
}

function ServiceDrawer({ initial, salonId, getAuthHeaders, subs, allServices, onSubCategoryCreate, onClose, onSaved }) {
  // IMPORTANT: keep drawer's sub_category coherent with its category.
  // - If parent passes `initial.sub_category` that doesn't belong to the current
  //   category's subs list, allow the "New sub-category" flow to add it.
  const [form, setForm] = useState(initial);
  const [subsForCat, setSubsForCat] = useState(subs);
  const fileRef = useRef(null);
  const [saving, setSaving] = useState(false);
  const isEdit = !!initial?.id;
  const isPackage = (form.category || 'Services') === 'Packages';

  // ---- Package composition state ----
  const [linkedIds, setLinkedIds] = useState(Array.isArray(initial?.linked_service_ids) ? initial.linked_service_ids : []);
  const [pkgSearch, setPkgSearch] = useState('');
  const [pricingMode, setPricingMode] = useState(
    initial?.discount_percentage && Number(initial.discount_percentage) > 0 ? 'discount' : 'manual'
  );
  const [discountPct, setDiscountPct] = useState(Number(initial?.discount_percentage || 0));
  const [manualFinal, setManualFinal] = useState(Number(initial?.base_price || 0));

  useEffect(() => { setSubsForCat(subs); }, [subs]);

  // Auto-compute subtotal + final for packages
  const eligibleServices = useMemo(() => (allServices || []).filter((s) => (s.category || 'Services') !== 'Packages'), [allServices]);
  const linkedSet = useMemo(() => new Set(linkedIds), [linkedIds]);
  const subtotal = useMemo(() => {
    return eligibleServices.reduce((acc, s) => linkedSet.has(s.id) ? acc + Number(s.base_price || 0) : acc, 0);
  }, [eligibleServices, linkedSet]);
  const computedFinal = useMemo(() => {
    if (!isPackage) return Number(form.base_price || 0);
    if (pricingMode === 'discount') {
      const pct = Math.max(0, Math.min(100, Number(discountPct || 0)));
      return Math.round(subtotal * (1 - pct / 100));
    }
    return Number(manualFinal || 0);
  }, [isPackage, pricingMode, discountPct, subtotal, manualFinal, form.base_price]);
  const impliedDiscountPct = subtotal > 0 ? Math.max(0, ((subtotal - computedFinal) / subtotal) * 100) : 0;

  const toggleLinked = (svcId) => {
    setLinkedIds((prev) => prev.includes(svcId) ? prev.filter((x) => x !== svcId) : [...prev, svcId]);
  };

  const upd = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const onPickImage = () => fileRef.current?.click();
  const onFileSelected = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) { toast.error('Image must be under 3 MB'); return; }
    const reader = new FileReader();
    reader.onload = () => upd('thumbnail_url', reader.result);
    reader.readAsDataURL(file);
  };

  const handleAddSub = async () => {
    const name = window.prompt('Sub-category name:');
    if (!name) return;
    const trimmed = name.trim();
    const added = await onSubCategoryCreate(trimmed);
    if (added) {
      // Keep drawer's local subs list in sync so the just-added option shows up.
      setSubsForCat((arr) => Array.from(new Set([...(arr || []), trimmed])).sort());
      upd('sub_category', trimmed);
    }
  };

  const save = async () => {
    if (!form.service_name.trim()) return toast.error(isPackage ? 'Package name required' : 'Service name required');
    if (isPackage && linkedIds.length === 0) {
      return toast.error('Add at least one service to the package');
    }
    setSaving(true);
    try {
      const cleanSub = (form.sub_category || '').trim();
      // For packages: base_price = final computed (discount OR manual)
      // Duration = sum of linked service durations (approx).
      let effectivePrice = parseFloat(form.base_price || 0);
      let effectiveDuration = parseInt(form.default_duration || 30, 10);
      if (isPackage) {
        effectivePrice = Math.max(0, Number(computedFinal || 0));
        const totalMins = eligibleServices.reduce((acc, s) => linkedSet.has(s.id) ? acc + Number(s.default_duration || 30) : acc, 0);
        effectiveDuration = totalMins || effectiveDuration;
      }
      const payload = {
        service_name: form.service_name.trim(),
        description: form.description || '',
        category: form.category,
        sub_category: cleanSub || null,
        gender_tag: form.gender_tag,
        default_duration: effectiveDuration,
        base_price: effectivePrice,
        price_type: form.price_type || 'fixed',
        is_favorite: !!form.is_favorite,
        available_at_home: !!form.available_at_home,
        home_price: form.available_at_home ? parseFloat(form.home_price || 0) : null,
        thumbnail_url: form.thumbnail_url || null,
        images: form.images || [],
        gst_rate: (form.gst_rate === '' || form.gst_rate === null || form.gst_rate === undefined) ? null : parseFloat(form.gst_rate),
        hsn_code: (form.hsn_code || '').trim() || null,
      };
      if (isPackage) {
        payload.linked_service_ids = linkedIds;
        payload.services_subtotal = Math.round(subtotal * 100) / 100;
        payload.discount_percentage = pricingMode === 'discount'
          ? Math.max(0, Math.min(100, Number(discountPct || 0)))
          : Math.round(impliedDiscountPct * 100) / 100;
      }
      let saved;
      if (isEdit) {
        const res = await axios.put(`${API}/services/${form.id}`, payload, { headers: getAuthHeaders() });
        saved = res.data;
      } else {
        const res = await axios.post(`${API}/services`, payload, { headers: getAuthHeaders() });
        saved = res.data;
        // Also enable for salon (idempotent).
        try {
          await axios.put(
            `${API}/salons/${salonId}/services/${saved.id}/toggle?is_enabled=true`,
            null,
            { headers: getAuthHeaders() }
          );
        } catch (_) { /* non-fatal */ }
      }
      // Merge back sub_category from our payload so the parent's `saved` shows
      // the sub-category immediately even if the backend response omitted it
      // (defensive; the backend does persist + return it).
      saved = { ...saved, sub_category: payload.sub_category, linked_service_ids: payload.linked_service_ids, discount_percentage: payload.discount_percentage };
      onSaved(saved, !isEdit);
    } catch (e) {
      console.error(e);
      toast.error(e?.response?.data?.detail || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="z-overlay" onClick={onClose} />
      <aside className="z-drawer">
        <div className="z-drawer-h">
          <div className="dico"><Icon name={form.category === 'Packages' ? 'gift' : 'scissors'} size={20} /></div>
          <div>
            <div className="eyebrow">{isEdit ? 'Edit' : 'New'}</div>
            <h3>{isEdit ? (isPackage ? 'Edit Package' : 'Edit Service') : (isPackage ? 'Add Package' : 'Add Service')}</h3>
            <p>{isPackage ? 'Bundle multiple services, apply a discount and set the final price.' : 'Configure name, price, duration and availability.'}</p>
          </div>
          <button className="z-drawer-close" onClick={onClose}><Icon name="x" /></button>
        </div>

        <div className="z-drawer-body">
          {/* Photo */}
          <div className="z-field">
            <label>Photo</label>
            {form.thumbnail_url ? (
              <div className="z-photo-preview">
                <div className="pv"><img src={form.thumbnail_url} alt="" /></div>
                <div style={{ flex: 1, fontSize: 12, color: 'var(--z-muted)' }}>
                  Photo attached
                </div>
                <button className="z-btn z-btn--ghost z-btn--sm" onClick={() => upd('thumbnail_url', '')}>Remove</button>
                <button className="z-btn z-btn--soft z-btn--sm" onClick={onPickImage}>Change</button>
              </div>
            ) : (
              <div className="z-photo-up" onClick={onPickImage}>
                <Icon name="camera" size={24} /><div style={{ fontWeight: 700, marginTop: 4 }}>Upload a photo</div>
                <div style={{ fontSize: 11.5, color: 'var(--z-muted-2)', marginTop: 2 }}>PNG or JPG, up to 3&nbsp;MB</div>
              </div>
            )}
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onFileSelected} />
          </div>

          <div className="z-field">
            <label>{isPackage ? 'Package name' : 'Service name'}</label>
            <input value={form.service_name} onChange={(e) => upd('service_name', e.target.value)} placeholder={isPackage ? "e.g., Bridal Prep Bundle" : "e.g., Men's Haircut"} />
          </div>

          <div className="z-field">
            <label>Description</label>
            <textarea value={form.description} onChange={(e) => upd('description', e.target.value)} placeholder="Short description..." />
          </div>

          <div className="z-grid2">
            <div className="z-field">
              <label>Category</label>
              <select
                value={form.category}
                onChange={(e) => {
                  // BUG FIX: when the category is switched, clear the stale
                  // sub_category so the sub-category dropdown reflects the new
                  // category's list and doesn't silently drop a mismatched
                  // sub-category on the save call.
                  const nextCat = e.target.value;
                  upd('category', nextCat);
                  upd('sub_category', '');
                }}
              >
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="z-field">
              <label>Sub-category</label>
              <select
                value={form.sub_category || ''}
                onChange={(e) => {
                  if (e.target.value === '__new__') handleAddSub();
                  else upd('sub_category', e.target.value);
                }}
              >
                <option value="">— none —</option>
                {(subsForCat || []).map((s) => <option key={s} value={s}>{s}</option>)}
                {/* If the pre-filled sub_category isn't in subs (e.g., legacy or newly
                    added), still render it so it's kept + editable. */}
                {form.sub_category && !((subsForCat || []).includes(form.sub_category)) && (
                  <option value={form.sub_category}>{form.sub_category}</option>
                )}
                <option value="__new__">+ New sub-category…</option>
              </select>
            </div>
          </div>

          {/* --- Package composition (only for Packages category) --- */}
          {isPackage && (
            <div className="z-field" style={{ background: 'var(--z-primary-050, #FDF4FF)', border: '1px solid var(--z-primary, #C6389E)', borderRadius: 12, padding: 14, marginTop: 4 }}>
              <label style={{ fontWeight: 700, color: 'var(--z-primary, #C6389E)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon name="gift" /> Services included in this package
              </label>
              <div style={{ fontSize: 11.5, color: 'var(--z-muted-2)', margin: '4px 0 10px' }}>
                Tick every service that will be delivered as part of this package. The subtotal below auto-sums their prices.
              </div>
              <input
                type="text"
                placeholder="Search services…"
                value={pkgSearch}
                onChange={(e) => setPkgSearch(e.target.value)}
                style={{ marginBottom: 8, width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--z-line, #E5DDE7)' }}
                data-testid="pkg-svc-search"
              />
              <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid var(--z-line, #E5DDE7)', borderRadius: 8, background: '#fff' }} data-testid="pkg-svc-list">
                {eligibleServices.length === 0 && (
                  <div style={{ padding: 12, fontSize: 12, color: 'var(--z-muted-2)' }}>No services yet. Create services first.</div>
                )}
                {eligibleServices
                  .filter((s) => !pkgSearch || (s.service_name || '').toLowerCase().includes(pkgSearch.toLowerCase()))
                  .map((s) => {
                    const on = linkedSet.has(s.id);
                    return (
                      <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderBottom: '1px solid #F4EEF6', cursor: 'pointer' }}>
                        <input type="checkbox" checked={on} onChange={() => toggleLinked(s.id)} data-testid={`pkg-svc-check-${s.id}`} />
                        <div style={{ flex: 1, fontSize: 12.5 }}>
                          <b>{s.service_name || s.name}</b>
                          <span style={{ color: 'var(--z-muted-2)', marginLeft: 8, fontSize: 11 }}>
                            {s.default_duration || 30} min · {s.category || 'Services'}
                            {s.sub_category ? ` · ${s.sub_category}` : ''}
                          </span>
                        </div>
                        <div style={{ fontWeight: 700, fontSize: 12.5 }}>{rupee(Number(s.base_price || 0))}</div>
                      </label>
                    );
                  })}
              </div>

              {/* Subtotal + discount + final */}
              <div style={{ marginTop: 12, padding: 10, background: '#fff', borderRadius: 8, border: '1px solid var(--z-line, #E5DDE7)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 13 }}>
                  <span style={{ color: 'var(--z-muted, #6B5E71)' }}>Sum of services ({linkedIds.length})</span>
                  <span style={{ fontWeight: 700 }} data-testid="pkg-subtotal">{rupee(subtotal)}</span>
                </div>

                <div style={{ display: 'flex', gap: 12, alignItems: 'center', margin: '8px 0' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                    <input type="radio" name="pkg-mode" checked={pricingMode === 'discount'} onChange={() => setPricingMode('discount')} data-testid="pkg-mode-discount" />
                    Apply discount %
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                    <input type="radio" name="pkg-mode" checked={pricingMode === 'manual'} onChange={() => setPricingMode('manual')} data-testid="pkg-mode-manual" />
                    Set final amount
                  </label>
                </div>

                {pricingMode === 'discount' && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 13, alignItems: 'center' }}>
                    <span style={{ color: 'var(--z-muted, #6B5E71)' }}>Discount</span>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <input
                        type="number"
                        min="0" max="100" step="0.1"
                        value={discountPct}
                        onChange={(e) => setDiscountPct(parseFloat(e.target.value) || 0)}
                        style={{ width: 80, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--z-line, #E5DDE7)', textAlign: 'right' }}
                        data-testid="pkg-discount-pct"
                      />
                      <span style={{ fontWeight: 700 }}>%</span>
                    </div>
                  </div>
                )}

                {pricingMode === 'manual' && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 13, alignItems: 'center' }}>
                    <span style={{ color: 'var(--z-muted, #6B5E71)' }}>Final price (₹)</span>
                    <input
                      type="number"
                      min="0"
                      value={manualFinal}
                      onChange={(e) => setManualFinal(parseFloat(e.target.value) || 0)}
                      style={{ width: 120, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--z-line, #E5DDE7)', textAlign: 'right', fontWeight: 700 }}
                      data-testid="pkg-manual-final"
                    />
                  </div>
                )}

                {subtotal > 0 && computedFinal < subtotal && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 12, color: 'var(--z-green, #12A594)' }}>
                    <span>You save</span>
                    <span style={{ fontWeight: 700 }}>{rupee(subtotal - computedFinal)} ({impliedDiscountPct.toFixed(1)}%)</span>
                  </div>
                )}

                <hr style={{ margin: '8px 0', border: 'none', borderTop: '1px dashed var(--z-line, #E5DDE7)' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 15, alignItems: 'center' }}>
                  <span style={{ fontWeight: 700 }}>Package price</span>
                  <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--z-primary, #C6389E)' }} data-testid="pkg-final">{rupee(computedFinal)}</span>
                </div>
              </div>
            </div>
          )}

          <div className="z-grid2">
            <div className="z-field">
              <label>Gender</label>
              <select value={form.gender_tag} onChange={(e) => upd('gender_tag', e.target.value)}>
                {GENDERS.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div className="z-field">
              <label>{isPackage ? 'Duration (auto)' : 'Duration (mins)'}</label>
              <input type="number" min="0" value={isPackage ? (eligibleServices.reduce((a, s) => linkedSet.has(s.id) ? a + Number(s.default_duration || 30) : a, 0) || form.default_duration) : form.default_duration} onChange={(e) => upd('default_duration', e.target.value)} disabled={isPackage} />
            </div>
          </div>

          {!isPackage && (
          <div className="z-grid2">
            <div className="z-field">
              <label>Base price (₹)</label>
              <input type="number" min="0" value={form.base_price} onChange={(e) => upd('base_price', e.target.value)} />
            </div>
            <div className="z-field">
              <label>Price type</label>
              <select value={form.price_type} onChange={(e) => upd('price_type', e.target.value)}>
                <option value="fixed">Fixed</option>
                <option value="onwards">Onwards</option>
              </select>
            </div>
          </div>
          )}

          {/* Tax fields — only relevant when the salon is GST registered.
              Kept optional; empty => the salon-default rate is applied. */}
          <div className="z-grid2">
            <div className="z-field">
              <label>GST rate (%) <span style={{ fontWeight: 400, color: 'var(--z-muted-2)' }}>optional · overrides salon default</span></label>
              <input
                type="number" min="0" max="100" step="0.1"
                value={form.gst_rate ?? ''}
                onChange={(e) => upd('gst_rate', e.target.value === '' ? null : parseFloat(e.target.value))}
                placeholder="e.g., 9 (each half of CGST/SGST)"
                data-testid="svc-gst-rate"
              />
            </div>
            <div className="z-field">
              <label>HSN / SAC code <span style={{ fontWeight: 400, color: 'var(--z-muted-2)' }}>optional</span></label>
              <input value={form.hsn_code || ''} onChange={(e) => upd('hsn_code', e.target.value)} placeholder="e.g., 999721" data-testid="svc-hsn-code" />
            </div>
          </div>

          <div className="z-field">
            <div className="z-togrow" onClick={() => upd('is_favorite', !form.is_favorite)}>
              <button className={`z-toggle ${form.is_favorite ? 'on' : ''}`} />
              <span>Mark as favourite</span>
            </div>
            <div className="z-togrow" onClick={() => upd('available_at_home', !form.available_at_home)}>
              <button className={`z-toggle ${form.available_at_home ? 'on' : ''}`} />
              <span>Available at home</span>
            </div>
          </div>

          {form.available_at_home && (
            <div className="z-field">
              <label>Home price (₹)</label>
              <input type="number" min="0" value={form.home_price} onChange={(e) => upd('home_price', e.target.value)} />
            </div>
          )}
        </div>

        <div className="z-drawer-foot" style={{ display: 'flex', gap: 10 }}>
          <button className="z-btn z-btn--ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
          <button className="z-btn z-btn--pri" style={{ flex: 2 }} onClick={save} disabled={saving}>
            <Icon name="save" /> {saving ? 'Saving…' : (isEdit ? 'Save changes' : (isPackage ? 'Create package' : 'Create service'))}
          </button>
        </div>
      </aside>
    </>
  );
}

// -----------------------------------------------------------------------------
// UploadServicesDrawer — dropzone + sample template + upload history + rollback
// -----------------------------------------------------------------------------
function UploadServicesDrawer({ open, onClose, uploading, onFilePicked, templateHref, batches, loading, onRollback }) {
  const fileRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  if (!open) return null;

  const pickFile = () => fileRef.current?.click();
  const onFile = (e) => {
    const file = e.target?.files?.[0];
    e.target.value = '';
    if (file) onFilePicked(file);
  };
  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) onFilePicked(file);
  };

  return (
    <>
      <div className="z-overlay" onClick={onClose} />
      <aside className="z-drawer wide" data-testid="upload-services-drawer">
        <div className="z-drawer-h">
          <div className="dico"><Icon name="upload" size={20} /></div>
          <div>
            <div className="eyebrow">Bulk add</div>
            <h3>Upload Services</h3>
            <p>Fill our CSV template so it works first-try — no column guessing.</p>
          </div>
          <button className="z-drawer-close" onClick={onClose}><Icon name="x" /></button>
        </div>

        <div className="z-drawer-body">
          {/* Template + rules */}
          <div className="z-up-card">
            <h4>1. Download the sample template</h4>
            <p>Only <code>service_name</code> is required. Duplicates (by name) are skipped automatically — existing services are never overwritten.</p>
            <a href={templateHref} download="services-upload-template.csv" className="z-btn z-btn--ghost" data-testid="download-services-template-btn">
              <Icon name="download" /> Download CSV template
            </a>
          </div>

          {/* Dropzone */}
          <div className="z-up-card">
            <h4>2. Upload your file</h4>
            <p>Supported: .csv, .xlsx, .xls · up to 5 MB. Every row is <b>added</b> — nothing is replaced.</p>
            <div
              className="z-drop"
              onClick={pickFile}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              style={dragOver ? { background: 'var(--z-primary-050)', borderColor: 'var(--z-primary)' } : undefined}
              data-testid="upload-dropzone"
            >
              <Icon name="upload" size={26} />
              <div style={{ marginTop: 6 }}>{uploading ? 'Uploading…' : (<span>Drag & drop, or <b>browse</b> to select a file</span>)}</div>
              <div style={{ fontSize: 11, marginTop: 4, color: 'var(--z-muted-2)' }}>Columns: service_name, description, category, sub_category, gender_tag, default_duration, base_price, price_type, is_favorite, available_at_home, thumbnail_url, images</div>
            </div>
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,text/csv" style={{ display: 'none' }} onChange={onFile} />
          </div>

          {/* History w/ rollback */}
          <div className="z-up-card">
            <h4>Recent uploads</h4>
            <p>Made a mistake? Roll back any batch to remove the services it created (existing services are untouched).</p>
            {loading ? (
              <div style={{ fontSize: 12, color: 'var(--z-muted)' }}>Loading history…</div>
            ) : (batches || []).length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--z-muted)' }}>No uploads yet.</div>
            ) : (
              <div>
                {batches.map((b) => {
                  const rolled = b.status === 'rolled_back';
                  const when = b.uploaded_at ? new Date(b.uploaded_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
                  return (
                    <div key={b.id} className="z-hist-row" data-testid={`upload-batch-${b.id}`}>
                      <div>
                        <div className="nm">
                          {b.filename || 'services.csv'}
                          <span className={`badge ${rolled ? 'rb' : ''}`}>{rolled ? 'Rolled back' : `+${b.created_count || 0} added`}</span>
                        </div>
                        <div className="sub">{when} · by {b.uploaded_by || 'salon_admin'}{b.skipped_count ? ` · ${b.skipped_count} skipped` : ''}{b.error_count ? ` · ${b.error_count} errors` : ''}</div>
                      </div>
                      <button
                        className="z-btn z-btn--ghost z-btn--sm"
                        onClick={() => onRollback(b.id)}
                        disabled={rolled || (b.created_count || 0) === 0}
                        title={rolled ? 'Already rolled back' : 'Undo this upload'}
                        data-testid={`upload-rollback-${b.id}`}
                      >
                        <Icon name="undo" /> Rollback
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="z-drawer-foot" style={{ display: 'flex', gap: 10 }}>
          <button className="z-btn z-btn--ghost" style={{ flex: 1 }} onClick={onClose}>Close</button>
        </div>
      </aside>
    </>
  );
}

// -----------------------------------------------------------------------------
// ServiceMetricsDrawer — deep metrics view for a clicked service
// -----------------------------------------------------------------------------
function ServiceMetricsDrawer({ salonId, getAuthHeaders, svc, summaryMetrics, onEdit, onClose }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await axios.get(
          `${API}/salons/${salonId}/services/${svc.id}/metrics`,
          { headers: getAuthHeaders() },
        );
        if (alive) setData(res.data);
      } catch (e) {
        if (alive) setErr(e?.response?.data?.detail || 'Failed to load metrics');
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [svc?.id, salonId]);

  const s = data?.service || svc;
  const m = data?.metrics || {
    bookings_30d: summaryMetrics?.bookings_30d || 0,
    revenue_30d: summaryMetrics?.revenue_30d || 0,
    bookings_90d: 0, revenue_90d: 0, avg_ticket_30d: 0,
    rating: summaryMetrics?.rating || 0, total_reviews: 0,
  };
  const timeline = data?.timeline_30d || [];
  const topBarbers = data?.top_barbers || [];
  const maxDay = timeline.reduce((mx, d) => Math.max(mx, Number(d.revenue || 0)), 0) || 1;

  return (
    <>
      <div className="z-overlay" onClick={onClose} />
      <aside className="z-drawer wide" data-testid="service-metrics-drawer">
        <div className="z-drawer-h">
          <div className="dico"><Icon name={s.category === 'Packages' ? 'gift' : 'scissors'} size={20} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="eyebrow">Service metrics</div>
            <h3 style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.service_name}</h3>
            <p>
              {(s.sub_category || '—')} · {s.gender_tag || 'Unisex'} · {s.default_duration || 30} min · {rupee(s.base_price)}
              {s.price_type === 'onwards' && ' onwards'}
            </p>
          </div>
          <button className="z-drawer-close" onClick={onClose}><Icon name="x" /></button>
        </div>

        <div className="z-drawer-body">
          {err && <div className="z-empty" style={{ color: 'var(--z-bad)' }}>{err}</div>}

          <div className="z-metgrid">
            <div className="z-metbox">
              <div className="k">Bookings · 30D</div>
              <div className="v">{m.bookings_30d} <small>bookings</small></div>
            </div>
            <div className="z-metbox">
              <div className="k">Revenue · 30D</div>
              <div className="v">{fmtCompactINR(m.revenue_30d)}</div>
            </div>
            <div className="z-metbox">
              <div className="k">Bookings · 90D</div>
              <div className="v">{m.bookings_90d} <small>total</small></div>
            </div>
            <div className="z-metbox">
              <div className="k">Revenue · 90D</div>
              <div className="v">{fmtCompactINR(m.revenue_90d)}</div>
            </div>
            <div className="z-metbox">
              <div className="k">Avg Ticket (30D)</div>
              <div className="v">{fmtCompactINR(m.avg_ticket_30d)}</div>
            </div>
          </div>

          {/* Timeline mini-bars */}
          <div style={{ marginTop: 18 }}>
            <div className="z-dsec">Revenue trend · last 30 days</div>
            <div className="z-metbox">
              <div className="z-spark" title="Daily revenue (last 30 days)">
                {timeline.map((d, i) => (
                  <div
                    key={i}
                    className="b"
                    style={{ height: `${Math.max(2, Math.round((Number(d.revenue) / maxDay) * 100))}%` }}
                    title={`${d.date}: ${fmtCompactINR(d.revenue)} · ${d.bookings} bookings`}
                  />
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--z-muted-2)', marginTop: 2 }}>
                <span>{timeline[0]?.date || ''}</span>
                <span>{timeline[timeline.length - 1]?.date || ''}</span>
              </div>
            </div>
          </div>

          {/* Top barbers */}
          <div style={{ marginTop: 18 }}>
            <div className="z-dsec">Top stylists · last 30 days</div>
            {topBarbers.length === 0 ? (
              <div style={{ fontSize: 12.5, color: 'var(--z-muted)' }}>No bookings yet for this service.</div>
            ) : (
              <div>
                {topBarbers.map((b) => (
                  <div key={b.barber_id} className="z-cline">
                    <div className="ci"><Icon name="user" /></div>
                    <div className="cn">
                      <div className="t">{b.barber_name}</div>
                      <div className="s">{b.bookings} booking{b.bookings === 1 ? '' : 's'}</div>
                    </div>
                    <div className="cp">{fmtCompactINR(b.revenue)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Facts */}
          <div style={{ marginTop: 18 }}>
            <div className="z-dsec">At a glance</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {s.is_favorite && <span className="z-pill z-pill--warn"><Icon name="star" size={11} /> Favourite</span>}
              {s.available_at_home && <span className="z-pill z-pill--ok"><Icon name="home" size={11} /> At-home {s.home_price ? `· ${rupee(s.home_price)}` : ''}</span>}
              <span className="z-pill z-pill--blue">{s.category || 'Services'}</span>
              {s.sub_category && <span className="z-pill">{s.sub_category}</span>}
              <span className="z-pill">{s.gender_tag || 'Unisex'}</span>
              <span className="z-pill"><Icon name="clock" size={11} /> {s.default_duration || 30} min</span>
            </div>
          </div>
        </div>

        <div className="z-drawer-foot" style={{ display: 'flex', gap: 10 }}>
          <button className="z-btn z-btn--ghost" style={{ flex: 1 }} onClick={onClose}>Close</button>
          <button className="z-btn z-btn--pri" style={{ flex: 1 }} onClick={onEdit} data-testid="drawer-edit-service-btn">
            <Icon name="edit" /> Edit service
          </button>
        </div>
      </aside>
    </>
  );
}
