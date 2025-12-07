const User = require('../model/user');

module.exports = async (req, res, next) => {
  try {
    // --- Helper to ensure a user exists ---
    async function ensureUser(username, role, password = 'all456', access = 1, custom = {}) {
      // Check if user exists by username or email
      const email = custom.email || `${username.toLowerCase()}.au@phinmaed.com`;
      let user = await User.findOne({
        $or: [{ username }, { email }]
      });

      if (user) {
        console.log(`User "${username}" already exists.`);
        return user;
      }

      const baseData = {
        fName: custom.fName || username,
        mName: custom.mName || 'Reyes',
        lName: custom.lName || 'Santos',
        xName: custom.xName || 'III',
        archive: custom.archive || false,
        verify: false,
        suspend: false,
        email,
        phone: custom.phone || '09001234567',
        address: custom.address || 'Cabanatuan City',
        bDay: custom.bDay || 1,
        bMonth: custom.bMonth || 1,
        bYear: custom.bYear || 2000,
        campus: custom.campus || 'South',
        schoolId: custom.schoolId || '001',
        yearLevel: custom.yearLevel || 'Second Year',
        photo: custom.photo || '',
        vId: custom.vId || '',
        username,
        password,
        role,
        access,
        ...custom
      };

      const newUser = await User.create(baseData);
      console.log(`✅ ${role} account "${username}" created!`);
      return newUser;
    }

    // --- Ensure all essential users exist ---
    await ensureUser('Head', 'Head', 'all456', 1);
    await ensureUser('Dev', 'Dev', 'all456', 1, {
      email: 'jnsantiago.au@phinmaed.com',
      phone: '09296199578'
    });
    await ensureUser('Seed', 'Seed', 'all456', 1, {
      email: 'registrar.au@phinmaed.com',
      phone: '09386571406',
      fName: 'Araullo',
      lName: 'University',
      archive: true
    });

    // --- Load seed user and attach globally ---
    const seedUser = await User.findOne({ role: 'Seed' });

    if (!seedUser) {
      console.warn('⚠️ Seed user creation/check failed.');
      res.locals.seedUser = null;
      req.seedUser = null;
      return next();
    }

    req.seedUser = seedUser;
    res.locals.seedUser = seedUser;
    console.log(`🌱 Seed user loaded: ${seedUser.fName} ${seedUser.lName}`);

    next();
  } catch (err) {
    console.error('⚠️ Error in isSeed middleware:', err);
    res.locals.seedUser = null;
    req.seedUser = null;
    next();
  }
};
