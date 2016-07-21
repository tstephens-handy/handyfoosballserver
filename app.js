let express = require('express'),
    firebase = require('firebase'),
    Promise = require('bluebird'),
    app = express();

app.get('/', (req, res) => {
    res.send('Hello world2');
});

app.listen(3000, () => {
    console.log('Express listening on port 3000');
});
