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
var fs = require('fs');
 
var client_id = '85e4855dbaa44f568c84825181a5ed0e'; // Your client id
//var client_secret = 'f8d395723d1a4168a9f0114e5e42caf5'; // Your secret
var client_secret = fs.readFileSync('secret_key', 'utf8');
console.log(client_secret);
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
  var search_query = req.query.search_query;
  var resultArray = [];
  var playlists = [];
  listAllPlaylists(access_token, playlists)
    .then(function(all_playlists) {
      playlists = all_playlists
      promises = playlists.map((item) => checkContainsSong(access_token, item.id, search_query));
      return Promise.all(promises);
    })
    .then(function(containValues) {
      for (var i = playlists.length - 1; i >= 0; i--) {
        if (containValues[i]) {
          resultArray.push([playlists[i].name, containValues[i]]);
        }
      }
      console.log(resultArray);
      res.send(resultArray);
    });
});

function listAllPlaylists(access_token, playlists, url) {
  var params = {
    url: url || 'https://api.spotify.com/v1/me/playlists',
    headers: { 'Authorization': 'Bearer ' + access_token },
    json: true
  };
  return request(params).then(function(list_playlist_response) {
    if (!playlists) {
        playlists = [];
    }
    playlists = playlists.concat(list_playlist_response.items);
    if(list_playlist_response.next) {
      return listAllPlaylists(access_token, playlists, list_playlist_response.next);
    } else {
      return playlists;
    }
  });
}

function checkContainsSong(access_token, id, search_query) {
  var params = {
    url: 'https://api.spotify.com/v1/playlists/' + id,
    headers: { 'Authorization': 'Bearer ' + access_token },
    json: true
  };
  return request(params) // returns a promise
    .then(function(get_playlist_response) {
      //return get_playlist_response.name.includes(name);
      console.log(get_playlist_response.name);
      var contains = null;
      for (var i = get_playlist_response.tracks.items.length - 1; i >= 0; i--) {
        try {
          if (get_playlist_response.tracks.items[i].track.name.includes(search_query)) {
            contains = get_playlist_response.tracks.items[i].track.name;
            break;
          }
        } catch(err) {
          console.log(err);
          console.log(get_playlist_response);
          break;
        }
      }
      return contains;
    });
}

app.get('/backup_discover', function(req, res) {
  var access_token = req.query.access_token;
  getDiscoverWeeklyURI(access_token, null)
    .then(function(uri) {
      res.send(uri);
      console.log(uri);
    });
});

function getDiscoverWeeklyURI(access_token, url) {
  var params = {
    url: url || 'https://api.spotify.com/v1/me/playlists',
    headers: { 'Authorization': 'Bearer ' + access_token },
    json: true
  };
  return request(params)
    .then(function(list_playlist_response) {
      for (var i = list_playlist_response.items.length - 1; i >= 0; i--) {
        if (list_playlist_response.items[i].name == 'Discover Weekly' &&
            list_playlist_response.items[i].owner.id == 'spotify') {
          return list_playlist_response.items[i].uri;
        }
      }
      if(list_playlist_response.next) {
        return getDiscoverWeeklyURI(access_token, list_playlist_response.next);
      } else {
        return null;
      }
    });
}

console.log('Listening on 8888');
app.listen(8888);
