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
            from: process.env.MAIL_USER,
            to: email,
            subject: 'Your OTP for InteractHub',
            text: `Dear User,\nWe have received a request to verify your account on InteractHub. \nYour One-Time Password (OTP) is: **${otp}**\nThis OTP is valid for the next 5 minutes\nPlease enter it on the website to complete the verification process.\nIf you did not request this, please ignore this email.\nThank you for using InteractHub!\nBest regards,\nThe InteractHub Team`
        });

    }catch(err){
        console.log("Error Occured",err.message)
    }
}