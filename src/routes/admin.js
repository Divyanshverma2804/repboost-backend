const express = require('express');
const router = express.Router();
const prisma = require('../config/database');
const { authenticate, requireSuperAdmin } = require('../middleware/auth');
const authService = require('../services/authService');
const auditLogService = require('../services/auditLogService');
const emailService = require('../services/emailService');

// All admin routes require authentication and super admin role
router.use(authenticate, requireSuperAdmin);

// GET /api/admin/dashboard - Dashboard stats
router.get('/dashboard', async (req, res) => {
  try {
    const [totalBusinesses, activeBusinesses, totalSmsSent, totalReviews] = await Promise.all([
      prisma.business.count(),
      prisma.business.count({ where: { status: 'ACTIVE' } }),
      prisma.smsLog.count({ where: { status: 'SENT' } }),
      prisma.customer.count({ where: { submittedAt: { not: null } } })
    ]);

    const recentActivity = await prisma.smsLog.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        business: { select: { name: true } },
        customer: { select: { name: true, phone: true ,sentAt: true } }
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

// --------------------
// System Admin Management
// --------------------

// GET /api/admin/admins - List all SuperAdmins
router.get('/system-admins', async (req, res) => {
  try {
    const admins = await prisma.user.findMany({
      where: { role: 'SUPER_ADMIN' },
      select: { id: true, email: true, createdAt: true }
    });
    res.json(admins);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch admins' });
  }
});

// POST /api/admin/system-admins - Add a new SuperAdmin
router.post('/system-admins', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) return res.status(400).json({ error: 'User already exists' });

    const bcrypt = require('bcryptjs');
    const passwordHash = await bcrypt.hash(password, 10);

    const newAdmin = await prisma.user.create({
      data: { email, passwordHash, role: 'SUPER_ADMIN' }
    });

    await auditLogService.log('SUPER_ADMIN_CREATE', req.user.id, { newAdminId: newAdmin.id, email });

    res.status(201).json({ id: newAdmin.id, email: newAdmin.email });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create admin' });
  }
});

// GET /api/admin/businesses - List all businesses
router.get('/businesses', async (req, res) => {
  try {
    const businesses = await prisma.business.findMany({
      include: { users: { where: { role: 'BUSINESS_ADMIN' } } }
    });
    res.json(businesses);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch businesses' });
  }
});

// POST /api/admin/businesses - Create a new business and invite owner
router.post('/businesses', async (req, res) => {
  try {
    let { name, slug, reviewLink, ownerEmail, placeId } = req.body;

    if (!name || !slug || !ownerEmail) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Clean strings (remove accidental backticks and leading/trailing whitespace)
    const cleanString = (str) => typeof str === 'string' ? str.replace(/[`]/g, '').trim() : str;
    
    name = cleanString(name);
    slug = cleanString(slug);
    reviewLink = cleanString(reviewLink);
    ownerEmail = cleanString(ownerEmail);
    placeId = cleanString(placeId);

    // Auto-generate review link if placeId is provided but reviewLink is not
    let finalReviewLink = reviewLink;
    if (placeId && !finalReviewLink) {
      finalReviewLink = `https://search.google.com/local/writereview?placeid=${placeId}`;
    }

    if (!finalReviewLink) {
      return res.status(400).json({ error: 'Review link or Place ID is required' });
    }

    const business = await prisma.business.create({
      data: { 
        name, 
        slug, 
        reviewLink: finalReviewLink,
        placeId 
      },
    });

    const { resetToken } = await authService.initiateBusinessOnboarding(ownerEmail, business.id);
    const inviteLink = `${process.env.APP_URL}/set-password/${resetToken}`;

    try {
      await emailService.sendTemplate(
        ownerEmail,
        'welcome',
        "Welcome to Rewple! 🌟 Let's Get You Started",
        {
          businessName: business.name,
          link: inviteLink,
          expiresIn: '7 days',
          year: String(new Date().getFullYear())
        }
      );
    } catch (err) {
      console.error('Welcome email failed:', err);
    }

    await auditLogService.log('BUSINESS_CREATE', req.user.id, { businessId: business.id, ownerEmail });

    res.status(201).json({ ...business, inviteLink });
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
        _count: { select: { customers: true, smsLogs: true } }
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
    res.status(500).json({ error: 'Failed to create business' });
  }
});

// POST /api/admin/businesses/:userId/resend-invite
router.post('/businesses/:userId/resend-invite', async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Re-use the onboarding logic to generate a new token and send email
    const { resetToken } = await authService.initiateBusinessOnboarding(user.email, user.businessId);
    const inviteLink = `${process.env.APP_URL}/set-password/${resetToken}`;

    try {
      const business = user.businessId ? await prisma.business.findUnique({ where: { id: user.businessId } }) : null;
      const templateName = user.role === 'BUSINESS_MEMBER' ? 'invitation' : 'welcome';
      const subject =
        user.role === 'BUSINESS_MEMBER'
          ? "You've been invited to join {{businessName}} on Rewple"
          : "Welcome to Rewple! 🌟 Let's Get You Started";

      await emailService.sendTemplate(
        user.email,
        templateName,
        subject,
        {
          businessName: business?.name || 'your business',
          link: inviteLink,
          expiresIn: '7 days',
          year: String(new Date().getFullYear())
        }
      );
    } catch (err) {
      console.error('Resend invite email failed:', err);
    }

    await auditLogService.log('BUSINESS_INVITE_RESEND', req.user.id, { targetUserId: userId });

    res.json({ message: 'Invitation resent successfully', inviteLink });
  } catch (error) {
    console.error('Resend invite error:', error);
    res.status(500).json({ error: 'Failed to resend invitation' });
  }
});

// --------------------
// Support Requests (Admin)
// --------------------
router.get('/support-requests', async (req, res) => {
  try {
    try {
      const rows = await prisma.$queryRaw`
        SELECT
          sr."id",
          sr."business_id" as "businessId",
          sr."user_id" as "userId",
          sr."type",
          sr."subject",
          sr."message",
          sr."status",
          sr."created_at" as "createdAt",
          sr."updated_at" as "updatedAt",
          b."name" as "businessName",
          b."slug" as "businessSlug",
          u."email" as "userEmail"
        FROM "support_requests" sr
        JOIN "businesses" b ON b."id" = sr."business_id"
        JOIN "users" u ON u."id" = sr."user_id"
        ORDER BY sr."created_at" DESC;
      `;

      const items = rows.map(r => ({
        id: r.id,
        businessId: r.businessId,
        userId: r.userId,
        type: r.type,
        subject: r.subject,
        message: r.message,
        status: r.status,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        business: { name: r.businessName, slug: r.businessSlug },
        user: { email: r.userEmail }
      }));

      res.json(items);
    } catch (err) {
      console.error('Admin support list failed:', err);
      res.status(503).json({ error: 'Support system not initialized. Please apply DB schema changes and restart.' });
    }
  } catch (error) {
    console.error('List support requests error:', error);
    res.status(500).json({ error: 'Failed to fetch support requests' });
  }
});

router.patch('/support-requests/:id', async (req, res) => {
  try {
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: 'Status is required' });
    try {
      const rows = await prisma.$queryRaw`
        UPDATE "support_requests"
        SET "status" = ${status}, "updated_at" = now()
        WHERE "id" = ${req.params.id}
        RETURNING
          "id",
          "business_id" as "businessId",
          "user_id" as "userId",
          "type",
          "subject",
          "message",
          "status",
          "created_at" as "createdAt",
          "updated_at" as "updatedAt";
      `;
      const updated = rows?.[0];
      if (!updated) return res.status(404).json({ error: 'Request not found' });
      res.json(updated);
    } catch (err) {
      console.error('Admin support update failed:', err);
      res.status(503).json({ error: 'Support system not initialized. Please apply DB schema changes and restart.' });
    }
  } catch (error) {
    console.error('Update support request error:', error);
    res.status(500).json({ error: 'Failed to update request' });
  }
});

// --------------------
// WhatsApp Template Management (Admin)
// --------------------

// GET /api/admin/whatsapp/pending - List all pending custom templates
router.get('/whatsapp/pending', async (req, res) => {
  try {
    const templates = await prisma.customTemplate.findMany({
      where: { status: 'PENDING' },
      include: {
        business: { select: { name: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(templates);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch pending templates' });
  }
});

// PATCH /api/admin/whatsapp/templates/:id - Approve or Reject a custom template
router.patch('/whatsapp/templates/:id', async (req, res) => {
  try {
    const { status, twilioTemplateSid, rejectionReason } = req.body;

    if (!['APPROVED', 'REJECTED'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    if (status === 'APPROVED' && !twilioTemplateSid) {
      return res.status(400).json({ error: 'Twilio Template SID is required for approval' });
    }

    const template = await prisma.customTemplate.update({
      where: { id: req.params.id },
      data: {
        status,
        twilioTemplateSid: status === 'APPROVED' ? twilioTemplateSid : null,
        rejectionReason: status === 'REJECTED' ? rejectionReason : null
      }
    });

    await auditLogService.log('CUSTOM_TEMPLATE_REVIEW', req.user.id, { 
      templateId: template.id, 
      status 
    });

    res.json(template);
  } catch (error) {
    console.error('Update template status error:', error);
    res.status(500).json({ error: 'Failed to update template' });
  }
});

module.exports = router;
