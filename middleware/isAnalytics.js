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
      ? { createdAt: { $gte: start.toDate(), $lte: end.toDate() } }
      : {};

    // ================================
    // REQUEST COUNTS
    // ================================
    const allRequests = await requests.find(dateFilter);
    const totalRequests = allRequests.length;
    const approved = allRequests.filter(r => r.status === "Approved").length;
    const pending = allRequests.filter(r => r.status === "Pending").length;
    const declined = allRequests.filter(r => r.declineAt).length;
    const onHold = allRequests.filter(r => r.holdAt).length;

    const requestStatusStats = await requests.aggregate([
      { $match: dateFilter },
      { 
        $group: { 
          _id: "$status", 
          count: { $sum: 1 } 
        } 
      },
      { $sort: { _id: 1 } } // optional, sort alphabetically
    ]);

    // ================================
    // ACTIVE USERS
    // ================================
    const uniqueUsers = [...new Set(allRequests.map(r => r.requestBy.toString()))];
    const activeUserCount = uniqueUsers.length;

    // ================================
    // TOP USERS
    // ================================
    const topUsersAgg = await requests.aggregate([
      { $match: dateFilter },
      { $group: { _id: "$requestBy", totalRequests: { $sum: 1 } } },
      { $sort: { totalRequests: -1 } },
      { $limit: 5 },
      { $lookup: { from: "users", localField: "_id", foreignField: "_id", as: "userInfo" } },
      { $unwind: "$userInfo" },
      { $project: { _id: 1, totalRequests: 1, userInfo: { fName: 1, lName: 1, role: 1 } } }
    ]);

    // ================================
    // ROLE, COURSE, YEAR LEVEL STATS
    // ================================
    const [roleStats, courseStats, yearLevelStats] = await Promise.all([
      requests.aggregate([
        { $match: dateFilter },
        { $lookup: { from: "users", localField: "requestBy", foreignField: "_id", as: "userInfo" } },
        { $unwind: "$userInfo" },
        { $group: { _id: "$userInfo.role", count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      requests.aggregate([
        { $match: dateFilter },
        { $lookup: { from: "users", localField: "requestBy", foreignField: "_id", as: "userInfo" } },
        { $unwind: "$userInfo" },
        { $group: { _id: "$userInfo.course", count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      requests.aggregate([
        { $match: dateFilter },
        { $lookup: { from: "users", localField: "requestBy", foreignField: "_id", as: "userInfo" } },
        { $unwind: "$userInfo" },
        { $group: { _id: "$userInfo.yearLevel", count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ])
    ]);

    // ================================
    // DOCUMENT ANALYTICS
    // ================================
    const requestTRs = allRequests.map(r => r.tr);
    const [topDocuments, purposeStats, docStatusStats] = await Promise.all([
      items.aggregate([
        { $match: { tr: { $in: requestTRs } } },
        { $group: { _id: "$type", totalQty: { $sum: "$qty" }, totalRequests: { $sum: 1 } } },
        { $sort: { totalQty: -1 } },
        { $limit: 10 }
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
          if (hoursDecimal < 1/60) return "Quick";      // Less than a minute
          if (hoursDecimal < 0.5) return "Fast";       // Less than 30 mins
          if (hoursDecimal < 1) return "Moderate";     // Less than 1 hour
          if (hoursDecimal < 3) return "Standard";     // Less than 3 hours
          if (hoursDecimal < 24) return "Slow";        // Less than 1 day
          if (hoursDecimal < 72) return "Warning";     // Less than 3 days
          return "Critical";                            // 3 days or more
      }


      const avgReviewTime = formatDuration(avgReviewDecimal);
      const avgReviewTimeStat = getTimeStat2(avgReviewDecimal);



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

    // ================================
    // FINAL OBJECT
    // ================================
    res.locals.analytics = {
      filterUsed: filter,
      rangeStart: start ? start.format("YYYY-MM-DD") : null,
      rangeEnd: end ? end.format("YYYY-MM-DD") : null,

      totalRequests,
      approved,
      declined,
      pending,
      onHold,
      avgApprovalTime, avgApprovalTimeStat,
      avgReviewTime, avgReviewTimeStat,

      activeUserCount,
      topUsers: topUsersAgg,
      roleStats,
      courseStats,
      yearLevelStats,

      topDocuments,
      purposeStats,
      docStatusStats,
      requestStatusStats,

      trend: trendAgg
    };

    next();
  } catch (err) {
    console.error("❌ Analytics Middleware Error:", err);
    res.locals.analytics = {};
    next();
  }
};
