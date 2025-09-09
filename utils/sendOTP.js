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
            text: `Dear User,\n\nWe have received a request to verify your account on InteractHub. \n\nYour One-Time Password (OTP) is: **${otp}**\nThis OTP is valid for the next 5 minutes\n\nPlease enter it on the website to complete the verification process.\n\nIf you did not request this, please ignore this email.\n\nThank you for using InteractHub!\nBest regards,\nThe InteractHub Team`
        });

    }catch(err){
        console.log("Error Occured",err.message)
    }
}