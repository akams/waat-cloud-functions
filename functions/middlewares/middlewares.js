
/**
 * Express middleware that validates Firebase ID Tokens passed in the Authorization HTTP header.
 * The Firebase ID token needs to be passed as a Bearer token in the Authorization HTTP header like this:
 * `Authorization: Bearer <Firebase ID Token>`.
 * when decoded successfully, the ID Token content will be added as `req.user`.
 * @admin {admin - SDK}
 */
const validateFirebaseIdToken = (admin) => async (req, res, next) => {
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

/**
 * Verify ACL permission user
 * @db {firestore}
 */
const validePermissionUser = (db) => async (req, res, next) => {
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

exports.validateFirebaseIdToken = validateFirebaseIdToken;
exports.validePermissionUser = validePermissionUser;
