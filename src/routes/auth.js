const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const prisma = require('../config/database');
const { authenticate } = require('../middleware/auth');

/**
 * POST /api/auth/admin/login
 * Super admin login
 */
router.post('/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user || user.role !== 'SUPER_ADMIN') {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.cookie('token', token, { 
      httpOnly: true, 
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production'
    });

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        role: user.role
      },
      token
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

/**
 * POST /api/auth/business/login
 * Business admin login
 */
// router.post('/business/login', async (req, res) => {
//   try {
//     const { slug, email, password } = req.body;

//     const business = await prisma.business.findUnique({
//       where: { slug }
//     });

//     if (!business) {
//       return res.status(404).json({ error: 'Business not found' });
//     }

//     const user = await prisma.user.findFirst({
//       where: {
//         email,
//         businessId: business.id,
//         role: 'BUSINESS_ADMIN'
//       },
//       include: { business: true }
//     });

//     if (!user) {
//       return res.status(401).json({ error: 'Invalid credentials' });
//     }

//     if (business.status === 'CANCELLED') {
//       return res.status(403).json({ error: 'Business account cancelled' });
//     }

//     const validPassword = await bcrypt.compare(password, user.passwordHash);
//     if (!validPassword) {
//       return res.status(401).json({ error: 'Invalid credentials' });
//     }

//     const token = jwt.sign(
//       { userId: user.id, role: user.role },
//       process.env.JWT_SECRET,
//       { expiresIn: '7d' }
//     );

//     res.cookie('token', token, { 
//       httpOnly: true, 
//       maxAge: 7 * 24 * 60 * 60 * 1000,
//       sameSite: 'lax',
//       secure: process.env.NODE_ENV === 'production'
//     });

//     res.json({
//       success: true,
//       user: {
//         id: user.id,
//         email: user.email,
//         role: user.role,
//         businessId: user.businessId
//       },
//       business: {
//         id: business.id,
//         name: business.name,
//         slug: business.slug,
//         status: business.status
//       },
//       token
//     });
//   } catch (error) {
//     console.error('Business login error:', error);
//     res.status(500).json({ error: 'Login failed' });
//   }
// });
router.post('/business/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // 🔐 Find user first
    const user = await prisma.user.findUnique({
      where: { email },
      include: { business: true }
    });

    if (!user || user.role !== 'BUSINESS_ADMIN') {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!user.business) {
      return res.status(401).json({ error: 'No business linked' });
    }

    if (user.business.status === 'CANCELLED') {
      return res.status(403).json({ error: 'Business account cancelled' });
    }

    const validPassword = await bcrypt.compare(password, user.passwordHash);

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // ✅ INCLUDE businessId in token (CRITICAL)
    const token = jwt.sign(
      { 
        userId: user.id,
        role: user.role,
        businessId: user.businessId
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.cookie('token', token, { 
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production'
    });

    res.json({
      success: true,
      // ⚠️ optional — frontend can fetch via /me instead
      business: {
        name: user.business.name,
        slug: user.business.slug
      }
    });

  } catch (error) {
    console.error('Business login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

/**
 * POST /api/auth/logout
 */
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true });
});

/**
 * GET /api/auth/me
 * Get current user info
 */
router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      // include: { business: true },
      select: {
        id: true,
        email: true,
        role: true,
        businessId: true,
        createdAt: true,
        business: {
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            smsMonthlyLimit: true,
            smsUsedThisMonth: true,
            maxCsvRowsPerUpload: true
          }
        }
      }
    });

    res.json(user);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

module.exports = router;
