// middleware/myRequest.js
const Request = require('../model/request');

const myRequest = async (req, res, next) => {
  try {
    if (!req.session || !req.session.user) {
      console.log('⚠️ Unauthorized access attempt — user not logged in!');
      req.session.error = 'Please login first!';
      return res.redirect('/');
    }

    const userId = req.session.user._id;

    // Fetch only requests created by the logged-in user
    const requests = await Request.find({ 
        requestBy: userId, 
        archive: false, 
        verify: false 
      })
      .populate('requestBy')   // load full user data
      .populate('processBy')   // load full user data if assigned
      .populate('releaseBy')   // load full user data if assigned
      .sort({ createdAt: -1 }); // latest first

    // Attach to req and res.locals
    req.requests = requests;
    res.locals.requests = requests;

    console.log(`📦 Loaded ${requests.length} requests for user ${userId}`);
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
