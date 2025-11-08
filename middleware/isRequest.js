// middleware/isRequest.js
const Request = require('../model/request');

const isRequest = async (req, res, next) => {
  try {
    // Fetch all requests from DB
    const requests = await Request.find({
        archive: false, 
        verify: false 
      })
      .populate('requestBy')   // ✅ load full user data
      .populate('processBy')   // ✅ load full user data
      .populate('releaseBy')   // ✅ load full user data
      .sort({ createdAt: -1 }); // latest first

    // Attach to req and res.locals
    req.requests = requests;
    res.locals.requests = requests;

    console.log(`📦 Loaded ${requests.length} full requests from DB (with user data)`);
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
