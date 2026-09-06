import { Router } from 'express';
import bcrypt from 'bcrypt';
import { body, validationResult } from 'express-validator';
import rateLimit from 'express-rate-limit';
import { query, withTransaction } from '../db/pool.js';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
} from '../utils/tokens.js';

const router = Router();

// Auth endpoints are brute-force targets — cap attempts per IP.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again later.' },
});

const DEFAULT_CATEGORIES = [
  { name: 'Groceries', color: '#22c55e', icon: 'shopping-cart' },
  { name: 'Rent', color: '#6366f1', icon: 'home' },
  { name: 'Transport', color: '#f59e0b', icon: 'car' },
  { name: 'Dining Out', color: '#ef4444', icon: 'utensils' },
  { name: 'Utilities', color: '#0ea5e9', icon: 'bolt' },
  { name: 'Entertainment', color: '#a855f7', icon: 'film' },
  { name: 'Other', color: '#71717a', icon: 'tag' },
];

const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array()[0].msg });
  }
  next();
};

router.post(
  '/signup',
  authLimiter,
  [
    body('email').isEmail().withMessage('Valid email required').normalizeEmail(),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('name').trim().notEmpty().withMessage('Name is required'),
  ],
  handleValidation,
  async (req, res, next) => {
    try {
      const { email, password, name } = req.body;

      const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
      if (existing.rows.length > 0) {
        return res.status(409).json({ error: 'An account with that email already exists' });
      }

      const passwordHash = await bcrypt.hash(password, 12);

      const user = await withTransaction(async (client) => {
        const userResult = await client.query(
          'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name, created_at',
          [email, passwordHash, name]
        );
        const newUser = userResult.rows[0];

        // Seed default categories so the dashboard isn't empty on first login
        for (const cat of DEFAULT_CATEGORIES) {
          await client.query(
            'INSERT INTO categories (user_id, name, color, icon, is_default) VALUES ($1, $2, $3, $4, true)',
            [newUser.id, cat.name, cat.color, cat.icon]
          );
        }

        // Every user needs at least one wallet to attach transactions to
        await client.query(
          'INSERT INTO wallets (user_id, name, type, color, is_default) VALUES ($1, $2, $3, $4, true)',
          [newUser.id, 'Cash', 'cash', '#6366f1']
        );

        return newUser;
      });

      const accessToken = signAccessToken(user.id);
      const refreshToken = signRefreshToken(user.id);
      await query(
        'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, now() + interval \'30 days\')',
        [user.id, hashToken(refreshToken)]
      );

      res.status(201).json({ user, accessToken, refreshToken });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/login',
  authLimiter,
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty(),
  ],
  handleValidation,
  async (req, res, next) => {
    try {
      const { email, password } = req.body;

      const result = await query(
        'SELECT id, email, name, password_hash FROM users WHERE email = $1',
        [email]
      );
      const user = result.rows[0];

      // Same generic error whether the email doesn't exist or the password is
      // wrong — don't leak which one it was.
      if (!user || !user.password_hash) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const accessToken = signAccessToken(user.id);
      const refreshToken = signRefreshToken(user.id);
      await query(
        'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, now() + interval \'30 days\')',
        [user.id, hashToken(refreshToken)]
      );

      res.json({
        user: { id: user.id, email: user.email, name: user.name },
        accessToken,
        refreshToken,
      });
    } catch (err) {
      next(err);
    }
  }
);

router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: 'refreshToken is required' });

    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    const tokenHash = hashToken(refreshToken);
    const stored = await query(
      'SELECT id FROM refresh_tokens WHERE user_id = $1 AND token_hash = $2 AND expires_at > now()',
      [payload.sub, tokenHash]
    );
    if (stored.rows.length === 0) {
      return res.status(401).json({ error: 'Refresh token not recognized (may have been revoked)' });
    }

    const accessToken = signAccessToken(payload.sub);
    res.json({ accessToken });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      await query('DELETE FROM refresh_tokens WHERE token_hash = $1', [hashToken(refreshToken)]);
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
