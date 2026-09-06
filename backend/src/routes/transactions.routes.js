import { Router } from 'express';
import { body, query as queryValidator, validationResult } from 'express-validator';
import multer from 'multer';
import Papa from 'papaparse';
import { query, withTransaction } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { detectRecurringForUser } from '../utils/recurringDetection.js';
import { generateOccurrenceDates, REPEAT_FREQUENCIES } from '../utils/recurringSchedule.js';

const router = Router();
router.use(requireAuth);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

// ---- List / filter transactions ----
router.get('/', async (req, res, next) => {
  try {
    const { from, to, categoryId, walletId, type, page = 1, pageSize = 50 } = req.query;
    const conditions = ['user_id = $1'];
    const params = [req.userId];

    if (from) {
      params.push(from);
      conditions.push(`occurred_on >= $${params.length}`);
    }
    if (to) {
      params.push(to);
      conditions.push(`occurred_on <= $${params.length}`);
    }
    if (categoryId) {
      params.push(categoryId);
      conditions.push(`category_id = $${params.length}`);
    }
    if (walletId) {
      params.push(walletId);
      conditions.push(`wallet_id = $${params.length}`);
    }
    if (type) {
      params.push(type);
      conditions.push(`type = $${params.length}`);
    }

    const offset = (Number(page) - 1) * Number(pageSize);
    params.push(Number(pageSize), offset);

    const result = await query(
      `SELECT id, category_id, wallet_id, amount, type, merchant, description, occurred_on, is_recurring, recurring_group_id
       FROM transactions
       WHERE ${conditions.join(' AND ')}
       ORDER BY occurred_on DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// ---- Create a single transaction (optionally repeating) ----
router.post(
  '/',
  [
    body('amount').isFloat({ gt: 0 }).withMessage('Amount must be a positive number'),
    body('type').isIn(['income', 'expense']),
    body('occurredOn').isISO8601().withMessage('occurredOn must be a valid date'),
    body('categoryId').optional().isUUID(),
    body('repeat').optional().isIn(['none', ...REPEAT_FREQUENCIES]),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

      const { amount, type, merchant, description, occurredOn, categoryId, walletId, repeat, force } = req.body;

      // Fall back to the user's default wallet so transactions never end up
      // "unassigned" unless the user has no wallets at all (shouldn't happen
      // post-signup, but defend against it anyway).
      let resolvedWalletId = walletId || null;
      if (!resolvedWalletId) {
        const defaultWallet = await query(
          'SELECT id FROM wallets WHERE user_id = $1 ORDER BY is_default DESC, created_at ASC LIMIT 1',
          [req.userId]
        );
        resolvedWalletId = defaultWallet.rows[0]?.id || null;
      }

      // Duplicate guard: if the user already has a transaction with the same
      // merchant, amount, and date, they most likely fat-fingered a repeat
      // entry (this is what tipped us off during testing — three identical
      // Netflix charges entered by hand). Rather than silently allowing it or
      // blocking it outright, ask for confirmation unless they've already
      // confirmed via `force`.
      if (!force && merchant) {
        const dupe = await query(
          `SELECT id FROM transactions
           WHERE user_id = $1 AND wallet_id = $2 AND type = $3 AND amount = $4
             AND occurred_on = $5 AND lower(trim(merchant)) = lower(trim($6))`,
          [req.userId, resolvedWalletId, type, amount, occurredOn, merchant]
        );
        if (dupe.rows.length > 0) {
          return res.status(409).json({
            error: 'duplicate',
            message: `You already have a ${type === 'expense' ? '-' : '+'}$${Number(amount).toFixed(2)} transaction for "${merchant}" on this date. Add it anyway?`,
          });
        }
      }

      const occurrenceDates = generateOccurrenceDates(occurredOn, repeat);
      const recurringGroupId =
        occurrenceDates.length > 1 ? await query('SELECT uuid_generate_v4() AS id').then((r) => r.rows[0].id) : null;

      const inserted = await withTransaction(async (client) => {
        const rows = [];
        for (const date of occurrenceDates) {
          const result = await client.query(
            `INSERT INTO transactions
               (user_id, category_id, wallet_id, amount, type, merchant, description, occurred_on, is_recurring, recurring_group_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
            [
              req.userId,
              categoryId || null,
              resolvedWalletId,
              amount,
              type,
              merchant || null,
              description || null,
              date,
              occurrenceDates.length > 1,
              recurringGroupId,
            ]
          );
          rows.push(result.rows[0]);
        }
        return rows;
      });

      res.status(201).json({
        transaction: inserted[0],
        occurrencesCreated: inserted.length,
      });
    } catch (err) {
      next(err);
    }
  }
);

router.put('/:id', async (req, res, next) => {
  try {
    const { amount, type, merchant, description, occurredOn, categoryId, walletId } = req.body;
    const result = await query(
      `UPDATE transactions SET
         amount = COALESCE($1, amount),
         type = COALESCE($2, type),
         merchant = COALESCE($3, merchant),
         description = COALESCE($4, description),
         occurred_on = COALESCE($5, occurred_on),
         category_id = COALESCE($6, category_id),
         wallet_id = COALESCE($7, wallet_id)
       WHERE id = $8 AND user_id = $9
       RETURNING *`,
      [amount, type, merchant, description, occurredOn, categoryId, walletId, req.params.id, req.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Transaction not found' });
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const result = await query(
      'DELETE FROM transactions WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Transaction not found' });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ---- CSV import ----
// Expected columns (case-insensitive, flexible order): date, amount, type, merchant, description, category
router.post('/import', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded (field name: file)' });

    const csvText = req.file.buffer.toString('utf8');
    const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });

    if (parsed.errors.length > 0) {
      return res.status(400).json({ error: 'Could not parse CSV', details: parsed.errors[0].message });
    }

    const categoriesResult = await query('SELECT id, name FROM categories WHERE user_id = $1', [req.userId]);
    const categoryByName = new Map(categoriesResult.rows.map((c) => [c.name.toLowerCase(), c.id]));

    let imported = 0;
    const skipped = [];

    for (const row of parsed.data) {
      const date = row.date || row.Date;
      const amount = parseFloat(row.amount || row.Amount);
      const type = (row.type || row.Type || (amount < 0 ? 'expense' : 'income')).toLowerCase();
      const merchant = row.merchant || row.Merchant || row.description || row.Description || null;
      const categoryName = (row.category || row.Category || '').toLowerCase();
      const categoryId = categoryByName.get(categoryName) || null;

      if (!date || Number.isNaN(amount)) {
        skipped.push(row);
        continue;
      }

      await query(
        `INSERT INTO transactions (user_id, category_id, amount, type, merchant, description, occurred_on, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'csv_import')`,
        [req.userId, categoryId, Math.abs(amount), type === 'expense' ? 'expense' : 'income', merchant, row.description || null, date]
      );
      imported++;
    }

    // Re-run recurring detection now that new history has been added
    const recurringGroups = await detectRecurringForUser(req.userId);

    res.status(201).json({ imported, skippedCount: skipped.length, recurringGroupsDetected: recurringGroups.length });
  } catch (err) {
    next(err);
  }
});

// ---- Manually trigger recurring detection ----
router.post('/detect-recurring', async (req, res, next) => {
  try {
    const groups = await detectRecurringForUser(req.userId);
    res.json({ recurringGroupsDetected: groups.length, groups });
  } catch (err) {
    next(err);
  }
});

// ---- Analytics: monthly summary + category breakdown ----
router.get(
  '/analytics/summary',
  [queryValidator('month').isInt({ min: 1, max: 12 }), queryValidator('year').isInt({ min: 2000 })],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

      const { month, year } = req.query;

      const totals = await query(
        `SELECT type, COALESCE(SUM(amount), 0) AS total
         FROM transactions
         WHERE user_id = $1 AND EXTRACT(MONTH FROM occurred_on) = $2 AND EXTRACT(YEAR FROM occurred_on) = $3
         GROUP BY type`,
        [req.userId, month, year]
      );

      const byCategory = await query(
        `SELECT c.id AS category_id, c.name, c.color, COALESCE(SUM(t.amount), 0) AS total
         FROM transactions t
         JOIN categories c ON c.id = t.category_id
         WHERE t.user_id = $1 AND t.type = 'expense'
           AND EXTRACT(MONTH FROM t.occurred_on) = $2 AND EXTRACT(YEAR FROM t.occurred_on) = $3
         GROUP BY c.id, c.name, c.color
         ORDER BY total DESC`,
        [req.userId, month, year]
      );

      const income = totals.rows.find((r) => r.type === 'income')?.total || 0;
      const expense = totals.rows.find((r) => r.type === 'expense')?.total || 0;

      res.json({
        month: Number(month),
        year: Number(year),
        totalIncome: Number(income),
        totalExpense: Number(expense),
        net: Number(income) - Number(expense),
        byCategory: byCategory.rows.map((r) => ({ ...r, total: Number(r.total) })),
      });
    } catch (err) {
      next(err);
    }
  }
);

// ---- Analytics: trend over last N months ----
router.get('/analytics/trend', async (req, res, next) => {
  try {
    const months = Math.min(Number(req.query.months) || 6, 24);

    const result = await query(
      `SELECT
         TO_CHAR(date_trunc('month', occurred_on), 'YYYY-MM') AS month,
         SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) AS expense,
         SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) AS income
       FROM transactions
       WHERE user_id = $1 AND occurred_on >= date_trunc('month', now()) - ($2 || ' months')::interval
       GROUP BY 1
       ORDER BY 1 ASC`,
      [req.userId, months]
    );

    res.json(result.rows.map((r) => ({ month: r.month, expense: Number(r.expense), income: Number(r.income) })));
  } catch (err) {
    next(err);
  }
});

export default router;
