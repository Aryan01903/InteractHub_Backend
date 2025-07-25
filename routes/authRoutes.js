const router=require('express').Router();
const authMW=require("../middlewares/authMW")
const isAdmin=require('../middlewares/isAdminMW')

const {sendOtpSignup, signin, getAllMembers, verifyOtp, deleteMember, sendInvite, userLogout}=require('../controllers/authController');


router.post('/register', sendOtpSignup);
router.post('/verify-otp', verifyOtp);
router.post('/login', signin);
router.get('/members',authMW, getAllMembers);
router.post('/accept-invite', sendInvite);
router.post('/sendInvite',authMW,isAdmin,sendInvite);
router.delete('/deleteMember', authMW, isAdmin, deleteMember);
router.post('/logout',userLogout);

module.exports=router;