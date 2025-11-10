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

const isLogin = require('./middleware/isLogin');
const isRequest = require('./middleware/isRequest');
const myRequest = require('./middleware/myRequest');
const isRatings = require('./middleware/isRatings');

const users = require('./model/user');
const requests = require('./model/request');
const Ratings = require('./model/Rating');

const app = express();
const PORT = process.env.PORT || 3000;

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
    async function ensureUserExists(username, role, password = '@admin2025', access = 1) {
      let user = await users.findOne({ username });
      if (user) {
        console.log(`User "${username}" already exists.`);
        return user;
      }

      const baseData = {
        fName: username,
        mName: '',
        lName: 'Account',
        xName: '',
        archive: false,
        verify: false,
        suspend: false,
        email: `${username.toLowerCase()}.au@phinmaed.com`,
        phone: '',
        address: '',
        bDay: 1,
        bMonth: 1,
        bYear: 2000,
        campus: '',
        schoolId: '',
        yearLevel: '',
        photo: '',
        vId: '',
        username: username,
        password: password,
        role: role,
        access: access,
      };

      const doc = await users.create(baseData);
      console.log(`${role} testing account "${username}" created!`);
      return doc;
    }

    await ensureUserExists('Head', 'Head', '@admin2025', 1);
    await ensureUserExists('Admin', 'Admin', '@admin2025', 1);
    await ensureUserExists('Student', 'Student', '@student2025', 0);

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


app.get('/dsb', isLogin, (req, res) => {
  res.render('dsb', { title: 'Dashboard' });
});

app.get('/hom', isLogin, myRequest, (req, res) => {
  res.render('hom', { title: 'Home' });
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
    error: 'OH NO! File in Directory is missing!'
  });
});

// Sumakses ka dyan boy!
app.listen(PORT, () => {
  console.log(`🚀 Kudos Supreme Ferry! Running at http://localhost:${PORT}`);
});
