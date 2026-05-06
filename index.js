require('dotenv').config();

const app = require('./server/app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`✅ TrucoMania rodando em http://localhost:${PORT}`);
});
