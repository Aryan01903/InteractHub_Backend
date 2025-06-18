const mongoose=require('mongoose')


const AuditLogSchema=new mongoose.Schema({
    tenantId : {
        type : mongoose.Schema.Types.ObjectId,
        ref : 'Tenant',
        required : true
    },
    userId : {
        type : mongoose.Schema.Types.ObjectId,
        ref : 'User',
        required : true
    },
    action : String,
    details : Object,
    createdAt : {
        type : Date,
        default : date.now
    }
})


module.exports=new mongoose.model('AuditLog',AuditLogSchema)