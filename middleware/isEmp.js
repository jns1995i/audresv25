const dayjs = require('dayjs');
const relativeTime = require('dayjs/plugin/relativeTime');
dayjs.extend(relativeTime);

const User = require('../model/user');
const Request = require('../model/request');

const isEmp = async (req, res, next) => {
  try {
    // Roles to include
    const employeeRoles = ['Admin', 'Head', 'Registrar', 'Employees', 'Accounting'];

    // Fetch all users with the defined roles
    const staffUsers = await User.find({ role: { $in: employeeRoles }, archive: false })
      .sort({ fName: 1 });

    // Fetch all requests with an assigned staff
    const requests = await Request.find({ archive: false })
      .populate('processBy', '_id');

    // Define date fields in user schema
    const dateFields = ['createdAt', 'updatedAt', 'verifyAt', 'unverifyAt', 'suspendAt'];

    // Get today boundaries
    const today = dayjs();
    
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

      // Requests assigned to this user
      const userRequests = requests.filter(
        rq => rq.processBy && rq.processBy._id.toString() === user._id.toString()
      );

      // Filter requests assigned today
      const todayRequests = userRequests.filter(rq =>
        rq.assignAt && dayjs(rq.assignAt).isSame(today, 'day')
      );

      // Define processing statuses
      const processingStatuses = ['Reviewed', 'Assessed', 'For Verification', 'For Payment'];

      // Request summary for today
      formatted.requestSummary = {
        total: todayRequests.length,
        pending: todayRequests.filter(rq => rq.status === 'Pending').length,
        processing: todayRequests.filter(rq => processingStatuses.includes(rq.status)).length,
        approved: todayRequests.filter(rq => rq.status === 'Approved').length,
        forRelease: todayRequests.filter(rq => rq.status === 'For Release').length
      };

      return formatted;
    });

    // Attach to req and res.locals
    req.users = formattedUsers;
    res.locals.users = formattedUsers;

    console.log(`📦 Loaded ${formattedUsers.length} employees with today's request counts.`);
    next();

  } catch (err) {
    console.error('⚠️ Error in isEmp middleware:', err);
    res.status(500).render('index', {
      title: 'Error Loading Employees',
      error: 'Internal Server Error: Failed to load employee users.'
    });
  }
};

module.exports = isEmp;
