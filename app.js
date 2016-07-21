var express = require('express'),
    firebase = require('firebase'),
    Promise = require('bluebird'),
    _ = require('lodash'),
    app = express(),
    SLACK_TOKEN = 'mDaXXt5QKddzhdQ5pA5cjBdH',
    port = process.env.PORT || 3000;

app.use(require('body-parser').urlencoded({extended:false}));

firebase.initializeApp({
    serviceAccount: 'cred.json',
    databaseURL: 'https://handyfoosball.firebaseio.com'
});

var db = firebase.database().ref(),
    dbUsers = db.child('users'),
    dbGames = db.child('games'),
    dbActiveGame = db.child('activeGame');

var commands = {
    register: function(userName, email) {
        return new Promise(function(resolve, reject) {
            resolve("Registered " + email + " to " + userName);
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
        // res.send(JSON.stringify(command));

        commands['register'](req.body.user_name, command[1]).then(res.send);


            // _.spread(commands[_.head(command)])(req.body.user_name, _.tail(command)));
    }
});

app.listen(port, function() {
    console.log('Express listening on port ' + port);
});
