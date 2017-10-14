const functions = require('firebase-functions');

// // Create and Deploy Your First Cloud Functions
// // https://firebase.google.com/docs/functions/write-firebase-functions
//
// exports.helloWorld = functions.https.onRequest((request, response) => {
//  response.send("Hello from Firebase!");
// });

// The Firebase Admin SDK to access the Firebase Realtime Database.
const admin = require('firebase-admin');
admin.initializeApp(functions.config().firebase);


//qamra wrote for blurring dick pics:
//const gcs = require('@google-cloud/storage')();
const vision = require('@google-cloud/vision')();
const spawn = require('child-process-promise').spawn;
const path = require('path');
const os = require('os');
const fs = require('fs');

//const UUID = require("uuid-v4");
const gcs = require('@google-cloud/storage')(functions.config().firebase);

//const gcs = require('@google-cloud/storage')({keyFilename: 'serviceAccountKey.json'});

// Blurs uploaded images that are flagged as Adult or Violence.
//gs://friendlypixdemo-b15e3.appspot.com/s7xtt969O3VSS3aod0FBLF09EPw2/thumb/1507479119070
exports.blurOffensiveImages = functions.storage.object().onChange(event => {
  const object = event.data;
//exports.blurOffensiveImages = functions.storage.object().onChange(event => {
//  const object = event.data;
  // Exit if this is a deletion or a deploy event.
  if (object.resourceState === 'not_exists') {
    return console.log('exports.blurOffensiveImages This is a deletion event.');
  } else if (!object.name) {
    return console.log('This is a deploy event.');
  }

  const image = {
    source: {imageUri: `gs://${object.bucket}/${object.name}`}
  };
  console.log('imageUri: gs://$object.bucket',object.bucket,'object.bucket',object.name);

  // Check the image content using the Cloud Vision API.
  return vision.safeSearchDetection(image).then(batchAnnotateImagesResponse => {
    const safeSearchResult = batchAnnotateImagesResponse[0].safeSearchAnnotation;
    if (safeSearchResult.adult === 'LIKELY' ||
        safeSearchResult.adult === 'VERY_LIKELY' ||
        safeSearchResult.violence === 'LIKELY' ||
        safeSearchResult.violence === 'VERY_LIKELY') {
      console.log('The image', object.name, 'has been detected as inappropriate.');
      console.log('object.metadata',object.metadata);
      //return blurImage(object.name, object.bucket);
      //QJK mod:
      return blurImage(object.name, object.bucket,object.metadata);
    } else {
      console.log('The image', object.name,'has been detected as OK.');
    }
  });
});


//https://firebasestorage.googleapis.com/v0/b/friendlypixdemo-b15e3.appspot.com/o/s7xtt969O3VSS3aod0FBLF09EPw2%2Ffull%2F1507479119070%2F85419.jpg?alt=media&token=1d736229-08e4-4df7-a1a0-b6831e802262
//https://firebasestorage.googleapis.com/v0/b/friendlypixdemo-b15e3.appspot.com/o/s7xtt969O3VSS3aod0FBLF09EPw2%2Ffull%2F1507479119070%2F85419.jpg?alt=media&token=c78e7a71-7740-406a-b5dc-9a509ed02789

//database full:https://firebasestorage.googleapis.com/v0/b/friendlypixdemo-b15e3.appspot.com/o/s7xtt969O3VSS3aod0FBLF09EPw2%2Ffull%2F1507480911807%2F85419.jpg?alt=media&token=b2e23579-4b27-4527-a725-aa6283acb321
//storage full: https://firebasestorage.googleapis.com/v0/b/friendlypixdemo-b15e3.appspot.com/o/s7xtt969O3VSS3aod0FBLF09EPw2%2Ffull%2F1507480911807%2F85419.jpg?alt=media&token=e124f653-6159-48c8-b0dc-2d1f2a8041b3
//database thumb: https://firebasestorage.googleapis.com/v0/b/friendlypixdemo-b15e3.appspot.com/o/s7xtt969O3VSS3aod0FBLF09EPw2%2Fthumb%2F1507480911807%2F85419.jpg?alt=media&token=231a7c32-ab86-4031-9f4b-a64ae1c6c51e
//storage thumb: https://firebasestorage.googleapis.com/v0/b/friendlypixdemo-b15e3.appspot.com/o/s7xtt969O3VSS3aod0FBLF09EPw2%2Fthumb%2F1507480911807%2F85419.jpg?alt=media&token=c8f6f6d4-9ab1-4717-b71d-d27228f0f6ba


//auxilary function for blurring newly added images
// Blurs the given image located in the given bucket using ImageMagick.
function blurImage(filePath, bucketName, metadata) {
  const tempLocalFile = path.join(os.tmpdir(), path.basename(filePath));
  const messageId = filePath.split(path.sep)[1];
  const bucket = gcs.bucket(bucketName);
  console.log('tempLocalFile :', tempLocalFile);
  console.log('messageId : ', messageId );
  //console.log('bucket :', bucket);
  const uuid = metadata.firebaseStorageDownloadTokens;
  //let uuid=UUID();
  console.log('UUID :', uuid);
  // Download file from bucket.
  return bucket.file(filePath).download({destination: tempLocalFile})
    .then(() => {
      console.log('Image has been downloaded to', tempLocalFile);
      // Blur the image using ImageMagick.
      return spawn('convert', [tempLocalFile, '-channel', 'RGBA', '-blur', '0x24', tempLocalFile]);
    }).then(() => {
      console.log('Image has been blurred');
      // Uploading the Blurred image back into the bucket.
      //console.log('blurImage tempLocalFile'+tempLocalFile);
      //console.log('blurImage filePath'+filePath);
      console.log('blurImage metadata'+metadata);

      //return bucket.upload(tempLocalFile, {destination: filePath});
      // //QJK mod
      return bucket.upload(tempLocalFile, {
        destination: filePath,
        uploadType: "media" ,
        metadata:{
          metadata:{
            contentType:'image/png',
            firebaseStorageDownloadTokens:uuid
          }
        }
      });
      }).then(() => {
      console.log('Blurred image has been uploaded to', filePath);
      // Deleting the local file to free up disk space.
      fs.unlinkSync(tempLocalFile);
      console.log('Deleted local file.');
      // Indicate that the message has been moderated.
      //.set(metadata)
      return admin.database().ref(`/messages/${messageId}`).update({moderated: true});
      //QJK mod
      //return admin.database().ref(`/messages/${messageId}`).set(metadata);
    }).then(() => {
      //console.log('Marked the image as moderated in the database.');
      //change the original URI pointers
    });
}

const translate = require('@google-cloud/translate')();
const _ = require('lodash');

// Languages change so rarely that it's not worth checking them in every call:
let cachedLanguages = null;
function getLanguages() {
    if (!cachedLanguages) {
        cachedLanguages = translate.getLanguages().then(([langs]) => langs.filter(l => l.code ==='ms'));

        console.log(cachedLanguages);
        //.then(([langs]) => langs);

        //cachedLanguages = translate.getLanguages().then(([langs]) => langs);
    }
    return cachedLanguages;
    //return 'ms';
}

function setTranslation(lang, message, ref) {
    return translate.translate(message, lang).then(([translation]) => {
        console.log(`Translation for ${lang} is ${translation}`);
        return ref.child(lang).set(translation);
    });
}

exports.translateMessage = functions.database.ref('events/{eventId}/description').onCreate(event => {
    const message = event.data.val();
    const ref = event.data.ref.parent;
    console.log(`Source message is ${message}`);

    //return ['ms'].then(langs => {
    return getLanguages().then(langs => {
        console.log(`Langs are ${JSON.stringify(langs)}`);

        //let translateAsync = _.map(langs, (lang) => setTranslation(lang.code, message, ref));
// let translateAsync =  setTranslation('ms', message, ref));
//         return Promise.all(translateAsync);

let translateAsync = _.map(langs, (lang) => setTranslation('ms', message, ref));
        return Promise.all(translateAsync);
    });
});
