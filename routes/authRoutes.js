const router=require('express').Router();


const {sendOtpSignup, verifyOtpSignup, signin,acceptInvite}=require('../controllers/authController');


router.post('/send-otp',sendOtpSignup);
router.post('/register',verifyOtpSignup);
router.post('/login',signin);

router.post('/accept-invite', acceptInvite);

module.exports=router;