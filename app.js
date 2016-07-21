var express = require('express'),
    firebase = require('firebase'),
    Promise = require('bluebird'),
    app = express();

process.env.PORT = process.env.PORT || 3000;

app.get('/', function(req, res) {
    res.send('Hello world2');
});

app.listen(process.env.PORT, function() {
    console.log('Express listening on port ' + process.env.PORT);
});
