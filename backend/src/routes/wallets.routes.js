import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { query, withTransaction } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

const WALLET_TYPES = ['cash', 'bank', 'credit', 'savings', 'other'];

// List wallets with a computed running balance (income - expense - transfers out + transfers in)
router.get('/', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT
         w.id, w.name, w.type, w.color, w.is_default,
         COALESCE(tx.net, 0) - COALESCE(out.total, 0) + COALESCE(inn.total, 0) AS balance
       FROM wallets w
       LEFT JOIN (
         SELECT wallet_id, SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END) AS net
         FROM transactions WHERE user_id = $1 GROUP BY wallet_id
       ) tx ON tx.wallet_id = w.id
       LEFT JOIN (
         SELECT from_wallet_id AS wallet_id, SUM(amount) AS total
         FROM transfers WHERE user_id = $1 GROUP BY from_wallet_id
       ) out ON out.wallet_id = w.id
       LEFT JOIN (
         SELECT to_wallet_id AS wallet_id, SUM(amount) AS total
         FROM transfers WHERE user_id = $1 GROUP BY to_wallet_id
       ) inn ON inn.wallet_id = w.id
       WHERE w.user_id = $1
       ORDER BY w.is_default DESC, w.created_at ASC`,
      [req.userId]
    );
    res.json(result.rows.map((w) => ({ ...w, balance: Number(w.balance) })));
  } catch (err) {
    next(err);
  }
});

router.post(
  '/',
  [
    body('name').trim().notEmpty().withMessage('Wallet name is required'),
    body('type').optional().isIn(WALLET_TYPES),
    body('color').optional().isHexColor(),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

      const { name, type = 'cash', color = '#6366f1' } = req.body;
      const result = await query(
        'INSERT INTO wallets (user_id, name, type, color) VALUES ($1, $2, $3, $4) RETURNING id, name, type, color, is_default',
        [req.userId, name, type, color]
      );
      res.status(201).json({ ...result.rows[0], balance: 0 });
    } catch (err) {
      next(err);
    }
  }
);

router.delete('/:id', async (req, res, next) => {
  try {
    // Prevent deleting the last remaining wallet — every user needs at least one
    const count = await query('SELECT COUNT(*) FROM wallets WHERE user_id = $1', [req.userId]);
    if (Number(count.rows[0].count) <= 1) {
      return res.status(400).json({ error: 'You must have at least one wallet' });
    }

    const result = await withTransaction(async (client) => {
      const wallet = await client.query('SELECT is_default FROM wallets WHERE id = $1 AND user_id = $2', [
        req.params.id,
        req.userId,
      ]);
      if (wallet.rows.length === 0) return null;

      await client.query('DELETE FROM wallets WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);

      // If we just deleted the default wallet, promote the oldest remaining one
      if (wallet.rows[0].is_default) {
        await client.query(
          `UPDATE wallets SET is_default = true
           WHERE id = (SELECT id FROM wallets WHERE user_id = $1 ORDER BY created_at ASC LIMIT 1)`,
          [req.userId]
        );
      }
      return true;
    });

    if (!result) return res.status(404).json({ error: 'Wallet not found' });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
