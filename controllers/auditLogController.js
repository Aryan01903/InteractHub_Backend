const AuditLog=require('../models/auditLogs')

exports.getAuditLogs=async(req,res)=>{
    const {tenantId}=req.user;

    try{
        const logs=await AuditLog.find({tenantId}).sort({createdAt : -1});
        res.status(200).json({logs})
    }catch(err){
        res.status(500).json({
            error : err.message
        })
    }
}