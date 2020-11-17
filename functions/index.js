const functions = require('firebase-functions');
const admin = require('firebase-admin');
const express = require('express');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const moment =  require('moment');
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
  }
  catch(e) {
    response.status(500).send({ err: e.message });
  }
});
// for chart graph
app.get('/get-statistics-prospect-with-status', validePermissionUser, async (request, response) => {
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

app.get('/get-simple-stats-info', validePermissionUser, async (request, response) => {
  var yesterdayDateMoment = moment().subtract(1, 'days').format('YYYY-MM-DD HH:mm:ss')
  var lastWeekDateMoment = moment().subtract(14, 'days').format('YYYY-MM-DD HH:mm:ss')
  var lastMonthDateMoment = moment().subtract(31, 'days').format('YYYY-MM-DD HH:mm:ss')
  const yesterday = admin.firestore.Timestamp.fromDate(new Date(yesterdayDateMoment));
  const lastWeek = admin.firestore.Timestamp.fromDate(new Date(lastWeekDateMoment));
  const lastMonth = admin.firestore.Timestamp.fromDate(new Date(lastMonthDateMoment));

  const refUser = db.collection('users');
  const querySnapshotUsers = await refUser.where('dateCreat', '>=' , yesterday).orderBy('dateCreat', 'desc').get();

  const refProspect = db.collection('prospects');
  // data last week new prospect
  const query = refProspect.where('statusWorksheet.status', '==' , 'terminer');
  const querySnapshotLastWeek = await query.where('leadTransmissionDate', '>=' , lastWeek).orderBy('leadTransmissionDate', 'desc').get();

  // data last month new prospect
  const querySnapshotLastMonth = await refProspect.where('leadTransmissionDate', '>=' , lastMonth).orderBy('leadTransmissionDate', 'desc').get();

  response.json({
    newBusinessProviderSize: querySnapshotUsers.size,
    newWorksheetSize: querySnapshotLastWeek.size,
    newLeadAcquisitionSize: querySnapshotLastMonth.size,
  });
});

function transformTimeFirebaseToMomentTime(firebaseDateTime) {
  if (firebaseDateTime && typeof firebaseDateTime === 'object') {
    const dateInMillis = firebaseDateTime._seconds * 1000;
    return moment(dateInMillis).format('YYYY-MM-DD HH:mm:ss');
  }
}
