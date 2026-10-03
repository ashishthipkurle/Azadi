const https = require('https');
https.get('https://expo.dev/api/v2/projects/f07e36aa-828b-4de9-bf0d-6f860b8bb2be/builds/35e4792c-0846-4748-9497-4112fcef333a', {
  headers: {
    'expo-session': '{\"id\":\"40f820c5-ba9e-4c7e-bf06-085399e7dff9\",\"version\":2}'
  }
}, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
     let parsed = JSON.parse(data);
     let errorObj = parsed.data && parsed.data.error;
     if (errorObj) {
         console.log(JSON.stringify(errorObj, null, 2));
     } else {
         console.log('No error field, raw:', data.substring(0, 1000));
     }
  });
});
