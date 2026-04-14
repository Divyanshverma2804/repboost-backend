const express = require('express');
const router = express.Router();
const multer = require('multer');
const { authenticate } = require('../middleware/auth');
const { uploadImage } = require('../services/cloudinaryService');

const upload = multer({ storage: multer.memoryStorage() });

router.post('/image', authenticate, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const folder = req.user && req.user.businessId ? `Rewple/${req.user.businessId}` : 'Rewple';
    const result = await uploadImage(req.file.buffer, folder);
    res.json({ url: result.secure_url });
  } catch (error) {
    console.error('Image upload error:', error);
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

module.exports = router;
