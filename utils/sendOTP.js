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
    try{
        await transporter.sendMail({
        from : process.env.MAIL_USER,
        to : email,
        subject : 'Your OTP for BoardStack',
        text : `Your OTP is ${otp}. It will expire in 5 minutes\n\nThanks,\nBoardStack Team`
        })
    }catch(err){
        console.log("Error Occured",err.message)
    }
}