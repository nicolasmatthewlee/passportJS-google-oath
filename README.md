# passportJS Google OAuth 2.0 with mongo-connect

## 1. Create express application

```javascript
const express = require("express");
const app = express();
app.listen(3000, console.log("listening at port 3000"));
```

_server can now respond to requests at http://127.0.0.1:3000_

---

## 2. Implement session store

1. import modules

```javascript
const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const MongoStore = require("connect-mongo");
const session = require("express-session");
```

2. connect to MongoDB

```javascript
mongoose.connect(process.env.MONGO_DB);
mongoose.connection.on("error", (err) => {
  console.log(err);
});
```

3. define model

```javascript
const userSchema = new Schema({
  googleId: { type: String, required: true },
  username: { type: String, required: true },
});
const User = mongoose.model("user", userSchema);
```

4. employ session

```javascript
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    store: MongoStore.create({ mongoUrl: process.env.MONGO_DB }),
  })
);
```

_all middleware after `app.use(session())` can access the session as `req.session`; `session.save()` is automatically called at the end of the HTTP response if the session data is altered_

---

## 3. Configure Google OAuth 2.0 authentication

1. configure project in Google developers console

   1. create new project
   2. `credentials>create credentials>create OAuth client ID>configure consent screen` (set application type and name, add authorized redirect URI)
   3. save the client ID and client secret in `.env`

2. configure the strategy and register with passport

```javascript
const GoogleStrategy = require("passport-google-oath20").Strategy;

passport.use(
  GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "http://127.0.0.1:3000/auth/google/callback",
    },
    (accessToken, refreshToken, profile, cb) => {
      User.findOneAndUpdate(
        { googleId: profile.id, username: profile.displayName },
        {},
        { upsert: true },
        (err, user) => {
          return cb(err, user);
        }
      );
    }
  )
);
```

_the callback function receives the user's google profile, and adds the specified information from that user to your own database which is accessed during session authentication; then, it returns the user_

3. configure passport session serializing/deserializing

```javascript
passport.serializeUser((user, cb) => {
  cb(null, user.googleId);
});
```

_when a login session is established, passport.serializeUser() is called to store the newly-created session ID and the user's googleId in a document_

```javascript
passport.deserializeUser((user, cb) => {
  User.findOne({ googleId: id }, (err, user) => {
    cb(err, user);
  });
});
```

_when `passport.authenticate("session")` is called, `passport.deserializeUser()` is called to retrieve user data to set `req.user`_

## 2. Implement Google OAuth 2.0 authentication

1. employ session authentication

```javascript
app.use(passport.authenticate("session"));
```

2. employ the strategy on a route to initiate the authentication request

```javascript
app.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["profile"] })
);
```

_the first `passport.authenticate()` call initiates the authentication request; the scope option must be defined_

3. call the strategy again from the callbackURL and set middleware to respond to the authentication response

```javascript
app.get(
  "/auth/google/callback",
  passport.authenticate("google"),
  (req, res, next) => {
    if (req.user) return res.redirect("/");
    else return res.redirect("/login");
  }
);
```

_the second passport.authenticate() call receives the response to the prior authentication request, setting req.user as defined by the strategy configuration_
