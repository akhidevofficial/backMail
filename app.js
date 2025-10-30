const express = require('express');
var path = require("path");
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cors = require('cors');
require("dotenv").config();

// ENV / configuration
const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY;
const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN; // ex: mg.example.com
const DEST_EMAIL = process.env.DEST_EMAIL;
const FROM_EMAIL = process.env.FROM_EMAIL || `no-reply@${MAILGUN_DOMAIN}`;

if (!MAILGUN_API_KEY || !MAILGUN_DOMAIN || !DEST_EMAIL) {
  console.error('Missing MAILGUN env vars (MAILGUN_API_KEY, MAILGUN_DOMAIN, DEST_EMAIL)');
  process.exit(1);
}

// Création du client Mailgun (utilise MAILGUN_API_BASE si besoin pour EU)
const FormData = require('form-data');
const Mailgun = require('mailgun.js');
const mailgun = new Mailgun(FormData);
const mg = mailgun.client({
  username: 'api',
  key: MAILGUN_API_KEY,
  ...(process.env.MAILGUN_API_BASE ? { url: process.env.MAILGUN_API_BASE } : {}),
});

const app = express();
app.use(helmet());
app.use(express.json({ limit: '8kb' })); // limite la taille du feedback
// configure CORS si tu veux limiter l'origine (optionnel)
app.use(cors({
  origin: true, // remplace par l'URL de ton app en production si souhaité
}));
app.use(express.urlencoded({ extended: false }));

app.use(express.static(path.join(__dirname, "public")));

// Rate limiter basique
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'), // 1 min
  max: parseInt(process.env.RATE_LIMIT_MAX || '6'), // 6 requêtes par fenêtre
  message: { error: 'Too many requests' },
});
app.use('/api/sendFeedback', limiter);

app.post('/api/sendFeedback', async (req, res) => {
  try {
    const { feedback } = req.body || {};
    if (typeof feedback !== 'string' || !feedback.trim()) {
      return res.status(400).json({ error: 'Missing feedback' });
    }

    // sanitation minimal (évite HTML/JS)
    const safe = feedback.trim().slice(0, 4000).replace(/<[^>]*>/g, '');

    // Envoi via mailgun.js
    try {
      const data = await mg.messages.create(MAILGUN_DOMAIN, {
        from: FROM_EMAIL,
        to: [DEST_EMAIL],
        subject: 'Feedback Gachanote (anonyme)',
        text: safe,
      });
      // succès
      return res.status(200).json({ ok: true, id: data.id || undefined });
    } catch (mgErr) {
      console.error('Mailgun error', mgErr);
      return res.status(500).json({ error: 'Failed to send' });
    }
  } catch (err) {
    console.error('sendFeedback err', err);
    return res.status(500).json({ error: 'Unexpected error' });
  }
});

// health
app.get('/health', (_, res) => res.send('ok'));

const port = process.env.PORT || 3000;

module.exports = app;

if (require.main === module) {
    app.listen(port, () => console.log(`sendFeedback server listening on ${port}`));
}