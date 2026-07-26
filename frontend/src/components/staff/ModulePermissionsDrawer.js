/**
 * ModulePermissionsDrawer.js
 *
 * Right-side slide-in drawer that lets the salon admin pick which granular
 * actions a staff user can perform inside a single module. Renders the
 * action list from MODULES (see ModulePermissionsConfig.js).
 *
 * Props:
 *   isOpen         : boolean
 *   moduleKey      : string             — the module key currently being edited
 *   value          : object             — current { [action_key]: bool }
 *   onSave(value)  : called with a NEW map of action → bool
 *   onClose()      : dismiss the drawer
 */
import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { X, ShieldCheck } from 'lucide-react';
import { MODULES } from './ModulePermissionsConfig';

export default function ModulePermissionsDrawer({ isOpen, moduleKey, value, onSave, onClose }) {
  const moduleDef = useMemo(() => MODULES.find(m => m.key === moduleKey), [moduleKey]);
  const [localValue, setLocalValue] = useState({});

  useEffect(() => {
    if (isOpen) setLocalValue(value ? { ...value } : {});
  }, [isOpen, value]);

  if (!isOpen || !moduleDef) return null;

  const allOn  = moduleDef.actions.every(a => localValue[a.key]);
  const anyOn  = moduleDef.actions.some(a  => localValue[a.key]);

  const toggleAll = (on) => {
    const next = {};
    moduleDef.actions.forEach(a => { next[a.key] = !!on; });
    setLocalValue(next);
  };

  const toggleOne = (actionKey, on) => {
    setLocalValue(prev => {
      const next = { ...prev, [actionKey]: !!on };
      // Cascade: turning off "view" disables everything inside the module
      // (a user without view can't operate the module regardless).
      if (actionKey === 'view' && !on) {
        moduleDef.actions.forEach(a => { next[a.key] = false; });
      }
      // Nested rule for staff.view_all — requires staff.view to be on.
      if (moduleKey === 'staff' && actionKey === 'view_all' && on) {
        next.view = true;
      }
      return next;
    });
  };

  const handleSave = () => { onSave(localValue); onClose(); };

  return createPortal((
    <div
      className="fixed inset-0 z-[9070] flex justify-end"
      data-testid="module-permissions-drawer"
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
    >
      {/* Backdrop */}
      <button
        aria-label="Close drawer"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
      />

      {/* Drawer body */}
      <aside
        className="relative w-full sm:w-[420px] max-w-[94vw] bg-card border-l border-border shadow-2xl flex flex-col"
        style={{ zIndex: 1, height: '100vh' }}
      >
        <header
          className="flex items-center justify-between px-5 py-4 border-b border-border bg-card flex-none"
          style={{ borderTop: `4px solid ${moduleDef.color}` }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <ShieldCheck className="w-5 h-5 flex-none" style={{ color: moduleDef.color }} />
            <div className="min-w-0">
              <div className="text-sm font-semibold" data-testid="drawer-module-label">
                {moduleDef.label} — Permissions
              </div>
              <div className="text-xs text-muted-foreground">{moduleDef.description}</div>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted flex-none" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="p-5 space-y-4 flex-1 overflow-y-auto">
          {/* Quick toggle */}
          <div
            className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border"
            style={{ background: `${moduleDef.color}0F` }} // 0F = ~6% opacity
          >
            <div className="min-w-0">
              <div className="text-sm font-semibold">Grant full access</div>
              <div className="text-xs text-muted-foreground">
                Turns every action in this module on or off.
              </div>
            </div>
            <div className="flex gap-2 flex-none">
              <Button
                size="sm"
                variant={allOn ? 'default' : 'outline'}
                onClick={() => toggleAll(true)}
                data-testid="drawer-select-all"
              >
                Select all
              </Button>
              <Button
                size="sm"
                variant={!anyOn ? 'default' : 'outline'}
                onClick={() => toggleAll(false)}
                data-testid="drawer-clear-all"
              >
                Clear
              </Button>
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-2">
            {moduleDef.actions.map(action => (
              <label
                key={action.key}
                className="flex items-start gap-3 p-3 rounded-md border border-border hover:bg-muted/40 cursor-pointer"
                data-testid={`drawer-action-${moduleKey}-${action.key}`}
              >
                <Checkbox
                  checked={!!localValue[action.key]}
                  onCheckedChange={(v) => toggleOne(action.key, v)}
                  className="mt-0.5 flex-none"
                  style={{ '--tw-ring-color': moduleDef.color }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{action.label}</div>
                  {action.hint && (
                    <div className="text-xs text-muted-foreground mt-0.5">{action.hint}</div>
                  )}
                </div>
              </label>
            ))}
          </div>
        </div>

        <footer className="bg-card border-t border-border p-4 flex justify-end gap-2 flex-none">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleSave}
            data-testid="drawer-save-permissions"
            style={{ background: moduleDef.color, color: '#fff' }}
          >
            Save
          </Button>
        </footer>
      </aside>
    </div>
  ), document.body);
}
