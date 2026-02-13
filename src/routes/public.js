const express = require('express');
const router = express.Router();
const prisma = require('../config/database');

// GET /api/public/:slug - Get business info (public)
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

    await prisma.patient.create({
      data: {
        businessId: business.id,
        name: 'Anonymous QR Review',
        rating: ratingNum,
        feedback: feedback || null,
        visitDate: now,      
        submittedAt: now,   
        source: 'QR'
      }
    });

    res.json({
      success: true,
      redirect: ratingNum >= 4 ? business.reviewLink : null
    });
  } catch (error) {
    console.error('Submit review error:', error);
    res.status(500).json({ error: 'Failed to submit review' });
  }
});


// GET /api/public/feedback/:patientId - Get patient for feedback
router.get('/feedback/:patientId', async (req, res) => {
  try {
    const patient = await prisma.patient.findUnique({
      where: { id: req.params.patientId },
      include: { business: true }
    });

    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    // Track open
    if (!patient.openedAt) {
      await prisma.patient.update({
        where: { id: patient.id },
        data: { openedAt: new Date() }
      });
    }

    res.json({
      patient: {
        id: patient.id,
        name: patient.name
      },
      business: {
        id: patient.business.id,
        name: patient.business.name,
        slug: patient.business.slug,
        reviewLink: patient.business.reviewLink
      }
    });
  } catch (error) {
    console.error('Get feedback error:', error);
    res.status(500).json({ error: 'Failed to fetch feedback form' });
  }
});

// POST /api/public/feedback/:patientId - Submit feedback from SMS
router.post('/feedback/:patientId', async (req, res) => {
  try {
    const { rating, feedback } = req.body;
    const ratingNum = parseInt(rating);

    const patient = await prisma.patient.findUnique({
      where: { id: req.params.patientId },
      include: { business: true }
    });

    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    await prisma.patient.update({
      where: { id: patient.id },
      data: {
        rating: ratingNum,
        feedback: feedback || null,
        submittedAt: new Date()
      }
    });

    res.json({
      success: true,
      redirect: ratingNum >= 4 ? patient.business.reviewLink : null
    });
  } catch (error) {
    console.error('Submit feedback error:', error);
    res.status(500).json({ error: 'Failed to submit feedback' });
  }
});

module.exports = router;
