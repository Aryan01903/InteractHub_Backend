const Whiteboard=require('../models/board.model')
const {createAuditLog}=require('../utils/createAuditLog')

exports.createWhiteboard=async(req,res)=>{
    const {name,data}=req.body;
    const {_id : userId,tenantId}=req.user;

    try{
        const whiteboard=await Whiteboard.create({
            name,
            data,
            tenantId,
            createdBy : userId
        })
        await createAuditLog({
            userId,
            tenantId,
            action : 'create-whiteboard',
            details : {name}
        })
        res.status(201).json(whiteboard)
    }catch(err){
        res.status(500).json({
            error : err.message
        })
    }
}

exports.updateWhiteboard=async(req,res)=>{
    const {id}=req.params;
    const {data}=req.body;
    const {_id : userId,tenantId}=req.user;

    try{
        const board=await Whiteboard.findOne({_id : id,tenantId});

        if(!board){
            return res.status(404).json({
                error : 'Whiteboard not found'
            })
        }

        // save current state to versions
        board.versions.push({data : board.data});
        board.data=data;
        await board.save();
        await createAuditLog({
            userId,
            tenantId,
            action : 'update-whiteboard',
            details : {whiteboard : id}
        }) 
        res.satus(200).json(board)
    }catch(err){
        res.status(500).json({
            error : err.message
        })
    }
}
// get all whiteboards
exports.getWhiteboards=async(req,res)=>{
    try{
        const boards=await Whiteboard.find({tenantId : req.user.tenantId});
        res.status(200).json(boards)
    }catch(err){
        res.status(500).json({
            error : err.message
        })
    }
}

// get specific Whiteboard by ID
exports.getWhiteboardsById=async(req,res)=>{
    try{
        const board=await Whiteboard.findOne({
            _id : req.params.id,
            tenantId : req.user.tenantId
        })
        if(!board){
            return res.status(404).json({
                error : 'Whiteboard not found'
            })
        }
        res.status(200).json(board);
    }catch(err){
        res.status(500).json({
            error : err.message
        })
    }
}

// get all versions of Whiteboard
exports.getWhiteboardVersions=async(Request,res)=>{
    try{
        const board=await Whiteboard.findOne({
            _id : req.params.id,
            tenantId : req.user.tenantId
        })
        if(!board){
            return res.status(404).json({
                error : 'Whityeboard not found'
            })
        }
        res.status(200).json(board.versions)
    }
    catch(err){
        res.status(500).json({
            error : err.message
        })
    }
}

// POST restore to a previous versions
exports.restoreVersion=async(req,res)=>{
    const {id,versionIndex}=req.params;
    const {_id : userId,tenantId}=req.user;

    try{
        const board=await Whiteboard.findOne({_id : id,tenantId})
        if(!board){
            return res.status(404).json({
                error : 'Whiteboard not found'
            })
        }
        if(!board.versions[versionIndex]){
            return res.status(400).json({
                error : 'Version index invalid'
            })
        }

        // save current version before restoring
        board.versions.push({data : board.data})
        board.data=board.versions[versionIndex].data;
        await board.save();

        await createAuditLog({
            userId,
            tenantId,
            action : 'restore-version',
            details : {whiteboardId : id,restoreVersion : versionIndex}
        })
        res.satus(200).json({
            message : 'Whiteboard restored to previous version',board
        })
    }catch(err){
        res.status(500).json({
            error : err.message
        })
    }
}