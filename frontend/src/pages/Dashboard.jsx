import { useEffect, useState, useCallback } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
  Sector,
} from 'recharts';
import { AnimatePresence } from 'framer-motion';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import StatCard from '../components/StatCard';
import TransactionModal from '../components/TransactionModal';
import TransactionList from '../components/TransactionList';
import BudgetModal from '../components/BudgetModal';
import WalletManagerModal from '../components/WalletManagerModal';

const currency = (n) =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(n);

// Renders the hovered pie slice slightly larger — gives the "pop out" feel
// the person asked for without needing a whole charting library swap.
const renderActivePieSlice = (props) => {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
  return (
    <Sector
      cx={cx}
      cy={cy}
      innerRadius={innerRadius}
      outerRadius={outerRadius + 8}
      startAngle={startAngle}
      endAngle={endAngle}
      fill={fill}
    />
  );
};

export default function Dashboard() {
  const { user, logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();

  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1); // 1-12
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());

  const [summary, setSummary] = useState(null);
  const [trend, setTrend] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [categories, setCategories] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [wallets, setWallets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [monthLoading, setMonthLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  const [showAddModal, setShowAddModal] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [activePieIndex, setActivePieIndex] = useState(-1);

  // Data that isn't month-scoped: categories, wallets, the 6-month trend,
  // and the recent-transactions feed. Fetched once (and after any mutation).
  const loadAll = useCallback(async () => {
    setLoadError('');
    try {
      const [summaryRes, trendRes, budgetsRes, categoriesRes, transactionsRes, transfersRes, walletsRes] =
        await Promise.all([
          api.get('/transactions/analytics/summary', { params: { month: selectedMonth, year: selectedYear } }),
          api.get('/transactions/analytics/trend', { params: { months: 6 } }),
          api.get('/budgets', { params: { month: selectedMonth, year: selectedYear } }),
          api.get('/categories'),
          api.get('/transactions', { params: { pageSize: 25 } }),
          api.get('/transfers'),
          api.get('/wallets'),
        ]);
      setSummary(summaryRes.data);
      setTrend(trendRes.data);
      setBudgets(budgetsRes.data);
      setCategories(categoriesRes.data);
      setTransactions(transactionsRes.data);
      setTransfers(transfersRes.data);
      setWallets(walletsRes.data);
    } catch (err) {
      // A 401 here means the interceptor is already redirecting to /login —
      // avoid flashing an error message right before that happens. Any other
      // failure (backend down, network error) gets a visible retry prompt
      // instead of leaving the dashboard stuck on a blank screen.
      if (err.response?.status !== 401) {
        setLoadError(
          err.response?.data?.error || 'Could not load your dashboard. Is the backend running?'
        );
      }
    }
  }, [selectedMonth, selectedYear]);

  // Re-fetch just the month-scoped pieces (summary + budgets) when the user
  // navigates months, instead of re-fetching everything.
  const reloadMonthData = useCallback(async () => {
    setMonthLoading(true);
    try {
      const [summaryRes, budgetsRes] = await Promise.all([
        api.get('/transactions/analytics/summary', { params: { month: selectedMonth, year: selectedYear } }),
        api.get('/budgets', { params: { month: selectedMonth, year: selectedYear } }),
      ]);
      setSummary(summaryRes.data);
      setBudgets(budgetsRes.data);
    } catch (err) {
      if (err.response?.status !== 401) {
        setLoadError(err.response?.data?.error || 'Could not load that month.');
      }
    } finally {
      setMonthLoading(false);
    }
  }, [selectedMonth, selectedYear]);

  useEffect(() => {
    setLoading(true);
    loadAll().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Skip on first mount — loadAll already fetched the initial month above.
    if (loading) return;
    reloadMonthData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth, selectedYear]);

  const goToMonth = (direction) => {
    let newMonth = selectedMonth + direction;
    let newYear = selectedYear;
    if (newMonth > 12) {
      newMonth = 1;
      newYear += 1;
    } else if (newMonth < 1) {
      newMonth = 12;
      newYear -= 1;
    }
    setSelectedMonth(newMonth);
    setSelectedYear(newYear);
  };

  const isCurrentMonth = selectedMonth === now.getMonth() + 1 && selectedYear === now.getFullYear();

  const monthLabel = new Date(selectedYear, selectedMonth - 1, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  const handleTransactionSaved = () => {
    setShowAddModal(false);
    setEditingTransaction(null);
    loadAll();
  };

  const totalBalance = wallets.reduce((sum, w) => sum + Number(w.balance), 0);

  const chartGrid = isDark ? '#27272a' : '#e5e7eb';
  const chartText = isDark ? '#a1a1aa' : '#52525b';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <header className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-6 py-4 flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Outlay</h1>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => setShowWalletModal(true)}
            className="text-sm px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 flex items-center gap-2 transition-all hover:border-brand-400 hover:shadow-sm"
          >
            <span>💼</span>
            <span>{wallets.length} wallet{wallets.length !== 1 ? 's' : ''}</span>
            <span className="text-gray-400">·</span>
            <span className="font-medium">{currency(totalBalance)}</span>
          </button>
          <span className="text-sm text-gray-500 dark:text-gray-400">Hi, {user?.name}</span>
          <button
            onClick={toggleTheme}
            className="text-sm px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 transition-all hover:border-brand-400 hover:shadow-sm"
          >
            {isDark ? '☀️ Light' : '🌙 Dark'}
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="text-sm px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium transition-all hover:shadow-md active:scale-95"
          >
            + Add transaction
          </button>
          <button
            onClick={logout}
            className="text-sm px-3 py-1.5 rounded-lg bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 transition-all hover:shadow-md active:scale-95"
          >
            Log out
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        {loading ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading dashboard...</p>
        ) : loadError ? (
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-8 text-center space-y-3">
            <p className="text-sm text-red-500">{loadError}</p>
            <button
              onClick={() => {
                setLoading(true);
                loadAll().finally(() => setLoading(false));
              }}
              className="text-sm px-4 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-medium"
            >
              Try again
            </button>
          </div>
        ) : summary ? (
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => goToMonth(-1)}
                  className="w-8 h-8 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                  aria-label="Previous month"
                >
                  ‹
                </button>
                <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 w-40 text-center">
                  {monthLabel}
                </h2>
                <button
                  onClick={() => goToMonth(1)}
                  className="w-8 h-8 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                  aria-label="Next month"
                >
                  ›
                </button>
                {!isCurrentMonth && (
                  <button
                    onClick={() => {
                      setSelectedMonth(now.getMonth() + 1);
                      setSelectedYear(now.getFullYear());
                    }}
                    className="text-xs text-brand-600 dark:text-brand-400 font-medium ml-1"
                  >
                    Jump to today
                  </button>
                )}
              </div>
              {monthLoading && <span className="text-xs text-gray-400">Updating…</span>}
            </div>

            <div className={`grid grid-cols-1 sm:grid-cols-3 gap-4 transition-opacity duration-200 ${monthLoading ? 'opacity-50' : 'opacity-100'}`}>
              <StatCard label={`Income · ${monthLabel}`} value={currency(summary.totalIncome)} tone="positive" />
              <StatCard label={`Expenses · ${monthLabel}`} value={currency(summary.totalExpense)} tone="negative" />
              <StatCard
                label="Net"
                value={currency(summary.net)}
                tone={summary.net >= 0 ? 'positive' : 'negative'}
              />
            </div>

            {budgets.some((b) => b.alertTriggered) && (
              <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300 rounded-xl px-4 py-3 text-sm">
                ⚠️ You're close to or over budget in:{' '}
                {budgets
                  .filter((b) => b.alertTriggered)
                  .map((b) => b.category_name)
                  .join(', ')}
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 shadow-sm dark:shadow-none transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:hover:shadow-none dark:hover:border-gray-700">
                <h2 className="text-sm font-medium mb-4 text-gray-900 dark:text-gray-100">Spending trend (6 months)</h2>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={trend}>
                    <CartesianGrid stroke={chartGrid} strokeDasharray="3 3" />
                    <XAxis dataKey="month" tick={{ fill: chartText, fontSize: 12 }} />
                    <YAxis tick={{ fill: chartText, fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{
                        background: isDark ? '#18181b' : '#fff',
                        border: '1px solid ' + chartGrid,
                        fontSize: 12,
                      }}
                    />
                    <Line type="monotone" dataKey="expense" stroke="#ef4444" strokeWidth={2} name="Expenses" animationDuration={400} />
                    <Line type="monotone" dataKey="income" stroke="#22c55e" strokeWidth={2} name="Income" animationDuration={400} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className={`bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 shadow-sm dark:shadow-none transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:hover:shadow-none dark:hover:border-gray-700 ${monthLoading ? 'opacity-50' : 'opacity-100'}`}>
                <h2 className="text-sm font-medium mb-4 text-gray-900 dark:text-gray-100">Spending by category · {monthLabel}</h2>
                {summary.byCategory.length === 0 ? (
                  <p className="text-sm text-gray-400 py-16 text-center">No expenses this month</p>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie
                        data={summary.byCategory}
                        dataKey="total"
                        nameKey="name"
                        innerRadius={55}
                        outerRadius={90}
                        paddingAngle={2}
                        activeIndex={activePieIndex}
                        activeShape={renderActivePieSlice}
                        onMouseEnter={(_, index) => setActivePieIndex(index)}
                        onMouseLeave={() => setActivePieIndex(-1)}
                        animationDuration={400}
                      >
                        {summary.byCategory.map((entry, i) => (
                          <Cell key={i} fill={entry.color} className="cursor-pointer" />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => currency(v)} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 shadow-sm dark:shadow-none transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:hover:shadow-none dark:hover:border-gray-700">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-medium text-gray-900 dark:text-gray-100">Budgets · {monthLabel}</h2>
                <button
                  onClick={() => setShowBudgetModal(true)}
                  className="text-sm text-brand-600 dark:text-brand-400 font-medium"
                >
                  + Add budget
                </button>
              </div>
              {budgets.length === 0 ? (
                <p className="text-sm text-gray-400">No budgets set yet.</p>
              ) : (
                <div className="space-y-4">
                  {budgets.map((b) => (
                    <div key={b.id} className="group">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-900 dark:text-gray-100">{b.category_name}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-gray-500 dark:text-gray-400">
                            {currency(b.spent)} / {currency(b.monthly_limit)}
                          </span>
                          <button
                            onClick={async () => {
                              await api.delete(`/budgets/${b.id}`);
                              reloadMonthData();
                            }}
                            className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 text-xs transition"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                      <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${b.overBudget ? 'bg-red-500' : b.alertTriggered ? 'bg-amber-500' : 'bg-brand-500'}`}
                          style={{ width: `${Math.min(b.pctUsed, 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-medium text-gray-900 dark:text-gray-100">Recent transactions</h2>
                <button
                  onClick={() => setShowAddModal(true)}
                  className="text-sm text-brand-600 dark:text-brand-400 font-medium"
                >
                  + Add another
                </button>
              </div>
              <TransactionList
                transactions={transactions}
                transfers={transfers}
                categories={categories}
                wallets={wallets}
                onChanged={loadAll}
                onEdit={(t) => setEditingTransaction(t)}
              />
            </div>
          </>
        ) : null}
      </main>

      <AnimatePresence>
        {(showAddModal || editingTransaction) && (
          <TransactionModal
            key="transaction-modal"
            categories={categories}
            wallets={wallets}
            editing={editingTransaction}
            onClose={() => {
              setShowAddModal(false);
              setEditingTransaction(null);
            }}
            onSaved={handleTransactionSaved}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showBudgetModal && (
          <BudgetModal
            key="budget-modal"
            categories={categories}
            month={selectedMonth}
            year={selectedYear}
            onClose={() => setShowBudgetModal(false)}
            onSaved={() => {
              setShowBudgetModal(false);
              reloadMonthData();
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showWalletModal && (
          <WalletManagerModal
            key="wallet-modal"
            wallets={wallets}
            onClose={() => setShowWalletModal(false)}
            onChanged={loadAll}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
