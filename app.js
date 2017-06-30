'use strict';

const env = process.env.NODE_ENV || 'dev';

if (env === 'dev') {
  require('dotenv').config({ silent: true });
}

const request = require('request');
const admin = require('firebase-admin');
const fbConfig = require('./firebase-config');
const Mustache = require('mustache');

admin.initializeApp({
  credential: admin.credential.cert(fbConfig.FIREBASE_SERVICE_ACCOUNT),
  databaseURL: fbConfig.APP_SETTINGS.databaseURL
});

const db = admin.database();

function set(ref, data) {
  ref.set(data, function (error) {
    if (error) {
      handleError('firebaseError', error);
    } else {
      let now = new Date();
      console.log('success', now.toLocaleDateString(), now.toLocaleTimeString());
    }
  });
}

function push(ref, data) {
  ref.push(data, function (error) {
    if (error) {
      handleError('firebaseError', error);
    } else {
      let now = new Date();
      console.log('success', now.toLocaleDateString(), now.toLocaleTimeString());
    }
  });
}

function getResponseErrorMessage(response) {
  let errorMessage;

  if (response) {
    errorMessage = `${response.statusCode}: ${response.statusMessage}`;
  } else if (response === null) {
    errorMessage = 'null response';
  } else if (typeof response === 'undefined') {
    errorMessage = 'undefined response';
  } else if (response === '') {
    errorMessage = 'empty string response';
  } else if (response === 0) {
    errorMessage = '0 response';
  } else if (Number.isNaN(response)) {
    errorMessage = 'NaN response';
  } else {
    errorMessage = 'unhandled response error';
  }

  return errorMessage;
}

function handleResponse(response, body) {
  let ref;
  let ts;

  if (response && response.statusCode == 200) {
    ts = new Date().valueOf();
    ref = db.ref(fbConfig.NODES.SNAPSHOTS + '/' + ts);
    set(ref, JSON.parse(body));
  } else {
    let errorMessage = getResponseErrorMessage(response);
    handleError('responseError', errorMessage);
  }
}

function handleError(type, errorMessage) {
  let ref = db.ref(fbConfig.NODES.LOG_ERROR)
  push(ref, { errorType: type, errorMessage: errorMessage, date: new Date().valueOf() })
}

function startLoop(previousLoop, baseUrl, intervalSeconds) {
  if (previousLoop) {
    clearInterval(previousLoop);
  }

  return setInterval(function () {
    request(baseUrl,
      function (error, response, body) {
        if (!error) {
          handleResponse(response, body);
        } else {
          handleError('requestError', error);
        }
      });

  }, intervalSeconds * 1000);
}

function go() {
  const now = new Date();
  console.log('starting', now.toLocaleDateString(), now.toLocaleTimeString());
  let loop;
  let settingsRef = db.ref(fbConfig.NODES.GLOBAL_SETTINGS);

  settingsRef.on('value', function(settingsSnap){
    let url;
    let intervalSeconds;
    let settings = settingsSnap.val();
    
    if(settings.urlTemplate && settings.queryStringParams && settings.intervalSeconds) {
      url = Mustache.render(settings.urlTemplate, settings.queryStringParams);
      intervalSeconds = settings.intervalSeconds;
      loop = startLoop(loop, url, intervalSeconds);
    } else {
      handleError('malformedSettings', settings);
    }
  });
}

go();
