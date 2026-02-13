const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const prisma = require('../config/database');
const { authenticate, requireSuperAdmin } = require('../middleware/auth');

// All admin routes require authentication and super admin role
router.use(authenticate);
router.use(requireSuperAdmin);

// GET /api/admin/dashboard - Dashboard stats
router.get('/dashboard', async (req, res) => {
  try {
    const [totalBusinesses, activeBusinesses, totalSmsSent, totalReviews] = await Promise.all([
      prisma.business.count(),
      prisma.business.count({ where: { status: 'ACTIVE' } }),
      prisma.smsLog.count({ where: { status: 'SENT' } }),
      prisma.patient.count({ where: { submittedAt: { not: null } } })
    ]);

    const recentActivity = await prisma.smsLog.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        business: { select: { name: true } },
        patient: { select: { name: true, phone: true ,sentAt: true } }
      }
    });

    res.json({
      stats: {
        totalBusinesses,
        activeBusinesses,
        totalSmsSent,
        totalReviews
      },
      recentActivity
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

// GET /api/admin/businesses - List all businesses
router.get('/businesses', async (req, res) => {
  try {
    const businesses = await prisma.business.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { patients: true, smsLogs: true }
        }
      }
    });

    res.json(businesses);
  } catch (error) {
    console.error('List businesses error:', error);
    res.status(500).json({ error: 'Failed to fetch businesses' });
  }
});

// POST /api/admin/businesses - Create business
router.post('/businesses', async (req, res) => {
  try {
    const {
      name, slug, reviewLink, email, password,
      smsMonthlyLimit, maxCsvRowsPerUpload, rateLimitPerMinute
    } = req.body;

    const existing = await prisma.business.findUnique({ where: { slug } });
    if (existing) {
      return res.status(400).json({ error: 'Slug already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await prisma.$transaction(async (tx) => {
      const business = await tx.business.create({
        data: {
          name,
          slug: slug.toLowerCase(),
          reviewLink,
          smsMonthlyLimit: parseInt(smsMonthlyLimit) || 500,
          maxCsvRowsPerUpload: parseInt(maxCsvRowsPerUpload) || 300,
          rateLimitPerMinute: parseInt(rateLimitPerMinute) || 20
        }
      });

      await tx.user.create({
        data: {
          email,
          passwordHash,
          role: 'BUSINESS_ADMIN',
          businessId: business.id
        }
      });

      return business;
    });

    res.json(result);
  } catch (error) {
    console.error('Create business error:', error);
    res.status(500).json({ error: 'Failed to create business' });
  }
});

// GET /api/admin/businesses/:id - Get business details
router.get('/businesses/:id', async (req, res) => {
  try {
    const business = await prisma.business.findUnique({
      where: { id: req.params.id },
      include: {
        users: { select: { id: true, email: true, createdAt: true } },
        _count: { select: { patients: true, smsLogs: true } }
      }
    });

    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }

    const smsStats = await prisma.smsLog.groupBy({
      by: ['status'],
      where: { businessId: business.id },
      _count: true
    });

    res.json({ ...business, smsStats });
  } catch (error) {
    console.error('Get business error:', error);
    res.status(500).json({ error: 'Failed to fetch business' });
  }
});

// PUT /api/admin/businesses/:id - Update business

router.put('/businesses/:id', async (req, res) => {
  try {

    const data = {
      ...req.body,

      smsMonthlyLimit: Number(req.body.smsMonthlyLimit),
      maxCsvRowsPerUpload: Number(req.body.maxCsvRowsPerUpload),
      rateLimitPerMinute: Number(req.body.rateLimitPerMinute),
      sendDelayHours: Number(req.body.sendDelayHours),
      reminderDelayHours: Number(req.body.reminderDelayHours),
      maxReminders: Number(req.body.maxReminders),
    };

    const business = await prisma.business.update({
      where: { id: req.params.id },
      data
    });

    res.json(business);
  } catch (error) {
    console.error('Update business error:', error);
    res.status(500).json({ error: 'Failed to update business' });
  }
});

// router.put('/businesses/:id', async (req, res) => {
//   try {
//     const business = await prisma.business.update({
//       where: { id: req.params.id },
//       data: req.body
//     });

//     res.json(business);
//   } catch (error) {
//     console.error('Update business error:', error);
//     res.status(500).json({ error: 'Failed to update business' });
//   }
// });

// PATCH /api/admin/businesses/:id/status - Update business status
router.patch('/businesses/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    
    const business = await prisma.business.update({
      where: { id: req.params.id },
      data: { status }
    });

    res.json(business);
  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// DELETE /api/admin/businesses/:id - Delete business
router.delete('/businesses/:id', async (req, res) => {
  try {
    await prisma.business.delete({
      where: { id: req.params.id }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete business error:', error);
    res.status(500).json({ error: 'Failed to delete business' });
  }
});

module.exports = router;
