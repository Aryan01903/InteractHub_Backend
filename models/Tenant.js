const mongoose= require('mongoose')

const tenantSchema=new mongoose.Schema({
    name : {
        type : String,
        required : true,
        unique : true
    },
    logoUrl : {
        type : String
    },
    createdAt : {
        type : Date,
        default : Date.now
    }
})


module.exports=mongoose.model('Tenant',tenantSchema)