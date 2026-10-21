const app = require('./app');

const port = process.env.PORT || 3003;

// Only the REST API for now. Messaging is added in Step 3.
app.listen(port, () => {
  console.log(
    JSON.stringify({
      time: new Date().toISOString(),
      level: 'info',
      service: 'payment-service',
      message: 'Listening',
      port: Number(port),
    })
  );
});