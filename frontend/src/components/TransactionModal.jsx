import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../api/client';

const today = () => new Date().toISOString().slice(0, 10);

const TYPE_CONFIG = {
  expense: {
    label: 'Expense',
    activeClass: 'bg-red-500 text-white',
    walletLabel: 'From wallet',
    payeeLabel: 'Merchant / Payee',
    payeePlaceholder: 'e.g. Netflix, Loblaws',
  },
  income: {
    label: 'Income',
    activeClass: 'bg-emerald-500 text-white',
    walletLabel: 'To wallet',
    payeeLabel: 'Source',
    payeePlaceholder: 'e.g. Employer, Client, Gift',
  },
  transfer: {
    label: 'Transfer',
    activeClass: 'bg-brand-500 text-white',
  },
};

const REPEAT_OPTIONS = [
  { value: 'none', label: 'Does not repeat' },
  { value: 'daily', label: 'Every day' },
  { value: 'weekly', label: 'Every week' },
  { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'monthly', label: 'Every month' },
  { value: 'semiannual', label: 'Every 6 months' },
  { value: 'yearly', label: 'Every year' },
];

// `editing` is an existing transaction to prefill/update, or null for create mode.
export default function TransactionModal({ categories, wallets, onClose, onSaved, editing = null }) {
  const [type, setType] = useState(editing?.type || 'expense');
  const [amount, setAmount] = useState(editing ? String(editing.amount) : '');
  const [merchant, setMerchant] = useState(editing?.merchant || '');
  const [description, setDescription] = useState(editing?.description || '');
  const [occurredOn, setOccurredOn] = useState(editing?.occurred_on?.slice(0, 10) || today());
  const [categoryId, setCategoryId] = useState(editing?.category_id || '');
  const [walletId, setWalletId] = useState(editing?.wallet_id || wallets[0]?.id || '');
  const [toWalletId, setToWalletId] = useState(wallets.find((w) => w.id !== wallets[0]?.id)?.id || '');
  const [repeat, setRepeat] = useState('none');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState(null);

  const isEditing = Boolean(editing);
  const config = TYPE_CONFIG[type];

  useEffect(() => {
    const handler = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const swapWallets = () => {
    setWalletId(toWalletId);
    setToWalletId(walletId);
  };

  const buildPayload = (force = false) => ({
    amount: parseFloat(amount),
    type,
    merchant: merchant || null,
    description: description || null,
    occurredOn,
    categoryId: categoryId || null,
    walletId: walletId || null,
    repeat: isEditing ? undefined : repeat,
    force,
  });

  const submitTransaction = async (force = false) => {
    if (isEditing) {
      await api.put(`/transactions/${editing.id}`, buildPayload());
    } else {
      await api.post('/transactions', buildPayload(force));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (type === 'transfer' && walletId === toWalletId) {
      setError('Choose two different wallets to transfer between');
      return;
    }

    setSaving(true);
    try {
      if (type === 'transfer') {
        await api.post('/transfers', {
          fromWalletId: walletId,
          toWalletId,
          amount: parseFloat(amount),
          occurredOn,
          note: description || null,
        });
      } else {
        await submitTransaction(false);
      }
      onSaved();
    } catch (err) {
      // The backend flags likely-duplicate entries (same merchant/amount/date)
      // with a 409 instead of silently allowing or blocking them — ask the
      // user to confirm rather than guessing either way.
      if (err.response?.status === 409 && err.response?.data?.error === 'duplicate') {
        setDuplicateWarning(err.response.data.message);
      } else {
        setError(err.response?.data?.error || 'Could not save');
      }
    } finally {
      setSaving(false);
    }
  };

  const confirmDuplicate = async () => {
    setSaving(true);
    try {
      await submitTransaction(true);
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save');
      setDuplicateWarning(null);
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
        <AnimatePresence mode="wait">
          {duplicateWarning ? (
            <motion.div
              key="duplicate-confirm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-4"
            >
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">This might be a duplicate</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">{duplicateWarning}</p>
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setDuplicateWarning(null)}
                  className="flex-1 rounded-lg border border-gray-300 dark:border-gray-700 text-sm font-medium py-2 text-gray-700 dark:text-gray-300"
                >
                  Go back
                </button>
                <button
                  type="button"
                  onClick={confirmDuplicate}
                  disabled={saving}
                  className="flex-1 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium py-2 transition disabled:opacity-60"
                >
                  {saving ? 'Adding...' : 'Yes, add it anyway'}
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {isEditing ? 'Edit transaction' : 'New transaction'}
                </h2>
                <button
                  onClick={onClose}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none transition-transform hover:rotate-90 duration-200"
                  aria-label="Close"
                >
                  ×
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="flex rounded-lg overflow-hidden border border-gray-300 dark:border-gray-700">
                  {Object.entries(TYPE_CONFIG).map(([key, cfg]) => (
                    <button
                      type="button"
                      key={key}
                      disabled={isEditing && key === 'transfer'}
                      onClick={() => setType(key)}
                      className={`flex-1 py-2 text-sm font-medium transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed ${
                        type === key ? cfg.activeClass : 'bg-transparent text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                      }`}
                    >
                      {cfg.label}
                    </button>
                  ))}
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 transition-shadow"
                  />
                </div>

                {type === 'transfer' ? (
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">From</label>
                    <select
                      value={walletId}
                      onChange={(e) => setWalletId(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    >
                      {wallets.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </select>

                    <div className="flex justify-center my-1">
                      <button
                        type="button"
                        onClick={swapWallets}
                        className="text-gray-400 hover:text-brand-500 text-sm w-8 h-8 rounded-full border border-gray-200 dark:border-gray-700 flex items-center justify-center transition-transform hover:rotate-180 duration-300"
                        aria-label="Swap wallets"
                        title="Swap"
                      >
                        ⇅
                      </button>
                    </div>

                    <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">To</label>
                    <select
                      value={toWalletId}
                      onChange={(e) => setToWalletId(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    >
                      {wallets.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{config.payeeLabel}</label>
                      <input
                        value={merchant}
                        onChange={(e) => setMerchant(e.target.value)}
                        placeholder={config.payeePlaceholder}
                        className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{config.walletLabel}</label>
                        <select
                          value={walletId}
                          onChange={(e) => setWalletId(e.target.value)}
                          className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                        >
                          {wallets.map((w) => (
                            <option key={w.id} value={w.id}>
                              {w.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Category</label>
                        <select
                          value={categoryId}
                          onChange={(e) => setCategoryId(e.target.value)}
                          className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                        >
                          <option value="">None</option>
                          {categories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </>
                )}

                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Date</label>
                  <input
                    type="date"
                    required
                    value={occurredOn}
                    onChange={(e) => setOccurredOn(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>

                {type !== 'transfer' && !isEditing && (
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Repeat</label>
                    <select
                      value={repeat}
                      onChange={(e) => setRepeat(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    >
                      {REPEAT_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    {repeat !== 'none' && (
                      <p className="text-xs text-gray-400 mt-1">
                        We'll add the upcoming occurrences automatically and tag them as recurring.
                      </p>
                    )}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Note (optional)</label>
                  <input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Anything else to remember about this"
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>

                {error && <p className="text-sm text-red-500">{error}</p>}

                <div className="flex gap-3 pt-1">
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 rounded-lg border border-gray-300 dark:border-gray-700 text-sm font-medium py-2 text-gray-700 dark:text-gray-300 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving || wallets.length === 0}
                    className="flex-1 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium py-2 transition-all hover:shadow-md disabled:opacity-60 disabled:hover:shadow-none"
                  >
                    {saving ? 'Saving...' : isEditing ? 'Save changes' : 'Save transaction'}
                  </button>
                </div>
                {wallets.length === 0 && (
                  <p className="text-xs text-amber-500 text-center">Add a wallet first before recording transactions.</p>
                )}
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
