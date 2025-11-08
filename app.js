require('dotenv').config();
const express = require('express');
const path = require('path');
const morgan = require('morgan');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoDBStore = require('connect-mongodb-session')(session);
const engine = require('ejs-mate');

const isLogin = require('./middleware/isLogin');
const isRequest = require('./middleware/isRequest');

const users = require('./model/user');
const requests = require('./model/request');

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
  maxAge: '7d',
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

// ================== ROUTES ==================
app.get('/', async (req, res) => {
  try {
    // Helper to ensure a user exists
    async function ensureUserExists(username, role) {
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
        password: '@admin2025', // not hashed
        role: role,
        access: 1,
      };

      const doc = await users.create(baseData);
      console.log(`Created ${role} account "${username}"`);
      return doc;
    }

    // Ensure Head exists
    await ensureUserExists('Head', 'Head');

    // Ensure Admin exists
    await ensureUserExists('Admin', 'Admin');

    // Render the main page
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
        title: 'AUDRESv25',   // always include title
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


app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) console.error(err);
    res.redirect('/');
  });
});

app.get('/dsb', isLogin, (req, res) => {
  res.render('dsb', { title: 'Dashboard' });
});

app.get('/hom', isLogin, (req, res) => {
  res.render('hom', { title: 'Home' });
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
