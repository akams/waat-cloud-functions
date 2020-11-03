const functions = require('firebase-functions');
const admin = require('firebase-admin');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

admin.initializeApp(functions.config().firebase);

// // Create and Deploy Your First Cloud Functions
// // https://firebase.google.com/docs/functions/write-firebase-functions

const db = admin.firestore(); // cloudFireStore Db
const app = express(); // Handle intern API
const main = express(); // Expose API

main.use(cors());
main.use('/api/v1', app);
main.use(bodyParser.json());

exports.waatCloudFunction = functions.https.onRequest(main);

app.get('/warmup', (request, response) => {
  response.send('Warming up serverless .');
});

// signin for waat user
app.post('/signup', async (request, response) => {
  try {
    const { uid, email, lastname, firstname } = request.body;
    const data = {
      email, lastname, firstname,
      acl: { admin: true },
      validate: false
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
      validate: false
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
