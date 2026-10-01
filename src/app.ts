import express from 'express';

export const app = express();

app.get('/ping', (_req, res) => {
  res.json({ message: 'pong' });
});