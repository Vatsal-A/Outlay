export default function StatCard({ label, value, tone = 'default' }) {
  const toneClasses = {
    default: 'text-gray-900 dark:text-gray-100',
    positive: 'text-emerald-600 dark:text-emerald-400',
    negative: 'text-red-600 dark:text-red-400',
  };

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 shadow-sm dark:shadow-none transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md dark:hover:shadow-none dark:hover:border-gray-700">
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">{label}</p>
      <p className={`text-2xl font-semibold ${toneClasses[tone]}`}>{value}</p>
    </div>
  );
}
