var express = require('express'),
    firebase = require('firebase'),
    Promise = require('bluebird'),
    app = express(),
    SLACK_TOKEN = 'mDaXXt5QKddzhdQ5pA5cjBdH',
    port = process.env.PORT || 3000;

app.get('/', function(req, res) {
    res.send('Hello foos!');
});

app.post('/', function(req, res) {
    res.send('Something else');
    return;
    if(req.body.token != SLACK_TOKEN) {
        res.send("Invalid token");
    } else {
        res.send(req.body);
    }
});

app.listen(port, function() {
    console.log('Express listening on port ' + port);
});
