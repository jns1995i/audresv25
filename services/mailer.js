require('dotenv').config()
const nodemailer = require("nodemailer")

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

async function send(to, subject, html, text = "") {
    const options = {
        from: `"${process.env.MAIL_SENDER_NAME}" <${process.env.MAIL_SENDER}>`,
        to,
        subject,
        text,
        html
    }

    const info = await transporter.sendMail(options)
    console.log("Email send:", info.messageId, info)

    return info
}

async function template(content) {
    return `
    <!DOCTYPE html> 
    <html lang="en"> 
    <head> 
        <meta charset="UTF-8"> 
        <meta name="viewport" content="width=device-width, initial-scale=1.0"> 
        <title>AUDRES</title> 
    </head>
    <body style=" margin: 0; padding: 0; background-color: #f4f6f8; font-family: Arial, Helvetica, sans-serif; color: #333333; ">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f4f6f8; padding: 40px 15px;">
            <tr>
                <td align="center">
                    <!-- Main Container -->
                    ${content}
                </td>
            </tr>
            <tr> 
                <td style=" padding: 20px 30px; background-color: #f8fafc; border-top: 1px solid #e5e7eb; text-align: center; "> 
                    <p style=" margin: 0; font-size: 12px; line-height: 1.5; color: #888888; "> This is an automated message from AUDRES. Please do not reply to this email. </p> 
                </td> 
            </tr>
        </table>
    </body>
    </html>
    `
}


const mailer = {
    verify,
    send,
    template
}

module.exports = mailer