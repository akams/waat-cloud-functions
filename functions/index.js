const functions = require('firebase-functions');
const admin = require('firebase-admin');
const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser')();
const cors = require('cors')({origin: true});
const middlewares = require('./middlewares/middlewares');
const prospectsModel = require('./model/prospects');

admin.initializeApp(functions.config().firebase);

const db = admin.firestore(); // cloudFireStore Db
const app = express(); // Handle intern API
const main = express(); // Expose API

const useValidateFirebaseIdToken = middlewares.validateFirebaseIdToken(admin);
const useValidePermissionUser = middlewares.validePermissionUser(db);

main.use(cors);
main.use(cookieParser);
main.use(useValidateFirebaseIdToken);
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
app.post('/manage/users/validate', useValidePermissionUser, async (request, response) => {
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
app.post('/prospect', useValidePermissionUser, async (request, response) => {
  try {
    await prospectsModel.handleUpdateProspect(db, request.body);
    response.status(200).send("success");
  }
  catch (error) {
    response.status(500).send({ err: error.message });
  }
});

// Get prospects
app.get('/prospect', useValidePermissionUser, async (request, response) => {
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
app.get('/get-statistics-prospect', useValidePermissionUser, async (request, response) => {
  try {
    const data = await prospectsModel.handleGetStatisticsProspect(db, admin);
    response.json(data);
  }
  catch(e) {
    response.status(500).send({ err: e.message });
  }
});
// for chart graph
app.get('/get-statistics-prospect-with-status', useValidePermissionUser, async (request, response) => {
  try {
    const data = await prospectsModel.handleGetStatisticsProspectWithStatus(db, admin);
    response.json(data);
  }
  catch(e) {
    response.status(500).send({ err: e.message });
  }
});

app.get('/get-simple-stats-info', useValidePermissionUser, async (request, response) => {
  try {
    const data = await prospectsModel.handleGetSimpleStatsInfo(db, admin);
    response.json(data);
  }
  catch(e) {
    response.status(500).send({ err: e.message });
  }
});

