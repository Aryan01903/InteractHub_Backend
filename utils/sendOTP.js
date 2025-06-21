const nodemailer=require('nodemailer')
require('dotenv').config();
const transporter  =  nodemailer.createTransport({
    service : 'gmail',
    auth : {
        user: process.env.MAIL_USER,
        pass : process.env.MAIL_PASS
    }
})

module.exports=async function sendOTP(email,otp){
    await transporter.sendMail({
        from : process.env.MAIL_USER,
        to : email,
        subject : 'Your OTP for CollabBoard',
        text : `Your OTP is ${otp}. It will expire in 5 minutes`
    })
}