const app = require('./app');

const port = process.env.PORT || 3004;

app.listen(port, () => {
  console.log(JSON.stringify({ level: 'info', service: 'notification-service', message: `Listening on port ${port}` }));
});