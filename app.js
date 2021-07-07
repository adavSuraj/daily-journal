require('dotenv').config();
const express = require('express');
const ejs = require('ejs');
const _ = require('lodash');
const mongoose = require('mongoose');
const session = require('express-session');
const passport = require('passport');
const passportLocalMongoose = require('passport-local-mongoose');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const findOrCreate = require('mongoose-findorcreate');
const app = express();
const ObjectId = require('mongodb').ObjectId;

app.set('view engine', 'ejs');

app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

app.use(
  session({
    secret: process.env.SECRET,
    resave: false,
    saveUninitialized: false,
  })
);

app.use(passport.initialize());
app.use(passport.session());

const CONNECTION_URL = process.env.MONGO_URI;
const PORT = process.env.PORT || 3000;

mongoose
  .connect(CONNECTION_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() =>
    app.listen(PORT, () => console.log(`Server started on port ${PORT}`))
  )
  .catch((error) => console.log(error.message));

const postSchema = {
  postTitle: String,
  content: String,
};

const userSchema = new mongoose.Schema(
  {
    googleId: {
      type: String,
      required: false,
      default: null,
    },
    email: String,
    password: String,
    posts: [postSchema],
  },
  { autoIndex: false }
);

userSchema.plugin(passportLocalMongoose);
userSchema.plugin(findOrCreate);

const User = mongoose.model('User', userSchema);

passport.use(User.createStrategy());

passport.serializeUser(function (user, done) {
  done(null, user.id);
});

passport.deserializeUser(function (id, done) {
  User.findById(id, function (err, user) {
    done(err, user);
  });
});

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.CLIENT_ID,
      clientSecret: process.env.CLIENT_SECRET,
      callbackURL: 'http://localhost:3000/auth/google/journal',
      userProfileURL: 'https://www.googleapis.com/oauth2/v3/userinfo',
    },
    function (accessToken, refreshToken, profile, cb) {
      User.findOrCreate({ googleId: profile.id }, function (err, user) {
        return cb(err, user);
      });
    }
  )
);

app.get('/gettingStarted', function (req, res) {
  res.render('gettingStarted');
});

app.get(
  '/auth/google',
  passport.authenticate('google', { scope: ['profile'] })
);

app.get(
  '/auth/google/journal',
  passport.authenticate('google', { failureRedirect: '/login' }),
  function (req, res) {
    res.redirect('/');
  }
);

app.get('/', function (req, res) {
  if (req.isAuthenticated()) {
    const o_id = ObjectId(req.user._id);
    User.findById({ _id: o_id }, function (err, userDetails) {
      if (err) {
        console.log(err);
        res.status(404);
      } else {
        res.render('home', {
          posts: userDetails.posts,
        });
      }
    });
  } else {
    res.redirect('/gettingStarted');
  }
});

app.get('/about', function (req, res) {
  if (req.isAuthenticated()) {
    res.render('about');
  } else {
    res.redirect('/gettingStarted');
  }
});

app.get('/compose', function (req, res) {
  if (req.isAuthenticated()) {
    res.render('compose');
  } else {
    res.redirect('/gettingStarted');
  }
});

app.get('/login', function (req, res) {
  res.render('login');
});

app.get('/register', function (req, res) {
  res.render('register');
});

app.get('/posts/:postId', function (req, res) {
  if (req.isAuthenticated()) {
    const o_id = ObjectId(req.user._id);
    const requestedId = req.params.postId;
    User.findById({ _id: o_id }, function (err, userDetails) {
      if (err) {
        console.log(err);
        res.status(404);
      } else {
        let foundPost = userDetails.posts.find(function (foundTitle) {
          return foundTitle.postTitle === requestedId;
        });
        const postTitle = foundPost.postTitle;
        const content = foundPost.content;
        res.render('post', {
          title: postTitle,
          content: content,
        });
      }
    });
  } else {
    res.redirect('/gettingStarted');
  }
});

app.get('/logout', function (req, res) {
  req.logout();
  res.redirect('/gettingStarted');
});

app.post('/register', function (req, res) {
  User.register(
    { username: req.body.username },
    req.body.password,
    function (err, user) {
      if (err) {
        console.log(err);
        res.status(401);
        res.redirect('/register');
      } else {
        passport.authenticate('local')(req, res, function () {
          res.redirect('/');
        });
      }
    }
  );
});

app.post('/login', function (req, res) {
  const user = new User({
    username: req.body.username,
    password: req.body.password,
  });

  req.login(user, function (err) {
    if (err) {
      console.log(err);
      res.status(401);
      res.redirect('/register');
    } else {
      passport.authenticate('local')(req, res, function () {
        res.redirect('/');
      });
    }
  });
});

//https://stackoverflow.com/questions/33049707/push-items-into-mongo-array-via-mongoose
app.post('/compose', function (req, res) {
  if (req.isAuthenticated) {
    const o_id = ObjectId(req.user._id);
    const newPost = {
      postTitle: req.body.postTitle,
      content: req.body.postBody,
    };
    User.findOneAndUpdate(
      { _id: o_id },
      { $push: { posts: newPost } },
      function (err, success) {
        if (err) {
          console.log(err);
        } else {
          console.log('Succesfully Added New Post');
        }
      }
    );
    res.redirect('/');
  } else {
    res.redirect('/gettingStarted');
  }
});
//https://stackoverflow.com/questions/42474045/mongoose-remove-element-in-array-using-pull/42474970
app.post('/delete', function (req, res) {
  if (req.isAuthenticated()) {
    const o_id = ObjectId(req.user._id);
    const deletedPostTitle = req.body.deletedPost;
    User.findOneAndUpdate(
      { _id: o_id },
      { $pull: { posts: { postTitle: deletedPostTitle } } },
      function (err, success) {
        if (err) {
          console.log(err);
        } else {
          console.log('Succesfully Deleted Post');
        }
      }
    );
    res.redirect('/');
  } else {
    res.redirect('/gettingStarted');
  }
});
