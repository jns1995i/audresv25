// middleware/myRequest.js
const dayjs = require('dayjs');
const relativeTime = require('dayjs/plugin/relativeTime');
dayjs.extend(relativeTime);

const Request = require('../model/request');
const Item = require('../model/item'); // ✅ Include Item model to fetch items per TR

const myRequest = async (req, res, next) => {
  try {
    // 🔐 Ensure user is logged in
    if (!req.session || !req.session.user) {
      console.log('⚠️ Unauthorized access attempt — user not logged in!');
      req.session.error = 'Please login first!';
      return res.redirect('/');
    }

    const userId = req.session.user._id;

    // 🔍 Fetch only requests from this logged-in user
    const requests = await Request.find({
      requestBy: userId,
      archive: false,
      verify: false
    })
      .populate('requestBy')
      .populate('processBy')
      .populate('releaseBy')
      .sort({ createdAt: -1 });

    // 📅 Date fields to auto-format
    const dateFields = [
      'createdAt', 'updatedAt', 'reviewAt', 'approveAt',
      'assessAt', 'payAt', 'verifyAt', 'turnAt',
      'claimedAt', 'holdAt', 'declineAt', 'assignAt'
    ];

    // 🛠️ Format and attach items per TR
    const formattedRequests = await Promise.all(
      requests.map(async reqDoc => {
        const formatted = reqDoc.toObject();

        // 🗓️ Add formatted date fields
        dateFields.forEach(field => {
          const dateValue = reqDoc[field];
          formatted[`${field}Formatted`] = dateValue
            ? dayjs(dateValue).format('MMM D, YYYY h:mm A')
            : '—';

          formatted[`${field}Ago`] = dateValue
            ? dayjs(dateValue).fromNow()
            : '—';
        });

        // 📌 Fetch matching items using TR
        const items = await Item.find({ tr: reqDoc.tr }).lean();
        formatted.items = items;

        return formatted;
      })
    );

    // 📦 Attach clean data to req & locals
    req.requests = formattedRequests;
    res.locals.requests = formattedRequests;

    console.log(
      `📦 Loaded ${formattedRequests.length} user requests with items attached (user: ${userId}).`
    );

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
