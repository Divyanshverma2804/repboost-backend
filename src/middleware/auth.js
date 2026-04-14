const jwt = require('jsonwebtoken');
const prisma = require('../config/database');

/**
 * Verify JWT token from cookie or Authorization header
 */
async function authenticate(req, res, next) {
  try {
    // Check cookie first, then Authorization header
    let token = req.cookies.token;
    
    if (!token && req.headers.authorization) {
      token = req.headers.authorization.replace('Bearer ', '');
    }

    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // const user = await prisma.user.findUnique({
    //   where: { id: decoded.userId },
    //   include: { business: true }
    // });
    req.user = {
      id: decoded.id,
      role: decoded.role,
      businessId: decoded.businessId
    };


    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Require SUPER_ADMIN role
 */
function requireSuperAdmin(req, res, next) {
  if (req.user.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: 'Super admin access required' });
  }
  next();
}

/**
 * Require BUSINESS_ADMIN role
 */
function requireBusinessAdmin(req, res, next) {
  if (req.user.role !== 'BUSINESS_ADMIN') {
    return res.status(403).json({ error: 'Business admin access required' });
  }
  next();
}

/**
 * Extract business from slug parameter
 */
async function extractBusiness(req, res, next) {
  try {
    const { slug } = req.params;
    
    if (!slug) {
      return res.status(400).json({ error: 'Business slug required' });
    }
    
    const business = await prisma.business.findUnique({
      where: { slug }
    });

    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }

    // For authenticated routes, verify access
    if (req.user) {
      if (req.user.role === 'BUSINESS_ADMIN' && req.user.businessId !== business.id) {
        return res.status(403).json({ error: 'Access denied to this business' });
      }

      if (business.status === 'CANCELLED' && req.user.role === 'BUSINESS_ADMIN') {
        return res.status(403).json({ error: 'Business account cancelled' });
      }
    }

    req.business = business;
    next();
  } catch (error) {
    console.error('Business extraction error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
}

/**
 * Optional authentication - doesn't fail if not authenticated
 */
async function optionalAuth(req, res, next) {
  try {
    let token = req.cookies.token;
    
    if (!token && req.headers.authorization) {
      token = req.headers.authorization.replace('Bearer ', '');
    }

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        include: { business: true }
      });
      
      if (user) {
        req.user = user;
      }
    }
    
    next();
  } catch (error) {
    // Continue without user
    next();
  }
}

module.exports = {
  authenticate,
  requireSuperAdmin,
  requireBusinessAdmin,
  extractBusiness,
  optionalAuth
};
