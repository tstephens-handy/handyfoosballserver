var express = require('express'),
    firebase = require('firebase'),
    Promise = require('bluebird'),
    app = express(),
    SLACK_TOKEN = 'mDaXXt5QKddzhdQ5pA5cjBdH';

process.env.PORT = process.env.PORT || 3000;

app.get('/', function(req, res) {
    res.send('Hello foos!');
});

app.post('/', function(req, res) {
    if(req.body.token != SLACK_TOKEN) {
        res.status(404).send("Invalid token");
    } else {
        res.send(req.body);
    }
});

app.listen(process.env.PORT, function() {
    console.log('Express listening on port ' + process.env.PORT);
});
