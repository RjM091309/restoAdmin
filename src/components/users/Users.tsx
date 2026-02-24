import React, { useEffect, useState } from 'react';
import { Search, Loader2, Shield, User as UserIcon, Plus, Edit2, Trash2 } from 'lucide-react';
import { DataTable, ColumnDef } from '../ui/DataTable';
import { Modal } from '../ui/Modal';
import { cn } from '../../lib/utils';

interface UserRow {
  id: string;
  fullName: string;
  username: string;
  role: string;
  branch: string;
  tableNumber: string | number | null;
  status: 'Active' | 'Inactive';
}

export const Users: React.FC = () => {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<UserRow[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    const fetchUsers = async () => {
      setLoading(true);
      setError(null);
      try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/user-management/users', {
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
        if (!res.ok) {
          throw new Error(`Failed to load users (${res.status})`);
        }
        const json = await res.json();
        const rawData = json.data ?? json;
        const mappedData: UserRow[] = (Array.isArray(rawData) ? rawData : []).map((u: any) => ({
          id: u.user_id || u.IDNo,
          fullName: `${u.FIRSTNAME || ''} ${u.LASTNAME || ''}`.trim(),
          username: u.USERNAME || '',
          role: u.role || '',
          branch: u.BRANCH_LABEL || u.BRANCH_NAME || '—',
          tableNumber: u.TABLE_NUMBER || '—',
          status: u.ACTIVE === 1 ? 'Active' : 'Inactive'
        }));
        setUsers(mappedData);
        setFilteredUsers(mappedData);
      } catch (e: any) {
        console.error('Failed to fetch users', e);
        setError(e.message || 'Failed to load users');
      } finally {
        setLoading(false);
      }
    };
    fetchUsers();
  }, []);

  useEffect(() => {
    const filtered = users.filter(user =>
      (user.fullName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (user.username || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (user.role || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (user.branch || '').toLowerCase().includes(searchQuery.toLowerCase())
    );
    setFilteredUsers(filtered);
  }, [searchQuery, users]);

  const columns: ColumnDef<UserRow>[] = [
    {
      header: 'Full Name',
      render: (user) => <span className="text-sm font-bold">{user.fullName}</span>,
    },
    {
      header: 'Username',
      render: (user) => <span className="text-sm font-bold text-brand-muted">{user.username}</span>,
    },
    {
      header: 'Role',
      render: (user) => <span className="text-xs font-bold bg-gray-100 px-2 py-1 rounded-lg">{user.role}</span>,
    },
    {
      header: 'Branch',
      render: (user) => <span className="text-sm font-medium">{user.branch}</span>,
    },
    {
      header: 'Table #',
      render: (user) => <span className="text-sm font-medium">{user.tableNumber}</span>,
    },
    {
      header: 'Status',
      render: (user) => (
        <span
          className={cn(
            "text-xs font-bold px-2 py-1 rounded-lg",
            user.status === 'Active' ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600"
          )}
        >
          {user.status}
        </span>
      ),
    },
    {
      header: 'Actions',
      className: 'text-right',
      render: () => (
        <div className="flex justify-end items-center gap-2">
          <button
            className="p-2 text-brand-muted hover:text-brand-orange hover:bg-brand-orange/10 transition-colors rounded-lg"
            title="Edit User"
          >
            <Edit2 size={16} />
          </button>
          <button
            className="p-2 text-brand-muted hover:text-red-500 hover:bg-red-50 transition-colors rounded-lg"
            title="Delete User"
          >
            <Trash2 size={16} />
          </button>
        </div>
      ),
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[500px]">
        <Loader2 className="h-10 w-10 animate-spin text-brand-orange" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[500px]">
        <p className="text-red-500 text-lg">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pt-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted" />
            <input
              type="text"
              placeholder="Search users..."
              className="bg-white border-none rounded-xl pl-10 pr-4 py-2.5 text-base w-80 shadow-sm focus:ring-2 focus:ring-brand-orange/20 outline-none"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-brand-orange text-white px-6 py-2.5 rounded-xl text-base font-bold flex items-center gap-2 shadow-lg shadow-brand-orange/20 hover:bg-brand-orange/90 transition-all"
        >
          <Plus size={18} />
          Add New User
        </button>
      </div>

      <div className="grid grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm">
          <p className="text-brand-muted text-sm font-medium mb-1">Total Users</p>
          <h3 className="text-3xl font-bold">{users.length}</h3>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm">
          <p className="text-brand-muted text-sm font-medium mb-1">Active Users</p>
          <h3 className="text-3xl font-bold text-green-600">{users.filter(u => u.status === 'Active').length}</h3>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm">
          <p className="text-brand-muted text-sm font-medium mb-1">Inactive Users</p>
          <h3 className="text-3xl font-bold text-red-500">{users.filter(u => u.status === 'Inactive').length}</h3>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm">
          <p className="text-brand-muted text-sm font-medium mb-1">User Roles</p>
          <h3 className="text-3xl font-bold">{new Set(users.map(u => u.role)).size}</h3>
        </div>
      </div>

      <DataTable
        data={filteredUsers}
        columns={columns}
        keyExtractor={(item) => item.id}
      />

      {/* Add New User Modal - Content will be added later */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Add New User"
        maxWidth="lg"
        footer={
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={() => setIsModalOpen(false)}
              className="px-5 py-2.5 rounded-xl font-bold text-brand-muted hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => setIsModalOpen(false)}
              className="px-6 py-2.5 rounded-xl font-bold text-white bg-brand-orange shadow-lg shadow-brand-orange/30 hover:bg-brand-orange/90 transition-all active:scale-[0.98]"
            >
              Save User
            </button>
          </div>
        }
      >
        <div className="space-y-5">
          <p className="text-brand-muted">User creation form will go here.</p>
        </div>
      </Modal>
    </div>
  );
};
