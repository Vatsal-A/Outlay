import { api } from '../api/client';

const currency = (n) =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(n);

const formatDate = (d) =>
  new Date(d).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });

export default function TransactionList({ transactions, transfers, categories, wallets, onChanged, onEdit }) {
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const walletById = new Map(wallets.map((w) => [w.id, w]));

  // Merge transactions and transfers into one chronological feed so the user
  // sees everything that happened to their money in one place.
  const items = [
    ...transactions.map((t) => ({ ...t, kind: 'transaction' })),
    ...transfers.map((t) => ({ ...t, kind: 'transfer' })),
  ].sort((a, b) => new Date(b.occurred_on) - new Date(a.occurred_on));

  const handleDeleteTransaction = async (id) => {
    await api.delete(`/transactions/${id}`);
    onChanged();
  };

  const handleDeleteTransfer = async (id) => {
    await api.delete(`/transfers/${id}`);
    onChanged();
  };

  if (items.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-8 text-center">
        <p className="text-sm text-gray-400">No transactions yet. Add your first one above.</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden">
      <div className="divide-y divide-gray-100 dark:divide-gray-800">
        {items.map((t) => {
          if (t.kind === 'transfer') {
            const from = walletById.get(t.from_wallet_id);
            const to = walletById.get(t.to_wallet_id);
            return (
              <div key={`transfer-${t.id}`} className="flex items-center justify-between px-5 py-3 group transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/40">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-2 h-2 rounded-full shrink-0 bg-brand-500" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate text-gray-900 dark:text-gray-100">
                      {(from?.name || t.from_wallet_name || 'Wallet')} → {(to?.name || t.to_wallet_name || 'Wallet')}
                      <span className="ml-2 text-[10px] uppercase tracking-wide text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-500/10 px-1.5 py-0.5 rounded">
                        Transfer
                      </span>
                    </p>
                    <p className="text-xs text-gray-400">{formatDate(t.occurred_on)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{currency(t.amount)}</span>
                  <button
                    onClick={() => handleDeleteTransfer(t.id)}
                    className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 text-sm transition"
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          }

          const category = categoryById.get(t.category_id);
          const wallet = walletById.get(t.wallet_id);
          return (
            <div key={t.id} className="flex items-center justify-between px-5 py-3 group transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/40">
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: category?.color || '#a1a1aa' }}
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate text-gray-900 dark:text-gray-100">
                    {t.merchant || t.description || 'Untitled'}
                    {t.is_recurring && (
                      <span className="ml-2 text-[10px] uppercase tracking-wide text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-500/10 px-1.5 py-0.5 rounded">
                        Recurring
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-gray-400">
                    {formatDate(t.occurred_on)}
                    {category ? ` · ${category.name}` : ''}
                    {wallet ? ` · ${wallet.name}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span
                  className={`text-sm font-medium ${
                    t.type === 'income' ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-900 dark:text-gray-100'
                  }`}
                >
                  {t.type === 'income' ? '+' : '-'}
                  {currency(t.amount)}
                </span>
                <div className="opacity-0 group-hover:opacity-100 transition flex items-center gap-2">
                  <button
                    onClick={() => onEdit(t)}
                    className="text-gray-400 hover:text-brand-500 text-sm"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeleteTransaction(t.id)}
                    className="text-gray-400 hover:text-red-500 text-sm"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
