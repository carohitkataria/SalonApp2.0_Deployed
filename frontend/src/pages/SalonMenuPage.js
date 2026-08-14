import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Scissors, MapPin, Phone, Clock, Search, ShoppingBag, Plus, Minus, Check,
} from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

/**
 * SalonMenuPage — printable menu landing reached via the "Services Menu QR".
 *
 * • Public (no auth required).
 * • Lists all enabled services grouped by category, with prices.
 * • Customer can multi-select services and tap "Book Now" — selections are
 *   passed to /book/:salonId via the `services` query param (existing flow).
 */
export default function SalonMenuPage() {
  const { salonId } = useParams();
  const [params] = useSearchParams();
  const branchId = params.get('branch') || '';
  const navigate = useNavigate();

  const [menu, setMenu] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const { data } = await axios.get(`${API}/salons/${salonId}/menu`, {
          params: branchId ? { branch: branchId } : {},
        });
        if (!cancelled) setMenu(data);
      } catch (err) {
        if (!cancelled) toast.error('Could not load this salon menu.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [salonId, branchId]);

  const grouped = useMemo(() => {
    const out = {};
    const q = search.trim().toLowerCase();
    (menu?.services || []).forEach((s) => {
      if (q && !(s.service_name || '').toLowerCase().includes(q)
            && !(s.sub_category || s.category || '').toLowerCase().includes(q)) return;
      const cat = s.sub_category || s.category || 'General';
      if (!out[cat]) out[cat] = [];
      out[cat].push(s);
    });
    return out;
  }, [menu, search]);

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const total = useMemo(() => {
    let t = 0;
    (menu?.services || []).forEach((s) => {
      if (selected.has(s.id)) t += Number(s.base_price || 0);
    });
    return t;
  }, [menu, selected]);

  const bookNow = () => {
    if (selected.size === 0) {
      toast.error('Pick at least one service first');
      return;
    }
    const ids = Array.from(selected).join(',');
    const branchQs = branchId ? `&branch=${branchId}` : '';
    navigate(`/book/${salonId}?services=${ids}&source=qr_menu${branchQs}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Scissors className="w-12 h-12 text-gold animate-spin mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">Loading menu…</p>
        </div>
      </div>
    );
  }

  if (!menu || !menu.salon) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-playfair font-bold mb-2">Menu not found</h1>
          <p className="text-sm text-muted-foreground mb-4">
            This salon menu link is invalid or no longer active.
          </p>
          <Button onClick={() => navigate('/')} className="bg-gold text-black hover:bg-gold/90">
            Go Home
          </Button>
        </div>
      </div>
    );
  }

  const { salon, branch, services } = menu;

  return (
    <div className="min-h-screen bg-background pb-32" data-testid="salon-menu-page">
      {/* Hero */}
      <div className="relative bg-gradient-to-b from-card to-background border-b border-border">
        <div className="max-w-3xl mx-auto px-4 py-8 text-center">
          {salon.logo_url ? (
            <img
              src={salon.logo_url}
              alt=""
              className="w-20 h-20 mx-auto rounded-full object-cover border-2 border-gold mb-3"
            />
          ) : (
            <div className="w-20 h-20 mx-auto rounded-full bg-gold/10 border-2 border-gold flex items-center justify-center mb-3">
              <Scissors className="w-8 h-8 text-gold" />
            </div>
          )}
          <p className="eyebrow text-gold tracking-widest text-xs mb-1">Services Menu</p>
          <h1 className="text-3xl sm:text-4xl font-playfair font-bold text-foreground" data-testid="menu-salon-name">
            {salon.salon_name}
          </h1>
          {branch?.branch_name && (
            <p className="text-sm text-muted-foreground mt-1" data-testid="menu-branch-name">
              {branch.branch_name}{branch.is_main_branch ? ' (Main)' : ''}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 mt-3 text-xs text-muted-foreground">
            {(branch?.address || salon.address) && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" />
                {branch?.address || salon.address}{(branch?.city || salon.city) ? `, ${branch?.city || salon.city}` : ''}
              </span>
            )}
            {(branch?.phone || salon.phone) && (
              <span className="inline-flex items-center gap-1">
                <Phone className="w-3.5 h-3.5" /> {branch?.phone || salon.phone}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="max-w-3xl mx-auto px-4 pt-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search services…"
            className="pl-10 h-11"
            data-testid="menu-search-input"
          />
        </div>
      </div>

      {/* Services grouped by category */}
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-8">
        {services.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-12">
            No services configured yet.
          </p>
        )}
        {Object.entries(grouped).map(([category, items]) => (
          <section key={category} data-testid={`menu-category-${category.toLowerCase().replace(/\s+/g, '-')}`}>
            <div className="flex items-baseline justify-between mb-3 pb-2 border-b border-border">
              <h2 className="font-playfair text-lg font-bold text-foreground">{category}</h2>
              <span className="text-xs text-muted-foreground">{items.length} items</span>
            </div>
            <div className="space-y-2">
              {items.map((s) => {
                const isSel = selected.has(s.id);
                const isOnwards = s.price_type === 'onwards';
                return (
                  <motion.button
                    key={s.id}
                    onClick={() => toggle(s.id)}
                    whileTap={{ scale: 0.99 }}
                    className={`w-full flex items-center justify-between gap-3 p-3 rounded-xl border-2 text-left transition-colors ${
                      isSel
                        ? 'bg-gold/10 border-gold'
                        : 'bg-card border-border hover:border-gold/40'
                    }`}
                    data-testid={`menu-service-${s.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground text-sm truncate">{s.service_name}</p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                        {s.default_duration && (
                          <span className="inline-flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {s.default_duration} min
                          </span>
                        )}
                        {s.gender_tag && s.gender_tag !== 'Unisex' && (
                          <span>{s.gender_tag}</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-bold text-gold">
                        ₹{s.base_price}{isOnwards && <span className="text-[10px] ml-0.5">+</span>}
                      </div>
                      <div className={`mt-1 inline-flex items-center justify-center w-7 h-7 rounded-full border-2 ${
                        isSel ? 'bg-gold border-gold text-black' : 'bg-background border-border text-muted-foreground'
                      }`}>
                        {isSel ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                      </div>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {/* Sticky Book Now bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur border-t border-border z-30">
        <div className="max-w-3xl mx-auto p-4 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground">
              {selected.size === 0 ? 'No services selected' : `${selected.size} service${selected.size > 1 ? 's' : ''} selected`}
            </p>
            <p className="text-xl font-bold text-gold">₹{total}</p>
          </div>
          <Button
            onClick={bookNow}
            disabled={selected.size === 0}
            className="bg-gold text-black hover:bg-gold/90 px-6 py-5 text-base font-bold rounded-xl disabled:opacity-50"
            data-testid="menu-book-now-btn"
          >
            <ShoppingBag className="w-5 h-5 mr-2" />
            Book Now
          </Button>
        </div>
      </div>
    </div>
  );
}
