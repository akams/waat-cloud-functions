const moment =  require('moment');
const nodemailer = require('nodemailer');
const utils = require('../scripts/utils');

/**
 * Process to update data
 * @db {firestore} connexion to bdd - is mandatory
 * @body {object} data from post
 */
async function handleUpdateProspect(db, body) {
  try {
    if (!db) {
      throw new Error('{db} firestore is required to continue the process');
    }
    const { uid, dataToApi } = body;

    const prospectRef = db.collection('prospects').doc(uid);
    await prospectRef.update({
      ...dataToApi,
    });
    const { email, keyDate: { datetravauxPrev } } = dataToApi;
    if (email !== '' && datetravauxPrev && typeof datetravauxPrev === 'string') {
      await sendMessage(email, datetravauxPrev).catch(console.error);
    }
  } catch (error) {
    return error;
  }
}


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

/**
 * Process to get data prospect with or not id
 * @db {firestore} connexion to bdd - is mandatory
 * @id {id} if you want to get element by id
 * @limit {limit} default = 5
 */
async function handleGetProspects (db, id, limit = 5) {
  try {
    if (!db) {
      throw new Error('db firestore is required to continue the process');
    }

    let queryProspects = db.collection('prospects');

    if (id) {
      queryProspects = db.collection('prospects').where('uidCompany', '==', id);
    }
    const snapshotProspects = await queryProspects.orderBy('leadTransmissionDate', 'desc').limit(limit).get();
    const dataProspects = [];
    snapshotProspects.forEach((doc) => {
      dataProspects.push({
        id: doc.id,
        ...doc.data()
      });
    });
  
    const collectionCompanies = db.collection('companies');
    const reads = dataProspects.map((prospect) => collectionCompanies.doc(prospect.uidCompany).get());
    const results = await Promise.all(reads);
    const companies = results.map((v) => ({ uidCompany: v.id, ...v.data() }));
    const merge = utils.mergeArraysByKeyId(dataProspects, companies, 'uidCompany');
    const datas = merge.map((m) => ({
      id: m.id,
      company: m.name,
      leadTransmissionDate: m.leadTransmissionDate,
      prospectName: `${m.firstname} ${m.lastname}`,
    }));
    return datas;
  } catch (error) {
    return error;
  }
}

/**
 * Process to get data for kpi bar graph
 * @db {firestore} - required
 * @admin {admin - sdk}  - required
 */
async function handleGetStatisticsProspect(db, admin) {
  try {
    if (!db || !admin) {
      throw new Error('Missing {db} or {admin} variable process to continue.');
    }
    const prospectRef = db.collection('prospects');
    // TODO: à remplacer par une request.query for filter by date
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
        date = utils.transformTimeFirebaseToMomentTime(leadTransmissionDate)
      }
      const month = moment(date).subtract(0, "month").startOf("month").format('MMMM')
      return {...acc, [month]: [...(acc[month] || []), id]};
    }, {});

    return updatedData;
  } catch (error) {
    return error;
  }
}

/**
 * Process to get data for kpi chart graph
 * @db {firestore} - required
 * @admin {admin - sdk}  - required
 */
async function handleGetStatisticsProspectWithStatus(db, admin) {
  try {
    if (!db || !admin) {
      throw new Error('Missing {db} or {admin} variable process to continue.');
    }
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
        date = utils.transformTimeFirebaseToMomentTime(leadTransmissionDate)
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
        date = utils.transformTimeFirebaseToMomentTime(leadTransmissionDate)
      }
      const month = moment(date).subtract(0, "month").startOf("month").format('MMMM')
      return {...acc, [month]: [...(acc[month] || []), id]};
    }, {});

    return {
      onload: updatedDataOnLoad,
      done: updatedDataDone,
    };
  } catch (error) {
    return error;
  }
}

/**
 * Process to get data info for kpi - simple data nb by
 * @db {firestore} - required
 * @admin {admin - sdk}  - required
 */
async function handleGetSimpleStatsInfo(db, admin) {
  try {
    if (!db || !admin) {
      throw new Error('Missing {db} or {admin} variable process to continue.');
    }
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

    return {
      newBusinessProviderSize: querySnapshotUsers.size,
      newWorksheetSize: querySnapshotLastWeek.size,
      newLeadAcquisitionSize: querySnapshotLastMonth.size,
    };
  } catch (error) {
    return error;
  }
}

async function methodName(db) {
  try {
    if (!db) {
      throw new Error('db firestore is required to continue the process');
    }
  } catch (error) {
    return error;
  }
}

exports.handleUpdateProspect = handleUpdateProspect;
exports.handleGetProspects = handleGetProspects;
exports.handleGetStatisticsProspect = handleGetStatisticsProspect;
exports.handleGetStatisticsProspectWithStatus = handleGetStatisticsProspectWithStatus;
exports.handleGetSimpleStatsInfo = handleGetSimpleStatsInfo;