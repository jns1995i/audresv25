// middleware/myRequest.js
const dayjs = require('dayjs');
const relativeTime = require('dayjs/plugin/relativeTime');
dayjs.extend(relativeTime);

const Request = require('../model/request');

const myRequest = async (req, res, next) => {
  try {
    if (!req.session || !req.session.user) {
      console.log('⚠️ Unauthorized access attempt — user not logged in!');
      req.session.error = 'Please login first!';
      return res.redirect('/');
    }

    const userId = req.session.user._id;

    // 🔍 Fetch only requests created by the logged-in user
    const requests = await Request.find({ 
        requestBy: userId, 
        archive: false, 
        verify: false 
      })
      .populate('requestBy')
      .populate('processBy')
      .populate('releaseBy')
      .sort({ createdAt: -1 });

    // 🗓️ Format all date fields before passing to frontend
    const dateFields = [
      'createdAt',
      'updatedAt',
      'reviewAt',
      'approveAt',
      'assessAt',
      'payAt',
      'verifyAt',
      'turnAt',
      'claimedAt',
      'holdAt',
      'declineAt',
      'assignAt'
    ];

    const formattedRequests = requests.map(reqDoc => {
      const formatted = reqDoc.toObject();

      dateFields.forEach(field => {
        const dateValue = reqDoc[field];
        formatted[`${field}Formatted`] = dateValue
          ? dayjs(dateValue).format('MMM D, YYYY h:mm A') // e.g. Nov 13, 2025 2:45 PM
          : '—';
        formatted[`${field}Ago`] = dateValue
          ? dayjs(dateValue).fromNow()
          : '—';
      });

      return formatted;
    });

    // 📦 Attach to req and res.locals
    req.requests = formattedRequests;
    res.locals.requests = formattedRequests;

    console.log(`📦 Loaded ${formattedRequests.length} requests for user ${userId} (with formatted dates)`);
    next();

  } catch (err) {
    console.error('⚠️ Error in myRequest middleware:', err);
    res.status(500).render('index', { 
      title: 'Error Loading Requests',
      error: 'Internal Server Error: Failed to load requests.'
    });
  }
};

module.exports = myRequest;
