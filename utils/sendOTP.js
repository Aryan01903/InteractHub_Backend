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
            text: `
                Dear User,

                We have received a request to verify your account on InteractHub.

                Your One-Time Password (OTP) is: **${otp}**

                This OTP is valid for the next 5 minutes. Please enter it on the website to complete the verification process.

                If you did not request this, please ignore this email.

                Thank you for using InteractHub!

                Best regards,
                The InteractHub Team
            `
        });

    }catch(err){
        console.log("Error Occured",err.message)
    }
}