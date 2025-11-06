const User = require('../model/user');
const Request = require('../model/request');

module.exports = async (req, res, next) => {
  try {
  if (!req.session || !req.session.user) {
    console.log('⚠️ .... Unauthorized access attempt — Please login first!');
    req.session.error = 'Please login first!';
    return res.redirect('/');
  }

    // ✅ Fetch full user data from DB (not just session copy)
    const user = await User.findById(req.session.user._id);
    if (!user) {
      req.session.destroy();
      return res.redirect('/');
    }

    // ✅ Attach user data to req & res.locals for global EJS access
    req.user = user;
    res.locals.user = user;

    // ✅ Fetch all requests where user is requestBy or processBy (or releaseBy if desired)
    const userRequests = await Request.find({
      $or: [
        { requestBy: user._id },
        { processBy: user._id },
        { releaseBy: user._id } // optional but helpful
      ]
    })
      .populate('requestBy')
      .populate('processBy')
      .populate('releaseBy')
      .sort({ createdAt: -1 });

    // ✅ Make requests available globally (EJS or backend)
    req.userRequests = userRequests;
    res.locals.userRequests = userRequests;

    console.log(`✅ Logged in as ${user.fName} ${user.lName}`);
    console.log(`📦 Found ${userRequests.length} related requests`);

    next();
  } catch (err) {
    console.error('⚠️ Error in isLogin middleware:', err);
    res.status(500).render('index', {
      title: 'Login Error',
      error: 'Internal Server Error: Unable to load user data.'
    });
  }
};
