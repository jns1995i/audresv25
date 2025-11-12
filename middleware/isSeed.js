const User = require('../model/user');

module.exports = async (req, res, next) => {
  try {
    // 🔍 Find user with role 'Seed'
    const seedUser = await User.findOne({ role: 'Seed' });

    if (!seedUser) {
      console.warn('⚠️ No user found with role "Seed".');
      res.locals.seedUser = null;
      req.seedUser = null;
      return next();
    }

    // ✅ Attach Seed user globally
    req.seedUser = seedUser;
    res.locals.seedUser = seedUser;

    console.log(`🌱 Seed user loaded: ${seedUser.fName} ${seedUser.lName}`);

    next();
  } catch (err) {
    console.error('⚠️ Error in isSeed middleware:', err);
    res.locals.seedUser = null;
    req.seedUser = null;
    next(); // Don’t block the request if there’s an error
  }
};
