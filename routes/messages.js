var express = require('express');
var router = express.Router();
const mongoose = require('mongoose');

let { checkLogin } = require('../utils/authHandler.js');
let messageModel = require('../schemas/messages');
let userModel = require('../schemas/users');

function isValidObjectId(id) {
    return mongoose.Types.ObjectId.isValid(id);
}

router.get('/', checkLogin, async function (req, res, next) {
    try {
        const currentUserId = req.userId;

        if (!isValidObjectId(currentUserId)) {
            return res.status(400).send({ message: 'current user id is invalid' });
        }

        const currentUserObjectId = new mongoose.Types.ObjectId(currentUserId);

        const latestMessages = await messageModel.aggregate([
            {
                $match: {
                    $or: [
                        { from: currentUserObjectId },
                        { to: currentUserObjectId }
                    ]
                }
            },
            {
                $addFields: {
                    partner: {
                        $cond: [
                            { $eq: ['$from', currentUserObjectId] },
                            '$to',
                            '$from'
                        ]
                    }
                }
            },
            {
                $sort: { createdAt: -1 }
            },
            {
                $group: {
                    _id: '$partner',
                    lastMessage: { $first: '$$ROOT' }
                }
            },
            {
                $replaceRoot: { newRoot: '$lastMessage' }
            },
            {
                $sort: { createdAt: -1 }
            }
        ]);

        return res.send(latestMessages);
    } catch (err) {
        return res.status(400).send({ message: err.message });
    }
});

router.get('/:userID', checkLogin, async function (req, res, next) {
    try {
        const currentUserId = req.userId;
        const partnerId = req.params.userID;

        if (!isValidObjectId(partnerId)) {
            return res.status(400).send({ message: 'userID is invalid' });
        }

        const partnerUser = await userModel.findOne({
            _id: partnerId,
            isDeleted: false
        });

        if (!partnerUser) {
            return res.status(404).send({ message: 'user not found' });
        }

        const messages = await messageModel
            .find({
                $or: [
                    { from: currentUserId, to: partnerId },
                    { from: partnerId, to: currentUserId }
                ]
            })
            .sort({ createdAt: 1 });

        return res.send(messages);
    } catch (err) {
        return res.status(400).send({ message: err.message });
    }
});

router.post('/', checkLogin, async function (req, res, next) {
    try {
        const from = req.userId;
        const { to, messageContent } = req.body;

        if (!to || !isValidObjectId(to)) {
            return res.status(400).send({ message: 'to is invalid' });
        }

        if (String(from) === String(to)) {
            return res.status(400).send({ message: 'cannot send message to yourself' });
        }

        const receiver = await userModel.findOne({ _id: to, isDeleted: false });
        if (!receiver) {
            return res.status(404).send({ message: 'receiver not found' });
        }

        if (!messageContent || typeof messageContent !== 'object') {
            return res.status(400).send({ message: 'messageContent is required' });
        }

        const { type, text } = messageContent;
        if (!type || !['file', 'text'].includes(type)) {
            return res.status(400).send({ message: 'type must be file or text' });
        }

        if (typeof text !== 'string' || text.trim().length === 0) {
            return res.status(400).send({ message: 'text is required' });
        }

        const newMessage = new messageModel({
            from: from,
            to: to,
            messageContent: {
                type: type,
                text: text.trim()
            }
        });

        const savedMessage = await newMessage.save();

        return res.status(201).send(savedMessage);
    } catch (err) {
        return res.status(400).send({ message: err.message });
    }
});

module.exports = router;
