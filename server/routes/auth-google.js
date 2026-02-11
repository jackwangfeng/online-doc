const express = require('express');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const jwt = require('jsonwebtoken');
const db = require('../db');
const router = express.Router();

// Google OAuth 配置
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '420915666656-pqdnftq8dvapd7ih1t661g9kk63ivljv.apps.googleusercontent.com';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

// 配置 Passport Google 策略
passport.use(new GoogleStrategy({
    clientID: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    callbackURL: '/auth/google/callback',
    proxy: true
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      const email = profile.emails[0].value;
      const googleId = profile.id;
      const displayName = profile.displayName;
      
      // 检查用户是否已存在
      let userResult = await db.query(
        'SELECT * FROM users WHERE email = $1 OR google_id = $2',
        [email, googleId]
      );
      
      let user;
      
      if (userResult.rows.length > 0) {
        // 更新用户的 Google ID
        user = userResult.rows[0];
        if (!user.google_id) {
          await db.query(
            'UPDATE users SET google_id = $1 WHERE id = $2',
            [googleId, user.id]
          );
        }
      } else {
        // 创建新用户
        const insertResult = await db.query(
          'INSERT INTO users (username, email, google_id, password_hash) VALUES ($1, $2, $3, $4) RETURNING *',
          [displayName, email, googleId, 'google-oauth']
        );
        user = insertResult.rows[0];
      }
      
      done(null, user);
    } catch (err) {
      done(err, null);
    }
  }
));

// 序列化和反序列化用户
passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const result = await db.query('SELECT * FROM users WHERE id = $1', [id]);
    done(null, result.rows[0]);
  } catch (err) {
    done(err, null);
  }
});

// Google 登录路由
router.get('/google',
  passport.authenticate('google', { 
    scope: ['profile', 'email'],
    prompt: 'select_account'
  })
);

// Google 回调路由
router.get('/google/callback',
  passport.authenticate('google', { 
    failureRedirect: `${CLIENT_URL}/login?error=google_auth_failed`,
    session: false
  }),
  (req, res) => {
    // 生成 JWT token
    const token = jwt.sign(
      { 
        userId: req.user.id, 
        email: req.user.email,
        username: req.user.username 
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    // 重定向到前端，带上 token
    res.redirect(`${CLIENT_URL}/auth/callback?token=${token}`);
  }
);

// 验证 token 路由
router.get('/verify', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // 获取用户信息
    const userResult = await db.query(
      'SELECT id, username, email, created_at FROM users WHERE id = $1',
      [decoded.userId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
      user: userResult.rows[0],
      token: token
    });
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// 获取当前用户信息
router.get('/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    const decoded = jwt.verify(token, JWT_SECRET);
    
    const userResult = await db.query(
      'SELECT id, username, email, created_at FROM users WHERE id = $1',
      [decoded.userId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ user: userResult.rows[0] });
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

module.exports = router;
