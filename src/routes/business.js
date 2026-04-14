// const express = require('express');
// const router = express.Router();
// const multer = require('multer');
// const Papa = require('papaparse');
// const QRCode = require('qrcode');
// const prisma = require('../config/database');
// const { authenticate, requireBusinessAdmin, extractBusiness } = require('../middleware/auth');

// const upload = multer({ storage: multer.memoryStorage() });

// // All business routes require authentication
// router.use(authenticate);
// router.use(requireBusinessAdmin);

// // GET /api/business/:slug/dashboard - Business dashboard stats
// router.get('/dashboard', extractBusiness, async (req, res) => {
//   try {
//     const [totalPatients, smsSent, reviewsReceived, smsCount] = await Promise.all([
//       prisma.patient.count({ where: { businessId: req.business.id } }),
//       prisma.patient.count({ where: { businessId: req.business.id, sentAt: { not: null } } }),
//       prisma.patient.count({ where: { businessId: req.business.id, submittedAt: { not: null } } }),
//       prisma.smsLog.count({ where: { businessId: req.business.id, status: 'SENT' } })
//     ]);

//     const recentPatients = await prisma.patient.findMany({
//       where: { businessId: req.business.id },
//       orderBy: { createdAt: 'desc' },
//       take: 10
//     });

//     const avgRating = await prisma.patient.aggregate({
//       where: { businessId: req.business.id, rating: { not: null } },
//       _avg: { rating: true }
//     });

//     res.json({
//       business: req.business,
//       stats: {
//         totalPatients,
//         smsSent,
//         reviewsReceived,
//         smsCount,
//         quotaRemaining: req.business.smsMonthlyLimit - req.business.smsUsedThisMonth,
//         avgRating: avgRating._avg.rating || 0
//       },
//       recentPatients
//     });
//   } catch (error) {
//     console.error('Dashboard error:', error);
//     res.status(500).json({ error: 'Failed to load dashboard' });
//   }
// });

// // GET /api/business/:slug/patients - List patients
// router.get('/:slug/patients', extractBusiness, async (req, res) => {
//   try {
//     const page = parseInt(req.query.page) || 1;
//     const limit = 50;
//     const skip = (page - 1) * limit;

//     const [patients, total] = await Promise.all([
//       prisma.patient.findMany({
//         where: { businessId: req.business.id },
//         orderBy: { createdAt: 'desc' },
//         take: limit,
//         skip
//       }),
//       prisma.patient.count({ where: { businessId: req.business.id } })
//     ]);

//     res.json({
//       patients,
//       pagination: {
//         page,
//         totalPages: Math.ceil(total / limit),
//         total
//       }
//     });
//   } catch (error) {
//     console.error('List patients error:', error);
//     res.status(500).json({ error: 'Failed to fetch patients' });
//   }
// });

// // POST /api/business/:slug/patients - Add patient
// router.post('/:slug/patients', extractBusiness, async (req, res) => {
//   try {
//     const { name, phone, visitDate } = req.body;

//     const visit = new Date(visitDate);
//     const sendAt = new Date(visit.getTime() + req.business.sendDelayHours * 60 * 60 * 1000);


//     console.log("sendDelayHours:", req.business.sendDelayHours);
//     console.log("visit:", visit);
//     console.log("sendAt:", sendAt);
//     console.log("isValid:", !isNaN(sendAt.getTime()));


//     const patient = await prisma.patient.create({
//       data: {
//         businessId: req.business.id,
//         name,
//         phone: phone || null,
//         visitDate: visit,
//         sendAt: sendAt,
//         source: 'MANUAL'
//       }
//     });
//      console.log("Created patient:", patient);
//     res.json(patient);
//   } catch (error) {
//     console.error('Add patient error:', error);
//     res.status(500).json({ error: 'Failed to add patient' });
//   }
// });

// // // POST /api/business/:slug/upload-csv - Upload CSV
// // router.post('/:slug/upload-csv', extractBusiness, upload.single('csvFile'), async (req, res) => {
// //   try {
// //     if (!req.file) {
// //       return res.status(400).json({ error: 'No file uploaded' });
// //     }

// //     const csvContent = req.file.buffer.toString('utf8');
// //     const parsed = Papa.parse(csvContent, { header: true, skipEmptyLines: true });

// //     if (parsed.errors.length > 0) {
// //       return res.status(400).json({ error: 'Invalid CSV format' });
// //     }

// //     const rows = parsed.data;
// //     console.log(rows);


// //     if (rows.length > req.business.maxCsvRowsPerUpload) {
// //       return res.status(400).json({ 
// //         error: `CSV exceeds limit of ${req.business.maxCsvRowsPerUpload} rows` 
// //       });
// //     }

// //     const projectedUsage = req.business.smsUsedThisMonth + rows.length;
// //     if (projectedUsage > req.business.smsMonthlyLimit) {
// //       return res.status(400).json({ 
// //         error: `Insufficient SMS quota. Need ${rows.length}, have ${req.business.smsMonthlyLimit - req.business.smsUsedThisMonth} remaining` 
// //       });
// //     }

// //     // let successCount = 0;
// //     // let errorCount = 0;

// //     // for (const row of rows) {
// //     //   try {
// //     //     if (!row.name || !row.phone || !row.visitDate) {
// //     //       errorCount++;
// //     //       continue;
// //     //     }

// //     //     const visitDate = new Date(row.visitDate);
// //     //     if (isNaN(visitDate.getTime())) {
// //     //       errorCount++;
// //     //       continue;
// //     //     }

// //     //     const sendAt = new Date(visitDate.getTime() + req.business.sendDelayHours * 60 * 60 * 1000);

// //     //     await prisma.patient.create({
// //     //       data: {
// //     //         businessId: req.business.id,
// //     //         name: row.name,
// //     //         phone: row.phone,
// //     //         visitDate,
// //     //         sendAt,
// //     //         source: 'CSV'
// //     //       }
// //     //     });

// //     //     successCount++;
// //     //   } catch (err) {
// //     //     errorCount++;
// //     //   }
// //     // }

// //     // res.json({
// //     //   summary: {
// //     //     total: rows.length,
// //     //     success: successCount,
// //     //     errors: errorCount
// //     //   }
// //     // });

// //     let successCount = 0;
// // let errorCount = 0;
// // const uploadTime = new Date();

// // for (const row of rows) {
// //   try {
// //     if (!row.name || !row.phone || !row.visitDate) {
// //       errorCount++;
// //       continue;
// //     }

// //     const visitDate = new Date(row.visitDate);
// //     if (isNaN(visitDate.getTime())) {
// //       errorCount++;
// //       continue;
// //     }

// //     // Spread sends randomly between 1–10h after upload time
// //     // so a 500-row upload doesn't trigger 500 SMS at once
// //     const minDelayMs = 1 * 60 * 60 * 1000;
// //     const maxDelayMs = 10 * 60 * 60 * 1000;
// //     const randomDelayMs = Math.floor(Math.random() * (maxDelayMs - minDelayMs + 1)) + minDelayMs;
// //     const sendAt = new Date(uploadTime.getTime() + randomDelayMs);

// //     await prisma.patient.create({
// //       data: {
// //         businessId: req.business.id,
// //         name: row.name,
// //         phone: row.phone,
// //         visitDate,
// //         sendAt,
// //         source: 'CSV'
// //       }
// //     });

// //     successCount++;
// //   } catch (err) {
// //     errorCount++;
// //   }
// // }

// // // Match the field names the frontend expects
// // res.json({
// //   totalRows: rows.length,
// //   successCount,
// //   skipCount: errorCount,
// //   smsScheduled: successCount
// // });
// //   } catch (error) {
// //     console.error('CSV upload error:', error);
// //     res.status(500).json({ error: 'Upload failed' });
// //   }
// // });




// // POST /api/business/:slug/upload-csv
// router.post('/:slug/upload-csv', extractBusiness, upload.single('csvFile'), async (req, res) => {
//   try {
//     if (!req.file) {
//       return res.status(400).json({ error: 'No file uploaded' });
//     }

//     const csvContent = req.file.buffer.toString('utf8');
//     const parsed = Papa.parse(csvContent, { header: true, skipEmptyLines: true });

//     // ✅ FIX 1: Log errors but don't hard-reject on non-fatal parse warnings
//     if (parsed.errors.length > 0) {
//       console.log('CSV parse warnings (non-fatal):', parsed.errors);
//       // Only reject if there are ZERO rows parsed (truly broken file)
//       if (parsed.data.length === 0) {
//         return res.status(400).json({ error: 'Invalid CSV format - no rows could be parsed' });
//       }
//     }

//     const rows = parsed.data;
//     console.log('Parsed rows:', rows);  // <-- check this in your server logs
//     console.log('First row keys:', rows[0] ? Object.keys(rows[0]) : 'no rows');  // <-- check column names

//     if (rows.length > req.business.maxCsvRowsPerUpload) {
//       return res.status(400).json({ 
//         error: `CSV exceeds limit of ${req.business.maxCsvRowsPerUpload} rows` 
//       });
//     }

//     const projectedUsage = req.business.smsUsedThisMonth + rows.length;
//     if (projectedUsage > req.business.smsMonthlyLimit) {
//       return res.status(400).json({ 
//         error: `Insufficient SMS quota. Need ${rows.length}, have ${req.business.smsMonthlyLimit - req.business.smsUsedThisMonth} remaining` 
//       });
//     }

//     let successCount = 0;
//     let errorCount = 0;
//     const uploadTime = new Date();

//     for (const row of rows) {
//       try {
//         // ✅ FIX 2: Trim whitespace from keys/values - CSVs often have hidden spaces
//         const name = row.name?.trim();
//         const phone = row.phone?.trim();
//         const visitDateRaw = row.visitDate?.trim();

//         console.log(`Row: name="${name}" phone="${phone}" visitDate="${visitDateRaw}"`);

//         if (!name || !phone || !visitDateRaw) {
//           console.log('Skipping row - missing required field:', { name, phone, visitDateRaw });
//           errorCount++;
//           continue;
//         }

//         const visitDate = new Date(visitDateRaw);
//         if (isNaN(visitDate.getTime())) {
//           console.log('Skipping row - invalid date:', visitDateRaw);
//           errorCount++;
//           continue;
//         }

//         // Spread sends randomly between 1–10h after upload time
//         const minDelayMs = 1 * 60 * 60 * 1000;
//         const maxDelayMs = 10 * 60 * 60 * 1000;
//         const randomDelayMs = Math.floor(Math.random() * (maxDelayMs - minDelayMs + 1)) + minDelayMs;
//         const sendAt = new Date(uploadTime.getTime() + randomDelayMs);

//         console.log(`Creating patient with sendAt: ${sendAt.toISOString()}`);

//         await prisma.patient.create({
//           data: {
//             businessId: req.business.id,
//             name,
//             phone,
//             visitDate,
//             sendAt,
//             source: 'CSV'
//           }
//         });

//         successCount++;
//       } catch (err) {
//         // ✅ FIX 3: Log the actual error instead of silently swallowing it
//         console.error('Row insert failed:', err.message, err);
//         errorCount++;
//       }
//     }

//     console.log(`Upload complete: ${successCount} success, ${errorCount} errors`);

//     res.json({
//       totalRows: rows.length,
//       successCount,
//       skipCount: errorCount,
//       smsScheduled: successCount
//     });

//   } catch (error) {
//     console.error('CSV upload error:', error);
//     res.status(500).json({ error: 'Upload failed' });
//   }
// });

// // GET /api/business/:slug/qr-code - Generate QR code
// router.get('/:slug/qr-code', extractBusiness, async (req, res) => {
//   try {
//     const quickReviewUrl = `${process.env.APP_URL}/review/${req.business.slug}`;
//     const qrCodeDataUrl = await QRCode.toDataURL(quickReviewUrl);

//     res.json({
//       quickReviewUrl,
//       qrCodeDataUrl
//     });
//   } catch (error) {
//     console.error('QR code error:', error);
//     res.status(500).json({ error: 'Failed to generate QR code' });
//   }
// });

// // GET /api/business/:slug/settings - Get settings
// router.get('/:slug/settings', extractBusiness, (req, res) => {
//   res.json(req.business);
// });

// // PUT /api/business/:slug/settings - Update settings
// // router.put('/:slug/settings', extractBusiness, async (req, res) => {
// //   try {
// //     const business = await prisma.business.update({
// //       where: { id: req.business.id },
// //       data: req.body
// //     });

// //     res.json(business);
// //   } catch (error) {
// //     console.error('Update settings error:', error);
// //     res.status(500).json({ error: 'Failed to update settings' });
// //   }
// // });

// const { updateBusinessSettingsSchema } = require('../validations/business.validation');

// router.put('/:slug/settings', extractBusiness, async (req, res) => {
//   try {
//     // Validate and whitelist
//     const parsedData = updateBusinessSettingsSchema.parse(req.body);

//     const business = await prisma.business.update({
//       where: { id: req.business.id },
//       data: parsedData
//     });

//     res.json(business);
//   } catch (error) {
//     console.error('Update settings error:', error);

//     if (error.name === 'ZodError') {
//       return res.status(400).json({
//         error: 'Invalid settings data',
//         details: error.errors
//       });
//     }

//     res.status(500).json({ error: 'Failed to update settings' });
//   }
// });


// module.exports = router;




const express = require('express');
const router = express.Router();
const multer = require('multer');
const Papa = require('papaparse');
const QRCode = require('qrcode');
const prisma = require('../config/database');
const { authenticate, requireBusinessAdmin } = require('../middleware/auth');
const { inviteLimiter } = require('../middleware/rateLimiter');
const { generateReviewReply, analyzeReviews, answerWithContext } = require('../services/aiService');
const emailService = require('../services/emailService');
const auditLogService = require('../services/auditLogService');
const { v4: uuidv4 } = require('uuid');

const upload = multer({ storage: multer.memoryStorage() });

// 🔐 All business routes require authentication
router.use(authenticate);

// --------------------
// GET /api/business/dashboard
// --------------------
router.get('/dashboard', async (req, res) => {
  try {
    const businessId = req.user.businessId;

    const business = await prisma.business.findUnique({
      where: { id: businessId }
    });

    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalCustomers,
      reviewsReceived,
      smsSentThisMonth,
      weeklyReviews
    ] = await Promise.all([
      prisma.customer.count({ where: { businessId } }),
      prisma.customer.count({ where: { businessId, rating: { not: null } } }),
      prisma.smsLog.count({
        where: {
          businessId,
          createdAt: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
          }
        }
      }),
      prisma.customer.findMany({
        where: {
          businessId,
          submittedAt: { gte: weekAgo },
          rating: { not: null }
        },
        orderBy: { submittedAt: 'desc' },
        take: 80,
        select: { feedback: true, rating: true, submittedAt: true }
      })
    ]);

    const recentCustomers = await prisma.customer.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { smsLogs: { orderBy: { createdAt: 'desc' }, take: 1 } }
    });

    const weeklySummary = await analyzeReviews(weeklyReviews, business.name);

    res.json({
      business,
      stats: {
        totalCustomers,
        reviewsReceived,
        smsSent: smsSentThisMonth,
        smsSentThisMonth,
        smsMonthlyLimit: business.smsMonthlyLimit
      },
      weeklySummary,
      recentCustomers
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

// --------------------
// GET /api/business/customers
// --------------------
router.get('/customers', async (req, res) => {
  try {
    const businessId = req.user.businessId;
    const page = parseInt(req.query.page) || 1;
    const limit = 50;
    const skip = (page - 1) * limit;

    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where: { businessId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip
      }),
      prisma.customer.count({ where: { businessId } })
    ]);

    res.json({
      customers,
      pagination: {
        page,
        totalPages: Math.ceil(total / limit),
        total
      }
    });
  } catch (error) {
    console.error('List customers error:', error);
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

// --------------------
// POST /api/business/customers/:id/generate-ai-reply
// --------------------
router.post('/customers/:id/generate-ai-reply', async (req, res) => {
  try {
    const businessId = req.user.businessId;
    const { id } = req.params;

    const customer = await prisma.customer.findFirst({
      where: { id, businessId },
      include: { business: true }
    });

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    if (!customer.feedback) {
      return res.status(400).json({ error: 'No feedback found for this customer' });
    }

    const aiReply = await generateReviewReply(customer.feedback, customer.business.name);

    // Save the AI reply to the database
    const updatedCustomer = await prisma.customer.update({
      where: { id },
      data: { aiReply }
    });

    res.json({ aiReply: updatedCustomer.aiReply });
  } catch (error) {
    console.error('Generate AI reply error:', error);
    res.status(500).json({ error: 'Failed to generate AI reply' });
  }
});

// --------------------
// POST /api/business/customers
// --------------------
router.post('/customers', async (req, res) => {
  try {
    const businessId = req.user.businessId;
    const { name, phone, visitDate } = req.body;

    const visit = new Date(visitDate);

    const business = await prisma.business.findUnique({
      where: { id: businessId }
    });

    const sendAt = new Date(
      visit.getTime() + business.sendDelayHours * 60 * 60 * 1000
    );

    const customer = await prisma.customer.create({
      data: {
        businessId,
        name,
        phone: phone || null,
        visitDate: visit,
        sendAt,
        source: 'MANUAL'
      }
    });

    res.json(customer);
  } catch (error) {
    console.error('Add customer error:', error);
    res.status(500).json({ error: 'Failed to add customer' });
  }
});

// --------------------
// POST /api/business/upload-csv
// --------------------
router.post('/upload-csv', upload.single('csvFile'), async (req, res) => {
  try {
    const businessId = req.user.businessId;

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const business = await prisma.business.findUnique({
      where: { id: businessId }
    });

    const csvContent = req.file.buffer.toString('utf8');
    const parsed = Papa.parse(csvContent, { header: true, skipEmptyLines: true });

    const rows = parsed.data;

    if (rows.length > business.maxCsvRowsPerUpload) {
      return res.status(400).json({
        error: `CSV exceeds limit of ${business.maxCsvRowsPerUpload} rows`
      });
    }

    let successCount = 0;
    let errorCount = 0;
    const uploadTime = new Date();

    for (const row of rows) {
      try {
        const name = row.name?.trim();
        const phone = row.phone?.trim();
        const visitDateRaw = row.visitDate?.trim();

        if (!name || !phone || !visitDateRaw) {
          errorCount++;
          continue;
        }

        const visitDate = new Date(visitDateRaw);
        if (isNaN(visitDate.getTime())) {
          errorCount++;
          continue;
        }

        const randomDelayMs =
          (Math.floor(Math.random() * 10) + 1) * 60 * 60 * 1000;

        await prisma.customer.create({
          data: {
            businessId,
            name,
            phone,
            visitDate,
            sendAt: new Date(uploadTime.getTime() + randomDelayMs),
            source: 'CSV'
          }
        });

        successCount++;
      } catch {
        errorCount++;
      }
    }

    res.json({
      totalRows: rows.length,
      successCount,
      skipCount: errorCount,
      smsScheduled: successCount
    });
  } catch (error) {
    console.error('CSV upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// --------------------
// GET /api/business/qr-code
// --------------------
router.get('/qr-code', async (req, res) => {
  try {
    const business = await prisma.business.findUnique({
      where: { id: req.user.businessId }
    });

    const quickReviewUrl = `${process.env.APP_URL}/review/${business.slug}`;
    const qrCodeDataUrl = await QRCode.toDataURL(quickReviewUrl);

    res.json({
      quickReviewUrl,
      qrCodeDataUrl,
      slug: business.slug,
      businessName: business.name
    });

  } catch (error) {
    console.error('QR error:', error);
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

// --------------------
// GET /api/business/settings
// --------------------
router.get('/settings', requireBusinessAdmin, async (req, res) => {
  try {
    const business = await prisma.business.findUnique({
      where: { id: req.user.businessId }
    });
    res.json(business);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// --------------------
// PUT /api/business/settings
// --------------------
const { updateBusinessSettingsSchema } = require('../validations/business.validation');

router.put('/settings', requireBusinessAdmin, async (req, res) => {
  try {
    const parsedData = updateBusinessSettingsSchema.parse(req.body);

    const business = await prisma.business.update({
      where: { id: req.user.businessId },
      data: parsedData
    });

    await auditLogService.log('BUSINESS_SETTINGS_UPDATE', req.user.id, { businessId: req.user.businessId });

    res.json(business);
  } catch (error) {
    if (error?.issues || error?.name === 'ZodError') {
      console.error('Validation error:', JSON.stringify(error.issues || error, null, 2));
      return res.status(400).json({
        error: 'Validation failed',
        details: error.issues || error.message
      });
    }
    console.error('Update settings error:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// --------------------
// WhatsApp Template Management
// --------------------

// GET /api/business/whatsapp/templates - List all usable templates
router.get('/whatsapp/templates', async (req, res) => {
  try {
    const businessId = req.user.businessId;

    // Fetch global templates + approved custom templates for this business
    const [globalTemplates, customTemplates] = await Promise.all([
      prisma.whatsAppTemplate.findMany({
        where: { isGlobal: true, status: 'APPROVED' }
      }),
      prisma.customTemplate.findMany({
        where: { businessId, status: 'APPROVED' }
      })
    ]);

    res.json({
      global: globalTemplates,
      custom: customTemplates
    });
  } catch (error) {
    console.error('Fetch templates error:', error);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// POST /api/business/whatsapp/custom-templates - Submit a new custom template
router.post('/whatsapp/custom-templates', async (req, res) => {
  try {
    const businessId = req.user.businessId;
    const { name, category, body, buttonText } = req.body;

    if (!name || !category || !body) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Safety Rules: Max 3 variables, URL at end
    const variableCount = (body.match(/{{[0-9]+}}/g) || []).length;
    if (variableCount > 3) {
      return res.status(400).json({ error: 'Templates can have a maximum of 3 variables' });
    }

    const customTemplate = await prisma.customTemplate.create({
      data: {
        businessId,
        name,
        category,
        body,
        buttonText,
        status: 'PENDING'
      }
    });

    await auditLogService.log('CUSTOM_TEMPLATE_SUBMIT', req.user.id, { 
      businessId, 
      templateId: customTemplate.id 
    });

    res.status(201).json(customTemplate);
  } catch (error) {
    console.error('Submit custom template error:', error);
    res.status(500).json({ error: 'Failed to submit template' });
  }
});

// GET /api/business/whatsapp/custom-templates - List business's custom templates
router.get('/whatsapp/custom-templates', async (req, res) => {
  try {
    const templates = await prisma.customTemplate.findMany({
      where: { businessId: req.user.businessId },
      orderBy: { createdAt: 'desc' }
    });
    res.json(templates);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch custom templates' });
  }
});

// GET /api/business/whatsapp/config - Get current template configuration
router.get('/whatsapp/config', async (req, res) => {
  try {
    const config = await prisma.businessTemplateConfig.findUnique({
      where: { businessId: req.user.businessId },
      include: {
        reviewRequestTemplate: true,
        reminderTemplate: true,
        thankYouTemplate: true,
        negativeFeedbackTemplate: true
      }
    });
    res.json(config || {});
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch config' });
  }
});

// PUT /api/business/whatsapp/config - Update template selection
router.put('/whatsapp/config', async (req, res) => {
  try {
    const businessId = req.user.businessId;
    const { 
      reviewRequestTemplateId, 
      reminderTemplateId, 
      thankYouTemplateId, 
      negativeFeedbackTemplateId 
    } = req.body;

    // Verify ownership/existence if IDs are provided
    const verifyTemplate = async (id) => {
      if (!id) return true;
      const [isGlobal, isCustom] = await Promise.all([
        prisma.whatsAppTemplate.findFirst({ where: { id, isGlobal: true, status: 'APPROVED' } }),
        prisma.customTemplate.findFirst({ where: { id, businessId, status: 'APPROVED' } })
      ]);
      return !!(isGlobal || isCustom);
    };

    const valid = await Promise.all([
      verifyTemplate(reviewRequestTemplateId),
      verifyTemplate(reminderTemplateId),
      verifyTemplate(thankYouTemplateId),
      verifyTemplate(negativeFeedbackTemplateId)
    ]);

    if (valid.includes(false)) {
      return res.status(400).json({ error: 'One or more templates are invalid or not approved' });
    }

    const config = await prisma.businessTemplateConfig.upsert({
      where: { businessId },
      update: {
        reviewRequestTemplateId,
        reminderTemplateId,
        thankYouTemplateId,
        negativeFeedbackTemplateId
      },
      create: {
        businessId,
        reviewRequestTemplateId,
        reminderTemplateId,
        thankYouTemplateId,
        negativeFeedbackTemplateId
      }
    });

    res.json(config);
  } catch (error) {
    console.error('Update config error:', error);
    res.status(500).json({ error: 'Failed to update configuration' });
  }
});

// --------------------
// Team Management Routes
// --------------------

// GET /api/business/team - List team members
router.get('/team', requireBusinessAdmin, async (req, res) => {
  try {
    const team = await prisma.user.findMany({
      where: { businessId: req.user.businessId },
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true
      }
    });
    res.json(team);
  } catch (error) {
    console.error('List team error:', error);
    res.status(500).json({ error: 'Failed to fetch team members' });
  }
});

// POST /api/business/team - Invite/Add team member
const bcrypt = require('bcryptjs');
const authService = require('../services/authService');

router.post('/team', requireBusinessAdmin, inviteLimiter, async (req, res) => {
  try {
    const { email, role } = req.body;

    if (!email || !role) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    const { user: newUser, resetToken } = await authService.initiateBusinessOnboarding(email, req.user.businessId);
    const inviteLink = `${process.env.APP_URL}/set-password/${resetToken}`;

    if (role === 'BUSINESS_MEMBER' || role === 'BUSINESS_ADMIN') {
      await prisma.user.update({
        where: { id: newUser.id },
        data: { role }
      });
    }

    await auditLogService.log('TEAM_MEMBER_INVITE', req.user.id, { invitedUserId: newUser.id, email, role });

    try {
      const business = await prisma.business.findUnique({ where: { id: req.user.businessId } });
      await emailService.sendTemplate(
        email,
        'invitation',
        "You've been invited to join {{businessName}} on Rewple",
        {
          businessName: business?.name || 'your business',
          link: inviteLink,
          expiresIn: '7 days',
          year: String(new Date().getFullYear())
        }
      );
    } catch (err) {
      console.error('Team invitation email failed:', err);
    }

    res.json({
      id: newUser.id,
      email: newUser.email,
      role,
      createdAt: newUser.createdAt,
      inviteLink
    });
  } catch (error) {
    console.error('Add team member error:', error);
    res.status(500).json({ error: 'Failed to add team member' });
  }
});

// DELETE /api/business/team/:id - Remove team member
router.delete('/team/:id', requireBusinessAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    if (id === req.user.id) {
      return res.status(400).json({ error: 'You cannot remove yourself' });
    }

    await prisma.user.delete({
      where: { id, businessId: req.user.businessId }
    });

    await auditLogService.log('TEAM_MEMBER_DELETE', req.user.id, { deletedUserId: id });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete team member error:', error);
    res.status(500).json({ error: 'Failed to remove team member' });
  }
});

// --------------------
// POST /api/business/ai/ask
// --------------------
router.post('/ai/ask', requireBusinessAdmin, async (req, res) => {
  try {
    const { question } = req.body;
    if (!question || !question.trim()) {
      return res.status(400).json({ error: 'Question is required' });
    }

    const business = await prisma.business.findUnique({
      where: { id: req.user.businessId },
      select: { id: true, name: true }
    });

    const feedbackSamples = await prisma.customer.findMany({
      where: { businessId: business.id, OR: [{ submittedAt: { not: null } }, { rating: { not: null } }] },
      orderBy: { submittedAt: 'desc' },
      take: 50,
      select: { rating: true, feedback: true, submittedAt: true, createdAt: true }
    });

    const answer = await answerWithContext(feedbackSamples, question, business.name);
    res.json({ answer });
  } catch (error) {
    console.error('AI ask error:', error);
    res.status(500).json({ error: 'Failed to generate AI insights' });
  }
});

// --------------------
// Support requests: Business -> SuperAdmin
// --------------------
router.post('/support', requireBusinessAdmin, async (req, res) => {
  try {
    const { type, subject, message } = req.body;
    if (!type || !subject || !message) {
      return res.status(400).json({ error: 'type, subject and message are required' });
    }

    const supportId = uuidv4();
    let support;
    try {
      const rows = await prisma.$queryRaw`
        INSERT INTO "support_requests" ("id","business_id","user_id","type","subject","message","status","created_at","updated_at")
        VALUES (${supportId}, ${req.user.businessId}, ${req.user.id}, ${type}, ${subject}, ${message}, 'OPEN', now(), now())
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
      support = rows?.[0];
    } catch (err) {
      console.error('Support insert failed:', err);
      return res.status(503).json({ error: 'Support system not initialized. Please apply DB schema changes and restart.' });
    }

    const business = await prisma.business.findUnique({ where: { id: req.user.businessId } });
    const to = process.env.PLATFORM_SUPPORT_EMAIL || process.env.SUPPORT_EMAIL || process.env.ADMIN_EMAIL;
    if (to) {
      const emailSubject = `[Rewple Support] ${type} — ${business?.name || 'Unknown Business'}`;
      const emailBody =
`A new support request has been submitted.

Business: ${business?.name || 'N/A'}
Business ID: ${req.user.businessId}
From: ${req.user.id}
Type: ${type}
Subject: ${subject}

Message:
${message}

Ticket ID: ${support.id}`;
      try {
        await emailService.sendEmail(to, emailSubject, emailBody);
      } catch (err) {
        console.error('Support email send failed:', err.message);
      }
    }

    res.status(201).json(support);
  } catch (error) {
    console.error('Support request error:', error);
    res.status(500).json({ error: 'Failed to submit support request' });
  }
});

router.get('/support', requireBusinessAdmin, async (req, res) => {
  try {
    try {
      const items = await prisma.$queryRaw`
        SELECT
          "id",
          "business_id" as "businessId",
          "user_id" as "userId",
          "type",
          "subject",
          "message",
          "status",
          "created_at" as "createdAt",
          "updated_at" as "updatedAt"
        FROM "support_requests"
        WHERE "business_id" = ${req.user.businessId}
        ORDER BY "created_at" DESC;
      `;
      res.json(items);
    } catch (err) {
      console.error('Support list failed:', err);
      res.status(503).json({ error: 'Support system not initialized. Please apply DB schema changes and restart.' });
    }
  } catch (error) {
    console.error('List support requests error:', error);
    res.status(500).json({ error: 'Failed to fetch support requests' });
  }
});

module.exports = router;
