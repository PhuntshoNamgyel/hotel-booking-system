const app = require('./app');

const port = process.env.PORT || 3001;

app.listen(port, () => {
  console.log(JSON.stringify({ level: 'info', service: 'hotel-service', message: `Listening on port ${port}` }));
});