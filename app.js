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

function isInGame(teams, userKey) {
    return _.chain(teams).flatten().map(_.values).flatten().find(function(k) {
        return k == userKey;
    }).value();
}

function userActiveGame(userName) {
    return new Promise(function(resolve) {
        dbSlackUsers.child(userName).once('value', function(userKey) {
            userKey = userKey.val();
            dbGames.once('value', function(games) { games = games.val();
                var userGame = _.findKey(games, function(game) {
                    if(game.endTime) {
                        return false;
                    }
                    return isInGame(game.teams, userKey);
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
                    var currentGames = {};
                    currentGames.pending = _.pickBy(games, function(game) { return !game.startTime; });
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
                    return teamFormatter(game.teams[game.winner]) + " won vs " + teamFormatter(game.teams[loser]) + " (" + moment(game.startTime).fromNow() + ")";
                } else {
                    return _.chain(game.teams).map(teamFormatter).join(" vs ").value();
                }
            }
            var result = "";

            if(games.activeGame) {
                result += "Active Game: " + gameFormatter(games.activeGame) + " (" + moment(games.activeGame.startTime).fromNow() + ")\n\n";
            }
            result += "Pending Games:\n";
            _.each(games.pending, function(game, key) {
                result += gameFormatter(game) + " (" + key + ")\n";
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
            if(gameInfo.game && _.every(gameInfo.game.teams, (team) => !_.isEmpty(team.player1) && !_.isEmpty(team.player2))) {
                return new Promise(function(resolve) {
                    dbActiveGame.child('gameId').set(gameInfo.$id);
                    dbGames.child(gameInfo.$id).child("startTime").set(moment().format(), resolver(resolve, "Started game"));
                });
            } else {
                return "Can't start a game without both teams full";
            }
        });
    },
    create: function(userName, teamMate, vsString, opp1, opp2) {
        return userActiveGame(userName).then(function(gameInfo) {
            if(gameInfo.game) {
                return "You are already in a game.";
            }

            return new Promise(function(resolve) {
                dbSlackUsers.once('value', function(users) {
                    users = users.val();

                    var players = _.map([teamMate, opp1, opp2], function(slackName) {
                        return slackName ? users[_.trim(slackName, "@")] : "";
                    })

                    dbGames.push({
                        teams: [
                            {
                                player1: users[userName] || "",
                                player2: players[0]
                            },
                            {
                                player1: players[1],
                                player2: players[2]
                            }
                        ]
                    }, resolver(resolve, "Created game"));
                });
            });
        });
    },
    join: function(userName, gameKey, teamId) {
        return userActiveGame(userName).then(function(gameInfo) {
            if(gameInfo.game) {
                return "You are already in a game.";
            }
            return new Promise(function(resolve) {
                if(!gameKey || !teamId) {
                    resolve("Must specify a valid game key and team index (1 or 2)");
                    return;
                }

                var teamRef = dbGames.child(gameKey).child('teams').child(teamId - 1);

                teamRef.once('value', function(team) {
                    team = team.val();
                    dbSlackUsers.child(userName).once('value', function(userKey) {
                        userKey = userKey.val();
                        if(_.isEmpty(team.player1)) {
                            teamRef.child('player1').set(userKey, resolver(resolve, "Joined game"));
                        } else if(_.isEmpty(team.player2)) {
                            teamRef.child('player2').set(userKey, resolver(resolve, "Joined game"));
                        } else {
                            resolve("No open players in game " + gameKey);
                        }
                    });
                });
            });
        });
    },
    result: function(userName, result) {
        var won = _.includes(['winner', 'won', 'win'], result);

        return new Promise(function(resolve) {
            dbSlackUsers.child(userName).once('value', function(userKey) { userKey = userKey.val();
                dbActiveGame.child('gameId').once('value', function(gameId) { gameId = gameId.val();
                    dbGames.child(gameId).child('teams').once('value', function(teams) { teams = teams.val();
                        if(!isInGame(teams, userKey)) {
                            resolve('You are not in the current active game');
                            return;
                        }

                        var teamIndex = _.findKey(teams, function(team) {
                            return team.player1 == userKey;
                        });

                        dbActiveGame.child('gameId').remove();
                        dbGames.child(gameId).update({
                            "winner": (won ? teamIndex : Number(!teamIndex)),
                            "endTime": moment().format()
                        }, resolver(resolve, "Recorded game result: You " + (won ? "won" : "lost")));
                    });
                });
            });
        });
    },

    me: function(username, optional_number) {
        return new Promise(function(resolve) {
            resolve("you want your ranking? try again later!");
        });
    },

    rankings: function(username, optional_number) {
        return new Promise(function(resolve) {
            resolve("rankings will be awesome!");
        });
    },

    help: function(userName, result) {
        return new Promise(function(resolve) {
            var response = "Available Commands are:";
            response += "\nregister $Handy_Email (registers you as a handy foosballer)";
            response += "\ngames (displays pending, current, and past games)";
            response += "\nstart (start pending game)";
            response += "\ncreate [optional $teamMate vs $opp1 $opp2] (create a new game with the listed players if provided)";
            response += "\njoin $gamekey $team (1 or 2) (join an existing game)";
            response += "\nresult $won_or_lost (set the current game result)";
            response += "\nrankings [optional # or 'all'] (no number given, show top 10, number given, show x, 'all' show all)";
            response += "\nme (shows ranking, W/L record)";
            resolve(response);
        });
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

        if(!commands[_.head(command)]) {
            res.send("Invalid command: " + _.head(command));
            return;
        }

        _.spread(commands[_.head(command)])(_.flatten([req.body.user_name, _.tail(command)]))
        .then(function(response) {
            res.send(response);
        });
    }
});

app.listen(port, function() {
    console.log('Express listening on port ' + port);
});
