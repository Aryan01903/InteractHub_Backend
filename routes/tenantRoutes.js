const router=require('express').Router();
const isAdmin=require('../middlewares/isAdminMW')
const auth=require('../middlewares/authMW')
const {createTenant}=require('../controllers/tenantController')

router.post('/create',auth,isAdmin,createTenant)

module.exports=router;