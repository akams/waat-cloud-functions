const functions = require('firebase-functions');
const admin = require('firebase-admin');
const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser')();
const cors = require('cors')({origin: true});
const prospectsModel = require('./model/prospects');

admin.initializeApp(functions.config().firebase);

const db = admin.firestore(); // cloudFireStore Db
const app = express(); // Handle intern API
const main = express(); // Expose API

// Express middleware that validates Firebase ID Tokens passed in the Authorization HTTP header.
// The Firebase ID token needs to be passed as a Bearer token in the Authorization HTTP header like this:
// `Authorization: Bearer <Firebase ID Token>`.
// when decoded successfully, the ID Token content will be added as `req.user`.
const validateFirebaseIdToken = async (req, res, next) => {
  console.log('Check if request is authorized with Firebase ID token');

  if ((!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) &&
      !(req.cookies && req.cookies.__session)) {
    console.error('No Firebase ID token was passed as a Bearer token in the Authorization header.',
        'Make sure you authorize your request by providing the following HTTP header:',
        'Authorization: Bearer <Firebase ID Token>',
        'or by passing a "__session" cookie.');
    res.status(403).send('Unauthorized');
    return;
  }

  let idToken;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    console.log('Found "Authorization" header');
    // Read the ID Token from the Authorization header.
    idToken = req.headers.authorization.split('Bearer ')[1];
  } else if(req.cookies) {
    console.log('Found "__session" cookie');
    // Read the ID Token from cookie.
    idToken = req.cookies.__session;
  } else {
    // No cookie
    res.status(403).send('Unauthorized');
    return;
  }

  try {
    const decodedIdToken = await admin.auth().verifyIdToken(idToken);
    console.log('ID Token correctly decoded', decodedIdToken);
    req.user = decodedIdToken;
    next();
    return;
  } catch (error) {
    console.error('Error while verifying Firebase ID token:', error);
    res.status(403).send('Unauthorized');
    return;
  }
};

// Verify ACL permission user
const validePermissionUser = async (req, res, next) => {
    const { uid } = req.user;
    const userRef = db.collection('users').doc(uid);
    const doc = await userRef.get();
    if (!doc.exists) {
      console.log('No such document!');
      res.status(404).send({ err: 'No such document for user uid' });
      return;
    }
    console.log('Document user data:', doc.data());
    const user = { id: doc.id , ...doc.data() };
    const { acl: { guest } } = user;
    if (guest) {
      res.status(403).send('Unauthorized user, missing permission read');
      return;
    }
    next();
    return;
};

main.use(cors);
main.use(cookieParser);
main.use(validateFirebaseIdToken);
main.use('/api/v1', app);
main.use(bodyParser.json());

exports.waatCloudFunction = functions.https.onRequest(main);

app.get('/warmup', (request, response) => {
  response.json({
    msg: 'Warming up serverless.',
    user: request.user,
  });
});

// signin for waat user
app.post('/signup', async (request, response) => {
  try {
    const { uid, email, lastname, firstname } = request.body;
    const data = {
      email, lastname, firstname,
      acl: { admin: true },
      validate: false,
      dateCreat: new Date(),
    };
    const userRef = db.collection('users').doc(uid);
    await userRef.set(data);

    response.status(200).send("success");
  }
  catch (error) {
    response.status(500).send({ err: error.message });
  }
});
// signin for business
app.post('/signup/business', async (request, response) => {
  try {
    const { uid, email, lastname, firstname, company } = request.body;
    const data = {
      email, lastname, firstname,
      acl: { guest: true },
      validate: false,
      dateCreat: new Date(),
    };
    const userRef = db.collection('users').doc(uid);
    await userRef.set(data);

    const companiesRef = db.collection('companies').doc(uid);
    await companiesRef.set(
      {
        name: company,
      },
      { merge: true }
    );
    response.status(200).send("success");
  }
  catch (error) {
    response.status(500).send({ err: error.message });
  }
});
// update value validate for authorize user to connecte into app
app.post('/manage/users/validate', validePermissionUser, async (request, response) => {
  try {
    const { uid } = request.body;
    const data = {
      validate: true
    };
    const userRef = db.collection('users').doc(uid);
    await userRef.update(data);
    response.status(200).send("success");
  }
  catch (error) {
    response.status(500).send({ err: error.message });
  }
});

// update value for work sheet
app.post('/prospect', validePermissionUser, async (request, response) => {
  try {
    await prospectsModel.handleUpdateProspect(db, request.body);
    response.status(200).send("success");
  }
  catch (error) {
    response.status(500).send({ err: error.message });
  }
});

// Get prospects
app.get('/prospect', validePermissionUser, async (request, response) => {
  try {
    const { limit = 5 } = request.query;
    const datas = await prospectsModel.handleGetProspects(db, undefined, limit);
    response.json(datas);
  } catch (error) {
    response.status(500).send({ err: error.message });
  }
});

// Get prospect by id
app.get('/prospect/:id', async (request, response) => {
  try {
    const { id } = request.params;
    const { limit = 5 } = request.query;
    if (!id) {
      throw new Error('id is required to operate request');
    }
    const datas = await prospectsModel.handleGetProspects(db, id, limit);
    response.json(datas);
  } catch (error) {
    response.status(500).send({ err: error.message });
  }
});

// for bar graph
app.get('/get-statistics-prospect', validePermissionUser, async (request, response) => {
  try {
    const data = await prospectsModel.handleGetStatisticsProspect(db, admin);
    response.json(data);
  }
  catch(e) {
    response.status(500).send({ err: e.message });
  }
});
// for chart graph
app.get('/get-statistics-prospect-with-status', validePermissionUser, async (request, response) => {
  try {
    const data = await prospectsModel.handleGetStatisticsProspectWithStatus(db, admin);
    response.json(data);
  }
  catch(e) {
    response.status(500).send({ err: e.message });
  }
});

app.get('/get-simple-stats-info', validePermissionUser, async (request, response) => {
  try {
    const data = await prospectsModel.handleGetSimpleStatsInfo(db, admin);
    response.json(data);
  }
  catch(e) {
    response.status(500).send({ err: e.message });
  }
});

