/**
 * AddCustomerPage.js — Direct "add customer" page.
 *
 * Simple form to create a customer entry in Customer Master. On success,
 * returns to Home (or Customer Master, depending on ?next=). No modals.
 */
import React, { useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, UserPlus, Loader2, Database } from 'lucide-react';
import { getSalonAuthHeaders, getSalonId } from './salonAuthHelper';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function AddCustomerPage() {
  const navigate = useNavigate();
  const salonId = getSalonId();
  const [form, setForm] = useState({
    name: '', phone: '', gender: 'Men', email: '', birthday: '', anniversary: '', notes: ''
  });
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!form.name.trim() || !form.phone.trim()) {
      toast.error('Name and phone are required');
      return;
    }
    const clean = form.phone.replace(/\D/g, '').slice(-10);
    if (clean.length !== 10) { toast.error('Enter 10-digit phone'); return; }
    setSubmitting(true);
    try {
      await axios.post(
        `${API}/salons/${salonId}/customers`,
        { ...form, phone: `+91${clean}` },
        { headers: getSalonAuthHeaders() }
      );
      toast.success('Customer added');
      navigate('/salon/dashboard');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to add customer');
    } finally {
      setSubmitting(false);
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
            <h1 className="text-xl md:text-2xl font-bold bg-gradient-to-r from-blue-500 to-indigo-500 bg-clip-text text-transparent">Add Customer</h1>
            <p className="text-xs text-muted-foreground">Quick create — saves straight to Customer Master.</p>
          </div>
          <button
            onClick={() => navigate('/salon/dashboard?tab=customer-master')}
            className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border hover:bg-muted text-xs font-semibold"
            title="Open full Customer Master"
          >
            <Database className="w-3.5 h-3.5" /> Full Master
          </button>
        </div>
      </div>

      <div className="max-w-[820px] mx-auto p-4">
        <section className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Full name *" value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="Rahul Sharma" testId="ac-name" />
            <Field label="Phone (10 digits) *" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} placeholder="9876543210" type="tel" testId="ac-phone" />
            <Field label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} placeholder="rahul@example.com" type="email" testId="ac-email" />
            <div>
              <label className="text-xs font-bold mb-1 block">Gender</label>
              <div className="flex gap-2">
                {['Men', 'Women', 'Kids'].map((g) => (
                  <button key={g} onClick={() => setForm({ ...form, gender: g })} className={`flex-1 px-2 py-2 rounded-lg text-xs font-semibold border transition ${form.gender === g ? 'bg-gold text-black border-gold' : 'bg-background border-border hover:bg-muted'}`}>{g}</button>
                ))}
              </div>
            </div>
            <Field label="Birthday" value={form.birthday} onChange={(v) => setForm({ ...form, birthday: v })} placeholder="" type="date" testId="ac-birthday" />
            <Field label="Anniversary" value={form.anniversary} onChange={(v) => setForm({ ...form, anniversary: v })} placeholder="" type="date" testId="ac-anniversary" />
          </div>
          <div>
            <label className="text-xs font-bold mb-1 block">Notes</label>
            <textarea
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Preferences, hair type, etc."
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-gold/40"
              data-testid="ac-notes"
            />
          </div>
          <div className="flex items-center gap-2 pt-2">
            <button
              onClick={submit}
              disabled={submitting}
              data-testid="ac-submit"
              className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition ${
                submitting ? 'bg-muted text-muted-foreground' : 'bg-gold hover:bg-gold/90 text-black'
              }`}
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
              Save Customer
            </button>
            <button
              onClick={() => navigate('/salon/dashboard')}
              className="px-4 py-2.5 rounded-xl border border-border hover:bg-muted text-sm font-semibold"
            >
              Cancel
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = 'text', testId }) {
  return (
    <div>
      <label className="text-xs font-bold mb-1 block">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        data-testid={testId}
        className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-gold/40"
      />
    </div>
  );
}
