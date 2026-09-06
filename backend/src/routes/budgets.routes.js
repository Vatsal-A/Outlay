import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { query } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const { month, year } = req.query;
    const params = [req.userId];
    let where = 'b.user_id = $1';
    if (month && year) {
      params.push(month, year);
      where += ` AND b.month = $2 AND b.year = $3`;
    }

    // Join in actual spend for each budgeted category so the client gets
    // "limit vs. actual" in one call instead of two round trips.
    const result = await query(
      `SELECT
         b.id, b.category_id, c.name AS category_name, c.color,
         b.monthly_limit, b.month, b.year, b.alert_threshold_pct,
         COALESCE(spend.total, 0) AS spent
       FROM budgets b
       JOIN categories c ON c.id = b.category_id
       LEFT JOIN (
         SELECT category_id, SUM(amount) AS total
         FROM transactions
         WHERE user_id = $1 AND type = 'expense'
           ${month && year ? 'AND EXTRACT(MONTH FROM occurred_on) = $2 AND EXTRACT(YEAR FROM occurred_on) = $3' : ''}
         GROUP BY category_id
       ) spend ON spend.category_id = b.category_id
       WHERE ${where}
       ORDER BY c.name`,
      params
    );

    const budgets = result.rows.map((b) => {
      const spent = Number(b.spent);
      const limit = Number(b.monthly_limit);
      const pctUsed = limit > 0 ? Math.round((spent / limit) * 100) : 0;
      return {
        ...b,
        spent,
        monthly_limit: limit,
        pctUsed,
        alertTriggered: pctUsed >= b.alert_threshold_pct,
        overBudget: spent > limit,
      };
    });

    res.json(budgets);
  } catch (err) {
    next(err);
  }
});

router.post(
  '/',
  [
    body('categoryId').isUUID(),
    body('monthlyLimit').isFloat({ gt: 0 }),
    body('month').isInt({ min: 1, max: 12 }),
    body('year').isInt({ min: 2000 }),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

      const { categoryId, monthlyLimit, month, year, alertThresholdPct = 80 } = req.body;
      const result = await query(
        `INSERT INTO budgets (user_id, category_id, monthly_limit, month, year, alert_threshold_pct)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (user_id, category_id, month, year)
         DO UPDATE SET monthly_limit = EXCLUDED.monthly_limit, alert_threshold_pct = EXCLUDED.alert_threshold_pct
         RETURNING *`,
        [req.userId, categoryId, monthlyLimit, month, year, alertThresholdPct]
      );
      res.status(201).json(result.rows[0]);
    } catch (err) {
      next(err);
    }
  }
);

router.delete('/:id', async (req, res, next) => {
  try {
    const result = await query('DELETE FROM budgets WHERE id = $1 AND user_id = $2 RETURNING id', [
      req.params.id,
      req.userId,
    ]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Budget not found' });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
