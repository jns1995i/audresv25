const dayjs = require('dayjs');
const relativeTime = require('dayjs/plugin/relativeTime');
dayjs.extend(relativeTime);

const User = require('../model/user');
const Request = require('../model/request');

const isStaff = async (req, res, next) => {
  try {
    // Fetch all users with role 'Registrar'/

    const staffUsers = await User.find({
      role: { $in: ['Registrar', 'Admin'] },
      archive: false
    }).sort({ createdAt: -1 });

    // Fetch all requests with an assigned staff
    const requests = await Request.find({ archive: false })
      .populate('processBy', '_id');

    // Define date fields in user schema
    const dateFields = [
      'createdAt',
      'updatedAt',
      'verifyAt',
      'unverifyAt',
      'suspendAt'
    ];

    // Get start and end of today
    const startOfToday = dayjs().startOf('day');
    const endOfToday = dayjs().endOf('day');

    // Map users with formatted dates and request counts
    const formattedUsers = staffUsers.map(user => {
      const formatted = user.toObject();

      // Format date fields
      dateFields.forEach(field => {
        const dateValue = user[field];
        formatted[`${field}Formatted`] = dateValue
          ? dayjs(dateValue).format('MMM D, YYYY h:mm A')
          : '—';
        formatted[`${field}Ago`] = dateValue
          ? dayjs(dateValue).fromNow()
          : '—';
      });

      // Get requests assigned to this user
      const userRequests = requests.filter(
        rq => rq.processBy && rq.processBy._id.toString() === user._id.toString()
      );

      // ✅ Filter requests assigned today only
      const todayRequests = userRequests.filter(rq =>
        rq.assignAt &&
        dayjs(rq.assignAt).isAfter(startOfToday) &&
        dayjs(rq.assignAt).isBefore(endOfToday)
      );

     function countStatus(arr, status) {
        return arr.filter(rq => rq.status === status && !rq.declineAt).length;
      }

      formatted.requestSummary = {
        total: todayRequests.length,
        pending: countStatus(todayRequests, 'Pending'),
        processing: countStatus(todayRequests, 'Processing'),
        approved: countStatus(todayRequests, 'Approved'),
        forRelease: countStatus(todayRequests, 'For Release')
      };

      return formatted;
    });

    // Attach to req & res.locals
    req.users = formattedUsers;
    res.locals.users = formattedUsers;

    console.log(`📦 Loaded ${formattedUsers.length} Registrar users with today's request counts.`);
    next();

  } catch (err) {
    console.error('⚠️ Error in isStaff middleware:', err);
    res.status(500).render('index', {
      title: 'Error Loading Staff',
      error: 'Internal Server Error: Failed to load staff users.'
    });
  }
};

module.exports = isStaff;
