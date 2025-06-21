const router=require('express').Router();
const auth=require('../middlewares/authMW')
const {getAuditLogs}=require('../controllers/auditLogController')
router.get('/',auth,getAuditLogs);

module.exports=router;