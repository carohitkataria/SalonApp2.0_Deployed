import React, { useState } from 'react';
import { Settings2, ChevronRight, RotateCcw } from 'lucide-react';
import { MODULES } from '@/components/staff/ModulePermissionsConfig';
import ModulePermissionsDrawer from '@/components/staff/ModulePermissionsDrawer';

const emptyMod = () => {
  const m = {};
  MODULES.forEach((mod) => { m[mod.key] = {}; mod.actions.forEach((a) => { m[mod.key][a.key] = false; }); });
  return m;
};

function summarise(modules, key) {
  const mod = MODULES.find((m) => m.key === key);
  const mp = (modules && modules[key]) || {};
  const total = mod.actions.length;
  const on = mod.actions.filter((a) => mp[a.key]).length;
  if (on === 0) return 'None';
  if (on === total) return 'Full';
  return `${on}/${total}`;
}

const sameMap = (a = {}, b = {}, mod) =>
  mod.actions.every((ac) => !!a[ac.key] === !!b[ac.key]);

/**
 * Reusable module permission grid + drawer.
 *
 * Props:
 *  value        : { [module]: { [action]: bool } }  — the map being edited
 *  onChange(v)  : called with the full updated modules map
 *  baseline     : optional role baseline map. When provided, cards that differ
 *                 from the baseline are flagged "Overridden" with a Reset action
 *                 (used by the per-staff override editor).
 *  readOnly     : disables editing (system role view)
 */
export default function PermissionMatrix({ value, onChange, baseline, readOnly = false }) {
  const modules = value || emptyMod();
  const [drawerKey, setDrawerKey] = useState(null);

  const applyDrawer = (key, actionMap) => {
    onChange({ ...modules, [key]: actionMap || {} });
  };

  const resetToRole = (key, e) => {
    e.stopPropagation();
    const base = (baseline && baseline[key]) || {};
    onChange({ ...modules, [key]: { ...base } });
  };

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 items-stretch" data-testid="permission-matrix">
        {MODULES.map((mod) => {
          const summary = summarise(modules, mod.key);
          const isNone = summary === 'None';
          const isFull = summary === 'Full';
          const overridden = baseline
            ? !sameMap(modules[mod.key], baseline[mod.key] || {}, mod)
            : false;
          return (
            <button
              type="button"
              key={mod.key}
              onClick={() => !readOnly && setDrawerKey(mod.key)}
              data-testid={`perm-card-${mod.key}`}
              className={`text-left rounded-lg border bg-card transition p-3 flex items-center gap-3 min-h-[58px] ${readOnly ? 'opacity-90 cursor-default' : 'hover:border-gold hover:shadow-sm'}`}
              style={{ borderLeftWidth: 4, borderLeftColor: mod.color }}
            >
              <div className="w-9 h-9 rounded-md flex items-center justify-center shrink-0"
                style={{ background: `${mod.color}1A`, color: mod.color }}>
                <Settings2 className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold flex items-center gap-1.5" style={{ wordBreak: 'normal' }}>
                  <span>{mod.label}</span>
                  {overridden && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 whitespace-nowrap"
                      style={{ background: '#FDE68A', color: '#92400E' }}
                      data-testid={`perm-overridden-${mod.key}`}>Overridden</span>
                  )}
                </div>
                <div className="text-[11px] text-muted-foreground truncate">{mod.description}</div>
              </div>
              {overridden && !readOnly && (
                <span onClick={(e) => resetToRole(mod.key, e)} role="button"
                  title="Reset to role"
                  data-testid={`perm-reset-${mod.key}`}
                  className="text-muted-foreground hover:text-gold shrink-0">
                  <RotateCcw className="w-3.5 h-3.5" />
                </span>
              )}
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap shrink-0"
                style={{
                  background: isNone ? '#F3F4F6' : (isFull ? `${mod.color}22` : `${mod.color}14`),
                  color: isNone ? '#6B7280' : mod.color,
                  border: `1px solid ${isNone ? '#E5E7EB' : mod.color + '55'}`,
                }}
                data-testid={`perm-summary-${mod.key}`}>
                {summary}
              </span>
              {!readOnly && <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
            </button>
          );
        })}
      </div>

      <ModulePermissionsDrawer
        isOpen={!!drawerKey}
        moduleKey={drawerKey}
        value={drawerKey ? (modules[drawerKey] || {}) : {}}
        onSave={(actionMap) => applyDrawer(drawerKey, actionMap)}
        onClose={() => setDrawerKey(null)}
      />
    </>
  );
}

export { emptyMod, summarise };
