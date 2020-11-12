const functions = require('firebase-functions');
const admin = require('firebase-admin');
const express = require('express');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const cors = require('cors');
const moment =  require('moment');

admin.initializeApp(functions.config().firebase);

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
// update value validate for authorize user to connecte into app
app.post('/manage/users/validate', async (request, response) => {
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
app.post('/prospect', async (request, response) => {
  try {
    const { uid, dataToApi } = request.body;

    const prospectRef = db.collection('prospects').doc(uid);
    await prospectRef.update({
      ...dataToApi,
    });
    const { email, keyDate: { datetravauxPrev } } = dataToApi;
    if (email !== '' && datetravauxPrev && typeof datetravauxPrev === 'string') {
      await sendMessage(email, datetravauxPrev).catch(console.error);
    }

    response.status(200).send("success");
  }
  catch (error) {
    response.status(500).send({ err: error.message });
  }
});

async function sendMessage(toEmail, datetravauxPrev) {
  const now = moment("2020-12-20T23:00:00.000Z").format('YYYY-MM-DD');

  // create reusable transporter object using the default SMTP transport
  const transporter = nodemailer.createTransport({
    service: "Gmail",
    auth: {
      user: "",
      pass: ""
    }
  });

  // send mail with defined transport object
  let info = await transporter.sendMail({
    from: '"Info WAAT" <foo@example.com>', // sender address
    to: "e.ndjawe@gmail.com", // list of receivers
    subject: "Date de travaux prévisionnnelle", // Subject line
    text: `Bonjour, une date de travaux prévisionnelle a été fixer pour votre chantier, celui-ci se déroulera pour le ${now}`, // plain text body
    // html: "<b>Hello world?</b>", // html body
  });
  console.log("Message sent: %s", info.messageId);
}
// for bar graph
app.get('/get-statistics-prospect', async (request, response) => {
  const prospectRef = db.collection('prospects');
  // TODO: à remplacer par une request.query
  const startfulldate = admin.firestore.Timestamp.fromDate(new Date("2020"));
  const querySnapshot = await prospectRef.where('leadTransmissionDate', '>=', startfulldate).get();
  const data = [];
  querySnapshot.forEach((doc) => {
    data.push({
      id: doc.id,
      ...doc.data()
    });
  });

  // const months = res.map(o => moment(o.leadTransmissionDate).subtract(0, "month").startOf("month").format('MMMM')).filter((value, index, array) => array.indexOf (value) == index);

  const updatedData = data.reduce((acc, curr) => {
    const { id, leadTransmissionDate } = curr;
    let date = leadTransmissionDate;
    if (typeof leadTransmissionDate !== 'string') {
      date = transformTimeFirebaseToMomentTime(leadTransmissionDate)
    }
    const month = moment(date).subtract(0, "month").startOf("month").format('MMMM')
    return {...acc, [month]: [...(acc[month] || []), id]};
  }, {});

  response.json(updatedData);
});
// for chart graph
app.get('/get-statistics-prospect-with-status', async (request, response) => {
  // TODO: à remplacer par une request.query
  const startfulldate = admin.firestore.Timestamp.fromDate(new Date("2020"));
  const refQuery = db.collection('prospects');
  let query = refQuery.where('leadTransmissionDate', '>=', startfulldate)
  const querySnapshotEnCours = await query.where('statusWorksheet.status', '==', 'en cours').get();
  const dataEnCours = [];
  querySnapshotEnCours.forEach((doc) => {
    dataEnCours.push({
      id: doc.id,
      ...doc.data()
    });
  });

  const updatedDataOnLoad = dataEnCours.reduce((acc, curr) => {
    const { id, leadTransmissionDate } = curr;
    let date = leadTransmissionDate;
    if (typeof leadTransmissionDate !== 'string') {
      date = transformTimeFirebaseToMomentTime(leadTransmissionDate)
    }
    const month = moment(date).subtract(0, "month").startOf("month").format('MMMM')
    return {...acc, [month]: [...(acc[month] || []), id]};
  }, {});

  let query2 = refQuery.where('leadTransmissionDate', '>=', startfulldate)
  const querySnapshotDone = await query2.where('statusWorksheet.status', '==', 'terminer').get();
  const dataDone = [];
  querySnapshotDone.forEach((doc) => {
    dataDone.push({
      id: doc.id,
      ...doc.data()
    });
  });

  const updatedDataDone = dataDone.reduce((acc, curr) => {
    const { id, leadTransmissionDate } = curr;
    let date = leadTransmissionDate;
    if (typeof leadTransmissionDate !== 'string') {
      date = transformTimeFirebaseToMomentTime(leadTransmissionDate)
    }
    const month = moment(date).subtract(0, "month").startOf("month").format('MMMM')
    return {...acc, [month]: [...(acc[month] || []), id]};
  }, {});

  response.json({
    onload: updatedDataOnLoad,
    done: updatedDataDone,
  });
});

function transformTimeFirebaseToMomentTime(firebaseDateTime) {
  if (firebaseDateTime && typeof firebaseDateTime === 'object') {
    const dateInMillis = firebaseDateTime._seconds * 1000;
    return moment(dateInMillis).format('YYYY-MM-DD HH:mm:ss');
  }
}