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

const isLogin = require('./middleware/isLogin');
const isRequest = require('./middleware/isRequest');
const myRequest = require('./middleware/myRequest');
const isRatings = require('./middleware/isRatings');
const isSeed = require('./middleware/isSeed');
const isDocuments = require('./middleware/isDocuments');
const isStaff = require('./middleware/isStaff');
const isEmp = require('./middleware/isEmp');

const users = require('./model/user');
const requests = require('./model/request');
const Ratings = require('./model/Rating');
const documents = require('./model/document');
const { isWeakMap } = require('util/types');

const app = express();
const PORT = process.env.PORT;

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

app.use(session({
  secret: process.env.SESSION_SECRET || 'ferry2025',
  resave: false,
  saveUninitialized: false,
  store: store,
  cookie: { 
    maxAge: 1000 * 60 * 60 * 24 // para matic isang araw lang
  }
}));

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

// Global variables na ipapasok sa lahat ng page
app.use((req, res, next) => {
  // Transfer any session messages to res.locals (so they show in EJS)
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
const upload = multer({ storage });

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
const uploadPhoto = multer({ storage: photoStorage });

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

// ================== ROUTES ==================

app.get('/', isRatings, async (req, res) => {
  try {
    async function ensureUserExists(username, role, password = 'all456', access = 1, custom = {}) {
      let user = await users.findOne({ username });
      if (user) {
        console.log(`User "${username}" already exists.`);
        return user;
      }

      const baseData = {
        fName: username,
        mName: 'Reyes',
        lName: 'Santos',
        xName: 'III',
        archive: false,
        verify: false,
        suspend: false,
        email: `${username.toLowerCase()}.au@phinmaed.com`,
        phone: '09001234567',
        address: 'Cabanatuan City',
        bDay: 1,
        bMonth: 1,
        bYear: 2000,
        campus: 'South',
        schoolId: '001',
        yearLevel: 'Second Year',
        photo: '',
        vId: '',
        username,
        password,
        role,
        access,
        ...custom
      };

      const doc = await users.create(baseData);
      console.log(`${role} testing account "${username}" created!`);
      return doc;
    }

    await ensureUserExists('Head', 'Head', 'all456', 1);
    await ensureUserExists('Admin', 'Admin', 'all456', 1);
    await ensureUserExists('Student', 'Student', 'all456', 0);
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
      return res.redirect('/dsb');
    } else {
      return res.redirect('/hom');
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

app.post('/reqDirect', cpUpload, async (req, res) => {
  try {
    const {
      firstName, middleName, lastName, extName,
      address, number, email, bDay, bMonth, bYear,
      role, campus, studentNo, yearLevel, course,
      schoolYear, semester, type, purpose, qty,
      yearGraduated, yearAttended
    } = req.body;

        // 1️⃣ Check for existing email
    const existingEmail = await users.findOne({ email: email.toLowerCase() });
    if (existingEmail) {
      return res.render('index', { error: 'Email is already used by an existing account!', title: "AUDRESv25" });
    }

    // 2️⃣ Check for existing student number (only if role is Student)
    if (role === 'Student' && studentNo) {
      const existingStudent = await users.findOne({ schoolId: studentNo });
      if (existingStudent) {
        return res.render('index', { error: 'Student Number is already registered!', title: "AUDRESv25" });
      }
    }

    // Find vId file from req.files
    const vIdFile = req.files.find(f => f.fieldname === 'vId');
    let vIdUrl = null;
    if (vIdFile) {
      const result = await cloudinary.uploader.upload(vIdFile.path, { folder: 'user_vIds' });
      vIdUrl = result.secure_url;
    }

    // Convert month to number
    const monthMap = {
      January: 1, February: 2, March: 3, April: 4, May: 5, June: 6,
      July: 7, August: 8, September: 9, October: 10, November: 11, December: 12
    };
    const bMonthNum = monthMap[bMonth] || null;

    // Create new user
    const newUser = new users({
      fName: firstName,
      mName: middleName,
      lName: lastName,
      xName: extName,
      address,
      phone: number,
      email,
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

    // Filter request photos
    const reqPhotos = req.files.filter(f => f.fieldname === 'reqPhoto[]');
    const reqPhotoUrlsMap = await Promise.all(
      reqPhotos.map(async file => {
        if (!file.path) return null;
        const result = await cloudinary.uploader.upload(file.path, { folder: 'request_photos' });
        return result.secure_url;
      })
    );

    // Normalize fields into arrays
    const typesArr = Array.isArray(type) ? type : [type];
    const purposesArr = Array.isArray(purpose) ? purpose : [purpose];
    const qtyArr = Array.isArray(qty) ? qty : [qty];
    const schoolYearsArr = Array.isArray(schoolYear) ? schoolYear : [schoolYear];
    const semestersArr = Array.isArray(semester) ? semester : [semester];

    // Build request documents
    const requestDocs = typesArr.map((t, i) => {
      const lastTwo = savedUser._id.toString().slice(-2);
      const seq = String(i + 1).padStart(3, '0');
      const monthNum = bMonthNum || new Date().getMonth() + 1;
      const tr = `AU25-${monthNum}${lastTwo}${seq}`;
      
      return {
        requestBy: savedUser._id,
        type: t,
        purpose: purposesArr[i],
        qty: qtyArr[i],
        schoolYear: schoolYearsArr[i] || '',
        semester: semestersArr[i] || '',
        proof: reqPhotoUrlsMap[i] || null,
        archive: true,
        verify: true,
        status: "Pending",
        tr
      };
    });

    await requests.insertMany(requestDocs);

    res.redirect('/regSuccess');
  } catch (err) {
    console.error(err);
    res.render('index', { error: 'You entered invalid or duplicate information!', title: "AUDRESv25" });
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

app.get('/req', isLogin, (req, res) => {
  res.render('req', { title: 'Request Form' });
});

app.post('/reqDoc', cpUpload, async (req, res) => {
  try {
    // Ensure user is logged in
    if (!req.session?.user?._id) {
      return res.render('req', { 
        error: 'You must be logged in to submit a request!',
        title: "AUDRESv25"
      });
    }

    const { type, purpose, qty, schoolYear, semester } = req.body;

    // Filter request photos
    const reqPhotos = req.files.filter(f => f.fieldname === 'reqPhoto[]');
    const reqPhotoUrlsMap = await Promise.all(
      reqPhotos.map(async file => {
        if (!file.path) return null;
        const result = await cloudinary.uploader.upload(file.path, { folder: 'request_photos' });
        return result.secure_url;
      })
    );

    // Normalize fields into arrays
    const typesArr = Array.isArray(type) ? type : [type];
    const purposesArr = Array.isArray(purpose) ? purpose : [purpose];
    const qtyArr = Array.isArray(qty) ? qty : [qty];
    const schoolYearsArr = Array.isArray(schoolYear) ? schoolYear : [schoolYear];
    const semestersArr = Array.isArray(semester) ? semester : [semester];

    // Build request documents with TR code
    const requestDocs = typesArr.map((t, i) => {
      // Last two characters from requestBy id
      const userIdStr = req.session.user._id.toString();
      const lastTwo = userIdStr.slice(-2);

      // Sequence number padded to 3 digits
      const seq = String(i + 1).padStart(3, '0');

      // Current month for TR code
      const monthNum = new Date().getMonth() + 1; // 1-12

      // Generate TR code
      const tr = `AU25-${monthNum}${lastTwo}${seq}`;

      return {
        requestBy: req.session.user._id,
        type: t,
        purpose: purposesArr[i],
        qty: qtyArr[i],
        schoolYear: schoolYearsArr[i] || '',
        semester: semestersArr[i] || '',
        proof: reqPhotoUrlsMap[i] || null,
        archive: false,
        verify: false,
        status: "Pending",
        tr // transaction code
      };
    });

    await requests.insertMany(requestDocs);

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
  res.render('prf', { 
    title: 'Profile',
    user: req.session.user,
    messagePass: '',
    messageSuccess: ''
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
            return res.redirect('/login');
        }

        const userId = req.session.user._id;
        const { currentPass, createPass, confirmPass } = req.body;

        const currentUser = await users.findById(userId);
        if (!currentUser) {
            return res.render('prf', { user: req.session.user, messagePass: "User not found!", title: "Profile" });
        }

        // Check current password
        if (currentPass.trim() !== currentUser.password.trim()) {
            return res.render('prf', { user: req.session.user, messagePass: "Current password is incorrect!", title: "Profile" });
        }

        // Validate new password rules
        const hasUpper = /[A-Z]/.test(createPass);
        const hasSpecial = /[\W_]/.test(createPass);
        const hasNumber = /\d/.test(createPass);
        const longEnough = createPass.length >= 8;

        if (!hasUpper || !hasSpecial || !hasNumber || !longEnough) {
            return res.render('prf', { user: req.session.user, messagePass: "New password does not meet requirements!", title: "Profile" });
        }

        // Confirm password match
        if (createPass !== confirmPass) {
            return res.render('prf', { user: req.session.user, messagePass: "New password and confirm password do not match!", title: "Profile" });
        }

        // Update password (plaintext)
        currentUser.password = createPass;
        await currentUser.save();

        return res.render('prf', { user: req.session.user, messagePass: "Password updated successfully!", title: "Profile", messageSuccess: "Password updated successfully!" });

    } catch (err) {
        console.error(err);
        return res.render('prf', { user: req.session.user, messagePass: "Server error!", title: "Profile" });
    }
});

app.post('/edt', async (req, res) => {
  try {
    // Ensure user is logged in
    if (!req.session.user?._id) {
      return res.redirect('/lg'); // redirect to login if not logged in
    }

    const userId = req.session.user._id;
    const { email, phone, address } = req.body;

    // Validate inputs
    if (!email || !phone || !address) {
      return res.render('prf', {
        user: req.session.user,
        messagePass: 'Email and phone are required!',
        messageSuccess: '',
        title: 'Profile'
      });
    }

    // Check if email is already used by another user
    const existingUser = await users.findOne({ email: email.toLowerCase(), _id: { $ne: userId } });
    if (existingUser) {
      return res.render('prf', {
        user: req.session.user,
        messagePass: 'Email is already in use!',
        messageSuccess: '',
        title: 'Profile'
      });
    }

    // Update user in DB
    const updatedUser = await users.findByIdAndUpdate(
      userId,
      { email: email.toLowerCase(), phone, address },
      { new: true }
    );

    // Update session user data
    req.session.user = updatedUser;

    return res.render('prf', {
      user: updatedUser,
      messagePass: '',
      messageSuccess: 'Profile updated successfully!',
      title: 'Profile'
    });

  } catch (err) {
    console.error('Error in /edt:', err);
    return res.render('prf', {
      user: req.session.user,
      messagePass: 'Server error!',
      messageSuccess: '',
      title: 'Profile'
    });
  }
});

app.post('/pht', isLogin, uploadPhoto.single('photo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.render('prf', { 
        user: req.session.user, 
        messagePass: 'No photo uploaded!', 
        title: 'Profile' 
      });
    }

    const userId = req.session.user._id;
    const photoUrl = req.file.path; // Cloudinary URL

    // Update user's photo in DB
    const updatedUser = await users.findByIdAndUpdate(
      userId,
      { photo: photoUrl },
      { new: true }
    );

    // Update session data
    req.session.user = updatedUser;

    // Success message
    return res.render('prf', { 
      user: req.session.user, 
      messageSuccess: 'Photo updated successfully!', 
      title: 'Profile' 
    });

  } catch (err) {
    console.error('Error uploading photo:', err);
    return res.render('prf', { 
      user: req.session.user, 
      messagePass: 'Failed to upload photo!', 
      title: 'Profile' 
    });
  }
});


app.get('/hom', isLogin, myRequest, (req, res) => {
  res.render('hom', { title: 'Home' });
});


app.get('/reqView/:id', isLogin, async (req, res) => {
  try {
    const rq = await requests.findById(req.params.id)
      .populate('requestBy')
      .populate('processBy')
      .populate('releaseBy');

    if (!rq) {
      return res.status(404).render('404', { title: 'Request Not Found' });
    }

    res.render('reqView', { 
      title: 'View Request',
      rq,
      back: 'Home'
    });

  } catch (err) {
    console.error('❗ Error loading request:', err);
    res.status(500).render('index', { 
      title: 'Error',
      error: 'Internal Server Error',
      back: 'Home'
    });
  }
});

app.get('/reqView2/:id', isLogin, async (req, res) => {
  try {
    const rq = await requests.findById(req.params.id)
      .populate('requestBy')
      .populate('processBy')
      .populate('releaseBy');

    if (!rq) {
      return res.status(404).render('404', { title: 'Request Not Found' });
    }

    res.render('reqView', { 
      title: 'View Request',
      rq,
      back: 'Req'
    });

  } catch (err) {
    console.error('❗ Error loading request:', err);
    res.status(500).render('index', { 
      title: 'Error',
      error: 'Internal Server Error',
      back: 'Req'
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

app.post('/paymentUpload', isLogin, uploadPhoto.single('payPhoto'), async (req, res) => {
  try {
    const requestId = req.body.id;

    if (!req.file) {
      const rq = await requests.findById(requestId)
        .populate('requestBy')
        .populate('processBy')
        .populate('releaseBy');

      return res.render('reqView', { 
        title: 'View Request',
        rq,
        messagePass: 'No photo uploaded!'
      });
    }

    const payMode = req.body.payMode;
    const payPhoto = req.file.path; // Cloudinary URL

    // Update the request
    await requests.findByIdAndUpdate(
      requestId,
      {
        payMode,
        payPhoto,
        regStatus: 'For Verification'    // ✅ updated as requested
      }
    );

    const rq = await requests.findById(requestId)
      .populate('requestBy')
      .populate('processBy')
      .populate('releaseBy');

    return res.render('reqView', { 
      title: 'View Request',
      rq,
      messageSuccess: 'Payment uploaded successfully!'
    });

  } catch (err) {
    console.error('Payment Upload Error:', err);

    const requestId = req.body.id;
    const rq = await requests.findById(requestId)
      .populate('requestBy')
      .populate('processBy')
      .populate('releaseBy');

    return res.render('reqView', { 
      title: 'View Request',
      rq,
      messagePass: 'Failed to upload payment!'
    });
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



app.get('/srv', isLogin, isRequest, isStaff, (req, res) => {
  // Pending transactions
  const filteredRequests = req.requests.filter(
    rq => rq.status === 'Pending' && !rq.declineAt
  );
  res.render('srv', { 
    title: 'Transactions', 
    active: 'srv', 
    requests: filteredRequests,
    totalCount: filteredRequests.length
  });
});

app.get('/vrf', isLogin, isRequest, isStaff, (req, res) => {
  // To Verify
  const filteredRequests = req.requests.filter(
    rq => rq.status === 'To Verify' && !rq.declineAt
  );
  res.render('srv', { 
    title: 'To Verify', 
    active: 'srv', 
    requests: filteredRequests,
    totalCount: filteredRequests.length
  });
});

app.get('/prc', isLogin, isRequest, isStaff, (req, res) => {
  // Processing statuses
  const processingStatuses = [
    'Reviewed',
    'Assessed',
    'For Verification',
    'For Payment'
  ];
  const filteredRequests = req.requests.filter(
    rq => processingStatuses.includes(rq.status) && !rq.declineAt
  );
  res.render('srv', { 
    title: 'Processing', 
    active: 'srv', 
    requests: filteredRequests,
    totalCount: filteredRequests.length
  });
});

app.get('/apr', isLogin, isRequest, isStaff, (req, res) => {
  // Approved
  const filteredRequests = req.requests.filter(
    rq => rq.status === 'Verified' && !rq.declineAt
  );
  res.render('srv', { 
    title: 'Approved', 
    active: 'srv', 
    requests: filteredRequests,
    totalCount: filteredRequests.length
  });
});

app.get('/rel', isLogin, isRequest, isStaff, (req, res) => {
  // For Release
  const filteredRequests = req.requests.filter(
    rq => rq.status === 'For Release' && !rq.declineAt
  );
  res.render('srv', { 
    title: 'For Release', 
    active: 'srv', 
    requests: filteredRequests,
    totalCount: filteredRequests.length
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

app.get('/srvView/:id', isLogin, isRequest, isStaff, async (req, res) => {
  try {
    const requestId = req.params.id;

    // find the request by ID and populate necessary fields
    const rq = req.requests.find(r => r._id.toString() === requestId);

    if (!rq) {
      return res.status(404).render('srvView', { 
        title: 'Request Not Found', 
        back: 'srv',
        active: 'srv',
        error: 'Request not found.' 
      });
    }

    res.render('srvView', { 
      title: 'Request Details',
      back: 'srv',
      active: 'srv',
      request: rq 
    });
  } catch (err) {
    console.error('❌ Error in /srvView/:id route:', err);
    res.status(500).render('srvView', { 
      title: 'Error', 
      back: 'srv',
      active: 'srv',
      error: 'Something went wrong while loading the request.' 
    });
  }
});

app.get('/prcView/:id', isLogin, isRequest, isStaff, async (req, res) => {
  try {
    const requestId = req.params.id;

    // find the request by ID and populate necessary fields
    const rq = req.requests.find(r => r._id.toString() === requestId);

    if (!rq) {
      return res.status(404).render('srvView', { 
        title: 'Request Not Found', 
        back: 'prc',
        active: 'srv',
        error: 'Request not found.' 
      });
    }

    res.render('srvView', { 
      title: 'Request Details',
      back: 'prc',
      active: 'srv',
      request: rq 
    });
  } catch (err) {
    console.error('❌ Error in /srvView/:id route:', err);
    res.status(500).render('srvView', { 
      title: 'Error', 
      back: 'prc',
      active: 'srv',
      error: 'Something went wrong while loading the request.' 
    });
  }
});

app.get('/relView/:id', isLogin, isRequest, isStaff, async (req, res) => {
  try {
    const requestId = req.params.id;

    // find the request by ID and populate necessary fields
    const rq = req.requests.find(r => r._id.toString() === requestId);

    if (!rq) {
      return res.status(404).render('srvView', { 
        title: 'Request Not Found', 
        back: 'rel',
        active: 'srv',
        error: 'Request not found.' 
      });
    }

    res.render('srvView', { 
      title: 'Request Details',
      back: 'rel',
      active: 'srv',
      request: rq 
    });
  } catch (err) {
    console.error('❌ Error in /srvView/:id route:', err);
    res.status(500).render('srvView', { 
      title: 'Error', 
      back: 'rel',
      active: 'srv',
      error: 'Something went wrong while loading the request.' 
    });
  }
});

app.get('/aprView/:id', isLogin, isRequest, isStaff, async (req, res) => {
  try {
    const requestId = req.params.id;

    // find the request by ID and populate necessary fields
    const rq = req.requests.find(r => r._id.toString() === requestId);

    if (!rq) {
      return res.status(404).render('srvView', { 
        title: 'Request Not Found', 
        back: 'apr',
        active: 'srv',
        error: 'Request not found.' 
      });
    }

    res.render('srvView', { 
      title: 'Request Details',
      back: 'apr',
      active: 'srv',
      request: rq 
    });
  } catch (err) {
    console.error('❌ Error in /srvView/:id route:', err);
    res.status(500).render('srvView', { 
      title: 'Error', 
      back: 'apr',
      active: 'srv',
      error: 'Something went wrong while loading the request.' 
    });
  }
});

app.get('/vrfView/:id', isLogin, isRequest, isStaff, async (req, res) => {
  try {
    const requestId = req.params.id;

    // find the request by ID and populate necessary fields
    const rq = req.requests.find(r => r._id.toString() === requestId);

    if (!rq) {
      return res.status(404).render('srvView', { 
        title: 'Request Not Found', 
        back: 'apr',
        active: 'srv',
        error: 'Request not found.' 
      });
    }

    res.render('srvView', { 
      title: 'Request Details',
      back: 'vrf',
      active: 'srv',
      request: rq 
    });
  } catch (err) {
    console.error('❌ Error in /srvView/:id route:', err);
    res.status(500).render('srvView', { 
      title: 'Error', 
      back: 'vrf',
      active: 'srv',
      error: 'Something went wrong while loading the request.' 
    });
  }
});



app.get('/emp', isLogin, isEmp, (req, res) => {
  res.render('emp', { title: 'Employees', active: 'emp' });
});

app.get('/dsb', isLogin, (req, res) => {
  res.render('dsb', { title: 'Dashboard', active: 'dsb' });
});

app.get('/stu', isLogin, (req, res) => {
  res.render('stu', { title: 'Students', active: 'stu' });
});


app.get('/cog', isLogin, (req, res) => {
  res.render('cog', { title: 'Settings', active: 'cog' });
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
