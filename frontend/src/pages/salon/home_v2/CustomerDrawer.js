/**
 * CustomerDrawer — Add / Edit Guest.
 *
 * Design tweaks (v1.2):
 *   - No clarification labels (labels are self-explanatory).
 *   - Fields laid out in 3 grid rows:
 *       Row 1: Mobile number  |  Email
 *       Row 2: Date of birth  |  Anniversary
 *       Row 3: Gender         |  Preferred staff
 *   - Custom tag "+" chip (no help text) still supported.
 *
 * Bug fix:
 *   Previously the state-reset useEffect depended on `getAuthHeaders` and
 *   `salonId` — both change reference on every parent re-render, which
 *   silently wiped the form while the user was typing.  Reset now only
 *   fires on `open` transitions (opening the drawer), and barbers load
 *   uses refs so the fetch has current callbacks without triggering resets.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const SYSTEM_TAGS = ['VIP', 'New', 'Regular'];

export default function CustomerDrawer({
  open, onClose, onSaved, getAuthHeaders, salonId,
  stacked = false,
  presetName = '',
  presetPhone = '',
  source = 'owner',
  initial = null,           // pass an existing customer to edit; null = create
}) {
  const [form, setForm] = useState({
    first: '', last: '', code: '+91', phone: '',
    email: '', gender: 'Female',
    tags: [], customTags: [],
    notes: '',
    photo_url: '', dob: '', anniversary: '',
    preferred_barber_id: '',
    instagram_id: '', facebook_id: '',
  });
  const [barbers, setBarbers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [addingTag, setAddingTag] = useState(false);
  const [newTag, setNewTag] = useState('');
  const firstNameRef = useRef(null);
  const fileRef = useRef(null);

  // Keep parent callbacks in a ref so they don't trigger the reset effect.
  const authRef = useRef(getAuthHeaders);
  const salonRef = useRef(salonId);
  useEffect(() => { authRef.current = getAuthHeaders; }, [getAuthHeaders]);
  useEffect(() => { salonRef.current = salonId; }, [salonId]);

  // Reset & prefill ONLY when `open` flips true. Any parent re-render is a no-op.
  useEffect(() => {
    if (!open) return;
    const src = initial || {};
    const parts = ((src.name || presetName) || '').trim().split(/\s+/);
    setForm({
      first: parts[0] || '',
      last: parts.slice(1).join(' ') || '',
      code: '+91',
      phone: ((src.phone || presetPhone) || '').replace(/^\+?91/, '').trim(),
      email: src.email || '',
      gender: src.gender || 'Female',
      tags: src.tags || [],
      customTags: (src.tags || []).filter(t => !SYSTEM_TAGS.includes(t)),
      notes: src.notes || '',
      photo_url: src.photo_url || '',
      dob: src.dob || src.date_of_birth || '',
      anniversary: src.anniversary || '',
      preferred_barber_id: src.preferred_barber_id || '',
      instagram_id: src.instagram_id || '',
      facebook_id: src.facebook_id || '',
    });
    setErrors({}); setAddingTag(false); setNewTag('');
    setTimeout(() => firstNameRef.current?.focus(), 350);
    (async () => {
      try {
        const res = await axios.get(`${API}/salons/${salonRef.current}/barbers`, { headers: authRef.current() });
        const list = Array.isArray(res.data) ? res.data : (res.data?.barbers || []);
        setBarbers(list.filter(b => b.is_active !== false));
      } catch (_) { setBarbers([]); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const toggleTag = (t) => setForm(f => ({
    ...f, tags: f.tags.includes(t) ? f.tags.filter(x => x !== t) : [...f.tags, t],
  }));

  const addCustomTag = () => {
    const t = newTag.trim();
    if (!t) { setAddingTag(false); return; }
    if (t.length > 24) return;
    setForm(f => ({
      ...f,
      tags: f.tags.includes(t) ? f.tags : [...f.tags, t],
      customTags: f.customTags.includes(t) ? f.customTags : [...f.customTags, t],
    }));
    setNewTag(''); setAddingTag(false);
  };

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      setErrors(er => ({ ...er, photo: 'Photo must be under 3 MB' }));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setForm(f => ({ ...f, photo_url: String(reader.result || '') }));
      setErrors(er => ({ ...er, photo: null }));
    };
    reader.readAsDataURL(file);
  };

  const save = async () => {
    const errs = {};
    if (!form.first.trim()) errs.first = 'First name is required';
    const cleaned = (form.phone || '').replace(/\D/g, '');
    if (cleaned.length < 10) errs.phone = 'Enter a valid 10-digit number';
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSaving(true);
    try {
      const fullPhone = `${form.code}${cleaned.slice(-10)}`;
      const payload = {
        name: `${form.first} ${form.last}`.trim(),
        phone: fullPhone,
        email: form.email || null,
        gender: form.gender,
        tags: form.tags,
        notes: form.notes,
        source,
        photo_url: form.photo_url || null,
        dob: form.dob || null,
        anniversary: form.anniversary || null,
        preferred_barber_id: form.preferred_barber_id || null,
        instagram_id: form.instagram_id || null,
        facebook_id: form.facebook_id || null,
      };
      const isEditing = !!initial?.phone;
      let cust;
      if (isEditing) {
        // Backend PUT accepts a subset (name/phone/gender/date_of_birth). Best-effort.
        const putPhone = String(initial.phone || '').replace(/^\+?91/, '').trim();
        try {
          const putUrl = `${API}/salons/${salonRef.current}/customers/${encodeURIComponent(putPhone)}`;
          const res = await axios.put(putUrl, {
            name: payload.name,
            phone: fullPhone,
            gender: payload.gender,
            date_of_birth: payload.dob,
          }, { headers: authRef.current() });
          cust = res.data?.customer || res.data || {};
        } catch (putErr) {
          // Fallback: try POST (upsert) — the backend usually upserts on same phone.
          const res = await axios.post(
            `${API}/salons/${salonRef.current}/customers`,
            payload,
            { headers: authRef.current() },
          );
          cust = res.data?.customer || res.data || {};
        }
      } else {
        const res = await axios.post(
          `${API}/salons/${salonRef.current}/customers`,
          payload,
          { headers: authRef.current() },
        );
        cust = res.data?.customer || res.data || {};
      }
      setTimeout(() => {
        onSaved?.({
          ...cust, phone: fullPhone, name: payload.name,
          photo_url: form.photo_url, dob: form.dob, anniversary: form.anniversary,
          preferred_barber_id: form.preferred_barber_id,
          gender: payload.gender, email: payload.email, notes: payload.notes,
          tags: payload.tags,
        });
      }, 300);
      onClose?.();
    } catch (e) {
      const detail = e?.response?.data?.detail || 'Save failed';
      setErrors({ phone: typeof detail === 'string' ? detail : 'Save failed' });
    } finally { setSaving(false); }
  };

  const nameInitial = ((form.first || 'G')[0] || 'G').toUpperCase();
  const isEdit = !!initial?.phone;

  return ReactDOM.createPortal(
    <>
      <div className={`shv2-overlay ${open ? 'open' : ''}`} onClick={onClose} style={{ zIndex: stacked ? 9075 : 9060 }} />
      <aside className={`shv2-drawer ${stacked ? 'stacked' : 'narrow'} ${open ? 'open' : ''}`} style={{ zIndex: stacked ? 9080 : 9070 }}>
        <div className="drawer__h">
          <div className="tt">
            <div className="ic">
              <svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
            </div>
            <div><h3>{isEdit ? 'Edit Guest' : 'Add New Guest'}</h3><p>{isEdit ? 'Update guest profile' : 'Create a customer profile'}</p></div>
          </div>
          <button className="drawer__close" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div className="drawer__body">
          {/* Profile photo */}
          <div className="photo-row">
            <div className="photo" style={form.photo_url ? { backgroundImage: `url(${form.photo_url})`, backgroundSize: 'cover', backgroundPosition: 'center', border: '2px solid #E7E2FF' } : {}}>
              {!form.photo_url && (
                <div style={{ fontFamily: 'Plus Jakarta Sans', fontWeight: 800, fontSize: 22, color: '#6C4FE0' }}>{nameInitial}</div>
              )}
            </div>
            <div className="pt">
              <b>Profile photo</b>
              <div>
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleFile} />
                <button onClick={() => fileRef.current?.click()}>{form.photo_url ? 'Change photo' : 'Upload photo'}</button>
                {form.photo_url && <button style={{ marginLeft: 6, background: '#FCEAF1', color: '#E45C86', borderColor: '#FCEAF1' }} onClick={() => setForm(f => ({ ...f, photo_url: '' }))}>Remove</button>}
              </div>
              {errors.photo && <span className="msg show">{errors.photo}</span>}
            </div>
          </div>

          {/* Name */}
          <div className="grid2">
            <div className="field">
              <label>First name <span className="req">*</span></label>
              <input ref={firstNameRef} value={form.first} onChange={e => setForm({ ...form, first: e.target.value })}
                     className={errors.first ? 'err' : ''} placeholder="First name" />
              {errors.first && <span className="msg show">{errors.first}</span>}
            </div>
            <div className="field">
              <label>Last name</label>
              <input value={form.last} onChange={e => setForm({ ...form, last: e.target.value })} placeholder="Last name" />
            </div>

            {/* Row 1 — Mobile number | Email */}
            <div className="field">
              <label>Mobile number <span className="req">*</span></label>
              <div className="phone">
                <select value={form.code} onChange={e => setForm({ ...form, code: e.target.value })}>
                  <option>+91</option><option>+1</option><option>+44</option>
                </select>
                <input inputMode="numeric" placeholder="10-digit mobile"
                       value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
                       className={errors.phone ? 'err' : ''} />
              </div>
              {errors.phone && <span className="msg show">{errors.phone}</span>}
            </div>
            <div className="field">
              <label>Email</label>
              <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="Email address" />
            </div>

            {/* Row 2 — Date of birth | Anniversary */}
            <div className="field">
              <label>Date of birth</label>
              <input type="date" value={form.dob} onChange={e => setForm({ ...form, dob: e.target.value })} />
            </div>
            <div className="field">
              <label>Anniversary</label>
              <input type="date" value={form.anniversary} onChange={e => setForm({ ...form, anniversary: e.target.value })} />
            </div>

            {/* Row 3 — Gender | Preferred staff */}
            <div className="field">
              <label>Gender</label>
              <div className="seg-pick">
                {['Female', 'Male', 'Other'].map(g => (
                  <button key={g} type="button" className={form.gender === g ? 'on' : ''}
                          onClick={() => setForm({ ...form, gender: g })}>{g}</button>
                ))}
              </div>
            </div>
            <div className="field">
              <label>Preferred staff</label>
              <select value={form.preferred_barber_id} onChange={e => setForm({ ...form, preferred_barber_id: e.target.value })}>
                <option value="">— No preference —</option>
                {barbers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>

            {/* Tags */}
            <div className="field full">
              <label>Tags</label>
              <div className="tags">
                {SYSTEM_TAGS.map(t => (
                  <button key={t} type="button" className={`tag ${form.tags.includes(t) ? 'on' : ''}`}
                          onClick={() => toggleTag(t)}>{t}</button>
                ))}
                {form.customTags.map(t => (
                  <button key={t} type="button" className={`tag ${form.tags.includes(t) ? 'on' : ''}`}
                          onClick={() => toggleTag(t)}>#{t}</button>
                ))}
                {addingTag ? (
                  <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                    <input autoFocus value={newTag} onChange={e => setNewTag(e.target.value)}
                           onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomTag(); } if (e.key === 'Escape') setAddingTag(false); }}
                           maxLength={24}
                           style={{ fontSize: 12, padding: '5px 10px', border: '1px solid #ECECF3', borderRadius: 20, width: 110, outline: 'none' }} />
                    <button className="tag on" style={{ padding: '5px 10px' }} onClick={addCustomTag}>Add</button>
                  </span>
                ) : (
                  <button className="tag" style={{ background: '#F1EEFF', color: '#6C4FE0', borderColor: '#E7E2FF', fontWeight: 800 }} onClick={() => setAddingTag(true)}>+</button>
                )}
              </div>
            </div>

            {/* Socials */}
            <div className="field">
              <label>Instagram ID</label>
              <input value={form.instagram_id} onChange={e => setForm({ ...form, instagram_id: e.target.value })} placeholder="Instagram handle" />
            </div>
            <div className="field">
              <label>Facebook ID</label>
              <input value={form.facebook_id} onChange={e => setForm({ ...form, facebook_id: e.target.value })} placeholder="Facebook profile" />
            </div>

            <div className="field full">
              <label>Notes</label>
              <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
        </div>
        <div className="drawer__f">
          <span className="hint"><span style={{ color: '#E45C86' }}>*</span> Required</span>
          <div className="acts">
            <button className="btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn-primary" disabled={saving} onClick={save}>
              {saving ? 'Saving…' : (isEdit ? 'Update guest' : 'Save guest')}
            </button>
          </div>
        </div>
      </aside>
    </>,
    document.body
  );
}
