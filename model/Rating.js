// models/Rating.js
const mongoose = require('mongoose');

const ratingSchema = new mongoose.Schema({
  rating: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now },
  ip: { type: String }
});

module.exports = mongoose.model('Rating', ratingSchema);
