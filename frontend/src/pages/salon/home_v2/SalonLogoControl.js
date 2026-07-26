/**
 * SalonLogoControl.js — the rail logo tile with a small "manage" menu.
 *
 * • Renders the salon's `logo_url` as an <img> when present, else falls
 *   back to the default scissors mark used by the shell.
 * • Hovering the tile reveals a tiny pencil badge in the bottom-right; a
 *   click opens a mini popover with:
 *     – Change logo…  → opens a hidden <input type="file"> (base64/data-URL
 *       is PUT to /api/salons/{id})
 *     – Remove logo    → PUTs `logo_url: null`
 * • The parent supplies `onLogoChanged(newUrl)` so it can refresh salon
 *   state without a full page reload.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';

const BACKEND_URL =
  (typeof process !== 'undefined' && process.env && process.env.REACT_APP_BACKEND_URL) ||
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.REACT_APP_BACKEND_URL) ||
  '';
const API = `${BACKEND_URL}/api`;

const DefaultMark = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="6" cy="6" r="3"/>
    <circle cx="6" cy="18" r="3"/>
    <line x1="20" y1="4" x2="8.12" y2="15.88"/>
    <line x1="14.47" y1="14.48" x2="20" y2="20"/>
    <line x1="8.12" y1="8.12" x2="12" y2="12"/>
  </svg>
);
const Pencil = () => (
  <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 20h9"/>
    <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>
  </svg>
);

async function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export default function SalonLogoControl({ salonId, salon, onLogoChanged, getAuthHeaders, onClick }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [logoUrl, setLogoUrl] = useState(salon?.logo_url || null);
  const wrapRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => { setLogoUrl(salon?.logo_url || null); }, [salon?.logo_url]);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  const saveLogo = useCallback(async (newValue) => {
    if (!salonId) return;
    setBusy(true);
    try {
      const headers = (typeof getAuthHeaders === 'function') ? (getAuthHeaders() || {}) : {};
      const r = await axios.put(
        `${API}/salons/${salonId}`,
        { logo_url: newValue },
        { headers },
      );
      const applied = r?.data?.logo_url ?? newValue;
      setLogoUrl(applied);
      onLogoChanged?.(applied);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[logo] save failed', e?.message || e);
      // eslint-disable-next-line no-alert
      alert('Could not save logo. Please try again.');
    } finally {
      setBusy(false);
    }
  }, [salonId, getAuthHeaders, onLogoChanged]);

  const onPickFile = async (ev) => {
    const f = ev.target.files?.[0];
    ev.target.value = '';
    if (!f) return;
    if (!/^image\//.test(f.type)) {
      // eslint-disable-next-line no-alert
      alert('Please pick an image file.');
      return;
    }
    if (f.size > 2 * 1024 * 1024) {
      // eslint-disable-next-line no-alert
      alert('Please pick an image under 2 MB.');
      return;
    }
    setMenuOpen(false);
    const url = await fileToDataURL(f);
    await saveLogo(url);
  };

  const removeLogo = async () => {
    setMenuOpen(false);
    // eslint-disable-next-line no-restricted-globals, no-alert
    if (!window.confirm('Remove your salon logo?')) return;
    await saveLogo(null);
  };

  const hasLogo = !!logoUrl;

  return (
    <div
      ref={wrapRef}
      style={{ position: 'relative', width: 44, height: 44, marginBottom: 22, flex: 'none' }}
    >
      <button
        type="button"
        data-testid="rail-logo-btn"
        onClick={() => {
          if (onClick) { onClick(); return; }
          setMenuOpen(v => !v);
        }}
        title={onClick ? (salon?.salon_name || 'Home') : (busy ? 'Saving…' : 'Manage salon logo')}
        style={{
          width: 44, height: 44, borderRadius: 13,
          background: hasLogo
            ? '#fff'
            : 'linear-gradient(135deg, var(--primary, #6C4FE0), #8A73F0)',
          border: hasLogo ? '1px solid #E3DFF3' : 'none',
          boxShadow: '0 6px 16px rgba(108,79,224,.35)',
          display: 'grid', placeItems: 'center', color: '#fff',
          cursor: 'pointer', padding: 0, overflow: 'hidden',
          opacity: busy ? 0.65 : 1,
          transition: 'opacity .15s',
        }}
      >
        {hasLogo ? (
          <img
            src={logoUrl}
            alt={salon?.salon_name || 'Salon logo'}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : <DefaultMark />}
      </button>

      {/* Pencil badge — clickable when the logo itself is a Home button.
          Opens the manage-logo mini menu. */}
      <button
        type="button"
        aria-label="Manage salon logo"
        data-testid="rail-logo-manage"
        onClick={(e) => { e.stopPropagation(); setMenuOpen(v => !v); }}
        style={{
          position: 'absolute', right: -3, bottom: -3,
          width: 16, height: 16, borderRadius: '50%',
          background: '#6C4FE0', color: '#fff',
          display: 'grid', placeItems: 'center',
          border: '2px solid #fff', padding: 0, cursor: 'pointer',
        }}
      ><Pencil /></button>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={onPickFile}
      />

      {menuOpen && (
        <div
          role="menu"
          style={{
            position: 'absolute', left: 'calc(100% + 8px)', top: 0,
            zIndex: 60, minWidth: 170, padding: '6px 0',
            background: '#fff', border: '1px solid #E7E2F3',
            borderRadius: 12, boxShadow: '0 18px 40px -12px rgba(15,10,40,0.25)',
          }}
        >
          <button
            type="button"
            data-testid="rail-logo-change"
            onClick={() => { setMenuOpen(false); fileRef.current?.click(); }}
            style={{
              display: 'block', width: '100%', padding: '9px 14px',
              background: 'transparent', border: 'none', textAlign: 'left',
              fontSize: 13, color: '#211a3d', cursor: 'pointer',
            }}
          >Change logo…</button>
          <button
            type="button"
            data-testid="rail-logo-remove"
            onClick={removeLogo}
            disabled={!hasLogo}
            style={{
              display: 'block', width: '100%', padding: '9px 14px',
              background: 'transparent', border: 'none', textAlign: 'left',
              fontSize: 13, color: hasLogo ? '#c23a5a' : '#c9c3dc',
              cursor: hasLogo ? 'pointer' : 'not-allowed',
            }}
          >Remove logo</button>
        </div>
      )}
    </div>
  );
}
