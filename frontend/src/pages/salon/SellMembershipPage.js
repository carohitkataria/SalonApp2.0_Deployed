/**
 * SellMembershipPage.js — Full-page flow: pick/create customer → open Sell
 * Membership modal → returns to Home on success.
 */
import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, BadgeCheck, Search, UserPlus, Loader2, X, Crown } from 'lucide-react';
import SellMembershipModal from '@/components/SellMembershipModal';
import { getSalonAuthHeaders, getSalonId } from './salonAuthHelper';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function SellMembershipPage() {
  const navigate = useNavigate();
  const salonId = getSalonId();
  const [customers, setCustomers] = useState([]);
  const [plans, setPlans] = useState([]);
  const [q, setQ] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!salonId) { navigate('/salon/login'); return; }
    (async () => {
      try {
        const [c, p] = await Promise.all([
          axios.get(`${API}/salons/${salonId}/customers`, { headers: getSalonAuthHeaders() }),
          axios.get(`${API}/salons/${salonId}/membership-plans`, { headers: getSalonAuthHeaders() }),
        ]);
        setCustomers(c.data?.customers || []);
        setPlans(p.data?.plans || []);
      } catch (err) {
        toast.error('Failed to load');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return customers.slice(0, 30);
    return customers.filter((c) => (c.name || '').toLowerCase().includes(t) || (c.phone || '').includes(t)).slice(0, 30);
  }, [customers, q]);

  const openFor = (c) => { setSelectedCustomer(c); setModalOpen(true); };

  const quickCreate = async (name, phone) => {
    if (!name || !phone) return;
    const clean = phone.replace(/\D/g, '').slice(-10);
    if (clean.length !== 10) { toast.error('Enter 10-digit phone'); return; }
    try {
      await axios.post(
        `${API}/salons/${salonId}/customers`,
        { name, phone: `+91${clean}`, gender: 'Men' },
        { headers: getSalonAuthHeaders() }
      );
      const c = { id: `local-${Date.now()}`, name, phone: `+91${clean}`, gender: 'Men' };
      setCustomers((cs) => [c, ...cs]);
      setShowAdd(false);
      openFor(c);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to create');
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur-md">
        <div className="max-w-[820px] mx-auto flex items-center gap-3 px-4 py-3">
          <button onClick={() => navigate('/salon/dashboard')} className="p-2 rounded-lg hover:bg-muted transition">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl md:text-2xl font-bold bg-gradient-to-r from-violet-500 to-purple-500 bg-clip-text text-transparent">Sell Membership</h1>
            <p className="text-xs text-muted-foreground">Pick a customer and choose a plan.</p>
          </div>
        </div>
      </div>

      <div className="max-w-[820px] mx-auto p-4 space-y-4">
        {/* Available plans preview */}
        <section className="bg-card border border-border rounded-2xl p-4">
          <h3 className="text-sm font-bold mb-3 flex items-center gap-1.5"><Crown className="w-4 h-4 text-amber-500" /> Available Plans</h3>
          {plans.length === 0 ? (
            <p className="text-xs text-muted-foreground">No plans configured. Go to Services → Memberships to create plans.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {plans.map((p) => (
                <div key={p.id} className="px-3 py-1.5 rounded-full text-xs font-medium border border-violet-500/30 bg-violet-500/5">
                  <span className="font-bold">{p.name}</span>
                  <span className="text-muted-foreground"> · ₹{p.price || p.plan_price || 0}</span>
                  <span className="text-muted-foreground"> · {(p.discount_percentage || p.service_discount_pct || 0)}% off</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Customer picker */}
        <section className="bg-card border border-border rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold">Choose Customer</h3>
            <button
              onClick={() => setShowAdd(true)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gold/10 border border-gold/40 text-gold text-xs font-semibold hover:bg-gold hover:text-black transition"
              data-testid="sm-add-new"
            >
              <UserPlus className="w-3.5 h-3.5" /> New Customer
            </button>
          </div>
          <div className="relative mb-3">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name or phone…"
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40"
              data-testid="sm-search"
            />
          </div>
          {loading ? (
            <div className="py-8 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">No customers match. Click "New Customer" to add one.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[350px] overflow-y-auto pr-1">
              {filtered.map((c) => (
                <button
                  key={c.id || c.phone}
                  onClick={() => openFor(c)}
                  className="text-left p-3 rounded-lg border border-border hover:border-violet-500/40 hover:bg-violet-500/5 transition"
                >
                  <p className="text-sm font-semibold">{c.name || 'Unnamed'}</p>
                  <p className="text-[11px] text-muted-foreground">{c.phone}</p>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      {selectedCustomer && (
        <SellMembershipModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          customer={selectedCustomer}
          salonId={salonId}
          getAuthHeaders={getSalonAuthHeaders}
          onSuccess={() => { setModalOpen(false); navigate('/salon/dashboard'); }}
        />
      )}

      {showAdd && (
        <QuickAdd onClose={() => setShowAdd(false)} onSubmit={quickCreate} />
      )}
    </div>
  );
}

function QuickAdd({ onClose, onSubmit }) {
  const [n, setN] = useState('');
  const [p, setP] = useState('');
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold flex items-center gap-2"><UserPlus className="w-4 h-4 text-gold" /> New Customer</h3>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded"><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-3">
          <input type="text" value={n} onChange={(e) => setN(e.target.value)} placeholder="Full name" className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-gold/40" />
          <input type="tel" value={p} onChange={(e) => setP(e.target.value)} placeholder="Phone (10 digits)" className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-gold/40" />
          <button onClick={() => onSubmit(n, p)} className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-gold text-black font-bold text-sm">
            <UserPlus className="w-4 h-4" /> Continue to Sell
          </button>
        </div>
      </div>
    </div>
  );
}
