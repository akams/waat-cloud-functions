const utils = require('../scripts/utils');

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

exports.handleGetProspects = handleGetProspects;