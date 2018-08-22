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
var client_secret = fs.readFileSync('secret_key', 'utf8');
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
          resultArray.push({
           playlist: playlists[i].name, 
           song: containValues[i].name, 
           artist: containValues[i].artists[0].name
          });
        }
      }
      console.log(resultArray);
      res.send(resultArray);
    });
});

function listAllPlaylists(access_token, playlists, url) { // return list of playlist objects
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

function getPlaylist(access_token, id) { // get one playlist object
  var params = {
    url: 'https://api.spotify.com/v1/playlists/' + id,
    headers: { 'Authorization': 'Bearer ' + access_token },
    json: true
  };
  return request(params)
    .then(function(get_playlist_response) {
      return get_playlist_response;
    });
}

function checkContainsSong(access_token, id, search_query) { // returns song object if in playlist
  return getPlaylist(access_token, id)
    .then(function(get_playlist_response) {
      console.log(get_playlist_response.name);
      var contains = null;
      for (var i = get_playlist_response.tracks.items.length - 1; i >= 0; i--) {
        try {
          if (get_playlist_response.tracks.items[i].track.name.includes(search_query)) {
            contains = get_playlist_response.tracks.items[i].track;
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
  var user_id = req.query.user_id;
  var createNewPlaylistPromise = createNewPlaylist(access_token, user_id);
  var getDiscoverWeeklyURIPromise = getDiscoverWeeklyURI(access_token, null);
  Promise.all([createNewPlaylistPromise, getDiscoverWeeklyURIPromise])
    .then(function(values) { // [ {new playlist id, new playlist name} , discover weekly id ]
      res.send(values[0].name);
      console.log('new playlist id ' + values[0].id);
      console.log('discover weekly id ' + values[1]);
      return copySongs(access_token, values[1], values[0].id);
    });
});

function getDiscoverWeeklyURI(access_token, url) {
  return listAllPlaylists(access_token)
    .then(function(playlists) {
      console.log(playlists[0]);
      for (var i = playlists.length - 1; i >= 0; i--) {
        if (playlists[i].name == 'Discover Weekly' &&
            playlists[i].owner.id == 'spotify') {
          return playlists[i].id;
        }
      }
      return null;
    });
}

function createNewPlaylist(access_token, user_id) {
  var params = {
    method: 'POST',
    url: `https://api.spotify.com/v1/users/${user_id}/playlists`,
    headers: {
      'Authorization': 'Bearer ' + access_token,
      'Content-Type': 'application/json'
    },
    body: {
      name: 'Discover Weekly Backup ' + new Date(Date.now()).toLocaleString(),
      description: 'Created by Spotify Utils'
    },
    json: true
  };
  return request(params)
    .then(function(create_playlist_response) {
      return {
        id: create_playlist_response.id,
        name: create_playlist_response.name
      }
    });
}

function copySongs(access_token, src_id, dest_id) {
  getPlaylist(access_token, src_id)
    .then(function(get_playlist_response) {
      var songUris = [];
      for (var i = 0; i < get_playlist_response.tracks.items.length; i++) {
        songUris.push(get_playlist_response.tracks.items[i].track.uri);
      }
      return songUris;
    })
    .then(function(songUris) {
      var params = {
        method: 'POST',
        url: `https://api.spotify.com/v1/playlists/${dest_id}/tracks`,
        headers: {
          'Authorization': 'Bearer ' + access_token,
          'Content-Type': 'application/json'
        },
        body: {
          uris: songUris
        },
        json: true
      };
      return request(params);
    });
}

console.log('Listening on 8888');
app.listen(8888);
