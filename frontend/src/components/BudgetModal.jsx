import { useState } from 'react';
import { motion } from 'framer-motion';
import { api } from '../api/client';

export default function BudgetModal({ categories, month, year, onClose, onSaved }) {
  const [categoryId, setCategoryId] = useState(categories[0]?.id || '');
  const [monthlyLimit, setMonthlyLimit] = useState('');
  const [alertThresholdPct, setAlertThresholdPct] = useState(80);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await api.post('/budgets', {
        categoryId,
        monthlyLimit: parseFloat(monthlyLimit),
        month,
        year,
        alertThresholdPct: Number(alertThresholdPct),
      });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save budget');
    } finally {
      setSaving(false);
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
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Set a budget</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Category</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
              Monthly limit
            </label>
            <input
              type="number"
              step="0.01"
              min="1"
              required
              value={monthlyLimit}
              onChange={(e) => setMonthlyLimit(e.target.value)}
              placeholder="e.g. 400"
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
              Alert me at {alertThresholdPct}% used
            </label>
            <input
              type="range"
              min="50"
              max="100"
              step="5"
              value={alertThresholdPct}
              onChange={(e) => setAlertThresholdPct(e.target.value)}
              className="w-full accent-brand-500"
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 dark:border-gray-700 text-sm font-medium py-2 text-gray-700 dark:text-gray-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || categories.length === 0}
              className="flex-1 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium py-2 transition disabled:opacity-60"
            >
              {saving ? 'Saving...' : 'Save budget'}
            </button>
          </div>
          {categories.length === 0 && (
            <p className="text-xs text-amber-500 text-center">Add a category first before setting a budget.</p>
          )}
        </form>
      </motion.div>
    </motion.div>
  );
}
