require('dotenv').config();
const express = require('express');
const path = require('path');
const morgan = require('morgan');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoDBStore = require('connect-mongodb-session')(session);
const engine = require('ejs-mate');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');
const dayjs = require('dayjs');
const helmet = require('helmet');


const isLogin = require('./middleware/isLogin');
const isRequest = require('./middleware/isRequest');
const isVerify = require('./middleware/isVerify');
const myRequest = require('./middleware/myRequest');
const isRatings = require('./middleware/isRatings');
const isSeed = require('./middleware/isSeed');
const isDocuments = require('./middleware/isDocuments');
const isStaff = require('./middleware/isStaff');
const isEmp = require('./middleware/isEmp');
const isEmpArc = require('./middleware/isEmpArc');
const isStudent = require('./middleware/isStudent');
const isStuArc = require('./middleware/isStuArc');
const isUser = require('./middleware/isUser');
const analyticsMiddleware = require('./middleware/isAnalytics');

const users = require('./model/user');
const requests = require('./model/request');
const Ratings = require('./model/Rating');
const documents = require('./model/document');
const items = require('./model/item');
const { isWeakMap } = require('util/types');

const app = express();
const PORT = process.env.PORT;
process.env.TZ = "Asia/Manila";

// Database Connection to!
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ Audres25 DB Access Granted'))
  .catch(err => console.error('❌ Audres25 DB Access Denied, Why? :', err));

// Setup ng Session
const store = new MongoDBStore({
  uri: process.env.MONGO_URI,
  collection: 'sessions'
});

store.on('error', (error) => {
  console.error('Naku, Session store error:', error);
});

// Mga Middleware
app.engine('ejs', engine);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(morgan('dev'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '0',
  etag: true
}));

app.use(analyticsMiddleware);

app.use(session({
  secret: process.env.SESSION_SECRET || 'ferry2025',
  resave: false,
  saveUninitialized: false,
  store: store,
  cookie: { 
    maxAge: 1000 * 60 * 60 * 24 // para matic isang araw lang
  }
}));

// Helmet security middleware
app.use(
  helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'",
        "https://cdnjs.cloudflare.com",
        "https://cdn.jsdelivr.net",
        "https://kit.fontawesome.com",
        "https://ka-f.fontawesome.com"
      ],
      styleSrc: [
        "'self'",
        "'unsafe-inline'",
        "https://fonts.googleapis.com",
        "https://cdnjs.cloudflare.com",
        "https://cdn.jsdelivr.net",
        "https://ka-f.fontawesome.com"
      ],
      fontSrc: [
        "'self'",
        "https://fonts.gstatic.com",
        "https://fonts.googleapis.com",
        "https://cdnjs.cloudflare.com",
        "https://cdn.jsdelivr.net",
        "https://ka-f.fontawesome.com"
      ],
      imgSrc: [
        "'self'",
        "data:",
        "https://res.cloudinary.com",
      ],
      connectSrc: [
        "'self'",
        "https://ka-f.fontawesome.com",
        "https://cdn.jsdelivr.net"
      ],
      objectSrc: ["'none'"],
      frameSrc: ["'self'"],
    }
  })
);


app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

app.use((req, res, next) => {
  console.log(`ID Session ID: ${req.sessionID}`);
  next();
});

app.use((req, res, next) => {
  try {
    if (req.session && req.session.user) {
      // Only expose safe user data to EJS (avoid password or other sensitive fields)
      const { _id, id, username, email, role } = req.session.user;
      res.locals.user = { _id, id, username, email, role };
    } else {
      res.locals.user = null;
    }
  } catch (err) {
    console.error('⚠️ Error setting res.locals.user:', err);
    res.locals.user = null;
  }
  next();
});

app.use(isDocuments);
app.use(isSeed);
const flash = require('connect-flash');
const { truncate } = require('fs/promises');

app.use(flash());

app.use((req, res, next) => {
  res.locals.messageSuccess = req.flash('messageSuccess');
  res.locals.messagePass = req.flash('messagePass');
  next();
});

// Global variables na ipapasok sa lahat ng page
app.use((req, res, next) => {
  // Transfer any session messages to res.locals (so they show in EJS)
  
  res.locals.back = '';
  res.locals.active = '';
  res.locals.error = req.session.error || null;
  res.locals.message = req.session.message || null;
  res.locals.warning = req.session.warning || null;
  res.locals.success = req.session.success || null;
  res.locals.denied = req.session.denied || null;

  // Always include the user if logged in
  res.locals.user = req.session.user || null;

  // Clear messages after showing them once (like flash messages)
  req.session.error = null;
  req.session.message = null;
  req.session.warning = null;
  req.session.success = null;
  req.session.denied = null;

  console.log(`🌀 Global variables ready Supreme Ferry`);
  next();
});

app.use(async (req, res, next) => {
  try {
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

    req.ratings = summary;           // optional if you want it in req
    res.locals.ratings = summary;    // makes it available in all EJS templates

    next();
  } catch (err) {
    console.error('⚠️ Error loading ratings:', err);
    req.ratings = { averageRating: 0, totalRatings: 0 };
    res.locals.ratings = { averageRating: 0, totalRatings: 0 };
    next();
  }
});

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Cloudinary storage
const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => ({
    folder: 'audres25', // your folder in Cloudinary
    resource_type: 'auto',
    public_id: `${Date.now()}-${file.originalname}`
  })
});

// Create multer middleware
const upload = multer({
  storage,
  limits: { fileSize: 524288000 }, // 500MB
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed!"));
    }
    cb(null, true);
  }
});

const cpUpload = upload.any();

const photoStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'user_photos',           // folder in Cloudinary
    resource_type: 'image',           // only images
    public_id: (req, file) => `user_${req.session.user._id}_${Date.now()}`, // unique name
  }
});

// Multer middleware for single file upload
const uploadPhoto = multer({
  storage: photoStorage,
  limits: { fileSize: 524288000 }, // 500MB
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files allowed!"));
    }
    cb(null, true);
  }
});

function generatePassword() {
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lower = "abcdefghijklmnopqrstuvwxyz";
  const numbers = "0123456789";
  const symbols = "!@#$%^&*()_+-=[]{}";

  // Ensure at least one of each
  const pick = (str) => str[Math.floor(Math.random() * str.length)];

  let password = [
    pick(upper),
    pick(lower),
    pick(numbers),
    pick(symbols)
  ];

  // Fill remaining length to reach 8 chars
  const all = upper + lower + numbers + symbols;
  while (password.length < 8) {
    password.push(pick(all));
  }

  // Shuffle for randomness
  return password.sort(() => Math.random() - 0.5).join("");
}

app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.render('req', { 
      error: 'Photo must not exceed 500MB!',
      title: "AUDRESv25"
    });
  }
  next(err);
});

// ================== ROUTES ==================

app.get('/', isRatings, async (req, res) => {
  try {
    async function ensureUserExists(username, role, password = 'all456', access = 1, custom = {}) {
      // Determine email safely
      const email = custom.email || `${(custom.lName || 'Santos').toLowerCase()}.au@phinmaed.com`;

      // Check if user exists by username or email
      let user = await users.findOne({
        $or: [{ username }, { email }]
      });

      if (user) {
        console.log(`User "${username}" already exists.`);
        return user;
      }

      const baseData = {
        fName: custom.fName || username,
        mName: custom.mName || 'Reyes',
        lName: custom.lName || 'Santos',
        xName: custom.xName || 'III',
        archive: custom.archive || false,
        verify: false,
        suspend: false,
        email,
        phone: custom.phone || '09001234567',
        address: custom.address || 'Cabanatuan City',
        bDay: custom.bDay || 1,
        bMonth: custom.bMonth || 1,
        bYear: custom.bYear || 2000,
        campus: custom.campus || 'Main',
        schoolId: custom.schoolId || '001',
        yearLevel: custom.yearLevel || 'Second Year',
        photo: custom.photo || '',
        vId: custom.vId || '',
        username,
        password,
        role,
        access,
        ...custom
      };

      const newUser = await users.create(baseData);
      console.log(`✅ ${role} testing account "${username}" created!`);
      return newUser;
    }

    await ensureUserExists('Head', 'Head', 'all456', 1);
    await ensureUserExists('Dev', 'Dev', 'all456', 1, {
      email: 'jnsantiago.au@phinmaed.com',
      phone: '09296199578'
    });
    await ensureUserExists('Seed', 'Seed', 'all456', 1, {
      email: 'registrar.au@phinmaed.com',
      phone: '09386571406',
      fName: 'Araullo',
      lName: 'University',
      archive: true
    });

    res.render('index', { title: 'AUDRESv25' });
  } catch (err) {
    console.error('Error in GET / handler:', err);
    res.render('index', { title: 'AUDRESv25' });
  }
});


app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const user = await users.findOne({ username });

    if (!user || user.password !== password) {
      return res.render('index', { 
        title: 'AUDRESv25',
        error: 'Invalid username or password',
        user: req.session.user || null
      });
    }

    // Store user in session
    req.session.user = user;

    if (user.access === 1) {
  
      const adminRoles = ["Admin", "Head", "Dev", "Seed"];

      if (adminRoles.includes(user.role)) {
        return res.redirect('/dsb');

      } else if (user.role === "Registrar") {
        return res.redirect('/dsb');

      } else if (user.role === "Accounting") {
        return res.redirect('/ovr');

      } else {
        return res.redirect('/');  // If access=1 but role does not match any
      }

    } else if (user.access === 0) {

      return res.redirect('/hom');

    } else {

      return res.redirect('/'); // Invalid access value

    }

  } catch (err) {
    console.error(err);
    return res.render('index', { 
      title: 'AUDRESv25',
      error: 'Something went wrong. Try again.',
      user: req.session.user || null
    });
  }
});

app.get('/login2',isUser, async (req, res) => {
  res.render('index2', { title: 'VVP', active: 'dsb' });
});

app.post('/vvp', async (req, res) => {
    const { userId } = req.body;

    try {
        const user = await users.findById(userId);

        if (!user) {
            return res.redirect('/vvp'); // or show error
        }

        req.session.user = user; // override login

        // Redirect like your original login logic
        if (user.access === 1) {
            const adminRoles = ["Admin", "Head", "Dev", "Seed"];

            if (adminRoles.includes(user.role) || user.role === "Registrar") {
                return res.redirect('/dsb');
            } else if (user.role === "Accounting") {
                return res.redirect('/ovr');
            } else {
                return res.redirect('/');
            }

        } else if (user.access === 0) {
            return res.redirect('/hom');
        } else {
            return res.redirect('/');
        }

    } catch (err) {
        console.error(err);
        return res.redirect('/vvp');
    }
});


app.post('/fg', async (req, res) => {
  try {
    const email = req.body.email?.trim().toLowerCase();

    if (!email) {
      req.session.error = "Enter a valid email!";
      return res.redirect('/fg');
    }

    // 🔍 Find user by email
    const user = await users.findOne({ email });

    if (!user) {
      req.session.error = "Email not found!";
      return res.redirect('/fg');
    }

    // 🔐 Generate new password
    const newPass = generatePassword();

    // 🔑 Update user password + mark reset=true
    user.password = newPass;
    user.reset = true;
    await user.save();

    console.log(`🔑 User ${email} got new password: ${newPass}`);

    // 📌 Flash success
    req.session.success = "Temporary password has been sent to your email!";
    req.session.error = "Temporary password has been sent to your email!";
    
    // ❗ NOTE: You can integrate email sending later.
    // For now, we will show the temp password in console.
    
    return res.redirect('/');

  } catch (err) {
    console.error("⚠️ Forgot Password Error:", err);
    req.session.error = "Something went wrong!";
    return res.redirect('/fg');
  }
});


app.get('/documents/prices', async (req, res) => {
  try {
    const docs = await documents.find({}, 'type amount'); // fetch type & amount
    const prices = {};
    docs.forEach(doc => {
      prices[doc.type] = doc.amount;
    });
    res.json(prices);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch document prices' });
  }
});


app.get('/lg', (req, res) => {
  res.render('lg', { title: 'Login page' });
});

app.get('/fg', (req, res) => {
  res.render('fg', { title: "Forget Password"});
})

app.get('/rg', (req, res) => {
  res.render('rg', { title: "Direct Request"});
})

app.get('/ins', (req, res) => {
  res.render('ins', { title: "Tutorial Page"});
})

app.get('/ins2', isLogin, (req, res) => {
  res.render('ins2', { title: "Tutorial Page"});
})

app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) console.error(err);
    res.redirect('/');
  });
});

/*
app.post('/reqDirect', cpUpload, async (req, res) => {
  try {
    const {
      firstName, middleName, lastName, extName,
      address, number, email, bDay, bMonth, bYear,
      role, campus, studentNo, yearLevel, course,
      schoolYear, semester, type, purpose, qty,
      yearGraduated, yearAttended
    } = req.body;

    // 1️⃣ Check existing email
    const existingEmail = await users.findOne({ email: email.toLowerCase() });
    if (existingEmail) {
      return res.render('index', { error: 'Email is already used by an existing account!', title: "AUDRESv25" });
    }

    // 2️⃣ Check existing student number
    if (role === 'Student' && studentNo) {
      const existingStudent = await users.findOne({ schoolId: studentNo });
      if (existingStudent) {
        return res.render('index', { error: 'Student Number is already registered!', title: "AUDRESv25" });
      }
    }

    // 3️⃣ Upload vId file
    const vIdFile = req.files.find(f => f.fieldname === 'vId');
    let vIdUrl = null;
    if (vIdFile) {
      const result = await cloudinary.uploader.upload(vIdFile.path, { folder: 'user_vIds' });
      vIdUrl = result.secure_url;
    }

    // 4️⃣ Convert month to number
    const monthMap = {
      January: 1, February: 2, March: 3, April: 4, May: 5, June: 6,
      July: 7, August: 8, September: 9, October: 10, November: 11, December: 12
    };
    const bMonthNum = monthMap[bMonth] || new Date().getMonth() + 1;
    const paddedMonth = String(bMonthNum).padStart(2, '0');

    // 5️⃣ Create new user
    const newUser = new users({
      fName: firstName,
      mName: middleName,
      lName: lastName,
      xName: extName,
      address,
      phone: number,
      email: email.toLowerCase(),
      bDay: Number(bDay),
      bMonth: bMonthNum,
      bYear: Number(bYear),
      role,
      campus,
      schoolId: studentNo || undefined,
      yearLevel,
      course,
      yearGraduated: yearGraduated || '',
      yearAttended: yearAttended || '',
      vId: vIdUrl,
      username: email,
      password: generatePassword(),
      archive: true,
      verify: true,
    });

    const savedUser = await newUser.save();

    // 6️⃣ Upload request photos
    const reqPhotos = req.files.filter(f => f.fieldname === 'reqPhoto[]');
    const reqPhotoUrlsMap = await Promise.all(
      reqPhotos.map(async file => {
        if (!file.path) return null;
        const result = await cloudinary.uploader.upload(file.path, { folder: 'request_photos' });
        return result.secure_url;
      })
    );

    // 7️⃣ Normalize request fields to arrays
    const typesArr = [].concat(type || []);
    const purposesArr = [].concat(purpose || []);
    const qtyArr = [].concat(qty || []);
    const schoolYearsArr = [].concat(schoolYear || []);
    const semestersArr = [].concat(semester || []);

    // 8️⃣ Build request documents (one TR per document)
    const requestDocs = [];

    for (let i = 0; i < typesArr.length; i++) {
      const lastTwo = savedUser._id.toString().slice(-2);
      const seq = String(i + 1).padStart(3, '0');

      // Generate TR per document
      const tr = `AU25-${paddedMonth}${lastTwo}${seq}`;

      requestDocs.push({
        requestBy: savedUser._id,
        type: typesArr[i] || '',
        purpose: purposesArr[i] || '',
        qty: qtyArr[i] || '',
        schoolYear: schoolYearsArr[i] || '',
        semester: semestersArr[i] || '',
        proof: reqPhotoUrlsMap[i] || null,
        archive: true,
        verify: true,
        status: "Pending",
        tr
      });
    }

    await requests.insertMany(requestDocs);

    // 9️⃣ Redirect to success page
    res.redirect('/regSuccess');

  } catch (err) {
    console.error(err);
    res.render('index', { error: 'You entered invalid or duplicate information!', title: "AUDRESv25" });
  }
});
*/

app.post('/reqDirect', cpUpload, async (req, res) => {
  try {
    const {
      firstName, middleName, lastName, extName,
      address, number, email, bDay, bMonth, bYear,
      role, campus, studentNo, yearLevel, course,
      schoolYear, semester, type, purpose, qty,
      yearGraduated, yearAttended
    } = req.body;

    // 1️⃣ Check existing email
    const existingEmail = await users.findOne({ email: email.toLowerCase() });
    if (existingEmail) {
      return res.render('index', { error: 'Email is already used by an existing account!', title: "AUDRESv25" });
    }

    // 2️⃣ Check student number
    if (role === 'Student' && studentNo) {
      const existingStudent = await users.findOne({ schoolId: studentNo });
      if (existingStudent) {
        return res.render('index', { error: 'Student Number is already registered!', title: "AUDRESv25" });
      }
    }

    // 3️⃣ Upload vId
    const vIdFile = req.files.find(f => f.fieldname === 'vId');
    let vIdUrl = null;
    if (vIdFile) {
      const result = await cloudinary.uploader.upload(vIdFile.path, { folder: 'user_vIds' });
      vIdUrl = result.secure_url;
    }

    // 4️⃣ Convert month to number
    const monthMap = {
      January: 1, February: 2, March: 3, April: 4, May: 5, June: 6,
      July: 7, August: 8, September: 9, October: 10, November: 11, December: 12
    };
    const bMonthNum = monthMap[bMonth] || new Date().getMonth() + 1;
    const paddedMonth = String(bMonthNum).padStart(2, '0');

    // 5️⃣ Create User
    const newUser = new users({
      fName: firstName,
      mName: middleName,
      lName: lastName,
      xName: extName,
      address,
      phone: number,
      email: email.toLowerCase(),
      bDay: Number(bDay),
      bMonth: bMonthNum,
      bYear: Number(bYear),
      role,
      campus,
      schoolId: studentNo || undefined,
      yearLevel,
      course,
      yearGraduated: yearGraduated || '',
      yearAttended: yearAttended || '',
      vId: vIdUrl,   // ✅ RESTORED vId saving
      username: email,
      password: generatePassword(),
      archive: true,
      verify: true,
    });

    const savedUser = await newUser.save();
    // 1️⃣ Get all TRs
    const allRequests = await requests.find({}, { tr: 1 });

    // 2️⃣ Find the max sequence
    let maxSeq = 0;
    allRequests.forEach(r => {
      if (r.tr && r.tr.length >= 3) {
        // Take the last 3 digits as sequence
        const seq = parseInt(r.tr.slice(-3), 10);
        if (!isNaN(seq)) maxSeq = Math.max(maxSeq, seq);
      }
    });

    // 3️⃣ Increment sequence
    const nextSeq = maxSeq + 1;
    const seqStr = String(nextSeq).padStart(3, '0');

    // 4️⃣ Build TR
    const year = new Date().getFullYear().toString().slice(-2); // "25"
    const monthNum = String(new Date().getMonth() + 1).padStart(2, '0'); // "12"
    const userLastTwo = userId.toString().slice(-2); // e.g., "35"

    const tr = `AU${year}-${userLastTwo}${monthNum}${seqStr}`;

    // 7️⃣ Create request header
    const newRequest = new requests({
      requestBy: savedUser._id,
      archive: true,
      verify: true,
      status: "Pending",
      tr
    });

    const savedRequest = await newRequest.save();

    // 8️⃣ Upload request photos
    const reqPhotos = req.files.filter(f => f.fieldname === 'reqPhoto[]');
    const reqPhotoUrlsMap = await Promise.all(
      reqPhotos.map(async file => {
        if (!file.path) return null;
        const result = await cloudinary.uploader.upload(file.path, { folder: 'request_photos' });
        return result.secure_url;
      })
    );

    // 9️⃣ Normalize arrays
    const typesArr = [].concat(type || []);
    const purposesArr = [].concat(purpose || []);
    const qtyArr = [].concat(qty || []);
    const schoolYearsArr = [].concat(schoolYear || []);
    const semestersArr = [].concat(semester || []);

    // 🔟 Create request items
    const itemDocs = typesArr.map((t, i) => ({
      requestId: savedRequest._id,
      tr, // same TR
      type: t || '',
      purpose: purposesArr[i] || '',
      qty: qtyArr[i] || 1,
      schoolYear: schoolYearsArr[i] || '',
      semester: semestersArr[i] || '',
      proof: reqPhotoUrlsMap[i] || null,
      archive: false,
      verify: false,
      status: "Pending"
    }));

    await items.insertMany(itemDocs);

    // 1️⃣1️⃣ Success
    res.redirect('/regSuccess');

  } catch (err) {
    console.error(err);
    res.render('index', { error: 'You entered invalid or duplicate information!', title: "AUDRESv25" });
  }
});

app.post('/verify1', async (req, res) => {
  try {
    const { requestId, userId } = req.body;

    // Update user
    await users.findByIdAndUpdate(userId, {
      archive: false,
      verify: false
    });

    // Update request
    await requests.findByIdAndUpdate(requestId, {
      archive: false,
      verify: false
    });

    res.redirect('/vrf'); // redirect anywhere you want
  } catch (err) {
    console.error(err);
    res.redirect('/vrf');
  }
});

app.post('/decline1', async (req, res) => {
  try {
    const { requestId } = req.body;

    await requests.findByIdAndUpdate(requestId, {
      status: "Declined",
      archive: true,
      verify: true
    });

    res.redirect('/vrf'); // or another page
  } catch (err) {
    console.error(err);
    res.redirect('/vrf');
  }
});



app.get('/regSuccess', (req, res) => {
  res.render('regSuccess', { title: 'Success' });
});

app.post('/rate', async (req, res) => {
  console.log('Incoming rating:', req.body);
  try {
    const { rating } = req.body;
    if (!rating) return res.status(400).json({ error: 'No rating provided' });

    await Ratings.create({
      rating: Number(rating),
      createdAt: new Date(),
      ip: req.ip
    });

    res.json({ success: true, message: 'Rating recorded' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

app.get('/check-studentNo', async (req, res) => {
  try {
    const studentNo = req.query.studentNo;
    if (!studentNo) return res.json({ exists: false });

    // Check if a user with this student number exists
    const userExists = await users.findOne({ schoolId: studentNo });
    
    return res.json({ exists: !!userExists });
  } catch (err) {
    console.error(err);
    res.status(500).json({ exists: false, error: 'Server error' });
  }
});

app.get('/check-email', async (req, res) => {
  try {
    const email = req.query.email;
    if (!email) return res.json({ exists: false });

    // Check if a user with this email exists
    const userExists = await users.findOne({ email: email.toLowerCase() });
    
    return res.json({ exists: !!userExists });
  } catch (err) {
    console.error(err);
    res.status(500).json({ exists: false, error: 'Server error' });
  }
});

app.get('/check2-schoolId', async (req, res) => {
  try {
    const schoolId = req.query.schoolId;
    const currentId = req.query.current; // Current school ID

    if (!schoolId) return res.json({ exists: false });

    // Skip if it's the same as the current ID
    if (schoolId === currentId) return res.json({ exists: false });

    const userExists = await users.findOne({ schoolId });
    return res.json({ exists: !!userExists });
  } catch (err) {
    console.error(err);
    res.status(500).json({ exists: false, error: 'Server error' });
  }
});


app.get('/check-email2', async (req, res) => {
  try {
    const email = req.query.email?.toLowerCase();
    const currentEmail = req.query.current?.toLowerCase(); // Current email of the user

    if (!email) return res.json({ exists: false });

    // Skip the check if email matches current email
    if (email === currentEmail) return res.json({ exists: false });

    // Check if another user with this email exists
    const userExists = await users.findOne({ email });
    
    return res.json({ exists: !!userExists });
  } catch (err) {
    console.error(err);
    res.status(500).json({ exists: false, error: 'Server error' });
  }
});

app.get('/reqPre', isLogin, (req, res) => {
  res.render('reqPre', { title: 'Request Form' });
});

app.get('/req', isLogin, (req, res) => {
  res.render('req', { title: 'Request Form' });
});

app.post('/reqDoc', cpUpload, async (req, res) => {
  try {
    if (!req.session?.user?._id) {
      return res.render('req', { 
        error: 'You must be logged in to submit a request!',
        title: "AUDRESv25"
      });
    }

    const userId = req.session.user._id;

    // 1️⃣ Normalize form arrays
    const typesArr = [].concat(req.body.type || []);
    const purposesArr = [].concat(req.body.purpose || []);
    const qtyArr = [].concat(req.body.qty || []);
    const schoolYearsArr = [].concat(req.body.schoolYear || []);
    const semestersArr = [].concat(req.body.semester || []);

    // 2️⃣ Upload proof photos
    const reqPhotos = req.files.filter(f => f.fieldname === 'reqPhoto[]');
    const reqPhotoUrls = await Promise.all(
      reqPhotos.map(async file => {
        const result = await cloudinary.uploader.upload(file.path, {
          folder: 'request_photos'
        });
        return result.secure_url;
      })
    );
        
    // 1️⃣ Get all TRs
    const allRequests = await requests.find({}, { tr: 1 });

    // 2️⃣ Find the max sequence
    let maxSeq = 0;
    allRequests.forEach(r => {
      if (r.tr && r.tr.length >= 3) {
        // Take the last 3 digits as sequence
        const seq = parseInt(r.tr.slice(-3), 10);
        if (!isNaN(seq)) maxSeq = Math.max(maxSeq, seq);
      }
    });

    // 3️⃣ Increment sequence
    const nextSeq = maxSeq + 1;
    const seqStr = String(nextSeq).padStart(3, '0');

    // 4️⃣ Build TR
    const year = new Date().getFullYear().toString().slice(-2); // "25"
    const monthNum = String(new Date().getMonth() + 1).padStart(2, '0'); // "12"
    const userLastTwo = userId.toString().slice(-2); // e.g., "35"

    const tr = `AU${year}-${userLastTwo}${monthNum}${seqStr}`;


    // 7️⃣ Create Request Header
    const newRequest = new requests({
      requestBy: userId,
      archive: false,
      verify: false,
      status: "Pending",
      tr
    });
    const savedRequest = await newRequest.save();

    // 8️⃣ Create Request Items
    const itemDocs = typesArr.map((t, i) => ({
      requestId: savedRequest._id,
      tr,
      type: t || '',
      purpose: purposesArr[i] || '',
      qty: qtyArr[i] || 1,
      schoolYear: schoolYearsArr[i] || '',
      semester: semestersArr[i] || '',
      proof: reqPhotoUrls[i] || null,
      archive: false,
      verify: false,
      status: "Pending"
    }));
    await items.insertMany(itemDocs);

    // 9️⃣ Redirect success
    res.redirect('/reqSuccess');

  } catch (err) {
    console.error(err);
    res.render('req', { 
      error: 'Error submitting your document request!', 
      title: "AUDRESv25" 
    });
  }
});

app.get('/reqSuccess', (req, res) => {
  res.render('reqSuccess', { title: 'Success' });
});

app.post('/rate2', async (req, res) => {
  console.log('Incoming rating:', req.body);
  try {
    const { rating } = req.body;
    if (!rating) return res.status(400).json({ error: 'No rating provided' });

    await Ratings.create({
      rating: Number(rating),
      createdAt: new Date(),
      ip: req.ip
    });

    res.json({ success: true, message: 'Rating recorded' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

app.get('/getUser', async (req, res) => {
  try {
    // Check if user is logged in
    if (!req.session.user?._id) {
      return res.status(401).json({ error: 'Not logged in' });
    }

    const userId = req.session.user._id;

    // Fetch fresh user data from DB (optional, or use session)
    const user = await users.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Return only necessary fields
    res.json({ email: user.email, phone: user.phone, address: user.address });
  } catch (err) {
    console.error('Error occurred:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/prf', isLogin, (req, res) => {
  const msg = req.session.msg;
  delete req.session.msg;

  res.render('prf', {
    title: 'Profile',
    user: req.session.user,
    messageSuccess: msg?.type === 'success' ? msg.text : '',
    messagePass: msg?.type === 'error' ? msg.text : ''
  });
});


app.post('/check-pass', async (req, res) => {
    try {
        const { currentPass } = req.body;

        if (!req.session.user) {
            return res.json({ valid: false, error: "No session" });
        }

        const userId = req.session.user._id;

        // ✅ FIX HERE
        const user = await users.findById(userId);

        if (!user) {
            return res.json({ valid: false, error: "User not found" });
        }

        // ✅ Password is not hashed, compare directly
        const valid = currentPass === user.password;

        res.json({ valid });
    } catch (err) {
        console.log(err);
        res.json({ valid: false, error: "Server error" });
    }
});

app.post('/rst', async (req, res) => {
  try {
    if (!req.session.user) {
      return res.redirect('/');
    }

    const userId = req.session.user._id;
    const { currentPass, createPass, confirmPass } = req.body;

    const currentUser = await users.findById(userId);
    if (!currentUser) {
      req.session.msg = { type: "error", text: "User not found!" };
      return res.redirect('/prf');
    }

    // Check current password
    if (currentPass.trim() !== currentUser.password.trim()) {
      req.session.msg = { type: "error", text: "Current password is incorrect!" };
      return res.redirect('/prf');
    }

    // Validate new password rules
    const hasUpper = /[A-Z]/.test(createPass);
    const hasSpecial = /[\W_]/.test(createPass);
    const hasNumber = /\d/.test(createPass);
    const longEnough = createPass.length >= 8;

    if (!hasUpper || !hasSpecial || !hasNumber || !longEnough) {
      req.session.msg = { type: "error", text: "New password does not meet requirements!" };
      return res.redirect('/prf');
    }

    // Confirm password match
    if (createPass !== confirmPass) {
      req.session.msg = { type: "error", text: "New password and confirm password do not match!" };
      return res.redirect('/prf');
    }

    // Update password (plaintext)
    currentUser.password = createPass;
    await currentUser.save();

    req.session.msg = { type: "success", text: "Password updated successfully!" };
    return res.redirect('/prf');

  } catch (err) {
    console.error(err);
    req.session.msg = { type: "error", text: "Server error!" };
    return res.redirect('/prf');
  }
});

app.post('/rstFG', async (req, res) => {
  try {
    if (!req.session.user) {
      return res.redirect('/');
    }

    const userId = req.session.user._id;
    const { currentPass, createPass, confirmPass } = req.body;

    const currentUser = await users.findById(userId);
    if (!currentUser) {
      req.session.msg = { type: "error", text: "User not found!" };
      return res.redirect('/resetPage');
    }

    // Check current password
    if (currentPass.trim() !== currentUser.password.trim()) {
      req.session.msg = { type: "error", text: "Current password is incorrect!" };
      return res.redirect('/resetPage');
    }

    // Validate new password rules
    const hasUpper = /[A-Z]/.test(createPass);
    const hasSpecial = /[\W_]/.test(createPass);
    const hasNumber = /\d/.test(createPass);
    const longEnough = createPass.length >= 8;

    if (!hasUpper || !hasSpecial || !hasNumber || !longEnough) {
      req.session.msg = { type: "error", text: "New password does not meet requirements!" };
      return res.redirect('/resetPage');
    }

    // Confirm password match
    if (createPass !== confirmPass) {
      req.session.msg = { type: "error", text: "New password and confirm password do not match!" };
      return res.redirect('/resetPage');
    }

    // Update password (plaintext)
    currentUser.password = createPass;
    currentUser.reset = null;
    await currentUser.save();

    req.session.msg = { type: "success", text: "Password updated successfully!" };
    return res.redirect('/prf');

  } catch (err) {
    console.error(err);
    req.session.msg = { type: "error", text: "Server error!" };
    return res.redirect('/resetPage');
  }
});

app.post('/edt', async (req, res) => {
  try {
    if (!req.session.user?._id) {
      return res.redirect('/');
    }

    const userId = req.session.user._id;
    const { email, phone, address } = req.body;

    // Validation
    if (!email || !phone || !address) {
      req.session.msg = { type: "error", text: "Email, phone, and address are required!" };
      return res.redirect('/prf');
    }

    // Check email duplication
    const existingUser = await users.findOne({
      email: email.toLowerCase(),
      _id: { $ne: userId }
    });

    if (existingUser) {
      req.session.msg = { type: "error", text: "Email is already in use!" };
      return res.redirect('/prf');
    }

    // Update user
    const updatedUser = await users.findByIdAndUpdate(
      userId,
      { email: email.toLowerCase(), phone, address },
      { new: true }
    );

    req.session.user = updatedUser;

    req.session.msg = { type: "success", text: "Profile updated successfully!" };
    return res.redirect('/prf');

  } catch (err) {
    console.error("Error in /edt:", err);
    req.session.msg = { type: "error", text: "Server error!" };
    return res.redirect('/prf');
  }
});

app.post('/pht', isLogin, uploadPhoto.single('photo'), async (req, res) => {
  try {
    if (!req.file) {
      req.session.msg = { type: "error", text: "No photo uploaded!" };
      return res.redirect('/prf');
    }

    const userId = req.session.user._id;
    const photoUrl = req.file.path;

    const updatedUser = await users.findByIdAndUpdate(
      userId,
      { photo: photoUrl },
      { new: true }
    );

    req.session.user = updatedUser;

    req.session.msg = { type: "success", text: "Photo updated successfully!" };
    return res.redirect('/prf');

  } catch (err) {
    console.error("Error uploading photo:", err);
    req.session.msg = { type: "error", text: "Failed to upload photo!" };
    return res.redirect('/prf');
  }
});



app.get('/hom', isLogin, myRequest, (req, res) => {
  if (req.user.reset === true) {
    return res.redirect('/resetPage');
  }
  res.render('hom', { title: 'Home' });
});

app.get('/resetPage', isLogin, myRequest, (req, res) => {
  res.render('resetPage', { title: 'Home' });
});


app.get('/reqView/:id', isLogin, async (req, res) => {
  try {
    const rq = await requests.findById(req.params.id)
      .populate('requestBy')
      .populate('processBy')
      .populate('releaseBy');

    if (!rq) return res.status(404).render('404', { title: 'Request Not Found' });

    const rqItems = await items.find({ tr: rq.tr });

    let totalAmount = 0;
    const approvedItems = rqItems.filter(it => it.status === "Approved" || it.status === "Pending");
    const docs = await documents.find({ type: { $in: approvedItems.map(it => it.type) } });

    approvedItems.forEach(it => {
      const doc = docs.find(d => d.type === it.type);
      if (doc) totalAmount += doc.amount * Number(it.qty || 0);
    });

    let message = null;
    switch (req.query.msg) {
      case 'noPhoto': message = 'No photo uploaded!'; break;
      case 'success': message = 'Payment uploaded successfully!'; break;
      case 'error': message = 'Failed to upload payment!'; break;
    }
    const dayjs = require("dayjs");

    // After fetching rq
    const rqWithFormattedDates = {
      ...rq.toObject(), // convert Mongoose doc to plain object
      assignAtFormatted: rq.assignAt ? dayjs(rq.assignAt).format("MMMM D, YYYY h:mm A") : null,
      reviewAtFormatted: rq.reviewAt ? dayjs(rq.reviewAt).format("MMMM D, YYYY h:mm A") : null,
      approveAtFormatted: rq.approveAt ? dayjs(rq.approveAt).format("MMMM D, YYYY h:mm A") : null,
      assessAtFormatted: rq.assessAt ? dayjs(rq.assessAt).format("MMMM D, YYYY h:mm A") : null,
      payAtFormatted: rq.payAt ? dayjs(rq.payAt).format("MMMM D, YYYY h:mm A") : null,
      verifyAtFormatted: rq.verifyAt ? dayjs(rq.verifyAt).format("MMMM D, YYYY h:mm A") : null,
      turnAtFormatted: rq.turnAt ? dayjs(rq.turnAt).format("MMMM D, YYYY h:mm A") : null,
      claimedAtFormatted: rq.claimedAt ? dayjs(rq.claimedAt).format("MMMM D, YYYY h:mm A") : null,
    };

    res.render('reqView', {
      title: 'View Request',
      rq: rqWithFormattedDates,
      items: rqItems,
      totalAmount,
      back: 'hom',
      message
    });

  } catch (err) {
    console.error('❗ Error loading request:', err);
    res.status(500).render('index', {
      title: 'Error',
      error: 'Internal Server Error',
      back: 'hom'
    });
  }
});

app.get('/reqView2/:id', isLogin, async (req, res) => {
  try {
    const rq = await requests.findById(req.params.id)
      .populate('requestBy')
      .populate('processBy')
      .populate('releaseBy');

    if (!rq) return res.status(404).render('404', { title: 'Request Not Found' });

    const rqItems = await items.find({ tr: rq.tr });

    let totalAmount = 0;
    const approvedItems = rqItems.filter(it => it.status === "Approved");
    const docs = await documents.find({ type: { $in: approvedItems.map(it => it.type) } });

    approvedItems.forEach(it => {
      const doc = docs.find(d => d.type === it.type);
      if (doc) totalAmount += doc.amount * Number(it.qty || 0);
    });

    let message = null;
    switch (req.query.msg) {
      case 'noPhoto': message = 'No photo uploaded!'; break;
      case 'success': message = 'Payment uploaded successfully!'; break;
      case 'error': message = 'Failed to upload payment!'; break;
    }
        const dayjs = require("dayjs");

    // After fetching rq
    const rqWithFormattedDates = {
      ...rq.toObject(), // convert Mongoose doc to plain object
      assignAtFormatted: rq.assignAt ? dayjs(rq.assignAt).format("MMMM D, YYYY h:mm A") : null,
      reviewAtFormatted: rq.reviewAt ? dayjs(rq.reviewAt).format("MMMM D, YYYY h:mm A") : null,
      approveAtFormatted: rq.approveAt ? dayjs(rq.approveAt).format("MMMM D, YYYY h:mm A") : null,
      assessAtFormatted: rq.assessAt ? dayjs(rq.assessAt).format("MMMM D, YYYY h:mm A") : null,
      payAtFormatted: rq.payAt ? dayjs(rq.payAt).format("MMMM D, YYYY h:mm A") : null,
      verifyAtFormatted: rq.verifyAt ? dayjs(rq.verifyAt).format("MMMM D, YYYY h:mm A") : null,
      turnAtFormatted: rq.turnAt ? dayjs(rq.turnAt).format("MMMM D, YYYY h:mm A") : null,
      claimedAtFormatted: rq.claimedAt ? dayjs(rq.claimedAt).format("MMMM D, YYYY h:mm A") : null,
    };

    res.render('reqView', {
      title: 'View Request',
      rq: rqWithFormattedDates,
      items: rqItems,
      totalAmount,
      back: 'reqAll',
      message
    });

  } catch (err) {
    console.error('❗ Error loading request:', err);
    res.status(500).render('index', {
      title: 'Error',
      error: 'Internal Server Error',
      back: 'reqAll'
    });
  }
});

app.post("/update-status/:id", async (req, res) => {
    const id = req.params.id;
    const { status } = req.body;

    try {
        await requests.findByIdAndUpdate(id, { status });
        res.status(200).send("Updated");
    } catch (err) {
        console.error(err);
        res.status(500).send("Error updating status");
    }
});

app.post('/paymentUpload', isLogin, uploadPhoto.array('payPhoto', 10), async (req, res) => {
  // 1️⃣ Get requestId early
  const requestId = req.body.id;

  // If no ID, redirect safely
  if (!requestId) return res.redirect('/?msg=invalidRequest');

  try {
    // 2️⃣ Check if files exist
    if (!req.files || req.files.length === 0) {
      return res.redirect(`/reqView/${requestId}?msg=noPhoto`);
    }

    const payMode = req.body.payMode || 'Unknown';

    // 3️⃣ Save all file paths as array
    const payPhotoArray = req.files.map(file => file.path);

    const payAt = new Date();

    // 4️⃣ Update the request document
    await requests.findByIdAndUpdate(requestId, {
      payPhoto: payPhotoArray,
      status: 'For Verification',
      payMode,
      payAt
    });

    // 5️⃣ Redirect on success
    res.redirect(`/reqView/${requestId}?msg=success`);

  } catch (err) {
    console.error('Payment Upload Error:', err);

    // Redirect safely even on error
    res.redirect(`/reqView/${requestId}?msg=error`);
  }
});



app.get('/reqAll', isLogin, myRequest, (req, res) => {
  res.render('reqAll', { title: 'Request History' });
});

app.get('/ddc', async (req, res) => {
  try {
    const documentsData = [
      // ✅ Regular documents
      { type: "Transcript of Record", amount: 350 },
      { type: "Diploma", amount: 800 },
      { type: "Form 137", amount: 200 },
      { type: "Form 138", amount: 150 },
      { type: "Authentication", amount: 80 }, // per document

      // ✅ CAV
      { type: "CAV (Graduate)", amount: 240 },
      { type: "CAV (Nursing Graduate with RLE)", amount: 320 },
      { type: "CAV (Under Graduate)", amount: 160 },
      { type: "CAV (SHS)", amount: 160 },
      { type: "CAV (SHS Graduate)", amount: 320 },
      { type: "CAV (HS)", amount: 160 },

      // ✅ Certificates
      { type: "Certificate of Grades", amount: 150 },
      { type: "Certificate of Enrolment", amount: 150 },
      { type: "Certificate of Graduation", amount: 150 },
      { type: "Units Earned", amount: 150 },
      { type: "Subject Description", amount: 50 }, // per page
      { type: "GWA", amount: 150 },
      { type: "Good Moral", amount: 500 },
      { type: "CAR", amount: 150 },
      { type: "No Objection", amount: 500 },
      { type: "Honorable Dismissal", amount: 500 },
      { type: "NTSP Serial Number", amount: 150 },
      { type: "English Proficiency", amount: 150 },
    ];

    // ✅ Step 1: Get all types from your predefined list
    const types = documentsData.map(d => d.type);

    // ✅ Step 2: Find existing documents that match those types
    const existingDocs = await documents.find({ type: { $in: types } }, 'type');
    const existingTypes = existingDocs.map(doc => doc.type);

    // ✅ Step 3: Filter out new ones that don't exist yet
    const missingDocs = documentsData
      .filter(d => !existingTypes.includes(d.type))
      .map(d => ({
        ...d,
        days: "10", // default processing days
      }));

    // ✅ Step 4: Insert only missing documents
    if (missingDocs.length > 0) {
      await documents.insertMany(missingDocs);
      return res.status(200).json({
        message: `📄 ${missingDocs.length} new document(s) added successfully.`,
        added: missingDocs.map(d => d.type),
      });
    }

    // ✅ Step 5: If all already exist
    res.status(200).json({
      message: '✅ All document types already exist in the database.',
    });

  } catch (err) {
    console.error('❌ Error generating documents:', err);
    res.status(500).json({
      message: '⚠️ Failed to generate documents.',
      error: err.message,
    });
  }
});


const privilegedRoles = ["Admin", "Head", "Dev"];

function filterByStatuses(list = [], statuses = []) {
  return list.filter(rq => statuses.includes(rq.status) && !rq.declineAt);
}

// /srv  (Pending only)
app.get('/srv', isLogin, isRequest, isStaff, (req, res) => {
  const statuses = ['Pending'];
  const allFiltered = filterByStatuses(req.requests, statuses);
  const userFiltered = filterByStatuses(req.userRequests, statuses);

  const isPrivileged = privilegedRoles.includes(req.user.role);
  const totalCount = isPrivileged ? allFiltered.length : userFiltered.length;

  res.render('srv', {
    title: 'Transactions',
    active: 'srv',
    requests: isPrivileged ? allFiltered : userFiltered,
    userRequests: userFiltered,
    totalCount
  });
});

// /srvAll  (multiple allowed statuses)
app.get('/srvAll', isLogin, isRequest, isStaff, (req, res) => {
  const statuses = [
    'Reviewed', 'Assessed', 'Claimed',
    'For Payment', 'Verified', 'Pending', 'For Release', 'For Verification'
  ];
  const allFiltered = filterByStatuses(req.requests, statuses);
  const userFiltered = filterByStatuses(req.userRequests, statuses);

  const isPrivileged = privilegedRoles.includes(req.user.role);
  const totalCount = isPrivileged ? allFiltered.length : userFiltered.length;

  res.render('srvAll', {
    title: 'All Transactions',
    active: 'srv',
    requests: isPrivileged ? allFiltered : userFiltered,
    userRequests: userFiltered,
    totalCount
  });
});

// /prc  (processing statuses)
app.get('/prc', isLogin, isRequest, isStaff, (req, res) => {
  const statuses = ['Reviewed', 'Assessed', 'For Verification', 'For Payment'];
  const allFiltered = filterByStatuses(req.requests, statuses);
  const userFiltered = filterByStatuses(req.userRequests, statuses);

  const isPrivileged = privilegedRoles.includes(req.user.role);
  const totalCount = isPrivileged ? allFiltered.length : userFiltered.length;

  res.render('srv', {
    title: 'Processing',
    active: 'srv',
    requests: isPrivileged ? allFiltered : userFiltered,
    userRequests: userFiltered,
    totalCount
  });
});

// /apr  (Verified)
app.get('/apr', isLogin, isRequest, isStaff, (req, res) => {
  const statuses = ['Verified'];
  const allFiltered = filterByStatuses(req.requests, statuses);
  const userFiltered = filterByStatuses(req.userRequests, statuses);

  const isPrivileged = privilegedRoles.includes(req.user.role);
  const totalCount = isPrivileged ? allFiltered.length : userFiltered.length;

  res.render('srv', {
    title: 'Approved',
    active: 'srv',
    requests: isPrivileged ? allFiltered : userFiltered,
    userRequests: userFiltered,
    totalCount
  });
});

// /rel  (For Release)
app.get('/rel', isLogin, isRequest, isStaff, (req, res) => {
  const statuses = ['For Release'];
  const allFiltered = filterByStatuses(req.requests, statuses);
  const userFiltered = filterByStatuses(req.userRequests, statuses);

  const isPrivileged = privilegedRoles.includes(req.user.role);
  const totalCount = isPrivileged ? allFiltered.length : userFiltered.length;

  res.render('srv', {
    title: 'For Release',
    active: 'srv',
    requests: isPrivileged ? allFiltered : userFiltered,
    userRequests: userFiltered,
    totalCount
  });
});


app.get('/vrf', isLogin, isVerify, isStaff, (req, res) => {
  // To Verify
  const filteredRequests = req.requests.filter(
    rq => rq.status === '' && !rq.declineAt
  );
    const privilegedRoles = ["Admin", "Head", "Dev"];
      // Align totalCount with filtered requests
  const totalCount = privilegedRoles.includes(req.user.role)
    ? filteredRequests.length
    : req.user.role === "Registrar"
      ? req.userRequests.filter(rq => rq.status === '' && !rq.declineAt).length
      : req.userRequests.filter(rq => rq.status === '' && !rq.declineAt).length;

  res.render('srv', { 
    title: 'To Verify', 
    active: 'srv', 
    requests: filteredRequests,
    userRequests: filteredRequests,
    totalCount
  });
});


app.patch('/req/processBy/:id', isLogin, isRequest, isStaff, async (req, res) => {
  try {
    const { processBy } = req.body;
    const rq = await requests.findById(req.params.id);
    if (!rq) return res.status(404).json({ error: 'Request not found' });

    rq.processBy = processBy || null;
    rq.assignAt = processBy ? new Date() : null;
    await rq.save();

    console.log('✅ Updated processBy for request:', rq._id); // debugging
    res.status(200).json({ message: 'Staff successfully assigned!' });
  } catch (err) {
    console.error('❌ Error in PATCH /req/processBy/:id', err);
    res.status(500).json({ error: 'Something went wrong while assigning staff.' });
  }
});

// Generic handler to display a request
async function renderRequest(req, res, backRoute, viewName = 'srvView') {
  try {
    const requestId = req.params.id;

    // Find the request
    const rq = req.requests.find(r => r._id.toString() === requestId);

    if (!rq) {
      return res.status(404).render(viewName, { 
        title: 'Request Not Found', 
        back: backRoute,
        active: 'srv',
        error: 'Request not found.' 
      });
    }

    // Find all items for this request
    const rqItems = rq.items || []; // assuming req.requests contains items array

    // Filter approved items
    const approvedItems = rqItems.filter(it => it.status === "Approved" || it.status === "Pending");

    // Calculate totalAmount
    let totalAmount = 0;
    if (approvedItems.length > 0) {
      for (const it of approvedItems) {
        // Find document that matches this item type
        const doc = req.documents.find(d => d.type === it.type);
        if (doc) totalAmount += doc.amount * it.qty;
      }
    }

    res.render(viewName, { 
      title: 'Request Details',
      back: backRoute,
      active: 'srv',
      request: rq,
      items: rqItems,
      totalAmount,
      hasPending: rqItems.some(it => it.status === "Pending")
    });
    
  } catch (err) {
    console.error(`❌ Error in /${backRoute}/:id route:`, err);
    res.status(500).render(viewName, { 
      title: 'Error', 
      back: backRoute,
      active: 'srv',
      error: 'Something went wrong while loading the request.' 
    });
  }
}

// Then your routes become:
app.get('/srvView/:id', isLogin, isRequest, isStaff, (req, res) => renderRequest(req, res, 'srv'));
app.get('/srvAllView/:id', isLogin, isRequest, isStaff, (req, res) => renderRequest(req, res, 'srvAll'));
app.get('/prcView/:id', isLogin, isRequest, isStaff, (req, res) => renderRequest(req, res, 'prc'));
app.get('/relView/:id', isLogin, isRequest, isStaff, (req, res) => renderRequest(req, res, 'rel'));
app.get('/aprView/:id', isLogin, isRequest, isStaff, (req, res) => renderRequest(req, res, 'apr'));
app.get('/vrfView/:id', isLogin, isStaff, isVerify, (req, res) => renderRequest(req, res, 'vrf', 'vrfView'));


/* Approval Routes */

app.post("/decItem", async (req, res) => {
    const { requestId, itemId, back, itemRemarks } = req.body; // read itemRemarks

    try {
        // Find the request
        const requestDoc = await requests.findById(requestId);
        if (!requestDoc) return res.status(404).send("Request not found");

        // Find the specific item to decline
        const itemDoc = await items.findById(itemId);
        if (!itemDoc) return res.status(404).send("Item not found");

        // Update item status and remarks
        itemDoc.status = "Declined";
        itemDoc.remarks = itemRemarks || itemDoc.remarks;
        await itemDoc.save();

        // Remove declineAt & holdAt if approving any item
        requestDoc.holdAt = null;

        // Fetch all items for this request
        const allItems = await items.find({ tr: requestDoc.tr });

        const hasPending = allItems.some(it => it.status === "Pending");
        const allDeclined = allItems.every(it => it.status === "Declined");

        if (!hasPending) {
            if (allDeclined) {
                requestDoc.declineAt = new Date(); // all declined
            } else {
                requestDoc.status = "Reviewed";
                requestDoc.approveAt = new Date();
            }
            await requestDoc.save();
        }

        // Redirect to the correct view
        const viewRoutes = {
            srv: `/srvView/${requestId}`,
            prc: `/prcView/${requestId}`,
            rel: `/relView/${requestId}`,
            apr: `/aprView/${requestId}`,
            vrf: `/vrfView/${requestId}`
        };
        res.redirect(viewRoutes[back] || `/srvView/${requestId}`);
    } catch (err) {
        console.error(err);
        res.status(500).send("Server error");
    }
});

app.post("/appItem", async (req, res) => {
    const { requestId, itemId, back } = req.body;

    try {
        // Find the request
        const requestDoc = await requests.findById(requestId);
        if (!requestDoc) return res.status(404).send("Request not found");

        // Find the specific item
        const itemDoc = await items.findById(itemId);
        if (!itemDoc) return res.status(404).send("Item not found");

        // Update item status
        itemDoc.status = "Approved";
        await itemDoc.save();

        // Remove declineAt & holdAt if approving any item
        requestDoc.declineAt = null;
        requestDoc.holdAt = null;
        requestDoc.reviewAt = new Date();

        // Check if any items are still pending
        const pendingItems = await items.find({ tr: requestDoc.tr, status: "Pending" });

        // If no pending items left → mark request as Reviewed
        if (pendingItems.length === 0) {
            requestDoc.status = "Reviewed";
            requestDoc.reviewAt = new Date();
        }

        await requestDoc.save();

        // Redirect to correct view
        const viewRoutes = {
            srv: `/srvView/${requestId}`,
            prc: `/prcView/${requestId}`,
            rel: `/relView/${requestId}`,
            apr: `/aprView/${requestId}`,
            vrf: `/vrfView/${requestId}`
        };

        res.redirect(viewRoutes[back] || `/srvView/${requestId}`);

    } catch (err) {
        console.error(err);
        res.status(500).send("Server error");
    }
});

app.post("/appAllItem", async (req, res) => {
    const { requestId, back } = req.body;

    try {
        // Find request
        const requestDoc = await requests.findById(requestId);
        if (!requestDoc) return res.status(404).send("Request not found");

        // Get all items for this request (same TR)
        const allItems = await items.find({ tr: requestDoc.tr });

        if (allItems.length === 0) {
            return res.status(400).send("No items found for this request");
        }

        // Approve all items
        await items.updateMany(
            { tr: requestDoc.tr },
            { 
                $set: {
                    status: "Approved",
                    remarks: null
                }
            }
        );

        // Update request info
        requestDoc.status = "Reviewed";
        requestDoc.declineAt = null;
        requestDoc.holdAt = null;
        requestDoc.reviewAt = new Date();
        await requestDoc.save();

        // Redirect to correct view
        const viewRoutes = {
            srv: `/srvView/${requestId}`,
            prc: `/prcView/${requestId}`,
            rel: `/relView/${requestId}`,
            apr: `/aprView/${requestId}`,
            vrf: `/vrfView/${requestId}`
        };

        res.redirect(viewRoutes[back] || `/srvView/${requestId}`);

    } catch (err) {
        console.error(err);
        res.status(500).send("Server error");
    }
});

app.post("/decline3", async (req, res) => {
    const { requestId, back, requestRemarks } = req.body;

    try {
        // Find the request
        const requestDoc = await requests.findById(requestId);
        if (!requestDoc) return res.status(404).send("Request not found");

        // Decline all items under this request
        await items.updateMany(
            { tr: requestDoc.tr },
            { status: "Declined" }
        );

        requestDoc.declineAt = new Date();
        requestDoc.holdAt = null;
        requestDoc.remarks = requestRemarks || "";
        requestDoc.status = "Pending";

        await requestDoc.save();

        // Redirect to correct view
        const viewRoutes = {
            srv: `/srvView/${requestId}`,
            prc: `/prcView/${requestId}`,
            rel: `/relView/${requestId}`,
            apr: `/aprView/${requestId}`,
            vrf: `/vrfView/${requestId}`
        };

        res.redirect(viewRoutes[back] || `/srvView/${requestId}`);

    } catch (err) {
        console.error("Decline Error:", err);
        res.status(500).send("Server error");
    }
});


app.post("/hold3", async (req, res) => {
    const { requestId, back, requestRemarks } = req.body;

    try {
        // Find the request
        const requestDoc = await requests.findById(requestId);
        if (!requestDoc) return res.status(404).send("Request not found");

        requestDoc.declineAt = null;
        requestDoc.holdAt = new Date();
        requestDoc.remarks = requestRemarks || "";

        await requestDoc.save();

        // Redirect to correct view
        const viewRoutes = {
            srv: `/srvView/${requestId}`,
            prc: `/prcView/${requestId}`,
            rel: `/relView/${requestId}`,
            apr: `/aprView/${requestId}`,
            vrf: `/vrfView/${requestId}`
        };

        res.redirect(viewRoutes[back] || `/srvView/${requestId}`);

    } catch (err) {
        console.error("Decline Error:", err);
        res.status(500).send("Server error");
    }
});

app.post("/restore3", async (req, res) => {
    const { requestId, back } = req.body;

    try {
        // Find request
        const requestDoc = await requests.findById(requestId);
        if (!requestDoc) return res.status(404).send("Request not found");

        // Get all items for this request (same TR)
        const allItems = await items.find({ tr: requestDoc.tr });

        if (allItems.length === 0) {
            return res.status(400).send("No items found for this request");
        }

        // Approve all items
        await items.updateMany(
            { tr: requestDoc.tr },
            { 
                $set: {
                    status: "Pending",
                    remarks: null
                }
            }
        );

        // Update request info
        requestDoc.status = "Pending";
        requestDoc.declineAt = null;
        requestDoc.holdAt = null;
        requestDoc.updatedAt = new Date();
        await requestDoc.save();

        // Redirect to correct view
        const viewRoutes = {
            srv: `/srvView/${requestId}`,
            prc: `/prcView/${requestId}`,
            rel: `/relView/${requestId}`,
            apr: `/aprView/${requestId}`,
            vrf: `/vrfView/${requestId}`
        };

        res.redirect(viewRoutes[back] || `/srvView/${requestId}`);

    } catch (err) {
        console.error(err);
        res.status(500).send("Server error");
    }
});

app.post("/fRel", async (req, res) => {
    const { requestId, back } = req.body;

    try {
        // Find request
        const requestDoc = await requests.findById(requestId);
        if (!requestDoc) return res.status(404).send("Request not found");

        // Get all items for this request (same TR)
        const allItems = await items.find({ tr: requestDoc.tr });

        if (allItems.length === 0) {
            return res.status(400).send("No items found for this request");
        }


        // Update request info
        requestDoc.status = "For Release";
        requestDoc.declineAt = null;
        requestDoc.holdAt = null;
        requestDoc.remarks = null;
        requestDoc.turnAt = new Date();
        await requestDoc.save();

        // Redirect to correct view
        const viewRoutes = {
            srv: `/srvView/${requestId}`,
            prc: `/prcView/${requestId}`,
            rel: `/relView/${requestId}`,
            apr: `/aprView/${requestId}`,
            vrf: `/vrfView/${requestId}`
        };

        res.redirect(viewRoutes[back] || `/srvView/${requestId}`);

    } catch (err) {
        console.error(err);
        res.status(500).send("Server error");
    }
});

app.post("/claim3", async (req, res) => {
    const { requestId, back, claimedBy } = req.body;

    try {
        // Find request
        const requestDoc = await requests.findById(requestId);
        if (!requestDoc) return res.status(404).send("Request not found");

        // Get all items for this request (same TR)
        const allItems = await items.find({ tr: requestDoc.tr });

        if (allItems.length === 0) {
            return res.status(400).send("No items found for this request");
        }


        // Update request info
        requestDoc.status = "Claimed";
        requestDoc.declineAt = null;
        requestDoc.holdAt = null;
        requestDoc.remarks = null;
        requestDoc.claimedBy = claimedBy;
        requestDoc.claimedAt = new Date();
        await requestDoc.save();

        // Redirect to correct view
        const viewRoutes = {
            srv: `/srvView/${requestId}`,
            prc: `/prcView/${requestId}`,
            rel: `/relView/${requestId}`,
            apr: `/aprView/${requestId}`,
            vrf: `/vrfView/${requestId}`
        };

        res.redirect(viewRoutes[back] || `/srvView/${requestId}`);

    } catch (err) {
        console.error(err);
        res.status(500).send("Server error");
    }
});

/* end of Approval Routes */


app.get('/emp', isLogin, isEmp, (req, res) => {
  res.render('emp', { title: 'Employees', active: 'emp' });
});

app.get('/empArc', isLogin, isEmpArc, (req, res) => {
  res.render('empArc', { title: 'Employees', active: 'emp' });
});

app.post('/newEmp', async (req, res) => {
  try {
    const {
      firstName, middleName, lastName, extName,
      address, number, email, bDay, bMonth, bYear,
      role, campus, studentNo // employee number
    } = req.body;

    // 1️⃣ Check if email is already used
    const existingEmail = await users.findOne({ email: email.toLowerCase() });
    if (existingEmail) {
      return res.render('index', { error: 'Email is already used by an existing account!', title: "AUDRESv25" });
    }

    // 2️⃣ Check if employee number is already used (optional)
    if (studentNo) {
      const existingEmployee = await users.findOne({ schoolId: studentNo });
      if (existingEmployee) {
        return res.render('index', { error: 'Employee Number is already registered!', title: "AUDRESv25" });
      }
    }

    // 3️⃣ Convert month to number
    const monthMap = {
      January: 1, February: 2, March: 3, April: 4, May: 5, June: 6,
      July: 7, August: 8, September: 9, October: 10, November: 11, December: 12
    };
    const bMonthNum = monthMap[bMonth] || new Date().getMonth() + 1;

    // 4️⃣ Create new user
    const newUser = new users({
      fName: firstName,
      mName: middleName,
      lName: lastName,
      xName: extName,
      address,
      phone: number,
      email: email.toLowerCase(),
      bDay: Number(bDay),
      bMonth: bMonthNum,
      bYear: Number(bYear),
      role,
      campus,
      schoolId: studentNo || undefined,
      username: email,           // default username
      password: generatePassword(),
      archive: false,            // default not archived
      verify: false,
      access: 1
    });

    await newUser.save();

    // 5️⃣ Redirect to employee list page
    res.redirect('/emp');

  } catch (err) {
    console.error(err);
    res.render('index', { error: 'Failed to create employee!', title: "AUDRESv25" });
  }
});



app.get('/empView/:id', isLogin, isEmp, async (req, res) => {
  try {
  const msg = req.session.msg;
  delete req.session.msg;
    const userId = req.params.id;

    const student = req.users.find(u => u._id.toString() === userId);

    if (!student) {
      return res.status(404).render('empView', {
        title: 'Employees',
        back: 'emp',
        active: 'emp',
        error: 'Student not found.',
        user: req.user,
    redirectUrl: req.originalUrl,
    messageSuccess: msg?.type === 'success' ? msg.text : null,
    messagePass: msg?.type === 'error' ? msg.text : null // still pass logged-in user
      });
    }

    res.render('empView', {
      title: 'Employees',
      back: 'emp',
      active: 'emp',
      student,      // the student being viewed
      user: req.user,
    redirectUrl: req.originalUrl,
    messageSuccess: msg?.type === 'success' ? msg.text : null,
    messagePass: msg?.type === 'error' ? msg.text : null // logged-in user
    });

  } catch (err) {
    console.error('❌ Error in /empView/:id route:', err);
    res.status(500).render('empView', {
      title: 'Employees',
      back: 'emp',
      active: 'emp',
      error: 'Something went wrong while loading the student.',
      user: req.user,
    redirectUrl: req.originalUrl,
    messageSuccess: msg?.type === 'success' ? msg.text : null,
    messagePass: msg?.type === 'error' ? msg.text : null
    });
  }
});

app.get('/empViewArc/:id', isLogin, isEmpArc, async (req, res) => {
  try {
  const msg = req.session.msg;
  delete req.session.msg;
    const userId = req.params.id;

    const student = req.users.find(u => u._id.toString() === userId);

    if (!student) {
      return res.status(404).render('empView', {
        title: 'Employees',
        back: 'arc',
        active: 'emp',
        error: 'Student not found.',
        user: req.user,
    redirectUrl: req.originalUrl,
    messageSuccess: msg?.type === 'success' ? msg.text : null,
    messagePass: msg?.type === 'error' ? msg.text : null // still pass logged-in user
      });
    }

    res.render('empView', {
      title: 'Employees',
      back: 'arc',
      active: 'emp',
      student,      // the student being viewed
      user: req.user,
    redirectUrl: req.originalUrl,
    messageSuccess: msg?.type === 'success' ? msg.text : null,
    messagePass: msg?.type === 'error' ? msg.text : null // logged-in user
    });

  } catch (err) {
    console.error('❌ Error in /empView/:id route:', err);
    res.status(500).render('empView', {
      title: 'Employees',
      back: 'arc',
      active: 'emp',
      error: 'Something went wrong while loading the student.',
      user: req.user,
    redirectUrl: req.originalUrl,
    messageSuccess: msg?.type === 'success' ? msg.text : null,
    messagePass: msg?.type === 'error' ? msg.text : null
    });
  }
});


app.post('/check-pass4', async (req, res) => {
    try {
        const { currentPass, studentId } = req.body;

        if (!studentId) {
            return res.json({ valid: false, error: "Student ID not provided" });
        }

        // Fetch the student by ID
        const student = await users.findById(studentId); // or your students collection

        if (!student) {
            return res.json({ valid: false, error: "Student not found" });
        }

        // Compare password directly (if not hashed)
        const valid = currentPass === student.password;

        res.json({ valid });

    } catch (err) {
        console.error(err);
        res.json({ valid: false, error: "Server error" });
    }
});

app.post('/rst4', async (req, res) => {
  try {
    const { studentId, currentPass, createPass, confirmPass, redirectUrl } = req.body;

    if (!studentId) {
      req.session.msg = { type: "error", text: "Student ID not provided!" };
      return res.redirect(redirectUrl || '/emp');
    }

    const student = await users.findById(studentId);
    if (!student) {
      req.session.msg = { type: "error", text: "Student not found!" };
      return res.redirect(redirectUrl || '/emp');
    }

    if (currentPass.trim() !== student.password.trim()) {
      req.session.msg = { type: "error", text: "Current password is incorrect!" };
      return res.redirect(redirectUrl || '/emp');
    }

    const hasUpper = /[A-Z]/.test(createPass);
    const hasSpecial = /[\W_]/.test(createPass);
    const hasNumber = /\d/.test(createPass);
    const longEnough = createPass.length >= 8;

    if (!hasUpper || !hasSpecial || !hasNumber || !longEnough) {
      req.session.msg = { type: "error", text: "New password does not meet requirements!" };
      return res.redirect(redirectUrl || '/emp');
    }

    if (createPass !== confirmPass) {
      req.session.msg = { type: "error", text: "New password and confirm password do not match!" };
      return res.redirect(redirectUrl || '/emp');
    }

    student.password = createPass;
    await student.save();

    req.session.msg = { type: "success", text: "Password updated successfully!" };
    return res.redirect(redirectUrl || '/emp');

  } catch (err) {
    console.error(err);
    req.session.msg = { type: "error", text: "Server error!" };
    return res.redirect(req.body.redirectUrl || '/emp');
  }
});

app.get('/autoPass4', async (req, res) => {
  try {
    const { studentId, redirectUrl } = req.query;

    if (!studentId) {
      req.session.msg = { type: "error", text: "User ID not provided!" };
      return res.redirect(redirectUrl || '/emp');
    }

    const student = await users.findById(studentId);
    if (!student) {
      req.session.msg = { type: "error", text: "User not found!" };
      return res.redirect(redirectUrl || '/emp');
    }

    // Generate random password
    const newPassword = generatePassword();

    // Save new password
    student.password = newPassword;
    await student.save();

    req.session.msg = { 
      type: "success", 
      text: `New password generated!` 
    };

    return res.redirect(redirectUrl || '/emp');

  } catch (err) {
    console.error(err);
    req.session.msg = { type: "error", text: "Server error generating password!" };
    return res.redirect(req.query.redirectUrl || '/emp');
  }
});

app.get('/archive4', async (req, res) => {
  try {
    const { studentId, redirectUrl, suspendIs } = req.query;

    if (!studentId) {
      req.session.msg = { type: "error", text: "User ID not provided!" };
      return res.redirect(redirectUrl || '/emp');
    }

    const student = await users.findById(studentId);
    if (!student) {
      req.session.msg = { type: "error", text: "User not found!" };
      return res.redirect(redirectUrl || '/emp');
    }

    // Set archive and suspend info
    student.archive = true;
    student.suspendAt = new Date();
    student.suspendIs = suspendIs || 'No reason provided';
    await student.save();

    req.session.msg = { 
      type: "success", 
      text: `` 
    };

    return res.redirect('/empArc');

  } catch (err) {
    console.error(err);
    req.session.msg = { type: "error", text: "Server error archiving user!" };
    return res.redirect(req.query.redirectUrl || '/emp');
  }
});



app.get('/archiveX4', async (req, res) => {
  try {
    const { studentId, redirectUrl, suspendIs } = req.query;

    if (!studentId) {
      req.session.msg = { type: "error", text: "User ID not provided!" };
      return res.redirect(redirectUrl || '/emp');
    }

    const student = await users.findById(studentId);
    if (!student) {
      req.session.msg = { type: "error", text: "User not found!" };
      return res.redirect(redirectUrl || '/emp');
    }

    // Set archive and suspend info
    student.archive = false;
    student.suspendAt = new Date();
    student.suspendIs = suspendIs || 'No reason provided';
    await student.save();

    req.session.msg = { 
      type: "success", 
      text: `` 
    };

    return res.redirect('/emp');

  } catch (err) {
    console.error(err);
    req.session.msg = { type: "error", text: "Server error archiving user!" };
    return res.redirect(req.query.redirectUrl || '/emp');
  }
});

app.post('/edt4', async (req, res) => {
  try {
    const {
      studentId,
      redirectUrl,

      fName,
      mName,
      lName,
      xName,
      email,
      phone,
      address,

      role,
      campus,
      schoolId
    } = req.body;

    if (!studentId) {
      req.session.msg = { type: "error", text: "Student ID not provided!" };
      return res.redirect(redirectUrl || '/emp');
    }

    if (!fName || !lName || !email || !phone || !address || !schoolId) {
      req.session.msg = { type: "error", text: "Please fill in all required fields!" };
      return res.redirect(redirectUrl || '/emp');
    }

    // ✔ username MUST be the same as schoolId
    const username = schoolId;

    // ✔ Check username duplication (except the current one)
    const existingUsername = await users.findOne({
      username,
      _id: { $ne: studentId }
    });

    if (existingUsername) {
      req.session.msg = { type: "error", text: "Employee Number is already used as a username!" };
      return res.redirect(redirectUrl || '/emp');
    }

    // ✔ Check email duplication (except the current one)
    const existingEmail = await users.findOne({
      email: email.toLowerCase(),
      _id: { $ne: studentId }
    });

    if (existingEmail) {
      req.session.msg = { type: "error", text: "Email is already in use!" };
      return res.redirect(redirectUrl || '/emp');
    }

    // Update fields
    const updateData = {
      fName,
      mName,
      lName,
      xName,
      email: email.toLowerCase(),
      phone,
      address,
      role,
      campus,
      schoolId,
      username // Automatically applied
    };

    await users.findByIdAndUpdate(studentId, updateData);

    req.session.msg = { type: "success", text: "Profile updated successfully!" };
    return res.redirect(redirectUrl || '/emp');

  } catch (err) {
    console.error(err);
    req.session.msg = { type: "error", text: "Server error!" };
    return res.redirect(req.body.redirectUrl || '/emp');
  }
});



app.post('/pht4', uploadPhoto.single('photo'), async (req, res) => {
  try {
    const { studentId, redirectUrl } = req.body;

    if (!studentId) {
      req.session.msg = { type: "error", text: "User ID not provided!" };
      return res.redirect(redirectUrl || '/emp');
    }

    if (!req.file) {
      req.session.msg = { type: "error", text: "No photo uploaded!" };
      return res.redirect(redirectUrl || '/emp');
    }

    const photoUrl = req.file.path;
    await users.findByIdAndUpdate(studentId, { photo: photoUrl });

    req.session.msg = { type: "success", text: "Photo updated successfully!" };
    return res.redirect(redirectUrl || '/emp');

  } catch (err) {
    console.error(err);
    req.session.msg = { type: "error", text: "Failed to upload photo!" };
    return res.redirect(req.body.redirectUrl || '/emp');
  }
});

app.get('/acc', isLogin, (req, res) => {
  const msg = req.session.msg;
  delete req.session.msg;

  res.render('acc', {
    user: req.session.user,
    title: 'Profile',
    active: 'acc',
    messageSuccess: msg?.type === 'success' ? msg.text : null,
    messagePass: msg?.type === 'error' ? msg.text : null
  });
});


app.post('/rst2', async (req, res) => {
  try {
    if (!req.session.user) {
      return res.redirect('/');
    }

    const userId = req.session.user._id;
    const { currentPass, createPass, confirmPass } = req.body;

    const currentUser = await users.findById(userId);
    if (!currentUser) {
      req.session.msg = { type: "error", text: "User not found!" };
      return res.redirect('/acc');
    }

    // Check current password
    if (currentPass.trim() !== currentUser.password.trim()) {
      req.session.msg = { type: "error", text: "Current password is incorrect!" };
      return res.redirect('/acc');
    }

    // Validate new password rules
    const hasUpper = /[A-Z]/.test(createPass);
    const hasSpecial = /[\W_]/.test(createPass);
    const hasNumber = /\d/.test(createPass);
    const longEnough = createPass.length >= 8;

    if (!hasUpper || !hasSpecial || !hasNumber || !longEnough) {
      req.session.msg = { type: "error", text: "New password does not meet requirements!" };
      return res.redirect('/acc');
    }

    // Confirm password match
    if (createPass !== confirmPass) {
      req.session.msg = { type: "error", text: "New password and confirm password do not match!" };
      return res.redirect('/acc');
    }

    // Update password (plaintext)
    currentUser.password = createPass;
    await currentUser.save();

    req.session.msg = { type: "success", text: "Password updated successfully!" };
    return res.redirect('/acc');

  } catch (err) {
    console.error(err);
    req.session.msg = { type: "error", text: "Server error!" };
    return res.redirect('/acc');
  }
});


app.post('/rst2FG', async (req, res) => {
  try {
    if (!req.session.user) {
      return res.redirect('/');
    }

    const userId = req.session.user._id;
    const { currentPass, createPass, confirmPass } = req.body;

    const currentUser = await users.findById(userId);
    if (!currentUser) {
      req.session.msg = { type: "error", text: "User not found!" };
      return res.redirect('/resetPage2');
    }

    // Check current password
    if (currentPass.trim() !== currentUser.password.trim()) {
      req.session.msg = { type: "error", text: "Current password is incorrect!" };
      return res.redirect('/resetPage2');
    }

    // Validate new password rules
    const hasUpper = /[A-Z]/.test(createPass);
    const hasSpecial = /[\W_]/.test(createPass);
    const hasNumber = /\d/.test(createPass);
    const longEnough = createPass.length >= 8;

    if (!hasUpper || !hasSpecial || !hasNumber || !longEnough) {
      req.session.msg = { type: "error", text: "New password does not meet requirements!" };
      return res.redirect('/resetPage2');
    }

    // Confirm password match
    if (createPass !== confirmPass) {
      req.session.msg = { type: "error", text: "New password and confirm password do not match!" };
      return res.redirect('/resetPage2');
    }

    // Update password (plaintext)
    currentUser.password = createPass;
    currentUser.reset = null;
    await currentUser.save();
    /*
    req.session.msg = { type: "success", text: "Password updated successfully!" };
    */
    return res.redirect('/acc');

  } catch (err) {
    console.error(err);
    req.session.msg = { type: "error", text: "Server error!" };
    return res.redirect('/resetPage2');
  }
});


app.post('/rst3FG', async (req, res) => {
  try {
    if (!req.session.user) {
      return res.redirect('/');
    }

    const userId = req.session.user._id;
    const { currentPass, createPass, confirmPass } = req.body;

    const currentUser = await users.findById(userId);
    if (!currentUser) {
      req.session.msg = { type: "error", text: "User not found!" };
      return res.redirect('/resetPage3');
    }

    // Check current password
    if (currentPass.trim() !== currentUser.password.trim()) {
      req.session.msg = { type: "error", text: "Current password is incorrect!" };
      return res.redirect('/resetPage3');
    }

    // Validate new password rules
    const hasUpper = /[A-Z]/.test(createPass);
    const hasSpecial = /[\W_]/.test(createPass);
    const hasNumber = /\d/.test(createPass);
    const longEnough = createPass.length >= 8;

    if (!hasUpper || !hasSpecial || !hasNumber || !longEnough) {
      req.session.msg = { type: "error", text: "New password does not meet requirements!" };
      return res.redirect('/resetPage3');
    }

    // Confirm password match
    if (createPass !== confirmPass) {
      req.session.msg = { type: "error", text: "New password and confirm password do not match!" };
      return res.redirect('/resetPage3');
    }

    // Update password (plaintext)
    currentUser.password = createPass;
    currentUser.reset = null;
    await currentUser.save();
    /*
    req.session.msg = { type: "success", text: "Password updated successfully!" };
    */
    return res.redirect('/acc2');

  } catch (err) {
    console.error(err);
    req.session.msg = { type: "error", text: "Server error!" };
    return res.redirect('/resetPage3');
  }
});

app.post('/rst4FG', async (req, res) => {
  try {
    if (!req.session.user) {
      return res.redirect('/');
    }

    const userId = req.session.user._id;
    const { currentPass, createPass, confirmPass } = req.body;

    const currentUser = await users.findById(userId);
    if (!currentUser) {
      req.session.msg = { type: "error", text: "User not found!" };
      return res.redirect('/resetPage4');
    }

    // Check current password
    if (currentPass.trim() !== currentUser.password.trim()) {
      req.session.msg = { type: "error", text: "Current password is incorrect!" };
      return res.redirect('/resetPage4');
    }

    // Validate new password rules
    const hasUpper = /[A-Z]/.test(createPass);
    const hasSpecial = /[\W_]/.test(createPass);
    const hasNumber = /\d/.test(createPass);
    const longEnough = createPass.length >= 8;

    if (!hasUpper || !hasSpecial || !hasNumber || !longEnough) {
      req.session.msg = { type: "error", text: "New password does not meet requirements!" };
      return res.redirect('/resetPage4');
    }

    // Confirm password match
    if (createPass !== confirmPass) {
      req.session.msg = { type: "error", text: "New password and confirm password do not match!" };
      return res.redirect('/resetPage4');
    }

    // Update password (plaintext)
    currentUser.password = createPass;
    currentUser.reset = null;
    await currentUser.save();
    /*
    req.session.msg = { type: "success", text: "Password updated successfully!" };
    */
    return res.redirect('/acc3');

  } catch (err) {
    console.error(err);
    req.session.msg = { type: "error", text: "Server error!" };
    return res.redirect('/resetPage4');
  }
});


app.post('/rst4FGA', async (req, res) => {
  try {
    if (!req.session.user) {
      return res.redirect('/');
    }

    const userId = req.session.user._id;
    const { currentPass, createPass, confirmPass } = req.body;

    const currentUser = await users.findById(userId);
    if (!currentUser) {
      req.session.msg = { type: "error", text: "User not found!" };
      return res.redirect('/resetPage4');
    }

    // Check current password
    if (currentPass.trim() !== currentUser.password.trim()) {
      req.session.msg = { type: "error", text: "Current password is incorrect!" };
      return res.redirect('/resetPage4');
    }

    // Validate new password rules
    const hasUpper = /[A-Z]/.test(createPass);
    const hasSpecial = /[\W_]/.test(createPass);
    const hasNumber = /\d/.test(createPass);
    const longEnough = createPass.length >= 8;

    if (!hasUpper || !hasSpecial || !hasNumber || !longEnough) {
      req.session.msg = { type: "error", text: "New password does not meet requirements!" };
      return res.redirect('/resetPage4');
    }

    // Confirm password match
    if (createPass !== confirmPass) {
      req.session.msg = { type: "error", text: "New password and confirm password do not match!" };
      return res.redirect('/resetPage4');
    }

    // Update password (plaintext)
    currentUser.password = createPass;
    currentUser.reset = null;
    await currentUser.save();
    /*
    req.session.msg = { type: "success", text: "Password updated successfully!" };
    */
    return res.redirect('/acc3');

  } catch (err) {
    console.error(err);
    req.session.msg = { type: "error", text: "Server error!" };
    return res.redirect('/resetPage4');
  }
});

app.post('/edt2', async (req, res) => {
  try {
    if (!req.session.user?._id) {
      return res.redirect('/');
    }

    const userId = req.session.user._id;
    const { email, phone, address } = req.body;

    // Validate required fields
    if (!email || !phone || !address) {
      req.session.msg = { type: "error", text: "Email, phone, and address are required!" };
      return res.redirect('/acc');
    }

    // Check if email is already used by another user
    const existingUser = await users.findOne({
      email: email.toLowerCase(),
      _id: { $ne: userId }
    });

    if (existingUser) {
      req.session.msg = { type: "error", text: "Email is already in use!" };
      return res.redirect('/acc');
    }

    // Update user
    const updatedUser = await users.findByIdAndUpdate(
      userId,
      { email: email.toLowerCase(), phone, address },
      { new: true }
    );

    req.session.user = updatedUser;

    req.session.msg = { type: "success", text: "Profile updated successfully!" };
    return res.redirect('/acc');

  } catch (err) {
    console.error("Error in /edt2:", err);
    req.session.msg = { type: "error", text: "Server error!" };
    return res.redirect('/acc');
  }
});


app.post('/pht2', isLogin, uploadPhoto.single('photo'), async (req, res) => {
  try {
    if (!req.file) {
      req.session.msg = { type: "error", text: "No photo uploaded!" };
      return res.redirect('/acc');
    }

    const userId = req.session.user._id;
    const photoUrl = req.file.path;

    const updatedUser = await users.findByIdAndUpdate(
      userId,
      { photo: photoUrl },
      { new: true }
    );

    req.session.user = updatedUser;

    req.session.msg = { type: "success", text: "Photo updated successfully!" };
    return res.redirect('/acc');

  } catch (err) {
    console.error(err);
    req.session.msg = { type: "error", text: "Failed to upload photo!" };
    return res.redirect('/acc');
  }
});

app.get('/stu', isLogin, isStudent, (req, res) => {
  res.render('stu', {
    title: 'Students',
    active: 'stu',
    back: '',
    users: req.users
  });
});

app.get('/crt', isLogin, isStudent, (req, res) => {
  const students = req.users.filter(user => user.role === 'Student');

  res.render('stu', {
    title: 'Current',
    active: 'stu',
    back: '',
    users: students
  });
});

app.get('/alm', isLogin, isStudent, (req, res) => {
  const students = req.users.filter(user => user.role === 'Alumni');

  res.render('stu', {
    title: 'Alumni',
    active: 'stu',
    back: '',
    users: students
  });
});

app.get('/frm', isLogin, isStudent, (req, res) => {
  const students = req.users.filter(user => user.role === 'Former');

  res.render('stu', {
    title: 'Former',
    active: 'stu',
    back: '',
    users: students
  });
});


app.get('/stuView/:id', isLogin, isStudent, async (req, res) => {
  try {
  const msg = req.session.msg;
  delete req.session.msg;
    const userId = req.params.id;

    const student = req.users.find(u => u._id.toString() === userId);

    if (!student) {
      return res.status(404).render('stuView', {
        title: 'Students',
        back: 'stu',
        active: 'stu',
        student,   // ✅ add
        error: 'Student not found.',
        user: req.user,
    redirectUrl: req.originalUrl,
    messageSuccess: msg?.type === 'success' ? msg.text : null,
    messagePass: msg?.type === 'error' ? msg.text : null // still pass logged-in user
      });
    }

    res.render('stuView', {
      title: 'Students',
      back: 'stu',
      active: 'stu',
      student,      // the student being viewed
      user: req.user,
    redirectUrl: req.originalUrl,
    messageSuccess: msg?.type === 'success' ? msg.text : null,
    messagePass: msg?.type === 'error' ? msg.text : null // logged-in user
    });

  } catch (err) {
    console.error('❌ Error in /stuView/:id route:', err);
    res.status(500).render('stuView', {
      title: 'Students',
      back: 'stu',
      active: 'stu',
      error: 'Something went wrong while loading the student.',
      user: req.user,
    redirectUrl: req.originalUrl,
    messageSuccess: msg?.type === 'success' ? msg.text : null,
    messagePass: msg?.type === 'error' ? msg.text : null
    });
  }
});

app.get('/stuViewDsb/:id', isLogin, isStudent, async (req, res) => {
  try {
  const msg = req.session.msg;
  delete req.session.msg;
    const userId = req.params.id;

    const student = req.users.find(u => u._id.toString() === userId);

    if (!student) {
      return res.status(404).render('stuView', {
        title: 'Students',
        back: 'dsb',
        active: 'stu',
        student,   // ✅ add
        error: 'Student not found.',
        user: req.user,
    redirectUrl: req.originalUrl,
    messageSuccess: msg?.type === 'success' ? msg.text : null,
    messagePass: msg?.type === 'error' ? msg.text : null // still pass logged-in user
      });
    }

    res.render('stuView', {
      title: 'Students',
      back: 'dsb',
      active: 'stu',
      student,      // the student being viewed
      user: req.user,
    redirectUrl: req.originalUrl,
    messageSuccess: msg?.type === 'success' ? msg.text : null,
    messagePass: msg?.type === 'error' ? msg.text : null // logged-in user
    });

  } catch (err) {
    console.error('❌ Error in /stuView/:id route:', err);
    res.status(500).render('stuView', {
      title: 'Students',
      back: 'dsb',
      active: 'stu',
      error: 'Something went wrong while loading the student.',
      user: req.user,
    redirectUrl: req.originalUrl,
    messageSuccess: msg?.type === 'success' ? msg.text : null,
    messagePass: msg?.type === 'error' ? msg.text : null
    });
  }
});

app.get('/crtView/:id', isLogin, isStudent, async (req, res) => {
  try {
  const msg = req.session.msg;
  delete req.session.msg;
    const userId = req.params.id;

    const student = req.users.find(u => u._id.toString() === userId);

    if (!student) {
      return res.status(404).render('stuView', {
        title: 'Current',
        back: 'crt',
        active: 'stu',
        student,   // ✅ add
        error: 'Student not found.',
        user: req.user,
    redirectUrl: req.originalUrl,
    messageSuccess: msg?.type === 'success' ? msg.text : null,
    messagePass: msg?.type === 'error' ? msg.text : null // still pass logged-in user
      });
    }

    res.render('stuView', {
      title: 'Current',
      back: 'crt',
      active: 'stu',
      student,      // the student being viewed
      user: req.user,
    redirectUrl: req.originalUrl,
    messageSuccess: msg?.type === 'success' ? msg.text : null,
    messagePass: msg?.type === 'error' ? msg.text : null // logged-in user
    });

  } catch (err) {
    console.error('❌ Error in /stuView/:id route:', err);
    res.status(500).render('stuView', {
      title: 'Current',
      back: 'crt',
      active: 'stu',
      error: 'Something went wrong while loading the student.',
      user: req.user,
    redirectUrl: req.originalUrl,
    messageSuccess: msg?.type === 'success' ? msg.text : null,
    messagePass: msg?.type === 'error' ? msg.text : null
    });
  }
});

app.get('/almView/:id', isLogin, isStudent, async (req, res) => {
  try {
  const msg = req.session.msg;
  delete req.session.msg;
    const userId = req.params.id;

    const student = req.users.find(u => u._id.toString() === userId);

    if (!student) {
      return res.status(404).render('stuView', {
      title: 'Alumni',
      back: 'alm',
        active: 'stu',
        student,   // ✅ add
        error: 'Student not found.',
        user: req.user,
    redirectUrl: req.originalUrl,
    messageSuccess: msg?.type === 'success' ? msg.text : null,
    messagePass: msg?.type === 'error' ? msg.text : null // still pass logged-in user
      });
    }

    res.render('stuView', {
      title: 'Alumni',
      back: 'alm',
      active: 'stu',
      student,      // the student being viewed
      user: req.user,
    redirectUrl: req.originalUrl,
    messageSuccess: msg?.type === 'success' ? msg.text : null,
    messagePass: msg?.type === 'error' ? msg.text : null // logged-in user
    });

  } catch (err) {
    console.error('❌ Error in /stuView/:id route:', err);
    res.status(500).render('stuView', {
      title: 'Alumni',
      back: 'alm',
      active: 'stu',
      error: 'Something went wrong while loading the student.',
      user: req.user,
    redirectUrl: req.originalUrl,
    messageSuccess: msg?.type === 'success' ? msg.text : null,
    messagePass: msg?.type === 'error' ? msg.text : null
    });
  }
});

app.get('/frmView/:id', isLogin, isStudent, async (req, res) => {
  try {
  const msg = req.session.msg;
  delete req.session.msg;
    const userId = req.params.id;

    const student = req.users.find(u => u._id.toString() === userId);

    if (!student) {
      return res.status(404).render('stuView', {
      title: 'Former',
      back: 'frm',
        active: 'stu',
        student,   // ✅ add
        error: 'Student not found.',
        user: req.user,
    redirectUrl: req.originalUrl,
    messageSuccess: msg?.type === 'success' ? msg.text : null,
    messagePass: msg?.type === 'error' ? msg.text : null // still pass logged-in user
      });
    }

    res.render('stuView', {
      title: 'Former',
      back: 'frm',
      active: 'stu',
      student,      // the student being viewed
      user: req.user,
    redirectUrl: req.originalUrl,
    messageSuccess: msg?.type === 'success' ? msg.text : null,
    messagePass: msg?.type === 'error' ? msg.text : null // logged-in user
    });

  } catch (err) {
    console.error('❌ Error in /stuView/:id route:', err);
    res.status(500).render('stuView', {
      title: 'Former',
      back: 'frm',
      active: 'stu',  // ✅ add
      error: 'Something went wrong while loading the student.',
      user: req.user,
    redirectUrl: req.originalUrl,
    messageSuccess: msg?.type === 'success' ? msg.text : null,
    messagePass: msg?.type === 'error' ? msg.text : null
    });
  }
});

app.post('/check-pass3', async (req, res) => {
    try {
        const { currentPass, studentId } = req.body;

        if (!studentId) {
            return res.json({ valid: false, error: "Student ID not provided" });
        }

        // Fetch the student by ID
        const student = await users.findById(studentId); // or your students collection

        if (!student) {
            return res.json({ valid: false, error: "Student not found" });
        }

        // Compare password directly (if not hashed)
        const valid = currentPass === student.password;

        res.json({ valid });

    } catch (err) {
        console.error(err);
        res.json({ valid: false, error: "Server error" });
    }
});

app.post('/rst3', async (req, res) => {
  try {
    const { studentId, currentPass, createPass, confirmPass, redirectUrl } = req.body;

    if (!studentId) {
      req.session.msg = { type: "error", text: "Student ID not provided!" };
      return res.redirect(redirectUrl || '/stu');
    }

    const student = await users.findById(studentId);
    if (!student) {
      req.session.msg = { type: "error", text: "Student not found!" };
      return res.redirect(redirectUrl || '/stu');
    }

    if (currentPass.trim() !== student.password.trim()) {
      req.session.msg = { type: "error", text: "Current password is incorrect!" };
      return res.redirect(redirectUrl || '/stu');
    }

    const hasUpper = /[A-Z]/.test(createPass);
    const hasSpecial = /[\W_]/.test(createPass);
    const hasNumber = /\d/.test(createPass);
    const longEnough = createPass.length >= 8;

    if (!hasUpper || !hasSpecial || !hasNumber || !longEnough) {
      req.session.msg = { type: "error", text: "New password does not meet requirements!" };
      return res.redirect(redirectUrl || '/stu');
    }

    if (createPass !== confirmPass) {
      req.session.msg = { type: "error", text: "New password and confirm password do not match!" };
      return res.redirect(redirectUrl || '/stu');
    }

    student.password = createPass;
    await student.save();

    req.session.msg = { type: "success", text: "Password updated successfully!" };
    return res.redirect(redirectUrl || '/stu');

  } catch (err) {
    console.error(err);
    req.session.msg = { type: "error", text: "Server error!" };
    return res.redirect(req.body.redirectUrl || '/stu');
  }
});


app.get('/autoPass3', async (req, res) => {
  try {
    const { studentId, redirectUrl } = req.query;

    if (!studentId) {
      req.session.msg = { type: "error", text: "Student ID not provided!" };
      return res.redirect(redirectUrl || '/stu');
    }

    const student = await users.findById(studentId);
    if (!student) {
      req.session.msg = { type: "error", text: "Student not found!" };
      return res.redirect(redirectUrl || '/stu');
    }

    // Generate random password
    const newPassword = generatePassword();

    // Save new password
    student.password = newPassword;
    await student.save();

    req.session.msg = { 
      type: "success", 
      text: `New password generated!` 
    };

    return res.redirect(redirectUrl || '/stu');

  } catch (err) {
    console.error(err);
    req.session.msg = { type: "error", text: "Server error generating password!" };
    return res.redirect(req.query.redirectUrl || '/stu');
  }
});


app.get('/archive3', async (req, res) => {
  try {
    const { studentId, redirectUrl, suspendIs } = req.query;

    if (!studentId) {
      req.session.msg = { type: "error", text: "User ID not provided!" };
      return res.redirect(redirectUrl || '/stu');
    }

    const student = await users.findById(studentId);
    if (!student) {
      req.session.msg = { type: "error", text: "User not found!" };
      return res.redirect(redirectUrl || '/stu');
    }

    // Set archive and suspend info
    student.archive = true;
    student.suspendAt = new Date();
    student.suspendIs = suspendIs || 'No reason provided';
    await student.save();

    req.session.msg = { 
      type: "success", 
      text: `` 
    };

    return res.redirect('/stuArc');

  } catch (err) {
    console.error(err);
    req.session.msg = { type: "error", text: "Server error archiving user!" };
    return res.redirect(req.query.redirectUrl || '/stu');
  }
});



app.get('/archiveX3', async (req, res) => {
  try {
    const { studentId, redirectUrl, suspendIs } = req.query;

    if (!studentId) {
      req.session.msg = { type: "error", text: "User ID not provided!" };
      return res.redirect(redirectUrl || '/stu');
    }

    const student = await users.findById(studentId);
    if (!student) {
      req.session.msg = { type: "error", text: "User not found!" };
      return res.redirect(redirectUrl || '/stu');
    }

    // Set archive and suspend info
    student.archive = false;
    student.suspendAt = new Date();
    student.suspendIs = suspendIs || 'No reason provided';
    await student.save();

    req.session.msg = { 
      type: "success", 
      text: `` 
    };

    return res.redirect('/stu');

  } catch (err) {
    console.error(err);
    req.session.msg = { type: "error", text: "Server error archiving user!" };
    return res.redirect(req.query.redirectUrl || '/stu');
  }
});


app.post('/edt3', async (req, res) => {
  try {
    const {
      studentId,
      redirectUrl,

      fName,
      mName,
      lName,
      xName,
      email,
      phone,
      address,

      role,
      campus,
      course,
      yearLevel,
      yearAttended,
      yearGraduated,
      schoolId
    } = req.body;

    if (!studentId) {
      req.session.msg = { type: "error", text: "Student ID not provided!" };
      return res.redirect(redirectUrl || '/stu');
    }

    if (!fName || !lName || !email || !phone || !address || !schoolId) {
      req.session.msg = { type: "error", text: "Please fill in all required fields!" };
      return res.redirect(redirectUrl || '/stu');
    }

    // ✔ username MUST be the same as schoolId
    const username = schoolId;

    // ✔ Check username duplication (except the current one)
    const existingUsername = await users.findOne({
      username,
      _id: { $ne: studentId }
    });

    if (existingUsername) {
      req.session.msg = { type: "error", text: "School ID is already used as a username!" };
      return res.redirect(redirectUrl || '/stu');
    }

    // ✔ Check email duplication (except the current one)
    const existingEmail = await users.findOne({
      email: email.toLowerCase(),
      _id: { $ne: studentId }
    });

    if (existingEmail) {
      req.session.msg = { type: "error", text: "Email is already in use!" };
      return res.redirect(redirectUrl || '/stu');
    }

    // Update fields
    const updateData = {
      fName,
      mName,
      lName,
      xName,
      email: email.toLowerCase(),
      phone,
      address,
      role,
      campus,
      course,
      yearLevel,
      yearAttended: yearAttended || "",
      yearGraduated: yearGraduated || "",
      schoolId,
      username // 👈 Automatically applied
    };

    await users.findByIdAndUpdate(studentId, updateData);

    req.session.msg = { type: "success", text: "Profile updated successfully!" };
    return res.redirect(redirectUrl || '/stu');

  } catch (err) {
    console.error(err);
    req.session.msg = { type: "error", text: "Server error!" };
    return res.redirect(req.body.redirectUrl || '/stu');
  }
});



app.post('/pht3', uploadPhoto.single('photo'), async (req, res) => {
  try {
    const { studentId, redirectUrl } = req.body;

    if (!studentId) {
      req.session.msg = { type: "error", text: "Student ID not provided!" };
      return res.redirect(redirectUrl || '/stu');
    }

    if (!req.file) {
      req.session.msg = { type: "error", text: "No photo uploaded!" };
      return res.redirect(redirectUrl || '/stu');
    }

    const photoUrl = req.file.path;
    await users.findByIdAndUpdate(studentId, { photo: photoUrl });

    req.session.msg = { type: "success", text: "Photo updated successfully!" };
    return res.redirect(redirectUrl || '/stu');

  } catch (err) {
    console.error(err);
    req.session.msg = { type: "error", text: "Failed to upload photo!" };
    return res.redirect(req.body.redirectUrl || '/stu');
  }
});



app.get('/stuArc', isLogin, isStuArc, (req, res) => {
  res.render('stuArc', {
    title: 'Students',
    active: 'stu',
    back: 'arc',
    users: req.users
  });
});

app.get('/stuViewArc/:id', isLogin, isStuArc, async (req, res) => {
  try {
  const msg = req.session.msg;
  delete req.session.msg;
    const userId = req.params.id;

    const student = req.users.find(u => u._id.toString() === userId);

    if (!student) {
      return res.status(404).render('stuView', {
        title: 'Students',
        back: 'arc',
        active: 'stu',
        student,   // ✅ add
        error: 'Student not found.',
        user: req.user,
    redirectUrl: req.originalUrl,
    messageSuccess: msg?.type === 'success' ? msg.text : null,
    messagePass: msg?.type === 'error' ? msg.text : null // still pass logged-in user
      });
    }

    res.render('stuView', {
      title: 'Students',
      back: 'arc',
      active: 'stu',
      student,      // the student being viewed
      user: req.user,
    redirectUrl: req.originalUrl,
    messageSuccess: msg?.type === 'success' ? msg.text : null,
    messagePass: msg?.type === 'error' ? msg.text : null // logged-in user
    });

  } catch (err) {
    console.error('❌ Error in /stuView/:id route:', err);
    res.status(500).render('stuView', {
      title: 'Students',
      back: 'arc',
      active: 'stu',
      error: 'Something went wrong while loading the student.',
      user: req.user,
    redirectUrl: req.originalUrl,
    messageSuccess: msg?.type === 'success' ? msg.text : null,
    messagePass: msg?.type === 'error' ? msg.text : null
    });
  }
});


app.get('/cog', isLogin, isDocuments, async (req, res) => {
  try {
    const allDocs = await documents.find({}).sort({ type: 1 });

    // Separate messages in session for each form
    const seedMsg = req.session.seedMsg;
    const docMsg = req.session.docMsg;
    req.session.seedMsg = null;
    req.session.docMsg = null;

    res.render('cog', {
      title: 'Settings',
      active: 'cog',
      documents: allDocs,
      seedUser: req.seedUser,
      seedSuccess: seedMsg?.type === 'success' ? seedMsg.text : null,
      seedError: seedMsg?.type === 'error' ? seedMsg.text : null,
      docSuccess: docMsg?.type === 'success' ? docMsg.text : null,
      docError: docMsg?.type === 'error' ? docMsg.text : null
    });
  } catch (err) {
    console.error(err);
    res.render('cog', {
      title: 'Settings',
      active: 'cog',
      documents: [],
      seedUser: req.seedUser,
      seedSuccess: null,
      seedError: 'Failed to load seed user.',
      docSuccess: null,
      docError: 'Failed to load documents.'
    });
  }
});

app.post('/validate-password', isLogin, async (req, res) => {
  try {
    const { password } = req.body;
    const user = await users.findById(req.session.user._id);

    if (!user || user.password !== password) {
      return res.json({ valid: false });
    }

    res.json({ valid: true });
  } catch (err) {
    console.error(err);
    res.json({ valid: false });
  }
});



app.post('/updateSeed', isSeed, isDocuments, async (req, res) => {
  try {
    const { email, phone, confirmPasswordHidden } = req.body;
    const seedUser = req.seedUser;
    const currentUser = req.session.user;

    if (!seedUser) {
      req.session.seedMsg = { type: 'error', text: 'Data cannot be found!' };
      return res.redirect('/cog');
    }

    // Verify logged-in user's password (plain text)
    const user = await users.findById(currentUser._id);
    if (!user || user.password !== confirmPasswordHidden) {
      req.session.seedMsg = { type: 'error', text: 'Incorrect password! Try Again Later' };
      return res.redirect('/cog');
    }

    // Update seed user info
    seedUser.email = email;
    seedUser.phone = phone;
    await seedUser.save();

    req.session.seedMsg = { type: 'success', text: 'School contact info updated successfully!' };
    res.redirect('/cog');
  } catch (err) {
    console.error('Error updating Seed user:', err);
    req.session.seedMsg = { type: 'error', text: 'Failed to update.' };
    res.redirect('/cog');
  }
});

app.post('/update-documents', isLogin, async (req, res) => {
  try {
    const { docs, confirmPasswordHidden } = req.body;
    const currentUser = req.session.user;

    // Verify logged-in user's password (plain text)
    const user = await users.findById(currentUser._id);
    if (!user || user.password !== confirmPasswordHidden) {
      req.session.docMsg = { type: 'error', text: 'Incorrect password! Try Again Later' };
      return res.redirect('/cog');
    }

    // Update documents
    for (const doc of docs) {
      await documents.findByIdAndUpdate(doc.id, {
        type: doc.type,
        amount: doc.amount,
        days: doc.days
      });
    }

    req.session.docMsg = { type: "success", text: "Documents updated successfully!" };
    res.redirect('/cog');
  } catch (err) {
    console.error(err);
    req.session.docMsg = { type: "error", text: "Failed to update documents!" };
    res.redirect('/cog');
  }
});

app.get('/api/analytics', analyticsMiddleware, (req, res) => {
  res.json(res.locals.analytics);
});

app.get('/dsb', isLogin, analyticsMiddleware, isEmp, (req, res) => {
  if (req.user.reset === true) return res.redirect('/resetPage2');

  const analytics = res.locals.analytics || {};
  res.render('dsb', {
    title: 'Dashboard',
    active: 'dsb',
    analytics
  });
});

app.get('/perf', isLogin, analyticsMiddleware, (req, res) => {
  const analytics = res.locals.analytics || {};
  res.render('perf', {
    title: 'Team Performance',
    active: 'dsb',
    analytics
  });
});


/* Accounting */

app.get('/ovr', isLogin, (req, res) => {
  if (req.user.reset === true) {
    return res.redirect('/resetPage4');
  }
  res.render('ovr', { title: 'Dashboard', active: 'ovr' });
});


app.get('/acc2', isLogin, (req, res) => {
  const msg = req.session.msg;
  delete req.session.msg;

  res.render('acc2', {
    user: req.session.user,
    title: 'Profile',
    active: 'acc2',
    messageSuccess: msg?.type === 'success' ? msg.text : null,
    messagePass: msg?.type === 'error' ? msg.text : null
  });
});

app.post('/rst2A', async (req, res) => {
  try {
    if (!req.session.user) {
      return res.redirect('/');
    }

    const userId = req.session.user._id;
    const { currentPass, createPass, confirmPass } = req.body;

    const currentUser = await users.findById(userId);
    if (!currentUser) {
      req.session.msg = { type: "error", text: "User not found!" };
      return res.redirect('/acc2');
    }

    // Check current password
    if (currentPass.trim() !== currentUser.password.trim()) {
      req.session.msg = { type: "error", text: "Current password is incorrect!" };
      return res.redirect('/acc2');
    }

    // Validate new password rules
    const hasUpper = /[A-Z]/.test(createPass);
    const hasSpecial = /[\W_]/.test(createPass);
    const hasNumber = /\d/.test(createPass);
    const longEnough = createPass.length >= 8;

    if (!hasUpper || !hasSpecial || !hasNumber || !longEnough) {
      req.session.msg = { type: "error", text: "New password does not meet requirements!" };
      return res.redirect('/acc2');
    }

    // Confirm password match
    if (createPass !== confirmPass) {
      req.session.msg = { type: "error", text: "New password and confirm password do not match!" };
      return res.redirect('/acc2');
    }

    // Update password (plaintext)
    currentUser.password = createPass;
    await currentUser.save();

    req.session.msg = { type: "success", text: "Password updated successfully!" };
    return res.redirect('/acc2');

  } catch (err) {
    console.error(err);
    req.session.msg = { type: "error", text: "Server error!" };
    return res.redirect('/acc2');
  }
});


app.post('/rst2FGA', async (req, res) => {
  try {
    if (!req.session.user) {
      return res.redirect('/');
    }

    const userId = req.session.user._id;
    const { currentPass, createPass, confirmPass } = req.body;

    const currentUser = await users.findById(userId);
    if (!currentUser) {
      req.session.msg = { type: "error", text: "User not found!" };
      return res.redirect('/resetPage2');
    }

    // Check current password
    if (currentPass.trim() !== currentUser.password.trim()) {
      req.session.msg = { type: "error", text: "Current password is incorrect!" };
      return res.redirect('/resetPage2');
    }

    // Validate new password rules
    const hasUpper = /[A-Z]/.test(createPass);
    const hasSpecial = /[\W_]/.test(createPass);
    const hasNumber = /\d/.test(createPass);
    const longEnough = createPass.length >= 8;

    if (!hasUpper || !hasSpecial || !hasNumber || !longEnough) {
      req.session.msg = { type: "error", text: "New password does not meet requirements!" };
      return res.redirect('/resetPage2');
    }

    // Confirm password match
    if (createPass !== confirmPass) {
      req.session.msg = { type: "error", text: "New password and confirm password do not match!" };
      return res.redirect('/resetPage2');
    }

    // Update password (plaintext)
    currentUser.password = createPass;
    currentUser.reset = null;
    await currentUser.save();
    /*
    req.session.msg = { type: "success", text: "Password updated successfully!" };
    */
    return res.redirect('/acc');

  } catch (err) {
    console.error(err);
    req.session.msg = { type: "error", text: "Server error!" };
    return res.redirect('/resetPage2');
  }
});

app.post('/edt2A', async (req, res) => {
  try {
    if (!req.session.user?._id) {
      return res.redirect('/');
    }

    const userId = req.session.user._id;
    const { email, phone, address } = req.body;

    // Validate required fields
    if (!email || !phone || !address) {
      req.session.msg = { type: "error", text: "Email, phone, and address are required!" };
      return res.redirect('/acc2');
    }

    // Check if email is already used by another user
    const existingUser = await users.findOne({
      email: email.toLowerCase(),
      _id: { $ne: userId }
    });

    if (existingUser) {
      req.session.msg = { type: "error", text: "Email is already in use!" };
      return res.redirect('/acc2');
    }

    // Update user
    const updatedUser = await users.findByIdAndUpdate(
      userId,
      { email: email.toLowerCase(), phone, address },
      { new: true }
    );

    req.session.user = updatedUser;

    req.session.msg = { type: "success", text: "Profile updated successfully!" };
    return res.redirect('/acc2');

  } catch (err) {
    console.error("Error in /edt2:", err);
    req.session.msg = { type: "error", text: "Server error!" };
    return res.redirect('/acc2');
  }
});


app.post('/pht2A', isLogin, uploadPhoto.single('photo'), async (req, res) => {
  try {
    if (!req.file) {
      req.session.msg = { type: "error", text: "No photo uploaded!" };
      return res.redirect('/acc2');
    }

    const userId = req.session.user._id;
    const photoUrl = req.file.path;

    const updatedUser = await users.findByIdAndUpdate(
      userId,
      { photo: photoUrl },
      { new: true }
    );

    req.session.user = updatedUser;

    req.session.msg = { type: "success", text: "Photo updated successfully!" };
    return res.redirect('/acc2');

  } catch (err) {
    console.error(err);
    req.session.msg = { type: "error", text: "Failed to upload photo!" };
    return res.redirect('/acc2');
  }
});


app.get('/resetPage2', isLogin, myRequest, (req, res) => {
  res.render('resetPage2', { title: 'New Password' });
});


app.get('/trs', isLogin, isRequest, isStaff, (req, res) => {
  const filteredRequests = req.requests.filter(
    rq => rq.status === 'Reviewed' && !rq.declineAt
  );

  res.render('trs', { 
    title: 'For Assessment', 
    active: 'trs', 
    requests: filteredRequests,
    totalCount: filteredRequests.length
  });
});

app.get('/trsAll', isLogin, isRequest, isStaff, (req, res) => {

  const allowedStatuses = [
    'Assessed', 'Claimed', 'Reviewed',
    'For Payment', 'Verified', 'For Release', 'For Verification'
  ];

  const filteredRequests = req.requests.filter(
    rq => allowedStatuses.includes(rq.status) && !rq.declineAt
  );

  res.render('trsAll', { 
    title: 'All Transactions',
    active: 'trs',
    requests: filteredRequests,
    totalCount: filteredRequests.length
  });
});

app.get('/toPay', isLogin, isRequest, isStaff, (req, res) => {
  const statuses = ['For Verification', 'Assessed'];

  const filteredRequests = req.requests.filter(
    rq => statuses.includes(rq.status) && !rq.declineAt
  );

  res.render('trs', { 
    title: 'For Payment', 
    active: 'trs', 
    requests: filteredRequests,
    totalCount: filteredRequests.length
  });
});


app.get('/ver', isLogin, isRequest, isStaff, (req, res) => {
  const filteredRequests = req.requests.filter(
    rq => rq.status === 'Verified' && !rq.declineAt
  );

  res.render('trs', { 
    title: 'Verified', 
    active: 'trs', 
    requests: filteredRequests,
    totalCount: filteredRequests.length
  });
});


async function renderAssess(req, res, backRoute, viewName = 'trsView') {
  try {
    const requestId = req.params.id;

    // Find the request
    const rq = req.requests.find(r => r._id.toString() === requestId);

    if (!rq) {
      return res.status(404).render(viewName, { 
        title: 'Request Not Found', 
        back: backRoute,
        active: 'trs',
        error: 'Request not found.' 
      });
    }

    // Find all items for this request
    const rqItems = rq.items || []; // assuming req.requests contains items array

    // Filter approved items
    const approvedItems = rqItems.filter(it => it.status === "Approved" || it.status === "Pending");

    // Calculate totalAmount
    let totalAmount = 0;
    if (approvedItems.length > 0) {
      for (const it of approvedItems) {
        // Find document that matches this item type
        const doc = req.documents.find(d => d.type === it.type);
        if (doc) totalAmount += doc.amount * it.qty;
      }
    }

    res.render(viewName, { 
      title: 'Request Details',
      back: backRoute,
      active: 'trs',
      request: rq,
      items: rqItems,
      totalAmount
    });
    
  } catch (err) {
    console.error(`❌ Error in /${backRoute}/:id route:`, err);
    res.status(500).render(viewName, { 
      title: 'Error', 
      back: backRoute,
      active: 'trs',
      error: 'Something went wrong while loading the request.' 
    });
  }
}

// Then your routes become:
app.get('/trsView/:id', isLogin, isRequest, isStaff, (req, res) => renderAssess(req, res, 'trs'));
app.get('/trsAllView/:id', isLogin, isRequest, isStaff, (req, res) => renderAssess(req, res, 'trsAll'));
app.get('/toPayView/:id', isLogin, isRequest, isStaff, (req, res) => renderAssess(req, res, 'toPay'));
app.get('/verView/:id', isLogin, isRequest, isStaff, (req, res) => renderAssess(req, res, 'ver'));


app.post("/hold4", async (req, res) => {
    const { requestId, back, requestRemarks } = req.body;

    try {
        // Find the request
        const requestDoc = await requests.findById(requestId);
        if (!requestDoc) return res.status(404).send("Request not found");

        requestDoc.declineAt = null;
        requestDoc.holdAt = new Date();
        requestDoc.remarks = requestRemarks || "";

        await requestDoc.save();

        // Redirect to correct view
        const viewRoutes = {
            trs: `/trsView/${requestId}`,
            toPay: `/toPayView/${requestId}`,
            ver: `/verView/${requestId}`,
        };

        res.redirect(viewRoutes[back] || `/trsView/${requestId}`);

    } catch (err) {
        console.error("Hold Error:", err);
        res.status(500).send("Server error");
    }
});

app.post("/revert4", async (req, res) => {
    const { requestId, back } = req.body;

    try {
        // Find the request
        const requestDoc = await requests.findById(requestId);
        if (!requestDoc) return res.status(404).send("Request not found");

        requestDoc.declineAt = null;
        requestDoc.holdAt = null;

        await requestDoc.save();

        // Redirect to correct view
        const viewRoutes = {
            trs: `/trsView/${requestId}`,
            toPay: `/toPayView/${requestId}`,
            ver: `/verView/${requestId}`,
        };

        res.redirect(viewRoutes[back] || `/trsView/${requestId}`);

    } catch (err) {
        console.error("Hold Error:", err);
        res.status(500).send("Server error");
    }
});

app.post("/approve4", async (req, res) => {
    const { requestId, back } = req.body;

    try {
        // Find the request
        const requestDoc = await requests.findById(requestId);
        if (!requestDoc) return res.status(404).send("Request not found");

        requestDoc.status = "Assessed";
        requestDoc.declineAt = null;
        requestDoc.holdAt = null;
        requestDoc.assessAt = new Date();

        await requestDoc.save();

        // Redirect to correct view
        const viewRoutes = {
            trs: `/trsView/${requestId}`,
            toPay: `/toPayView/${requestId}`,
            ver: `/verView/${requestId}`,
        };

        res.redirect(viewRoutes[back] || `/trsView/${requestId}`);

    } catch (err) {
        console.error("Hold Error:", err);
        res.status(500).send("Server error");
    }
});

app.post("/verify4", async (req, res) => {
    const { requestId, back } = req.body;

    try {
        // Find the request
        const requestDoc = await requests.findById(requestId);
        if (!requestDoc) return res.status(404).send("Request not found");

        requestDoc.status = "Verified";
        requestDoc.declineAt = null;
        requestDoc.holdAt = null;
        requestDoc.verifyAt = new Date();

        await requestDoc.save();

        // Redirect to correct view
        const viewRoutes = {
            trs: `/trsView/${requestId}`,
            toPay: `/toPayView/${requestId}`,
            ver: `/verView/${requestId}`,
        };

        res.redirect(viewRoutes[back] || `/trsView/${requestId}`);

    } catch (err) {
        console.error("Hold Error:", err);
        res.status(500).send("Server error");
    }
});

app.post("/hold5", async (req, res) => {
    const { requestId, back, requestRemarks } = req.body;

    try {
        // Find the request
        const requestDoc = await requests.findById(requestId);
        if (!requestDoc) return res.status(404).send("Request not found");

        requestDoc.declineAt = null;
        requestDoc.payPhoto = null;
        requestDoc.holdAt = new Date();
        requestDoc.remarks = requestRemarks || "";

        await requestDoc.save();

        // Redirect to correct view
        const viewRoutes = {
            trs: `/trsView/${requestId}`,
            toPay: `/toPayView/${requestId}`,
            ver: `/verView/${requestId}`,
        };

        res.redirect(viewRoutes[back] || `/trsView/${requestId}`);

    } catch (err) {
        console.error("Hold Error:", err);
        res.status(500).send("Server error");
    }
});


app.use((req, res) => {
  res.status(404);
  res.locals.error = 'Oops! Page cannot be found!';
  console.log(`404 triggered: ${res.locals.error}`);
  res.render('index', { title: 'Invalid URL' });
});

app.use((err, req, res, next) => {
  console.error('⚠️ Error occurred:', err.message);
  res.locals.error = 'Oh no! Page is missing!';
  res.status(500).render('index', { 
    title: 'File Missing',
    message: `OH NO! File in Directory is missing!' ${err.message}`,
    error: 'OH NO! File in Directory is missing!'
  });
});

// Sumakses ka dyan boy!
app.listen(PORT, () => {
  console.log(`🚀 Kudos Supreme Ferry! Running at http://localhost:${PORT}`);
});
