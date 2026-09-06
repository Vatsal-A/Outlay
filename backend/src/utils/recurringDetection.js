import crypto from 'crypto';
import { query } from '../db/pool.js';

/**
 * Recurring expense detection.
 *
 * Approach: group a user's expense transactions by normalized merchant name,
 * then within each merchant group, look for transactions whose amounts are
 * close (within AMOUNT_TOLERANCE_PCT) and whose dates fall at a roughly
 * consistent interval (within INTERVAL_TOLERANCE_DAYS of each other).
 * If we find >= MIN_OCCURRENCES such transactions, we tag them as a
 * recurring series and stamp them with a shared recurring_group_id.
 *
 * This runs as an on-demand analysis (called after CSV import or on a
 * schedule) rather than on every single transaction insert, since it needs
 * to look at the merchant's full history to be accurate.
 */

const MIN_OCCURRENCES = 3;
const AMOUNT_TOLERANCE_PCT = 0.05; // amounts within 5% of each other count as "the same"
const INTERVAL_TOLERANCE_DAYS = 4; // allows for weekends/billing cycle drift
const EXPECTED_INTERVALS = [
  { label: 'weekly', days: 7 },
  { label: 'biweekly', days: 14 },
  { label: 'monthly', days: 30 },
];

const normalizeMerchant = (merchant = '') =>
  merchant
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const withinTolerance = (a, b, pct) => Math.abs(a - b) <= Math.max(a, b) * pct;

const daysBetween = (a, b) => Math.abs((new Date(a) - new Date(b)) / (1000 * 60 * 60 * 24));

const matchesExpectedInterval = (days) =>
  EXPECTED_INTERVALS.some((i) => Math.abs(days - i.days) <= INTERVAL_TOLERANCE_DAYS);

/**
 * Runs detection for a single user and persists results.
 * Returns the recurring groups found, for reporting back to the client.
 */
export const detectRecurringForUser = async (userId) => {
  const { rows: transactions } = await query(
    `SELECT id, amount, merchant, occurred_on
     FROM transactions
     WHERE user_id = $1 AND type = 'expense' AND merchant IS NOT NULL AND merchant != ''
     ORDER BY occurred_on ASC`,
    [userId]
  );

  // Group by normalized merchant name
  const byMerchant = new Map();
  for (const t of transactions) {
    const key = normalizeMerchant(t.merchant);
    if (!key) continue;
    if (!byMerchant.has(key)) byMerchant.set(key, []);
    byMerchant.get(key).push(t);
  }

  const groupsFound = [];

  for (const [merchantKey, txns] of byMerchant.entries()) {
    if (txns.length < MIN_OCCURRENCES) continue;

    // Cluster by amount similarity first (a merchant might have both a
    // recurring subscription AND unrelated one-off charges)
    const amountClusters = [];
    for (const t of txns) {
      let cluster = amountClusters.find((c) => withinTolerance(c.avgAmount, Number(t.amount), AMOUNT_TOLERANCE_PCT));
      if (!cluster) {
        cluster = { avgAmount: Number(t.amount), items: [] };
        amountClusters.push(cluster);
      }
      cluster.items.push(t);
      cluster.avgAmount = cluster.items.reduce((sum, i) => sum + Number(i.amount), 0) / cluster.items.length;
    }

    for (const cluster of amountClusters) {
      if (cluster.items.length < MIN_OCCURRENCES) continue;

      const sorted = cluster.items.sort((a, b) => new Date(a.occurred_on) - new Date(b.occurred_on));
      const intervals = [];
      for (let i = 1; i < sorted.length; i++) {
        intervals.push(daysBetween(sorted[i - 1].occurred_on, sorted[i].occurred_on));
      }

      const consistentIntervals = intervals.filter(matchesExpectedInterval).length;
      // Require most gaps between consecutive charges to look like a regular cadence
      if (consistentIntervals >= intervals.length * 0.7) {
        const groupId = crypto.randomUUID();
        groupsFound.push({
          merchant: merchantKey,
          groupId,
          transactionIds: sorted.map((t) => t.id),
          averageAmount: Math.round(cluster.avgAmount * 100) / 100,
          occurrences: sorted.length,
        });
      }
    }
  }

  // Persist: tag matched transactions as recurring
  for (const group of groupsFound) {
    await query(
      `UPDATE transactions SET is_recurring = true, recurring_group_id = $1 WHERE id = ANY($2::uuid[])`,
      [group.groupId, group.transactionIds]
    );
  }

  return groupsFound;
};
