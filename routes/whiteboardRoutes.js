const router=require('express').Router()
const {createWhiteboard,updateWhiteboard,getWhiteboards,getWhiteboardsById,getWhiteboardVersions,restoreVersion}=require('../controllers/whiteboardController')
const authMW=require('../middlewares/authMW')
router.post('/create',authMW,createWhiteboard)
router.put('/update/:id',authMW,updateWhiteboard)
router.get('/get',authMW,getWhiteboards);
router.get('/get/:id',authMW,getWhiteboardsById)
router.get('/get/:id/versions',authMW,getWhiteboardVersions)
router.get('/get/:id/restore/:versionIndex',authMW,restoreVersion)

module.exports=router;