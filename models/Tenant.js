const mongoose= require('mongoose')

const tenantSchema=new mongoose.Schema({
    name : {
        type : String,
        required : true,
        unique : true
    },
    adminEmails : {
        type : [String],
        required : true,
        unique : false
    },
    createdAt : {
        type : Date,
        default : Date.now
    }
})


module.exports=mongoose.model('Tenant',tenantSchema)