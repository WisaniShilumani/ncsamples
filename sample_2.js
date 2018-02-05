//Node js - backend end

//================================================================================//
//============== Snippet 1 - Whiteboard using socket.io and heroku ===============//
//================================================================================//
//initiating the express app on port 3000
var express = require('express'),
    http = require('http');
var app = express();
var server = http.createServer(app);
var io = require('socket.io').listen(server);
var _ = require('lodash');


server.listen(3000);
app.use(express.static(__dirname + '/public'))

var boards = ['same_board'] //start off in the first initial board ('Waiting board')
var line_history = []; //nothing in the drawing history
var userids = []; //the users in the board
io.on('connection', socket => { //on the event of a successful connection
  socket.on('adduser', user => {  //when the front end calls 'adduser' to the websocket, with user data (including boardid)
    if(boards.indexOf(user.boardid) == -1) { //if no such board exists
      boards.push(user.boardid); //add new board
    }
    socket.username = user.username;
    console.log(`${user.username} has connected to this room`)
    socket.room = user.boardid; //the room is the board id
    socket.join(user.boardid); //join the room
    socket.emit('updateboard','SERVER', `you have connected to ${user.boardid}`);
    socket.broadcast.to(user.boardid).emit('updateboard','SERVER', `${user.username} has connected to this room`); //broadcast to everyone in the room
    socket.emit('updateboards', boards, user.boardid)
  })

  socket.on('disconnect', ()=> {
    socket.leave(socket.room); //leave the room if socket is disconnected
  })
  for(var i in line_history) {
    socket.emit('draw_line', {line: line_history[i]}); //if there is anything in the linehistory, emit a 'draw_line' event
  }

  socket.on('draw_line', data => { //the draw_line event draws lines in the board that are picked up by everyone in the room; 
    line_history.push(data.line); //adds it to the line_history so that anyone who joins the room receives it
    io.sockets.in(socket.room).emit('draw_line', {line: data.line})
  })
})

//================================================================================//
//=== Snippet 2 - Simple customer management using Mongo, Express and Node.js ====//
//================================================================================//

const express = require('express');
const routes = require('./src/routes/customerRoutes');
const bodyParser = require('body-parser');

const app = express();
const PORT = 3000;

//bodyparser
app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json());

routes(app);

app.get('/', (req, res) => {
    res.send(`Node and express server is running on port ${PORT}`)
})

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`)
})

//....................................in ./src........................................//
//====================================================================================//
//routes/customerRoutes
var mongo = require('mongodb').MongoClient;

var url = "mongodb://localhost:27017/awesomedb";
var collection;
mongo.connect(url, (err,db) => {
    console.log("Mongo db connected successfully!");
    const awesomedb = db.db('awesomedb');
    collection = awesomedb.collection('customers');
})
const routes = (app) => {
    app.route('/customers') 
    .get((req, res) => { //Get the customer list
        var findObject = {};
        for(var key in req.query) {
            findObject[key] = req.query[key];
        }
        collection.find(findObject).toArray((err, customers) => {
            if(customers.length < 1) {
                res.send("No customers to list")
            } else {
                res.send(customers);
            }
            
        })
    }) //Add new customer
    .post((req, res) => {
        console.log(req.body);
        collection.insertOne(req.body, (err, result) => {
            res.send(req.payload);
        })
    });

    
    app.route('/customers/:name')
    .get((req, res) => { //Get a single customer
        collection.findOne({"firstName": req.params.name}, (err, customer) => {
            if(customer == null) {
                res.send("Customer not found");
            } else {
                res.send(customer);
            }
        })
    })
    .put((req, res) => { //Update a single custoemr
        collection.updateOne({firstName: req.params.name}, {
            $set: req.body
        }, (err, results) => {
            collection.findOne({firstName: req.params.name}, (err, customer) => {
                res.send(customer);
            })
        })
    })
    .delete((req, res) => { //Delete a single customer
        collection.deleteOne({"firstName": req.params.name}, (err, results) => {
            res.status(204).send()
        })     
    });
}

module.exports = routes; 

//================================================================================//
//====== Snippet 3 - Firebase Cloud Functions for Class Room notifications =======//
//================================================================================//
'use strict';

const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp(functions.config().firebase);

/**
 * Triggers when a user gets a new follower and sends a notification.
 *
 * Followers add a flag to `/followers/{followedUid}/{followerUid}`.
 * Users save their device notification tokens to `/users/{followedUid}/notificationTokens/{notificationToken}`.
 */
//GET HELP NOTIFICATION (remember this must have topics, and then student can push topic to archive if satisfied)
//We must decide if learner must get teacher name, this can get perverse
exports.helpNotification = functions.database.ref(`/classhelp/{classID}/{studentID}/topic/{pushkey}`).onWrite(event => {
  const classId = event.params.classID;
  const studentId = event.params.studentID;
  const pushKey = event.params.pushkey;
  const helpmessage = event.data.val();
  const getClassroomPromise = admin.database().ref(`/classrooms/${classId}`).once('value');
  const getHelpNode = admin.database().ref(`/classhelp/${classId}/${studentId}`).once('value');
  return Promise.all([getClassroomPromise,getHelpNode]).then(results => {
  
    const classSnapshot = results[0].val();
    const helpNode = results[1].val();
    const payload = {
      notification: {
        title: `${helpNode.title} Help`,
        body: `Your ${classSnaphost.name} teacher has responded`,
        icon: 'icon',//use some default icon
        tag: classId+': help'
      }
    };

    // Send notifications to topic.
    admin.messaging().sendToTopic(classId, payload)
    return 'ok';
  }) 
});

//GET ANNOUNCEMENT NOTIFICATION
exports.annoucementNotification = functions.database.ref(`/announcements/{classID}/{pushkey}`).onWrite(event => {
  const classId = event.params.classID;
  const pushKey = event.params.pushkey;
  const announcement = event.data.val();
  const getClassroomPromise = admin.database().ref(`/classrooms/${classId}`).once('value').then(result => {
    const classSnapshot = result.val();
    const maxLength = 55;
    var smallString = announcement.body;
    if(smallString.length > maxLength) {
      smallString = smallString.substr(0,maxLength-3) + '...'
    }
    const payload = {
      notification: {
        title: `${classSnapshot.name} Announcement`,
        body: `${announcement.title}: ${smallString}`,
        icon: 'icon',//use some default icon
        tag: classId+':'+ announcement.title
      }
    };

    // Send notifications to topic.
    admin.messaging().sendToTopic(classId, payload)
    return 'ok';
  }) 
});

//GET ASSIGNMENT NOTIFICATION
exports.assignmenttNotification = functions.database.ref(`/assignments/{classID}/{pushkey}`).onWrite(event => {
  const classId = event.params.classID;
  const pushKey = event.params.pushkey;
  const assignment = event.data.val();

  const getClassroomPromise = admin.database().ref(`/classrooms/${classId}`).once('value').then(result => {
    const classSnapshot = result.val();
    const maxLength = 55;
    var smallString = assignment.body;
    if(smallString.length > maxLength) {
      smallString = smallString.substr(0,maxLength-3) + '...'
    }
    const payload = {
      notification: {
        title: `New ${classSnapshot.name} Assignment`,
        body: `${assignment.title}: ${smallString}`,
        icon: 'icon',//use some default icon
        tag: classId+':'+ assignment.title
      }
    };

    // Send notifications to topic.
    admin.messaging().sendToTopic(classId, payload)
    return 'ok';
  }) 
})
 //GRADEBOOK NOTIFICATIONS
exports.sendGradebookNotification = functions.database.ref(`/gradebook/{classID}/marks/{pushkey}/students/{studentID}`).onWrite(event => {
  const classId = event.params.classID;
  const grade = event.data.val();
  const pushKey = event.params.pushkey;
  const getClassroomPromise = admin.database().ref(`/classrooms/${classId}`).once('value');
  const markInfoPromise = admin.database().ref(`/gradebook/${classId}/marks/${pushKey}`).once('value');

  return Promise.all([getClassroomPromise, markInfoPromise]).then(results => {
    const classSnapshot = results[0].val()
    const markSnapshot = results[1].val();
    // Notification details.
    console.log(markSnapshot);
    console.log(classSnapshot);
    const payload = {
      notification: {
        title: `${classSnapshot.name} ${markSnapshot.name} Marks`,
        body: `Your gradebook has been updated with ${markSnapshot.name} marks`,
        icon: 'icon',//use some default icon
        tag: classId+':'+ markSnapshot.name
      }
    };

    // Send notifications to topic.
    admin.messaging().sendToTopic(classId, payload)
    return 'ok';
  })


})

//CHAT ROOM NOTIFICATIONS
exports.sendChatNotification = functions.database.ref('/chatrooms/{classID}/{pushkey}/').onWrite(event => {
  const classId = event.params.classID;
  const pushkey = event.params.pushkey;
  const message = event.data.val();
  // If un-follow we exit the function.
  if (!event.data.val()) {
    return console.log('User ', followerUid, 'un-followed user', followedUid);
  }
  console.log(`${message.name}: ${message.text}`);

  // Get the follower profile.
  const getUserProfilePromise = admin.auth().getUser(message.uid);

  // Get the classroom details
  const getClassroomPromise = admin.database().ref(`/classrooms/${classId}`).once('value');

  return Promise.all([getClassroomPromise, getUserProfilePromise]).then(results => {
    const classSnapshot = results[0].val();
    const sender = results[1];
    const maxLength = 55;

    console.log(classSnapshot);
    var shortMsg = message.text;
    if(shortMsg.length > maxLength) {
      shortMsg = shortMsg.substr(0,maxLength-3) + '...'
    }

    // Notification details.
    const payload = {
      notification: {
        title: `${classSnapshot.name} Chat`,
        body: `${message.name}: ${shortMsg}`,
        icon: sender.photoURL,
        tag: classId+":chat"
      }
    };

    // Listing all tokens.
    //const tokens = Object.keys(tokensSnapshot.val());

    // Send notifications to all tokens.
    admin.messaging().sendToTopic(classId, payload)
    return 'ok';
  });
});