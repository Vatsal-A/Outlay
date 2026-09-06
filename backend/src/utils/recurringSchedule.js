/**
 * Given a start date and a repeat frequency, returns an array of ISO date
 * strings (YYYY-MM-DD) for the original occurrence plus its future repeats.
 *
 * We generate a bounded number of future occurrences up front rather than
 * running an open-ended background job — simpler to reason about, and the
 * recurring-detection algorithm will keep tagging any further manual entries
 * as recurring anyway once this batch runs out.
 */

const OCCURRENCE_COUNTS = {
  daily: 30,
  weekly: 12,
  biweekly: 12,
  monthly: 12,
  semiannual: 4,
  yearly: 3,
};

const addDays = (date, days) => {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
};

const addMonths = (date, months) => {
  const d = new Date(date);
  const targetMonth = d.getUTCMonth() + months;
  d.setUTCMonth(targetMonth);
  return d;
};

const toISODate = (d) => d.toISOString().slice(0, 10);

export const REPEAT_FREQUENCIES = Object.keys(OCCURRENCE_COUNTS);

export const generateOccurrenceDates = (startDateStr, frequency) => {
  if (!frequency || frequency === 'none') return [startDateStr];

  const count = OCCURRENCE_COUNTS[frequency];
  if (!count) return [startDateStr];

  const start = new Date(startDateStr);
  const dates = [startDateStr];

  for (let i = 1; i < count; i++) {
    let next;
    switch (frequency) {
      case 'daily':
        next = addDays(start, i);
        break;
      case 'weekly':
        next = addDays(start, i * 7);
        break;
      case 'biweekly':
        next = addDays(start, i * 14);
        break;
      case 'monthly':
        next = addMonths(start, i);
        break;
      case 'semiannual':
        next = addMonths(start, i * 6);
        break;
      case 'yearly':
        next = addMonths(start, i * 12);
        break;
      default:
        next = null;
    }
    if (next) dates.push(toISODate(next));
  }

  return dates;
};
