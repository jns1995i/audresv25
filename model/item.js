const mongoose = require('mongoose');

const requestSchema = new mongoose.Schema({
  tr: { type: String, required: true, trim: true },
  type: { type: String, required: true, trim: true },
  purpose: { type: String, trim: true },
  qty: { type: Number, default: 1 },

  schoolYear: { type: String, trim: true },
  semester: { type: String, trim: true },

  proof: { type: String, trim: true },
  status: { type: String, trim: true },

  approveAt: { type: Date },

  holdAt: { type: Date },
  declineAt: { type: Date },

  remarks: { type: String, trim: true },
  notes: { type: String, trim: true },

  archive: { type: Boolean, default: false },
  verify: { type: Boolean, default: true }
}, {
  timestamps: true // adds createdAt & updatedAt automatically
});

module.exports = mongoose.model('item', requestSchema);
