const Document = require('../model/document');

module.exports = async (req, res, next) => {
  try {
    // ✅ Predefined complete list of documents
    const documentsData = [
      // Regular documents
      { type: "Transcript of Record", amount: 350 },
      { type: "Diploma", amount: 800 },
      { type: "Form 137", amount: 200 },
      { type: "Form 138", amount: 150 },
      { type: "Authentication", amount: 80 },

      // CAV
      { type: "CAV (Graduate)", amount: 240 },
      { type: "CAV (Nursing Graduate with RLE)", amount: 320 },
      { type: "CAV (Under Graduate)", amount: 160 },
      { type: "CAV (SHS)", amount: 160 },
      { type: "CAV (SHS Graduate)", amount: 320 },
      { type: "CAV (HS)", amount: 160 },

      // Certificates
      { type: "Certificate of Grades", amount: 150 },
      { type: "Certificate of Enrollment", amount: 150 },
      { type: "Certificate of Graduation", amount: 150 },
      { type: "Units Earned", amount: 150 },
      { type: "Subject Description", amount: 50 },
      { type: "GWA", amount: 150 },
      { type: "Good Moral", amount: 500 },
      { type: "CAR", amount: 150 },
      { type: "No Objection", amount: 500 },
      { type: "Honorable Dismissal", amount: 500 },
      { type: "NTSP Serial Number", amount: 150 },
      { type: "English Proficiency", amount: 150 },
    ];

    // ✅ Get all existing document types
    const types = documentsData.map(d => d.type);
    const existingDocs = await Document.find({ type: { $in: types } }, 'type');
    const existingTypes = existingDocs.map(doc => doc.type);

    // ✅ Filter missing documents
    const missingDocs = documentsData
      .filter(d => !existingTypes.includes(d.type))
      .map(d => ({
        ...d,
        days: ["Transcript of Record", "Diploma", "Form 137"].includes(d.type) ? "20" : "10"
      }));

    // ✅ Add missing documents if any
    if (missingDocs.length > 0) {
      await Document.insertMany(missingDocs);
      console.log(`📄 Added ${missingDocs.length} missing document(s): ${missingDocs.map(d => d.type).join(', ')}`);
    }

    // ✅ Fetch all documents again (now complete)
    const documentsList = await Document.find({}, 'type amount days').sort({ type: 1 });

    // Make documents available globally in EJS and req
    req.documents = documentsList;
    res.locals.documents = documentsList;

    console.log(`📄 Documents loaded: ${documentsList.length} types available`);

    next();
  } catch (err) {
    console.error('⚠️ Error in isDocuments middleware:', err);
    req.documents = [];
    res.locals.documents = [];
    next();
  }
};
