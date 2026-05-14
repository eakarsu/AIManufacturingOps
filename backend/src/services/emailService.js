const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
});

async function sendPasswordReset(to, token) {
  if (!process.env.SMTP_USER) {
    console.log('Email skipped: no SMTP config');
    return;
  }
  await transporter.sendMail({
    from: process.env.SMTP_FROM || 'noreply@manufacturing.com',
    to,
    subject: 'Password Reset',
    html: `<p>Reset: <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${token}">Click here</a></p>`
  });
}

module.exports = { sendPasswordReset };
