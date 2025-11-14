// middleware/isRequest.js
const dayjs = require('dayjs');
const relativeTime = require('dayjs/plugin/relativeTime');
dayjs.extend(relativeTime);

const Request = require('../model/request');

const isVerify = async (req, res, next) => {
  try {
    const requests = await Request.find({
        archive: true,
        verify: true
      })
      .populate('requestBy')
      .populate('processBy')
      .populate('releaseBy')
      .sort({ createdAt: -1 });

    // ✅ Define *all* date fields from your schema
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

    // ✅ Map and format all dates before sending to frontend
    const formattedRequests = requests.map(reqDoc => {
      const formatted = reqDoc.toObject();

      dateFields.forEach(field => {
        const dateValue = reqDoc[field];
        formatted[`${field}Formatted`] = dateValue
          ? dayjs(dateValue).format('MMM D, YYYY h:mm A') // e.g., "Nov 13, 2025 2:45 PM"
          : '—'; // fallback if missing

        // (Optional) also include relative time, e.g., "2 days ago"
        formatted[`${field}Ago`] = dateValue
          ? dayjs(dateValue).fromNow()
          : '—';
      });

      return formatted;
    });

    req.requests = formattedRequests;
    res.locals.requests = formattedRequests;

    console.log(`📦 Loaded ${formattedRequests.length} requests (all dates formatted).`);
    next();

  } catch (err) {
    console.error('⚠️ Error in isRequest middleware:', err);
    res.status(500).render('index', { 
      title: 'Error Loading Requests',
      error: 'Internal Server Error: Failed to load requests.'
    });
  }
};

module.exports = isVerify;
