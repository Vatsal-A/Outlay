import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { query } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT t.id, t.amount, t.occurred_on, t.note,
              t.from_wallet_id, fw.name AS from_wallet_name,
              t.to_wallet_id, tw.name AS to_wallet_name
       FROM transfers t
       JOIN wallets fw ON fw.id = t.from_wallet_id
       JOIN wallets tw ON tw.id = t.to_wallet_id
       WHERE t.user_id = $1
       ORDER BY t.occurred_on DESC
       LIMIT 50`,
      [req.userId]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

router.post(
  '/',
  [
    body('fromWalletId').isUUID(),
    body('toWalletId').isUUID(),
    body('amount').isFloat({ gt: 0 }),
    body('occurredOn').isISO8601(),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

      const { fromWalletId, toWalletId, amount, occurredOn, note } = req.body;
      if (fromWalletId === toWalletId) {
        return res.status(400).json({ error: 'Cannot transfer to the same wallet' });
      }

      // Confirm both wallets belong to this user before allowing the transfer
      const owned = await query('SELECT id FROM wallets WHERE user_id = $1 AND id = ANY($2::uuid[])', [
        req.userId,
        [fromWalletId, toWalletId],
      ]);
      if (owned.rows.length !== 2) {
        return res.status(404).json({ error: 'One or both wallets not found' });
      }

      const result = await query(
        `INSERT INTO transfers (user_id, from_wallet_id, to_wallet_id, amount, occurred_on, note)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [req.userId, fromWalletId, toWalletId, amount, occurredOn, note || null]
      );
      res.status(201).json(result.rows[0]);
    } catch (err) {
      next(err);
    }
  }
);

router.delete('/:id', async (req, res, next) => {
  try {
    const result = await query('DELETE FROM transfers WHERE id = $1 AND user_id = $2 RETURNING id', [
      req.params.id,
      req.userId,
    ]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Transfer not found' });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
