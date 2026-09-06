import { useState } from 'react';
import { motion } from 'framer-motion';
import { api } from '../api/client';

const WALLET_TYPES = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank', label: 'Bank account' },
  { value: 'credit', label: 'Credit card' },
  { value: 'savings', label: 'Savings' },
  { value: 'other', label: 'Other' },
];

const currency = (n) =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(n);

export default function WalletManagerModal({ wallets, onClose, onChanged }) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState('cash');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleAdd = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await api.post('/wallets', { name, type });
      setName('');
      setShowAddForm(false);
      onChanged();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not add wallet');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/wallets/${id}`);
      onChanged();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not delete wallet');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.12 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60 px-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        transition={{ duration: 0.15, ease: 'easeOut' }}
        className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Your wallets</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="space-y-2 mb-4">
          {wallets.map((w) => (
            <div
              key={w.id}
              className="flex items-center justify-between rounded-xl border border-gray-200 dark:border-gray-800 px-4 py-3 transition-colors hover:border-brand-300 dark:hover:border-brand-700 hover:bg-gray-50 dark:hover:bg-gray-800/50"
            >
              <div className="flex items-center gap-3">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: w.color }} />
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {w.name}
                    {w.is_default && (
                      <span className="ml-2 text-[10px] uppercase tracking-wide text-gray-400">Default</span>
                    )}
                  </p>
                  <p className="text-xs text-gray-400 capitalize">{w.type}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{currency(w.balance)}</span>
                {wallets.length > 1 && (
                  <button
                    onClick={() => handleDelete(w.id)}
                    className="text-gray-400 hover:text-red-500 text-xs"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {error && <p className="text-sm text-red-500 mb-3">{error}</p>}

        {showAddForm ? (
          <form onSubmit={handleAdd} className="space-y-3 border-t border-gray-100 dark:border-gray-800 pt-4">
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Wallet name</label>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. TD Chequing, Amex Card"
                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                {WALLET_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="flex-1 rounded-lg border border-gray-300 dark:border-gray-700 text-sm font-medium py-2 text-gray-700 dark:text-gray-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium py-2 transition disabled:opacity-60"
              >
                {saving ? 'Adding...' : 'Add wallet'}
              </button>
            </div>
          </form>
        ) : (
          <button
            onClick={() => setShowAddForm(true)}
            className="w-full rounded-lg border border-dashed border-gray-300 dark:border-gray-700 text-sm font-medium py-2.5 text-brand-600 dark:text-brand-400"
          >
            + Add a wallet
          </button>
        )}
      </motion.div>
    </motion.div>
  );
}
