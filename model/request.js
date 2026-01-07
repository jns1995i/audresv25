const mongoose = require('mongoose');

const requestSchema = new mongoose.Schema({
  requestBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'user',
    required: true
  },
  processBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'user'
  },

  tr: { type: String, required: true, trim: true },

  items: [{ type: mongoose.Schema.Types.ObjectId, ref: 'item' }],
  type: { type: String, required: false, trim: true },
  purpose: { type: String, trim: true },
  qty: { type: Number, default: 1 },

  schoolYear: { type: String, trim: true },
  semester: { type: String, trim: true },

  proof: { type: String, trim: true },  // path or filename of proof
  status: { type: String, trim: true },
  payPhoto: [{ type: String, trim: true }],
  payMode: { type: String, trim: true },

  assignAt: { type: Date },
  reviewAt: { type: Date },
  approveAt: { type: Date },
  assessAt: { type: Date },
  payAt: { type: Date },
  verifyAt: { type: Date },
  turnAt: { type: Date },
  claimedAt: { type: Date },

  holdAt: { type: Date },
  declineAt: { type: Date },

  claimedBy: { type: String, trim: true }, // name of claimant
  releaseBy: { type: mongoose.Schema.Types.ObjectId, ref: 'user' },
  rating: { type: String, trim: true },

  remarks: { type: String, trim: true },
  notes: { type: String, trim: true },
  paper: { type: String, trim: true },

  archive: { type: Boolean, default: false },
  verify: { type: Boolean, default: true }
}, {
  timestamps: true // adds createdAt & updatedAt automatically
});

module.exports = mongoose.model('request', requestSchema);
