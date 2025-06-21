const AuditLog=require("../models/auditLogs")

exports.createAuditLog=async({userId,tenantId,action,details={}})=>{
    try{
        AuditLog.create({userId,tenantId,action,details});
    }catch(err){
        console.error("Failed to writre audit log : ",err.message)
    }
}