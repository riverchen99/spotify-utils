/**
 * Spotify Playlist Utils
 * Author: Chuan Chen
 * Adapted from Spotify's oAuth2 example.
 */

var express = require('express'); // Express web server framework
var request = require('request-promise'); // "Request" library
var cors = require('cors');
var querystring = require('querystring');
var cookieParser = require('cookie-parser');

var client_id = '85e4855dbaa44f568c84825181a5ed0e'; // Your client id
var client_secret = '7da55ee6fdd1484c9f2627cbb8789ef5'; // Your secret
var redirect_uri = 'http://localhost:8888/callback'; // Your redirect uri

/**
 * Generates a random string containing numbers and letters
 * @param  {number} length The length of the string
 * @return {string} The generated string
 */
var generateRandomString = function(length) {
  var text = '';
  var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  for (var i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
};

var stateKey = 'spotify_auth_state';

var app = express();

app.use(express.static(__dirname + '/public'))
   .use(cors())
   .use(cookieParser());

app.get('/login', function(req, res) {

  var state = generateRandomString(16);
  res.cookie(stateKey, state); // save an auth state cookie

  // your application requests authorization
  var scope = 'user-read-private user-read-email playlist-read-collaborative playlist-modify-private playlist-modify-public playlist-read-private';
  // redirect to spotify
  res.redirect('https://accounts.spotify.com/authorize?' + // build the url
    querystring.stringify({
      response_type: 'code',
      client_id: client_id,
      scope: scope,
      redirect_uri: redirect_uri, // spotify redirects back to us
      state: state
    }));
});

app.get('/callback', function(req, res) {
  // we get some localhost:8888/callback?code=something&state=something

  // your application requests refresh and access tokens
  // after checking the state parameter

  var code = req.query.code || null;
  var state = req.query.state || null;
  var storedState = req.cookies ? req.cookies[stateKey] : null;

  if (state === null || state !== storedState) {
    res.redirect('/#' +
      querystring.stringify({
        error: 'state_mismatch'
      }));
  } else {
    res.clearCookie(stateKey);
    var authOptions = {
      url: 'https://accounts.spotify.com/api/token',
      form: {
        code: code,
        redirect_uri: redirect_uri,
        grant_type: 'authorization_code'
      },
      headers: {
        'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64'))
      },
      json: true
    };

    request.post(authOptions, function(error, response, body) { // send our post request
      if (!error && response.statusCode === 200) {

        var access_token = body.access_token,
            refresh_token = body.refresh_token;

        var options = { // get some information about the use
          url: 'https://api.spotify.com/v1/me',
          headers: { 'Authorization': 'Bearer ' + access_token },
          json: true
        };

        // use the access token to access the Spotify Web API
        request.get(options, function(error, response, body) { // make the actual request
          console.log(body);
        });

        // we can also pass the token to the browser to make requests from there
        // go back to tn
        res.redirect('/#' +
          querystring.stringify({
            access_token: access_token,
            refresh_token: refresh_token
          }));
      } else {
        res.redirect('/#' +
          querystring.stringify({
            error: 'invalid_token'
          }));
      }
    });
  }
});

app.get('/refresh_token', function(req, res) {
  // requesting access token from refresh token
  var refresh_token = req.query.refresh_token;
  var authOptions = {
    url: 'https://accounts.spotify.com/api/token',
    headers: { 'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64')) },
    form: {
      grant_type: 'refresh_token',
      refresh_token: refresh_token
    },
    json: true
  };

  request.post(authOptions, function(error, response, body) {
    if (!error && response.statusCode === 200) {
      var access_token = body.access_token;
      res.send({
        'access_token': access_token
      });
    }
  });
});

app.get('/list_playlists_containing', function(req, res) {
  var access_token = req.query.access_token;
  var title = req.query.title;
  // console.log(access_token);
  // console.log(title);

/*
  fetch('https://api.spotify.com/v1/me/playlists', {
    headers: { 'Authorization': 'Bearer ' + access_token }
  })
  .then(res => res.json())
  .then(jsonBody => {
    console.log(jsonBody);
    const promises = jsonBody.items.map((item) => getTracks(access_token, item.id));
    console.log(promises);
    return Promise.all(promises);
  }).then((resResponses) => {
    return Promise.all(resResponses.map((res) => res.json()))
  }).then((result) => {
    for (var i = result.length - 1; i >= 0; i--) {
      console.log(result[i].name);
    }
  });
*/
/*
  fetch('https://api.spotify.com/v1/me/playlists', {
    headers: { 'Authorization': 'Bearer ' + access_token }
  })
  .then(res => res.json())
  .then(jsonBody => {
    console.log(jsonBody);
    const promises = jsonBody.items.map((item) => getTracksV2(access_token, item.id));
    return Promise.all(promises);
  }).then(console.log);
  res.send({});
*/
  var resultArray = [];
  var playlists = [];
  var params = {
    url: 'https://api.spotify.com/v1/me/playlists',
    headers: { 'Authorization': 'Bearer ' + access_token },
    json: true
  };
  request(params)
    .then(function(list_playlist_response) {
      promises = list_playlist_response.items.map((item) => checkContainsSong(access_token, item.id, title));
      playlists = list_playlist_response;
      return Promise.all(promises);
    })
    .then(function(containValues) {
      for (var i = playlists.items.length - 1; i >= 0; i--) {
        if (containValues[i]) {
          resultArray.push(playlists.items[i].name);
        }
      }
      console.log(resultArray);
      res.send(resultArray);
    });
});

function checkContainsSong(access_token, id, name) {
  var params = {
    url: 'https://api.spotify.com/v1/playlists/' + id,
    headers: { 'Authorization': 'Bearer ' + access_token },
    json: true
  };
  return request(params)
    .then(function(get_playlist_response) {
      return get_playlist_response.name.includes(name);
      /*
      var contains = false;
      for (var i = get_playlist_response.tracks.items.length - 1; i >= 0; i--) {
        if (get_playlist_response.tracks.items.track.name.includes(name)) {
          contains = true;
        }
      }
      return contains;
      */
    });
  /*
  return new Promise(resolve => {
    request.get(params, function(error, response, body) {
      var jsonBody = JSON.parse(body);
      resolve(jsonBody.name);
    })
  });
  */
}
/*
var getTracks = function(access_token, id) {
  console.log('https://api.spotify.com/v1/playlists/' + id);
  return fetch('https://api.spotify.com/v1/playlists/' + id, {
    headers: { 'Authorization': 'Bearer ' + access_token }
  });
}
*/
console.log('Listening on 8888');
app.listen(8888);
