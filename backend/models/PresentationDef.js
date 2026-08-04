const mongoose = require('mongoose');

const PresentationDefSchema = new mongoose.Schema({
  pres_def_id: { type: String, required: true, unique: true },
  name: { type: String },
  purpose: { type: String },
  pres_def: { type: Object, required: true },
  raw_record: { type: Object },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('PresentationDef', PresentationDefSchema);
