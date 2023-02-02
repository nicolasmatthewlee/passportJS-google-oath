const path = require("path");
const dotenv = require("dotenv");
dotenv.config();

const express = require("express");
const session = require("express-session");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const MongoStore = require("connect-mongo");
const mongoose = require("mongoose");
mongoose.set("strictQuery", false);

const Schema = mongoose.Schema;

const app = express();

// 6. connect session to MongoDB (set store: MongoStore.create with mongoURL)
// must store Users in OWN database to use with serialize/deserialize with sessions
mongoose.connect(process.env.MONGO_DB);

// define model
const userSchema = new Schema({
  googleId: { type: String, required: true },
  username: { type: String, required: true },
});
const User = mongoose.model("user", userSchema);

// 1. register Google Strategy with passport
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "http://127.0.0.1:5001/auth/google/callback", // REQUIRED
      // callbackURL must match EXACTLY (127.0.0.1 !== localhost)
    },

    // 7. in callback, add user to OWN database with google id
    // set upsert to true to add the user if not in database
    (accessToken, refreshToken, profile, cb) => {
      User.findOneAndUpdate(
        { googleId: profile.id, username: profile.displayName },
        {},
        { upsert: true },
        (err, user) => {
          // return Google profile (sets req.user)

          return cb(err, user);
        }
      );
    }
  )
);

// 4. configure passport session authentication
passport.serializeUser((user, cb) => {
  cb(null, user.googleId);
});
passport.deserializeUser((id, cb) => {
  // use findOne NOT find to get an object instead of an array
  User.findOne({ googleId: id }, (err, user) => {
    cb(err, user);
  });
});

// 3. add session middleware
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    store: MongoStore.create({ mongoUrl: process.env.MONGO_DB }),
  })
);

// 5. employ session authentication
app.use(passport.authenticate("session"));

// 2. employ strategy in a route
// this route gets called onClick "login with google"
// it invokes the google login, which eventually redirects
// to your application at callbackURL
// callbackURL is NOT the route that returns the home page on login,
// but instead the page that processes the result given by Google

// 2.1. first passport.authenticate("google") initiates authentication request
app.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["profile"] }) // scope REQUIRED
);

// 2.2. second passsport.authenticate("google") is used by the provider to respond
// to the prior authentication request with a positive or negative assertion
app.get(
  "/auth/google/callback",
  passport.authenticate("google"),
  (req, res, next) => {
    if (req.user) return res.redirect("/");
    else return res.redirect("/login");
  }
);

app.get("/", (req, res, next) => {
  // successful authentication
  if (req.user)
    res.json({
      username: req.user.username,
    });
  else res.json({ err: "Unauthorized" });
});

app.get("/login", (req, res, next) => {
  res.sendFile(path.join(__dirname, "/views/login.html"));
});

app.listen(5001, console.log("listening at port 5001"));
