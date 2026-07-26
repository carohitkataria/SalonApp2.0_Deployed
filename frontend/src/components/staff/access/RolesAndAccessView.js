import React, { useState } from 'react';
import { Shield, Users } from 'lucide-react';
import RolesManager from './RolesManager';
import UserAccountsList from './UserAccountsList';

/**
 * Staff-list-level Roles & Access view (sibling to the staff list, NOT per-staff).
 * Two tabs: Roles (role library) + User accounts (all salon logins).
 */
export default function RolesAndAccessView({ salonId, onOpenStaff }) {
  const [tab, setTab] = useState('roles');
  return (
    <div className="pane-r">
      <div className="p-4 md:p-6" style={{ overflowY: 'auto' }}>
        <div className="flex items-center gap-2 mb-4" data-testid="roles-access-tabs">
          <button onClick={() => setTab('roles')} data-testid="tab-roles"
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-semibold transition ${tab === 'roles' ? 'bg-gold text-black' : 'bg-muted text-muted-foreground hover:bg-muted/70'}`}>
            <Shield className="w-4 h-4" /> Roles
          </button>
          <button onClick={() => setTab('users')} data-testid="tab-users"
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-semibold transition ${tab === 'users' ? 'bg-gold text-black' : 'bg-muted text-muted-foreground hover:bg-muted/70'}`}>
            <Users className="w-4 h-4" /> User accounts
          </button>
        </div>
        {tab === 'roles' ? <RolesManager salonId={salonId} /> : <UserAccountsList salonId={salonId} onOpenStaff={onOpenStaff} />}
      </div>
    </div>
  );
}
