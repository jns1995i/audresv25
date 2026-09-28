require('dotenv').config()
const nodemailer = require("nodemailer")

console.log("SMTP:", process.env.SMTP_HOST, process.env.SMTP_PORT)

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: process.env.SMTP_SECURE === "true",
    tls: {
        rejectUnauthorized: true
    },
    logger: true,
    debug: true
})

async function verify() {
    try {
        await transporter.verify()

        console.log("SMTP connection successfull")
    } catch (error) {
        console.error("SMTP connection failed:", error)
    }
}

async function send({ to, subject, text, html = "<h2>Watas</h2>" }) {
    const options = {
        from: `"${process.env.MAIL_SENDER_NAME}" <${process.env.MAIL_SENDER}>`,
        to,
        subject,
        text,
        html
    }

    console.log("Send Options:", options)

    const info = await transporter.sendMail(options)

    console.log("Email send:", info.messageId, info)

    return info
}


const mailer = {
    verify,
    send,
}

module.exports = mailer