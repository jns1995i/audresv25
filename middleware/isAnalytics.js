const dayjs = require("dayjs");
const requests = require("../model/request");
const users = require("../model/user");
const items = require("../model/item");

module.exports = async function analyticsMiddleware(req, res, next) {
  try {
    const filter = req.query.range || "thisYear";
    const now = dayjs();
    let start = null;
    let end = null;

    switch (filter) {
      case "today":
        start = now.startOf("day");
        end = now.endOf("day");
        break;
      case "yesterday":
        start = now.subtract(1, "day").startOf("day");
        end = now.subtract(1, "day").endOf("day");
        break;
      case "thisWeek":
        start = now.startOf("week");
        end = now.endOf("week");
        break;
      case "lastWeek":
        start = now.subtract(1, "week").startOf("week");
        end = now.subtract(1, "week").endOf("week");
        break;
      case "thisMonth":
        start = now.startOf("month");
        end = now.endOf("month");
        break;
      case "lastMonth":
        start = now.subtract(1, "month").startOf("month");
        end = now.subtract(1, "month").endOf("month");
        break;
      case "thisYear":
        start = now.startOf("year");
        end = now.endOf("year");
        break;
      case "lastYear":
        start = now.subtract(1, "year").startOf("year");
        end = now.subtract(1, "year").endOf("year");
        break;
      case "specific":
        if (req.query.date) {
          start = dayjs(req.query.date).startOf("day");
          end = dayjs(req.query.date).endOf("day");
        }
        break;
      case "custom":
        if (req.query.start && req.query.end) {
          start = dayjs(req.query.start).startOf("day");
          end = dayjs(req.query.end).endOf("day");
        }
        break;
      case "overall":
      default:
        start = null;
        end = null;
    }

    const dateFilter = start && end
      ? { 
          createdAt: { $gte: start.toDate(), $lte: end.toDate() },
          archive: false,
          verify: false
        }
      : { archive: false, verify: false };


    // ================================
    // REQUEST COUNTS
    // ================================
    const allRequests = await requests.find(dateFilter);
    const totalRequests = allRequests.length;

    const approved = allRequests.filter(r => ["Verified", "For Release", "Claimed"].includes(r.status)).length;
    const onProcess = allRequests.filter(r => ["Reviewed", "Assessed", "For Payment", "For Verification"].includes(r.status)).length;
    const pending = allRequests.filter(r => r.status === "Pending" && !r.declineAt).length;
    const declined = allRequests.filter(r => r.declineAt).length;
    const onHold = allRequests.filter(r => r.holdAt).length;
    const toVerify = allRequests.filter(r => r.verify === true).length;


    const getPercent = (count) => {
      if (totalRequests === 0) return 0;
      const value = (count / totalRequests) * 100;
      return Number.isInteger(value) ? value : Number(value.toFixed(1));
    };

    const approvedPercent = `${getPercent(approved)}%`;
    const pendingPercent = `${getPercent(pending)}%`;
    const declinedPercent = `${getPercent(declined)}%`;
    const onHoldPercent = `${getPercent(onHold)}%`;
    const onProcessPercent = `${getPercent(onProcess)}%`;

    console.log(approvedPercent, pendingPercent, declinedPercent, onHoldPercent);

    let requestStatusStats = await requests.aggregate([
      { $match: dateFilter },
      { 
        $group: { 
          _id: "$status", 
          count: { $sum: 1 } 
        } 
      },
      { $sort: { count: 1 } } // optional, sort alphabetically
    ]);

    requestStatusStats = requestStatusStats.map(s => ({
      _id: s._id,
      count: s.count,
      percentage: totalRequests === 0 ? 0 : Number(((s.count / totalRequests) * 100).toFixed(1)) // numeric only
    }));

    // ================================
    // ACTIVE USERS
    // ================================

    const requestorIds = allRequests.map(r => r.requestBy.toString());
    const relevantUsers = await users.find({
      _id: { $in: requestorIds },
      role: { $in: ["Student", "Alumni", "Former", "Tst"] }
    });

    // Count unique active users
    const activeUserCount = relevantUsers.length;

    // ================================
    // TOP USERS
    // ================================

    const topUsersAgg = await requests.aggregate([
      { $match: dateFilter },
      { $group: { _id: "$requestBy", totalRequests: { $sum: 1 } } },
      { $sort: { totalRequests: -1 } },
      { $limit: 3 },
      {
        $lookup: {
          from: "users",
          let: { uid: "$_id" },
          pipeline: [
            { $match: {
                $expr: { $eq: ["$_id", "$$uid"] },
                role: { $in: ["Student", "Alumni", "Former","Test"] }
            }},
            { $project: { fName: 1, lName: 1, mName: 1, photo: 1, course: 1, role: 1 } }
          ],
          as: "userInfo"
        }
      },
      { $unwind: "$userInfo" }
    ]);


    // ================================
    // ROLE, COURSE, YEAR LEVEL STATS
    // ================================
    const [roleStats, courseStats, yearLevelRaw] = await Promise.all([
      // roleStats (only Student/Alumni/Former/Test)
      requests.aggregate([
        { $match: dateFilter },
        {
          $lookup: {
            from: "users",
            let: { uid: "$requestBy" },
            pipeline: [
              { $match: { $expr: { $eq: ["$_id", "$$uid"] }, role: { $in: ["Student", "Alumni", "Former","Test"] } } }
            ],
            as: "userInfo"
          }
        },
        { $unwind: "$userInfo" },
        { $group: { _id: "$userInfo.role", count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),

      // courseStats
      requests.aggregate([
        { $match: dateFilter },
        { $lookup: { from: "users", localField: "requestBy", foreignField: "_id", as: "userInfo" } },
        { $unwind: "$userInfo" },
        { $group: { _id: "$userInfo.course", count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),

      // yearLevel raw counts (compute percentages in JS)
      requests.aggregate([
        { $match: dateFilter },
        { $lookup: { from: "users", localField: "requestBy", foreignField: "_id", as: "userInfo" } },
        { $unwind: "$userInfo" },
        { $group: { _id: "$userInfo.yearLevel", count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ])
    ]);

    // compute percentages using totalRequests (avoid heavy aggregation)
    const yearLevelStats = yearLevelRaw.map(d => ({
      _id: d._id,
      count: d.count,
      percentage: totalRequests === 0 ? 0 : Number(((d.count / totalRequests) * 100).toFixed(1))
    }));

    // ================================
    // DOCUMENT ANALYTICS
    // ================================
    const requestTRs = allRequests.map(r => r.tr);
    const [topDocuments, topPurpose, purposeStats, docStatusStats, documentStats] = await Promise.all([
      items.aggregate([
        { $match: { tr: { $in: requestTRs } } },
        { $group: { _id: "$type", totalQty: { $sum: "$qty" }, totalRequests: { $sum: 1 } } },
        { $sort: { totalQty: -1 } },
        { $limit: 3 }
      ]),
      items.aggregate([
        { $match: { tr: { $in: requestTRs } } },
        { $group: { _id: "$purpose", total: { $sum: 1 } } },
        { $sort: { total: -1 } },
        { $limit: 3 }
      ]),
      items.aggregate([
        { $match: { tr: { $in: requestTRs } } },
        { $group: { _id: "$purpose", total: { $sum: 1 } } },
        { $sort: { total: -1 } }
      ]),
      items.aggregate([
        { $match: { tr: { $in: requestTRs } } },
        { $group: { _id: { type: "$type", status: "$status" }, count: { $sum: 1 } } },
        { $sort: { "_id.type": 1 } }
      ]),
      items.aggregate([
        { $match: { tr: { $in: requestTRs } } },
        { $group: { _id: "$type", totalQty: { $sum: "$qty" }, totalRequests: { $sum: 1 } } },
        { $sort: { totalQty: -1 } }
      ])
    ]);

    // ================================
    // AVERAGE APPROVAL TIME
    // ================================
      const avgApprovalAgg = await requests.aggregate([
        { $match: { status: "Verified", verifyAt: { $exists: true }, ...dateFilter } },
        { $project: { durationHours: { $divide: [{ $subtract: ["$verifyAt", "$createdAt"] }, 1000*60*60] } } },
        { $group: { _id: null, avgApprovalTime: { $avg: "$durationHours" } } }
      ]);
      const avgApprovalDecimal = avgApprovalAgg[0]?.avgApprovalTime || 0;

      function formatDuration(hoursDecimal) {
        const totalMinutes = Math.round(hoursDecimal * 60);
        const days = Math.floor(totalMinutes / (60 * 24));
        const hrs = Math.floor((totalMinutes % (60 * 24)) / 60);
        const mins = totalMinutes % 60;
        let result = "";
        if (days) result += `${days} day${days > 1 ? 's' : ''} `;
        if (hrs) result += `${hrs} hr${hrs > 1 ? 's' : ''} `;
        if (mins) result += `${mins} min${mins > 1 ? 's' : ''}`;
        if (!days && !hrs && !mins) result = "Less than a minute";
        return result.trim();
      }

      function getTimeStat1(hoursDecimal) {
        if (hoursDecimal < 1) return "Quick";
        if (hoursDecimal < 4) return "Fast";
        if (hoursDecimal < 12) return "Moderate";
        if (hoursDecimal < 24) return "Standard";
        if (hoursDecimal < 48) return "Slow";
        if (hoursDecimal < 72) return "Warning";
        return "Critical";
      }

      const avgApprovalTime = formatDuration(avgApprovalDecimal);
      const avgApprovalTimeStat = getTimeStat1(avgApprovalDecimal);

      
    // ================================
    // AVERAGE REVIEW TIME
    // ================================
      const avgReviewAgg = await requests.aggregate([
        { $match: { status: "Reviewed", reviewAt: { $exists: true }, ...dateFilter } },
        { $project: { durationHours: { $divide: [{ $subtract: ["$reviewAt", "$createdAt"] }, 1000*60*60] } } },
        { $group: { _id: null, avgReviewTime: { $avg: "$durationHours" } } }
      ]);
      const avgReviewDecimal = avgReviewAgg[0]?.avgReviewTime || 0;

      function formatDuration(hoursDecimal) {
        const totalMinutes = Math.round(hoursDecimal * 60);
        const days = Math.floor(totalMinutes / (60 * 24));
        const hrs = Math.floor((totalMinutes % (60 * 24)) / 60);
        const mins = totalMinutes % 60;
        let result = "";
        if (days) result += `${days} day${days > 1 ? 's' : ''} `;
        if (hrs) result += `${hrs} hr${hrs > 1 ? 's' : ''} `;
        if (mins) result += `${mins} min${mins > 1 ? 's' : ''}`;
        if (!days && !hrs && !mins) result = "Less than a minute";
        return result.trim();
      }

        function getTimeStat2(hoursDecimal) {
          if (hoursDecimal < 1/60) return "Quick";
          if (hoursDecimal < 0.5) return "Fast";
          if (hoursDecimal < 1) return "Moderate";
          if (hoursDecimal < 3) return "Standard";
          if (hoursDecimal < 24) return "Slow";
          if (hoursDecimal < 72) return "Warning";
          return "Critical";                         
      }


      const avgReviewTime = formatDuration(avgReviewDecimal);
      const avgReviewTimeStat = getTimeStat2(avgReviewDecimal);

            
    // ================================
    // AVERAGE ASSESSMENT TIME
    // ================================
      const avgAssessAgg = await requests.aggregate([
        { $match: { status: "Reviewed", assessAt: { $exists: true }, ...dateFilter } },
        { $project: { durationHours: { $divide: [{ $subtract: ["$assessAt", "$reviewAt"] }, 1000*60*60] } } },
        { $group: { _id: null, avgAssessTime: { $avg: "$durationHours" } } }
      ]);
      const avgAssessDecimal = avgAssessAgg[0]?.avgAssessTime || 0;

      function formatDuration(hoursDecimal) {
        const totalMinutes = Math.round(hoursDecimal * 60);
        const days = Math.floor(totalMinutes / (60 * 24));
        const hrs = Math.floor((totalMinutes % (60 * 24)) / 60);
        const mins = totalMinutes % 60;
        let result = "";
        if (days) result += `${days} day${days > 1 ? 's' : ''} `;
        if (hrs) result += `${hrs} hr${hrs > 1 ? 's' : ''} `;
        if (mins) result += `${mins} min${mins > 1 ? 's' : ''}`;
        if (!days && !hrs && !mins) result = "Less than a minute";
        return result.trim();
      }

        function getTimeStat2(hoursDecimal) {
          if (hoursDecimal < 1/60) return "Quick";
          if (hoursDecimal < 0.5) return "Fast";
          if (hoursDecimal < 1) return "Moderate";
          if (hoursDecimal < 3) return "Standard";
          if (hoursDecimal < 24) return "Slow";
          if (hoursDecimal < 72) return "Warning";
          return "Critical";                         
      }


      const avgAssessTime = formatDuration(avgAssessDecimal);
      const avgAssessTimeStat = getTimeStat2(avgAssessDecimal);



    // ================================
    // TREND AGGREGATION (dynamic)
    // ================================
    let trendAgg = [];

    if (start && end) {
      switch (filter) {
        case "today":
        case "yesterday": {
          // hours 0-23
          const labels = Array.from({ length: 24 }, (_, i) => i);
          const counts = await requests.aggregate([
            { $match: dateFilter },
            { $group: { _id: { hour: { $hour: "$createdAt" } }, count: { $sum: 1 } } }
          ]);
          trendAgg = labels.map(h => {
            const found = counts.find(c => c._id.hour === h);
            return { label: `${h}:00`, count: found ? found.count : 0 };
          });
          break;
        }
      case "thisWeek":
      case "lastWeek": {
          // labels: Sunday → Saturday
          const dayNames = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

          const counts = await requests.aggregate([
              { $match: dateFilter },
              {
                  $group: {
                      _id: {
                          iso: { $isoDayOfWeek: "$createdAt" }
                      },
                      count: { $sum: 1 }
                  }
              }
          ]);

          // Convert counts into Sunday-first format
          trendAgg = dayNames.map((name, index) => {
              // Map index (0–6) → isoDayOfWeek (Sunday=7, Monday=1, etc.)
              const isoDay = index === 0 ? 7 : index; // Sunday=7

              const found = counts.find(c => c._id.iso === isoDay);

              return {
                  label: name,
                  count: found ? found.count : 0
              };
          });

          break;
      }
      case "specific": {
        // Show months of the selected year instead of hours
        const mNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

        const counts = await requests.aggregate([
          { $match: dateFilter }, 
          { 
            $group: { 
              _id: { month: { $month: "$createdAt" } }, 
              count: { $sum: 1 } 
            } 
          }
        ]);

        trendAgg = mNames.map((m, index) => {
          const monthNum = index + 1; // 1 - 12
          const found = counts.find(c => c._id.month === monthNum);
          return { label: m, count: found ? found.count : 0 };
        });

        break;
      }
      case "custom": {
        const totalDays = end.diff(start, "day") + 1;

        // Generate an array of dates from start → end
        const dateList = Array.from({ length: totalDays }, (_, i) => {
          const d = start.add(i, "day");
          return {
            display: d.format("MM-DD"),
            match: d.format("YYYY-MM-DD")
          };
        });

        const counts = await requests.aggregate([
          { $match: dateFilter },
          { 
            $group: { 
              _id: { date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } } }, 
              count: { $sum: 1 } 
            } 
          }
        ]);

        trendAgg = dateList.map(d => {
          const found = counts.find(c => c._id.date === d.match);
          return { label: d.display, count: found ? found.count : 0 };
        });

        break;
      }

        case "thisMonth":
        case "lastMonth": {
          const daysInMonth = end.date(); // last day of month
          const labels = Array.from({ length: daysInMonth }, (_, i) => i + 1);
          const counts = await requests.aggregate([
            { $match: dateFilter },
            { $group: { _id: { date: { $dayOfMonth: "$createdAt" } }, count: { $sum: 1 } } }
          ]);
          trendAgg = labels.map(d => {
            const found = counts.find(c => c._id.date === d);
            return { label: `${d}`, count: found ? found.count : 0 };
          });
          break;
        }
        case "thisYear":
        case "lastYear": {
          const mNames = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
          const counts = await requests.aggregate([
            { $match: dateFilter },
            { 
              $group: { 
                _id: { month: { $month: "$createdAt" } }, 
                count: { $sum: 1 } 
              } 
            }
          ]);

          trendAgg = mNames.map((m, i) => {
            const monthNum = i + 1; // maps Jan→1, Feb→2 ... Dec→12
            const found = counts.find(c => c._id.month === monthNum);

            return {
              label: m,
              count: found ? found.count : 0
            };
          });

          break;
        }
       case "overall":
        default: {
        const counts = await requests.aggregate([
            { $group: { _id: { year: { $year: "$createdAt" } }, count: { $sum: 1 } } },
            { $sort: { "_id.year": 1 } }
        ]);

        trendAgg = counts.map(c => ({
            label: `${c._id.year}`,
            count: c.count
        }));
        break;
        }
      }
    }
    if (filter === "overall") {
    const firstDoc = await requests.findOne().sort({ createdAt: 1 });
    const lastDoc = await requests.findOne().sort({ createdAt: -1 });
    if (firstDoc && lastDoc) {
        const startYear = dayjs(firstDoc.createdAt).year();
        const endYear = dayjs(lastDoc.createdAt).year();
        const yearLabels = Array.from({ length: endYear - startYear + 1 }, (_, i) => startYear + i);

        const counts = await requests.aggregate([
        { $group: { _id: { year: { $year: "$createdAt" } }, count: { $sum: 1 } } }
        ]);

        trendAgg = yearLabels.map(y => {
        const found = counts.find(c => c._id.year === y);
        return { label: `${y}`, count: found ? found.count : 0 };
        });
    }
    }

    const totalUsers = await users.countDocuments({
      role: { $in: ["Student", "Alumni", "Former", "Test"] },
      archive: false,
      verify: false
    });

    const toVerifyUsers = await users.countDocuments({
      role: { $in: ["Student", "Alumni", "Former", "Test"] },
      archive: false,
      verify: true
    });

// ================================
// USER REGISTRATION & GROWTH (actual counts)
// ================================
let currentUsersCount = 0;
let previousUsersCount = 0;
let registrationGrowth = ""; // string to allow "New: X users"

let prevStart = null;
let prevEnd = null;

if (start && end) {
  const periodLength = end.diff(start, "day") + 1;

  // determine previous period
  switch(filter) {
    case "today":
    case "yesterday":
      prevStart = start.subtract(1, "day");
      prevEnd = end.subtract(1, "day");
      break;
    case "thisWeek":
    case "lastWeek":
      prevStart = start.subtract(1, "week");
      prevEnd = end.subtract(1, "week");
      break;
    case "thisMonth":
    case "lastMonth":
      prevStart = start.subtract(1, "month");
      prevEnd = end.subtract(1, "month");
      break;
    case "thisYear":
    case "lastYear":
      prevStart = start.subtract(1, "year");
      prevEnd = end.subtract(1, "year");
      break;
    case "custom":
      prevStart = start.subtract(periodLength, "day");
      prevEnd = end.subtract(periodLength, "day");
      break;
    case "specific":
      prevStart = start.subtract(1, "day");
      prevEnd = end.subtract(1, "day");
      break;
    default:
      break;
  }

  // current period
  currentUsersCount = await users.countDocuments({
    role: { $in: ["Student", "Alumni", "Former", "Test"] },
    archive: false,
    verify: false,
    createdAt: { $gte: start.toDate(), $lte: end.toDate() }
  });

  // previous period
  if (prevStart && prevEnd) {
    previousUsersCount = await users.countDocuments({
      role: { $in: ["Student", "Alumni", "Former", "Test"] },
      archive: false,
      verify: false,
      createdAt: { $gte: prevStart.toDate(), $lte: prevEnd.toDate() }
    });
  }

  // compute growth
  if (previousUsersCount > 0) {
    const diff = currentUsersCount - previousUsersCount;
    if (diff > 0) {
      registrationGrowth = `${((diff / previousUsersCount) * 100).toFixed(2)}%`;
    } else if (diff < 0) {
      registrationGrowth = `${((Math.abs(diff) / previousUsersCount) * 100).toFixed(2)}%`;
    } else {
      registrationGrowth = "No Progress";
    }
  } else {
    if (currentUsersCount > 0) {
      registrationGrowth = `+${currentUsersCount} New User${currentUsersCount > 1 ? "s" : ""}`;
    } else {
      registrationGrowth = "No New Users";
    }
  }

} else {
  // overall
  currentUsersCount = await users.countDocuments({
    role: { $in: ["Student", "Alumni", "Former", "Test"] },
    archive: false,
    verify: false
  });
  previousUsersCount = 0;
  registrationGrowth = currentUsersCount > 0
    ? `+${currentUsersCount} User${currentUsersCount > 1 ? "s" : ""}`
    : "No Users";
}

// ========================================
// PERIOD LABELS (Filter Name + Value)
// ========================================
let currentPeriodLabel = "";
let previousPeriodLabel = "";

switch (filter) {
  case "today":
    currentPeriodLabel = `Today – ${start.format("MMM DD, YYYY")}`;
    previousPeriodLabel = `Yesterday – ${prevStart.format("MMM DD, YYYY")}`;
    break;

  case "yesterday":
    currentPeriodLabel = `Yesterday – ${start.format("MMM DD, YYYY")}`;
    previousPeriodLabel = `2 Days Ago – ${prevStart.format("MMM DD, YYYY")}`;
    break;

  case "thisWeek":
    currentPeriodLabel = `This Week – ${start.format("MMM DD")} to ${end.format("MMM DD, YYYY")}`;
    previousPeriodLabel = `Last Week – ${prevStart.format("MMM DD")} to ${prevEnd.format("MMM DD, YYYY")}`;
    break;

  case "lastWeek":
    currentPeriodLabel = `Last Week – ${start.format("MMM DD")} to ${end.format("MMM DD, YYYY")}`;
    previousPeriodLabel = `Previous Week – ${prevStart.format("MMM DD")} to ${prevEnd.format("MMM DD, YYYY")}`;
    break;

  case "thisMonth":
    currentPeriodLabel = `This Month – ${start.format("MMMM YYYY")}`;          // Example: January 2025
    previousPeriodLabel = `Last Month – ${prevStart.format("MMMM YYYY")}`;     // Example: December 2024
    break;

  case "lastMonth":
    currentPeriodLabel = `Last Month – ${start.format("MMMM YYYY")}`;
    previousPeriodLabel = `Previous Month – ${prevStart.format("MMMM YYYY")}`;
    break;

  case "thisYear":
    currentPeriodLabel = `This Year – ${start.format("YYYY")}`;
    previousPeriodLabel = `Last Year – ${prevStart.format("YYYY")}`;
    break;

  case "lastYear":
    currentPeriodLabel = `Last Year – ${start.format("YYYY")}`;
    previousPeriodLabel = `Previous Year – ${prevStart.format("YYYY")}`;
    break;

  case "specific":
    currentPeriodLabel = `Selected Date – ${start.format("MMM DD, YYYY")}`;
    previousPeriodLabel = `Previous Date – ${prevStart.format("MMM DD, YYYY")}`;
    break;

  case "custom":
    currentPeriodLabel = `Custom Range – ${start.format("MMM DD")} to ${end.format("MMM DD, YYYY")}`;
    previousPeriodLabel = `Previous Range – ${prevStart.format("MMM DD")} to ${prevEnd.format("MMM DD, YYYY")}`;
    break;

  default:
    currentPeriodLabel = "Overall – All Time";
    previousPeriodLabel = "—";
}


  // ================================
  // PROCESS-BY ANALYTICS
  // ================================
  const processByAggRaw = await requests.aggregate([
    { $match: dateFilter },

    // Only requests processed by someone
    { $match: { processBy: { $exists: true, $ne: null } } },

    {
      $group: {
        _id: { staffId: "$processBy", status: "$status" },
        count: { $sum: 1 }
      }
    },

    // Flatten per staff
    {
      $group: {
        _id: "$_id.staffId",
        statuses: {
          $push: {
            status: "$_id.status",
            count: "$count"
          }
        },
        totalProcessed: { $sum: "$count" }
      }
    },

    // Attach staff details
    {
      $lookup: {
        from: "users",
        localField: "_id",
        foreignField: "_id",
        as: "staffInfo"
      }
    },
    { $unwind: "$staffInfo" },

    {
      $project: {
          _id: 0,
          staffId: "$_id",

          // FULL NAME (cleaned: no double spaces, middle optional)
          fullName: {
            $trim: {
              input: {
                $concat: [
                  "$staffInfo.fName", " ",
                  { $ifNull: ["$staffInfo.mName", ""] }, " ",
                  "$staffInfo.lName"
                ]
              }
            }
          },

          // DISPLAY NAME (First Name + Last Initial)
          displayName: "$staffInfo.fName",

          totalProcessed: 1,
          statuses: 1
        }
    }
  ]);

  // GET OVERALL TOTAL OF ALL STAFF
  const overallTotalProcessed = processByAggRaw.reduce(
    (sum, s) => sum + s.totalProcessed,
    0
  );

  // Add percentage for each staff
  const processByAgg = processByAggRaw.map((s) => ({
    ...s,
    percentage: overallTotalProcessed
      ? ((s.totalProcessed / overallTotalProcessed) * 100).toFixed(2) + "%"
      : "0%"
  }));

  // Sort after adding percentage
  processByAgg.sort((a, b) => b.totalProcessed - a.totalProcessed);

// ================================
// PROCESS-BY ANALYTICS (VERIFIED / RELEASED / CLAIMED ONLY)
// ================================
const processByVerifiedAggRaw = await requests.aggregate([
  { $match: dateFilter },

  // Only requests processed by someone
  { $match: { processBy: { $exists: true, $ne: null } } },

  // Only include requests with specific statuses
  { $match: { status: { $in: ["Verified", "For Release", "Claimed"] } } },

  {
    $group: {
      _id: { staffId: "$processBy", status: "$status" },
      count: { $sum: 1 }
    }
  },

  // Flatten per staff
  {
    $group: {
      _id: "$_id.staffId",
      statuses: {
        $push: {
          status: "$_id.status",
          count: "$count"
        }
      },
      totalProcessed: { $sum: "$count" }
    }
  },

  // Attach staff details
  {
    $lookup: {
      from: "users",
      localField: "_id",
      foreignField: "_id",
      as: "staffInfo"
    }
  },
  { $unwind: "$staffInfo" },

  {
    $project: {
      _id: 0,
      staffId: "$_id",
      displayName: "$staffInfo.fName", // only first name for chart labels
      totalProcessed: 1,
      statuses: 1
    }
  }
]);

// GET OVERALL TOTAL OF VERIFIED/RELEASED/CLAIMED
const overallVerifiedTotal = processByVerifiedAggRaw.reduce(
  (sum, s) => sum + s.totalProcessed,
  0
);

// Add percentage for each staff
const processByVerifiedAgg = processByVerifiedAggRaw.map((s) => ({
  ...s,
  percentage: overallVerifiedTotal
    ? ((s.totalProcessed / overallVerifiedTotal) * 100).toFixed(2) + "%"
    : "0%"
}));

// Sort
processByVerifiedAgg.sort((a, b) => b.totalProcessed - a.totalProcessed);

const processByDeclineAggRaw = await requests.aggregate([
  { $match: dateFilter },
  { $match: { declineAt: { $exists: true, $ne: null } } },

  {
    $group: {
      _id: { $ifNull: ["$processBy", "Unassigned"] }, // handle null processBy
      totalDeclined: { $sum: 1 }
    }
  },
  {
    $lookup: {
      from: "users",
      localField: "_id",
      foreignField: "_id",
      as: "staffInfo"
    }
  },
  {
    $project: {
      _id: 0,
      staffId: "$_id",
      displayName: {
        $cond: [
          { $and: [{ $gt: [{ $size: "$staffInfo" }, 0] }, { $ne: ["$_id", "Unassigned"] }] },
          { $concat: [
              { $arrayElemAt: ["$staffInfo.fName", 0] }, " ",
              { $arrayElemAt: ["$staffInfo.lName", 0] }
          ]},
          "$_id" // use "Unassigned" if no staffInfo
        ]
      },
      totalDeclined: 1
    }
  }
]);

const overallDeclinedTotal = processByDeclineAggRaw.reduce((sum, s) => sum + s.totalDeclined, 0);

const processByDeclineAgg = processByDeclineAggRaw.map(s => ({
  ...s,
  percentage: overallDeclinedTotal
    ? ((s.totalDeclined / overallDeclinedTotal) * 100).toFixed(2) + "%"
    : "0%"
}));

processByDeclineAgg.sort((a, b) => b.totalDeclined - a.totalDeclined);


    // ================================
    // FINAL OBJECT
    // ================================
    res.locals.analytics = {
      filterUsed: filter,
      rangeStart: start ? start.format("YYYY-MM-DD") : null,
      rangeEnd: end ? end.format("YYYY-MM-DD") : null,

      totalRequests,
      approved, approvedPercent,
      declined, declinedPercent,
      pending, pendingPercent,
      onHold, onHoldPercent,
      onProcess, onProcessPercent,
      avgApprovalTime, avgApprovalTimeStat,
      avgReviewTime, avgReviewTimeStat,
      avgAssessTime, avgAssessTimeStat,

      activeUserCount,
      topUsers: topUsersAgg,
      totalUsers,
      toVerify, toVerifyUsers,
      roleStats,
      courseStats,
      yearLevelStats,

      topDocuments,
      topPurpose,
      purposeStats,
      docStatusStats,
      requestStatusStats,
      documentStats,

      trend: trendAgg,

      currentUsersCount, previousUsersCount, registrationGrowth,
      currentPeriodLabel,
      previousPeriodLabel,

      processByStats: processByAgg,
      overallTotalProcessed,

      processByVerifiedStats: processByVerifiedAgg,
      overallVerifiedTotal,

      processByDeclineStats: processByDeclineAgg,
      overallDeclinedTotal

    };

    next();
  } catch (err) {
    console.error("❌ Analytics Middleware Error:", err);
    res.locals.analytics = {};
    next();
  }
};
