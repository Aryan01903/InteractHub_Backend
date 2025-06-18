const mongoose=require('mongoose')

const versionSchema=new mongoose.Schema({
    data : Object,
    createdAt : {
        type : Date,
        default : Date.now
    }
})

const WhiteboardSchema=new mongoose.Schema({
    name : {
        type : String,
        required : true,
    },
    tenantId : {
        type : mongoose.Schema.Types.ObjectId,
        ref : 'Tenant',
        required : true
    },
    createdBy : {
        type : mongoose.Schema.Types.ObjectId,
        ref : 'User',
        required : true
    },
    data : Object,
    versions : [versionSchema],
    createdAt : {
        type : Date, 
        default : Date.now
    },
    updatedAt : {
        type : Date,
        default : Date.now
    }

})

WhiteboardSchema.pre('save',function(next){
    this.updatedAt=Date.now();
    next();
})

module.exports=mongoose.model("Whiteboard",WhiteboardSchema)
