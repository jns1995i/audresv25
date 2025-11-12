const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema({
  type: {
    type: String,
    required: true,
    trim: true
  },
  amount: {
    type: Number,
    required: true,
    default: 0
  },
  days: {
    type: String,
    required: true,
    trim: true
  },
  archive: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('document', documentSchema);
