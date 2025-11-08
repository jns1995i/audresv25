const Ratings = require('../model/Rating');

module.exports = async (req, res, next) => {
  try {
    // ✅ Fetch all ratings or aggregate summary
    const ratingsSummary = await Ratings.aggregate([
      {
        $group: {
          _id: null,
          averageRating: { $avg: "$rating" },
          totalRatings: { $sum: 1 }
        }
      }
    ]);

    const summary = ratingsSummary[0] || { averageRating: 0, totalRatings: 0 };

    // ✅ Make ratings available globally in EJS & req
    req.ratings = summary;
    res.locals.ratings = summary;

    console.log(`⭐ Ratings loaded: avg=${summary.averageRating.toFixed(1)}, total=${summary.totalRatings}`);

    next();
  } catch (err) {
    console.error('⚠️ Error in isRatings middleware:', err);
    // Default values if ratings cannot be loaded
    req.ratings = { averageRating: 0, totalRatings: 0 };
    res.locals.ratings = { averageRating: 0, totalRatings: 0 };
    next();
  }
};
