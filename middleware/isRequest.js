// middleware/isRequest.js
const dayjs = require('dayjs');
const relativeTime = require('dayjs/plugin/relativeTime');
dayjs.extend(relativeTime);

const Request = require('../model/request');
const Item = require('../model/item'); // make sure this points to your items model

const isRequest = async (req, res, next) => {
  try {
    // 1️⃣ Get all requests
    const requests = await Request.find({ archive: false, verify: false })
      .populate('requestBy')
      .populate('processBy')
      .populate('releaseBy')
      .sort({ createdAt: -1 });

    // 2️⃣ Define all date fields
    const dateFields = [
      'createdAt', 'updatedAt', 'reviewAt', 'approveAt',
      'assessAt', 'payAt', 'verifyAt', 'turnAt',
      'claimedAt', 'holdAt', 'declineAt', 'assignAt'
    ];

    // 3️⃣ Map requests to include formatted dates & items
    const formattedRequests = await Promise.all(requests.map(async reqDoc => {
      const formatted = reqDoc.toObject();

      // ✅ Format all dates
      dateFields.forEach(field => {
        const dateValue = reqDoc[field];
        formatted[`${field}Formatted`] = dateValue ? dayjs(dateValue).format('MMM D, YYYY h:mm A') : '—';
        formatted[`${field}Ago`] = dateValue ? dayjs(dateValue).fromNow() : '—';
      });

      // ✅ Attach items for this request
      const items = await Item.find({ tr: reqDoc.tr }).lean(); // get items matching request TR
      formatted.items = items; // add as new property

      return formatted;
    }));

    // 4️⃣ Set to request & locals for frontend
    req.requests = formattedRequests;
    res.locals.requests = formattedRequests;

    console.log(`📦 Loaded ${formattedRequests.length} requests with items attached.`);
    next();
  } catch (err) {
    console.error('⚠️ Error in isRequest middleware:', err);
    res.status(500).render('index', {
      title: 'Error Loading Requests',
      error: 'Internal Server Error: Failed to load requests.'
    });
  }
};

module.exports = isRequest;
