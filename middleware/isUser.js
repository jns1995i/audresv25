const dayjs = require('dayjs');
const relativeTime = require('dayjs/plugin/relativeTime');
dayjs.extend(relativeTime);

const User = require('../model/user');

const isUser = async (req, res, next) => {
  try {
    const studentRoles = ['Student', 'Alumni', 'Former', 'Head', 'Dev','Seed','Admin','Accounting','Test','Registrar'];

    // Get all students only (NO STAFF LOGIC)
    const students = await User.find({
      role: { $in: studentRoles },
      archive: false
    }).sort({ fName: 1 });

    // Date fields to format
    const dateFields = [
      'createdAt',
      'updatedAt',
      'verifyAt',
      'unverifyAt',
      'suspendAt'
    ];

    const formattedUsers = students.map(user => {
      const u = user.toObject();

      // Format all date fields
      dateFields.forEach(field => {
        const value = user[field];

        u[`${field}Formatted`] = value
          ? dayjs(value).format('MMM D, YYYY h:mm A')
          : '—';

        u[`${field}Ago`] = value
          ? dayjs(value).fromNow()
          : '—';
      });

      return u;
    });

    // Attach to req
    req.users = formattedUsers;
    res.locals.users = formattedUsers;

    console.log(`📦 Loaded ${formattedUsers.length} student users.`);
    next();

  } catch (err) {
    console.error('❌ Error in isStudent middleware:', err);
    res.status(500).render('index', {
      title: 'Error Loading Students',
      error: 'Internal Server Error: Failed to load student users.'
    });
  }
};

module.exports = isUser;
