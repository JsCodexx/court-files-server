import app from './app';

const port = Number(process.env.PORT) || 5500;

app.listen(port, () => {
  console.log(`Court Files API listening on http://localhost:${port}`);
});
