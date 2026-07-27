import { Router } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'cc_dev_secret_change_in_prod';

function signToken(userId) {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: '30d' });
}

// ── POST /api/auth/signup ─────────────────────────────────────────────────────
router.post('/signup', async (req, res) => {
  // 1. Extract all possible fields (App payload + Ad Form payload)
  let { 
    type, 
    value, 
    countryCode = '', 
    password, 
    name = '', 
    phone, 
    email,
    passwordHash // catching the incorrect key from the Ad form just in case
  } = req.body;

  // 2. ADAPTATION: If 'type' and 'value' are missing, infer them from the Ad Form payload
  if (!type || !value) {
    if (phone) {
      type = 'phone';
      value = phone;
    } else if (email) {
      type = 'email';
      value = email;
    }
  }

  // 3. ADAPTATION: Handle Passwords for Ad Forms
  // Ad leads often don't provide a password. We check for 'passwordHash' as a fallback, 
  // or generate a random secure password so the DB creation doesn't fail.
  let finalPassword = password || passwordHash;
  if (!finalPassword) {
    // Generates a random 10-character password (e.g., "7x9a2b4c!A") for ad leads
    finalPassword = Math.random().toString(36).slice(-8) + "!A1"; 
  }

  // 4. Standard Validations
  if (!type || !value) {
    return res.status(400).json({ success: false, error: 'Provide type/value OR phone/email' });
  }
  if (finalPassword.length < 6) {
    return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
  }

  // 5. Query Construction
  const target = type === 'phone' ? value.trim() : value.trim().toLowerCase();
  const query  = type === 'phone' ? { phone: target, countryCode } : { email: target };

  // 6. Check for existing user
  const existing = await User.findOne(query).select('+passwordHash');
  if (existing?.passwordHash) {
    return res.status(409).json({ success: false, error: 'Account already exists. Please log in.' });
  }

  // 7. Hash the final password (whether user-provided or auto-generated)
  const hashedPass = await bcrypt.hash(finalPassword, 12);
  
  // 8. Create or Update User
  const user = existing
    ? await User.findByIdAndUpdate(existing._id, { passwordHash: hashedPass, name: name || existing.name, isVerified: true }, { new: true })
    : await User.create({ ...query, passwordHash: hashedPass, name, isVerified: true });

  const token = signToken(user._id);
  
  res.status(201).json({
    success: true,
    token,
    user: { 
      id: user._id, 
      name: user.name, 
      phone: user.phone, 
      email: user.email, 
      countryCode: user.countryCode, 
      walletBalance: user.walletBalance || 0 
    },
  });
});

// ── POST /api/auth/login ──────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { type, value, countryCode = '', password } = req.body;

  if (!type || !value || !password) {
    return res.status(400).json({ success: false, error: 'type, value and password are required' });
  }

  const target = type === 'phone' ? value.trim() : value.trim().toLowerCase();
  const query  = type === 'phone' ? { phone: target, countryCode } : { email: target };

  const user = await User.findOne(query).select('+passwordHash');
  if (!user || !user.passwordHash) {
    return res.status(401).json({ success: false, error: 'No account found. Please sign up first.' });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return res.status(401).json({ success: false, error: 'Incorrect password' });

  const token = signToken(user._id);
  res.json({
    success: true,
    token,
    user: { id: user._id, name: user.name, phone: user.phone, email: user.email, countryCode: user.countryCode, walletBalance: user.walletBalance || 0 },
  });
});

// ── POST /api/auth/wallet ─────────────────────────────────────────────────────
router.post('/wallet', async (req, res) => {
  const { walletAddress, walletName } = req.body;
  if (!walletAddress) return res.status(400).json({ success: false, error: 'walletAddress is required' });

  let user = await User.findOne({ walletAddress });
  if (!user) user = await User.create({ walletAddress, walletName, isVerified: true });

  const token = signToken(user._id);
  res.json({
    success: true,
    token,
    user: { id: user._id, name: user.name || walletName, walletAddress, walletName, walletBalance: user.walletBalance || 0 },
  });
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
router.get('/me', async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ success: false, error: 'Unauthorized' });

  try {
    const { sub } = jwt.verify(auth.slice(7), JWT_SECRET);
    const user = await User.findById(sub).lean();
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    res.json({ success: true, user });
  } catch {
    res.status(401).json({ success: false, error: 'Invalid token' });
  }
});

export default router;
