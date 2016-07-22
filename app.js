var express = require('express'),
    firebase = require('firebase'),
    Promise = require('bluebird'),
    bodyParser = require('body-parser'),
    _ = require('lodash'),
    moment = require('moment'),
    app = express(),
    SLACK_TOKEN = 'mDaXXt5QKddzhdQ5pA5cjBdH',
    port = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended:false}));

firebase.initializeApp({
    serviceAccount: 'cred.json',
    databaseURL: 'https://handyfoosball.firebaseio.com'
});

var db = firebase.database().ref(),
    dbUsers = db.child('users'),
    dbGames = db.child('games'),
    dbActiveGame = db.child('activeGame'),
    dbSlackUsers = db.child('slackUsers');

function userActiveGame(userName) {
    return new Promise(function(resolve) {
        dbSlackUsers.child(userName).once('value', function(userKey) {
            userKey = userKey.val();
            dbGames.once('value', function(games) { games = games.val();
                var userGame = _.findKey(games, function(game) {
                    if(game.endTime) {
                        return false;
                    }
                    return _.chain(game.teams).flatten().map(_.values).flatten().find(function(k) {
                        return k == userKey;
                    }).value();
                });

                resolve({$id: userGame, game: games[userGame]});
            });
        });
    });
}

function resolver(resolve, success) {
    return function(err) {
        if(err) {
            resolve("Error:" + err);
        } else {
            resolve(success);
        }
    };
}

var commands = {
    register: function(userName, email) { return new Promise(function(resolve) {
        dbUsers.once('value', function(users) { users = users.val();
            var userKey = _.findKey(users, function(user, key) { return user.email == email; });
            if(!userKey) {
                resolve("Could not find user with email: " + email);
            } else {
                dbUsers.child(userKey).child('slack').set(userName);
                dbSlackUsers.child(userName).set(userKey, resolver(resolve, "Registered " + email + " to " + userName));
            }
        });
    });},
    games: function() { return Promise.all([
            new Promise(function(resolve) {
                dbGames.once('value', function(games) { games = games.val();
                    let currentGames = {};
                    currentGames.pending = _.chain(games).values().filter(function(game) { return !game.startTime; }).value();
                    currentGames.past = _.chain(games)
                        .values()
                        .filter(function(game) { return !!game.endTime; })
                        .sortBy(function(game) { return -moment(game.endTime).unix(); })
                        .take(10)
                        .value();
                    dbActiveGame.child('gameId').once('value', function(game) {
                        if(game && game.val()) {
                            currentGames.activeGame = games[game.val()];
                        }
                        resolve(currentGames);
                    });
                });
            }),
            new Promise(function(resolve) {
                dbUsers.once('value', function(users) { resolve(users.val()); });
            })
        ]).spread(function(games, users) {
            function teamFormatter(team) {
                var player1 = users[team.player1],
                    player2 = users[team.player2];
                player1 = player1 ? (player1.slack || player1.displayName) : "open";
                player2 = player2 ? (player2.slack || player2.displayName) : "open";
                return player1 + " & " + player2;
            }
            function gameFormatter(game) {
                if(game.winner !== undefined) {
                    var loser = Number(!game.winner);
                    return teamFormatter(game.teams[game.winner]) + " won vs " + teamFormatter(game.teams[loser]);
                } else {
                    return _.chain(game.teams).map(teamFormatter).join(" vs ").value();
                }
            }
            var result = "";

            if(games.activeGame) {
                result += "Active Game: " + gameFormatter(games.activeGame) + " (" + moment(games.activeGame.startTime).fromNow() + ")\n\n";
            }
            result += "Pending Games:\n";
            _.each(games.pending, function(game) {
                result += gameFormatter(game) + "\n";
            });
            result += "\nLast " + games.past.length + " Games:\n";
            _.each(games.past, function(game) {
                result += gameFormatter(game) + "\n";
            });

            return result;
        });
    },
    start: function(userName) {
        return userActiveGame(userName).then(function(gameInfo) {
            console.log("User's active game:");
            console.log(gameInfo);
            if(_.every(gameInfo.game.teams, (team) => !_.isEmpty(team.player1) && !_.isEmpty(team.player2))) {
                return new Promise(function(resolve) {
                    dbGames.child(gameInfo.$id).child("startTime").set(moment().format(), resolver(resolve, "Started game"));
                });
            } else {
                return "Can't start a game without both teams full";
            }
        });
    },
    create: function(userName) {

    }
};

app.get('/', function(req, res) {
    res.send('Hello foos!');
});

app.post('/', function(req, res) {
    if(req.body.token != SLACK_TOKEN) {
        res.send("Invalid token: " + req.body.token);
    } else {
        if(_.isEmpty(req.body.text)) {
            res.send("No command specified");
            return;
        }
        var command = _.split(req.body.text, " ");

        _.spread(commands[_.head(command)])(_.flatten([req.body.user_name, _.tail(command)]))
        .then(function(response) {
            res.send(response);
        });
    }
});

app.listen(port, function() {
    console.log('Express listening on port ' + port);
});
