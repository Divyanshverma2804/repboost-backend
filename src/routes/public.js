const express = require('express');
const router = express.Router();
const prisma = require('../config/database');
const { generateReviewReply, improveFeedback } = require('../services/aiService');
const twilioService = require('../services/twilioService');
const emailService = require('../services/emailService');
const { aiImproveLimiter } = require('../middleware/rateLimiter');

// Helper for automated AI response
async function handleAutoAiReply(customer, business, ratingNum, feedback) {
  if (business.autoReplyEnabled && ratingNum >= business.autoReplyMinRating && feedback) {
    try {
      const aiReply = await generateReviewReply(feedback, business.name);
      
      // Update customer with the AI reply
      await prisma.customer.update({
        where: { id: customer.id },
        data: { aiReply }
      });

      // Send the reply via WhatsApp (if customer has a phone)
      if (customer.phone) {
        // Double check quota before sending
        const freshBusiness = await prisma.business.findUnique({
          where: { id: business.id },
          select: { smsUsedThisMonth: true, smsMonthlyLimit: true }
        });

        if (freshBusiness.smsUsedThisMonth < freshBusiness.smsMonthlyLimit) {
          const sent = await twilioService.sendSms(customer.phone, aiReply); // This sends a WhatsApp message
          if (sent) {
            await prisma.business.update({
              where: { id: business.id },
              data: { smsUsedThisMonth: { increment: 1 } }
            });
            await prisma.smsLog.create({
              data: {
                businessId: business.id,
                customerId: customer.id,
                status: 'SENT'
              }
            });
          }
        }
      }
    } catch (error) {
      console.error('Auto AI Reply failed:', error);
    }
  }
}

async function getBusinessNotificationEmails(businessId) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { notificationEmails: true }
  });

  const fromConfig = business?.notificationEmails
    ? business.notificationEmails.split(',').map(e => e.trim()).filter(Boolean)
    : [];

  if (fromConfig.length > 0) return fromConfig;

  const admins = await prisma.user.findMany({
    where: { businessId, role: 'BUSINESS_ADMIN' },
    select: { email: true }
  });
  return admins.map(a => a.email);
}

async function maybeSendFirstReviewEmail(business, customerName, ratingNum, feedbackText) {
  try {
    const count = await prisma.customer.count({
      where: { businessId: business.id, rating: { not: null }, submittedAt: { not: null } }
    });
    if (count !== 1) return;

    const recipients = await getBusinessNotificationEmails(business.id);
    if (!recipients || recipients.length === 0) return;

    const feedbackSnippet = String(feedbackText || '').trim();
    const clipped = feedbackSnippet.length > 220 ? `${feedbackSnippet.slice(0, 217)}...` : (feedbackSnippet || '—');
    const link = `${process.env.FRONTEND_URL || process.env.APP_URL}/login`;

    await Promise.all(
      recipients.map((to) =>
        emailService.sendTemplate(
          to,
          'first_review_received',
          '🎉 You got your first review!',
          {
            businessName: business.name,
            customerName: customerName || 'A customer',
            rating: String(ratingNum),
            feedbackSnippet: clipped,
            link,
            year: String(new Date().getFullYear())
          }
        )
      )
    );
  } catch (err) {
    console.error('First review email failed:', err);
  }
}

// GET /api/public/page/:slug - Get full business landing page data
router.get('/page/:slug', async (req, res) => {
  try {
    const business = await prisma.business.findUnique({
      where: { slug: req.params.slug },
      select: {
        id: true,
        name: true,
        slug: true,
        reviewLink: true,
        logoUrl: true,
        tagline: true,
        description: true,
        highlights: true,
        phone: true,
        address: true,
        mapsLink: true,
        heroBannerUrl: true,
        primaryColor: true,
        status: true,
      }
    });

    if (!business || business.status !== 'ACTIVE') {
      return res.status(404).json({ error: 'Business not found' });
    }

    // Get recent reviews (submitted, with a rating)
    const recentReviews = await prisma.customer.findMany({
      where: {
        businessId: business.id,
        submittedAt: { not: null },
        rating: { not: null },
      },
      orderBy: { submittedAt: 'desc' },
      take: 8,
      select: {
        id: true,
        name: true,
        rating: true,
        feedback: true,
        submittedAt: true,
      }
    });

    // Parse highlights from JSON string
    let parsedHighlights = [];
    if (business.highlights) {
      try {
        parsedHighlights = JSON.parse(business.highlights);
      } catch {
        parsedHighlights = [];
      }
    }

    res.json({
      ...business,
      highlights: parsedHighlights,
      recentReviews,
    });
  } catch (error) {
    console.error('Get business page error:', error);
    res.status(500).json({ error: 'Failed to fetch business page' });
  }
});

// POST /api/public/book-demo - Demo request (public)
router.post('/book-demo', async (req, res) => {
  try {
    const { name, email, phone, businessType, companyName } = req.body || {};
    if (!name || !email || !phone) {
      return res.status(400).json({ error: 'Name, email, and phone are required' });
    }

    const to = process.env.PLATFORM_SUPPORT_EMAIL || process.env.SUPPORT_EMAIL || process.env.ADMIN_EMAIL;
    if (!to) {
      return res.status(500).json({ error: 'Demo email destination not configured' });
    }

    const subject = 'New Rewple Demo Request';
    const text =
`A new demo request was submitted.

Name: ${name}
Email: ${email}
Phone: ${phone}
Business Type: ${businessType || 'N/A'}
Company Name: ${companyName || 'N/A'}
`;

    const sent = await emailService.sendEmail(to, subject, text, null);
    if (!sent) {
      return res.status(500).json({ error: 'Failed to send demo request email' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Book demo error:', error);
    res.status(500).json({ error: 'Failed to submit demo request' });
  }
});

// POST /api/public/improve-feedback - AI feedback improvement
router.post('/improve-feedback', aiImproveLimiter, async (req, res) => {
  try {
    const { feedback, rating } = req.body || {};
    const ratingNum = Number(rating);
    if (!feedback || typeof feedback !== 'string') {
      return res.status(400).json({ error: 'feedback is required' });
    }
    if (!Number.isFinite(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return res.status(400).json({ error: 'rating must be between 1 and 5' });
    }

    const improved = await improveFeedback(feedback, ratingNum);
    res.json({ improved });
  } catch (error) {
    res.status(500).json({ error: 'AI could not improve the feedback right now' });
  }
});

// GET /api/public/:slug - Get business info (public - for QuickReview)
router.get('/:slug', async (req, res) => {
  try {
    const business = await prisma.business.findUnique({
      where: { slug: req.params.slug },
      select: {
        id: true,
        name: true,
        slug: true,
        reviewLink: true,
        logoUrl: true
      }
    });

    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }

    res.json(business);
  } catch (error) {
    console.error('Get business error:', error);
    res.status(500).json({ error: 'Failed to fetch business' });
  }
});

// GET /api/public/widget/:slug - Get reviews for web widget
router.get('/widget/:slug', async (req, res) => {
  try {
    const business = await prisma.business.findUnique({
      where: { slug: req.params.slug },
      select: {
        id: true,
        name: true,
        primaryColor: true
      }
    });

    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }

    const reviews = await prisma.customer.findMany({
      where: {
        businessId: business.id,
        submittedAt: { not: null },
        rating: { gte: 4 }, // Only show good reviews in widget
        feedback: { not: null }
      },
      orderBy: { submittedAt: 'desc' },
      take: 10,
      select: {
        name: true,
        rating: true,
        feedback: true,
        submittedAt: true
      }
    });

    res.json({
      business,
      reviews
    });
  } catch (error) {
    console.error('Widget error:', error);
    res.status(500).json({ error: 'Failed to fetch widget data' });
  }
});

// GET /api/public/wall-of-love/:slug - Get reviews for Wall of Love
router.get('/wall-of-love/:slug', async (req, res) => {
  try {
    const business = await prisma.business.findUnique({
      where: { slug: req.params.slug },
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
        tagline: true,
        wallOfLoveEnabled: true,
        wallOfLoveTitle: true,
        wallOfLoveDescription: true,
        primaryColor: true
      }
    });

    if (!business || !business.wallOfLoveEnabled) {
      return res.status(404).json({ error: 'Wall of Love not found or disabled' });
    }

    const reviews = await prisma.customer.findMany({
      where: {
        businessId: business.id,
        submittedAt: { not: null },
        rating: { gte: 4 }, // Only show 4-5 stars
        feedback: { not: null, not: "" }
      },
      orderBy: { submittedAt: 'desc' },
      select: {
        id: true,
        name: true,
        rating: true,
        feedback: true,
        submittedAt: true
      }
    });

    res.json({
      business,
      reviews
    });
  } catch (error) {
    console.error('Wall of Love error:', error);
    res.status(500).json({ error: 'Failed to fetch reviews' });
  }
});

// POST /api/public/:slug/review - Submit quick review (QR code)
// router.post('/:slug/review', async (req, res) => {
//   try {
//     const { rating, feedback } = req.body;
//     const ratingNum = parseInt(rating);

//     const business = await prisma.business.findUnique({
//       where: { slug: req.params.slug }
//     });

//     if (!business) {
//       return res.status(404).json({ error: 'Business not found' });
//     }

//     await prisma.patient.create({
//       data: {
//         businessId: business.id,
//         name: 'Anonymous QR Review',
//         rating: ratingNum,
//         feedback: feedback || null,
//         submittedAt: new Date(),
//         source: 'QR'
//       }
//     });

//     res.json({
//       success: true,
//       redirect: ratingNum >= 4 ? business.reviewLink : null
//     });
//   } catch (error) {
//     console.error('Submit review error:', error);
//     res.status(500).json({ error: 'Failed to submit review' });
//   }
// });

// POST /api/public/:slug/review - Submit quick review (QR code)
router.post('/:slug/review', async (req, res) => {
  try {
    const { rating, feedback } = req.body;
    const ratingNum = parseInt(rating);

    if (!ratingNum || ratingNum < 1 || ratingNum > 5) {
      return res.status(400).json({ error: 'Invalid rating' });
    }

    const business = await prisma.business.findUnique({
      where: { slug: req.params.slug }
    });

    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }

    const now = new Date();

    const customer = await prisma.customer.create({
      data: {
        businessId: business.id,
        name: 'Explorer (QR Review)',
        rating: ratingNum,
        feedback: feedback || null,
        submittedAt: now,
        sentAt: now, // QR reviews don't have a "sent" time usually, so we mark it as now
        source: 'QR'
      }
    });

    // Auto-AI Reply for QR reviews too
    if (ratingNum >= 4) {
      handleAutoAiReply(customer, business, ratingNum, feedback);
    }

    // Notify business of new review (especially negative ones)
    if (business.notifyOnNegativeReview && ratingNum <= business.negativeReviewThreshold) {
      const recipients = await getBusinessNotificationEmails(business.id);
      if (recipients.length > 0) {
        const feedbackSnippet = String(feedback || '').trim();
        const clipped = feedbackSnippet.length > 220 ? `${feedbackSnippet.slice(0, 217)}...` : (feedbackSnippet || '—');
        
        await Promise.all(
          recipients.map(to => 
            emailService.sendEmail(
              to,
              `⚠️ New Low Rating: ${ratingNum} Stars`,
              `A customer just left a ${ratingNum}-star review for ${business.name}.\n\nFeedback: ${clipped}\n\nView details: ${process.env.FRONTEND_URL}/login`,
              null
            )
          )
        );
      }
    }

    // Handle first review email
    maybeSendFirstReviewEmail(business, customer.name, ratingNum, feedback);

    res.json({
      success: true,
      redirect: ratingNum >= 4 ? business.reviewLink : null
    });
  } catch (error) {
    console.error('Submit review error:', error);
    res.status(500).json({ error: 'Failed to submit review' });
  }
});


// GET /api/public/feedback/:customerId - Get customer for feedback
router.get('/feedback/:customerId', async (req, res) => {
  try {
    const customer = await prisma.customer.findUnique({
      where: { id: req.params.customerId },
      include: { business: true }
    });

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Track open
    if (!customer.openedAt) {
      await prisma.customer.update({
        where: { id: customer.id },
        data: { openedAt: new Date() }
      });
    }

    res.json({
      customer: {
        id: customer.id,
        name: customer.name
      },
      business: {
        id: customer.business.id,
        name: customer.business.name,
        slug: customer.business.slug,
        reviewLink: customer.business.reviewLink
      }
    });
  } catch (error) {
    console.error('Get feedback error:', error);
    res.status(500).json({ error: 'Failed to fetch feedback form' });
  }
});

// POST /api/public/feedback/:customerId - Submit feedback from SMS
router.post('/feedback/:customerId', async (req, res) => {
  try {
    const { rating, feedback } = req.body;
    const ratingNum = parseInt(rating);

    const customer = await prisma.customer.findUnique({
      where: { id: req.params.customerId },
      include: { business: true }
    });

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    await prisma.customer.update({
      where: { id: customer.id },
      data: {
        rating: ratingNum,
        feedback: feedback || null,
        submittedAt: new Date()
      }
    });

    // Handle automated AI reply if enabled
    // Note: This is non-blocking (doesn't use 'await') so response returns immediately
    handleAutoAiReply(customer, customer.business, ratingNum, feedback);
    maybeSendFirstReviewEmail(customer.business, customer.name, ratingNum, feedback);

    // Handle Negative Review Notification
    if (ratingNum <= customer.business.negativeReviewThreshold && customer.business.notifyOnNegativeReview) {
      handleNegativeReviewNotification(customer, customer.business, ratingNum, feedback);
    }

    // Handle Referral Loop if 5-star review and enabled
    if (ratingNum === 5 && customer.business.referralEnabled) {
      handleReferralLoop(customer, customer.business);
    }

    res.json({
      success: true,
      redirect: ratingNum >= 4 ? customer.business.reviewLink : null
    });
  } catch (error) {
    console.error('Submit feedback error:', error);
    res.status(500).json({ error: 'Failed to submit feedback' });
  }
});

// Helper for Referral Loop
async function handleReferralLoop(patient, business) {
  try {
    const referralMsg = business.referralMessageTemplate
      .replace('{{offer}}', business.referralOffer)
      .replace('{{link}}', `${process.env.APP_URL}/review/${business.slug}`);

    // Send via WhatsApp first
    if (patient.phone && business.smsUsedThisMonth < business.smsMonthlyLimit) {
      const sent = await twilioService.sendSms(patient.phone, referralMsg); // This sends a WhatsApp message
      if (sent) {
        await prisma.business.update({ where: { id: business.id }, data: { smsUsedThisMonth: { increment: 1 } } });
        return; // Stop here if WhatsApp was successful
      }
    }
    
    // Fallback to Email if enabled
    if (patient.email && business.emailEnabled && business.emailUsedThisMonth < business.emailMonthlyLimit) {
      await emailService.sendEmail(patient.email, `A special offer from ${business.name}`, referralMsg);
      await prisma.business.update({ where: { id: business.id }, data: { emailUsedThisMonth: { increment: 1 } } });
    }
  } catch (error) {
    console.error('Referral loop error:', error);
  }
}

// Helper for Negative Review Notification
async function handleNegativeReviewNotification(patient, business, rating, feedback) {
  try {
    const notificationContent = `⚠️ Alert: New Negative Feedback for ${business.name}
    
Rating: ${rating}/5
Customer: ${patient.name}
Feedback: "${feedback || 'No comments'}"

Action: You may want to reach out to this customer to resolve their concern.`;

    // 1. Get notification emails
    const emails = business.notificationEmails 
      ? business.notificationEmails.split(',').map(e => e.trim()) 
      : [];
    
    // Also include all business admins
    const admins = await prisma.user.findMany({
      where: { businessId: business.id, role: 'BUSINESS_ADMIN' },
      select: { email: true }
    });
    
    const allEmails = [...new Set([...emails, ...admins.map(a => a.email)])];

    // 2. Send Emails
    for (const email of allEmails) {
      await emailService.sendEmail(
        email, 
        `⚠️ Action Required: Negative Feedback received for ${business.name}`, 
        notificationContent
      );
    }

    // 3. Send WhatsApp to Business Phone (if configured)
    if (business.phone) {
      await twilioService.sendSms(business.phone, notificationContent);
    }
  } catch (error) {
    console.error('Notification error:', error);
  }
}

module.exports = router;
