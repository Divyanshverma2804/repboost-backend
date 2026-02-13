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

const upload = multer({ storage: multer.memoryStorage() });

// 🔐 All business routes require authentication
router.use(authenticate);
router.use(requireBusinessAdmin);

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

    const [
      totalPatients,
      reviewsReceived,
      smsCount,
      avgRating,
      recentPatients
    ] = await Promise.all([
      prisma.patient.count({ where: { businessId } }),
      prisma.patient.count({ where: { businessId, submittedAt: { not: null } } }),
      prisma.smsLog.count({ where: { businessId, status: 'SENT' } }),
      prisma.patient.aggregate({
        where: { businessId, rating: { not: null } },
        _avg: { rating: true }
      }),
      prisma.patient.findMany({
        where: { businessId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { smsLogs: true }
      })
    ]);

    res.json({
      business,
      stats: {
        totalPatients,
        smsSent: business.smsUsedThisMonth,
        reviewsReceived,
        smsCount,
        quotaRemaining: business.smsMonthlyLimit - business.smsUsedThisMonth,
        avgRating: avgRating._avg.rating || 0
      },
      recentPatients
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

// --------------------
// GET /api/business/patients
// --------------------
router.get('/patients', async (req, res) => {
  try {
    const businessId = req.user.businessId;
    const page = parseInt(req.query.page) || 1;
    const limit = 50;
    const skip = (page - 1) * limit;

    const [patients, total] = await Promise.all([
      prisma.patient.findMany({
        where: { businessId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip
      }),
      prisma.patient.count({ where: { businessId } })
    ]);

    res.json({
      patients,
      pagination: {
        page,
        totalPages: Math.ceil(total / limit),
        total
      }
    });
  } catch (error) {
    console.error('List patients error:', error);
    res.status(500).json({ error: 'Failed to fetch patients' });
  }
});

// --------------------
// POST /api/business/patients
// --------------------
router.post('/patients', async (req, res) => {
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

    const patient = await prisma.patient.create({
      data: {
        businessId,
        name,
        phone: phone || null,
        visitDate: visit,
        sendAt,
        source: 'MANUAL'
      }
    });

    res.json(patient);
  } catch (error) {
    console.error('Add patient error:', error);
    res.status(500).json({ error: 'Failed to add patient' });
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

        await prisma.patient.create({
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
router.get('/settings', async (req, res) => {
  const business = await prisma.business.findUnique({
    where: { id: req.user.businessId }
  });

  res.json(business);
});

// --------------------
// PUT /api/business/settings
// --------------------
const { updateBusinessSettingsSchema } = require('../validations/business.validation');

router.put('/settings', async (req, res) => {
  try {
    const parsedData = updateBusinessSettingsSchema.parse(req.body);

    const business = await prisma.business.update({
      where: { id: req.user.businessId },
      data: parsedData
    });

    res.json(business);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

module.exports = router;
