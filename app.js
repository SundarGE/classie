
/**
 * Module dependencies.
 */

var express = require('express');

var http = require('http');
var path = require('path');
var fs = require('fs');
var app = express();

var    chatClients = new Object();

// all environments
app.set('port', process.env.PORT || 3000);

app.use(express.logger('dev'));
app.use(express.json());
app.use(express.urlencoded());
app.use(express.methodOverride());
app.use(express.static(path.join(__dirname, 'public')));

// development only
if ('development' == app.get('env')) {
  app.use(express.errorHandler());
}

// dynamically include models 
fs.readdirSync(__dirname+'/models').forEach(function (file) {
  if(file.substr(-3) == '.js') {
	  require(__dirname+'/models/' + file);
  }
});

// dynamically include routes (Controller)
	fs.readdirSync(__dirname+'/controllers').forEach(function (file) {
	  if(file.substr(-3) == '.js') {
		  route = require(__dirname+'/viewcontrollers/' + file);
		  route.controller(app,db,sessionHandler);
	  }
	});

app.get('/', function(req, res){
	res.sendfile('views/index.html');
});

var server=http.createServer(app);

	var io = require('socket.io').listen(server);
	io.set('log level', 2);

// sets the log level of socket.io, with
// log level 2 we wont see all the heartbits
// of each socket but only the handshakes and
// disconnections
io.set('log level', 2);

// setting the transports by order, if some client
// is not supporting 'websockets' then the server will
// revert to 'xhr-polling' (like Comet/Long polling).
// for more configurations got to:
// https://github.com/LearnBoost/Socket.IO/wiki/Configuring-Socket.IO
io.set('transports', [ 'websocket', 'xhr-polling','polling', 'jsonp-polling' ]);

//io.set('transports',['polling']);
// socket.io events, each connection goes through here
// and each event is emited in the client.
// I created a function to handle each event
	sockets.on('connection', function(socket){
	// after connection, the client sends us the 
	// nickname through the connect event
	socket.on('connect', function(data){
		console.log('receiving');
		connect(socket, data);
	});

	// when a client sends a messgae, he emits
	// this event, then the server forwards the
	// message to other clients in the same room
	socket.on('chatmessage', function(data){
		chatmessage(socket, data);
	});
	
	// client subscribtion to a room
	socket.on('subscribe', function(data){
		subscribe(socket, data);
	});

	// client unsubscribtion from a room
	socket.on('unsubscribe', function(data){
		unsubscribe(socket, data);
	});
	
	// when a client calls the 'socket.close()'
	// function or closes the browser, this event
	// is built in socket.io so we actually dont
	// need to fire it manually
	socket.on('disconnect', function(){
		disconnect(socket);
	});
});

// create a client for the socket
function connect(socket, data){
	//generate clientId
	data.clientId = generateId();

	// save the client to the hash object for
	// quick access, we can save this data on
	// the socket with 'socket.set(key, value)'
	// but the only way to pull it back will be
	// async
	chatClients[socket.id] = data;

	// now the client objtec is ready, update
	// the client
	socket.emit('ready', { clientId: data.clientId });
	
	// auto subscribe the client to the 'lobby'
	subscribe(socket, { room: 'lobby' });

	// sends a list of all active rooms in the
	// server
	socket.emit('roomslist', { rooms: getRooms() });
}

// when a client disconnect, unsubscribe him from
// the rooms he subscribed to
function disconnect(socket){
	// get a list of rooms for the client
	var rooms = io.sockets.manager.roomClients[socket.id];
	
	// unsubscribe from the rooms
	for(var room in rooms){
		if(room && rooms[room]){
			unsubscribe(socket, { room: room.replace('/','') });
		}
	}

	// client was unsubscribed from the rooms,
	// now we can selete him from the hash object
	delete chatClients[socket.id];
}

// receive chat message from a client and
// send it to the relevant room
function chatmessage(socket, data){
	// by using 'socket.broadcast' we can send/emit
	// a message/event to all other clients except
	// the sender himself
	socket.broadcast.to(data.room).emit('chatmessage', { client: chatClients[socket.id], message: data.message, room: data.room });
}

// subscribe a client to a room
function subscribe(socket, data){
	// get a list of all active rooms
	var rooms = getRooms();

	// check if this room is exist, if not, update all 
	// other clients about this new room
	if(rooms.indexOf('/' + data.room) < 0){
		socket.broadcast.emit('addroom', { room: data.room });
	}

	// subscribe the client to the room
	socket.join(data.room);

	// update all other clients about the online
	// presence
	updatePresence(data.room, socket, 'online');

	// send to the client a list of all subscribed clients
	// in this room
	socket.emit('roomclients', { room: data.room, clients: getClientsInRoom(socket.id, data.room) });
}

// unsubscribe a client from a room, this can be
// occured when a client disconnected from the server
// or he subscribed to another room
function unsubscribe(socket, data){
	// update all other clients about the offline
	// presence
	updatePresence(data.room, socket, 'offline');
	
	// remove the client from socket.io room
	socket.leave(data.room);

	// if this client was the only one in that room
	// we are updating all clients about that the
	// room is destroyed
	if(!countClientsInRoom(data.room)){

		// with 'io.sockets' we can contact all the
		// clients that connected to the server
		io.sockets.emit('removeroom', { room: data.room });
	}
}

// 'io.sockets.manager.rooms' is an object that holds
// the active room names as a key, returning array of
// room names
function getRooms(){
	return Object.keys(io.sockets.manager.rooms);
}

// get array of clients in a room
function getClientsInRoom(socketId, room){
	// get array of socket ids in this room
	var socketIds = io.sockets.manager.rooms['/' + room];
	var clients = [];
	
	if(socketIds && socketIds.length > 0){
		socketsCount = socketIds.lenght;
		
		// push every client to the result array
		for(var i = 0, len = socketIds.length; i < len; i++){
			
			// check if the socket is not the requesting
			// socket
			if(socketIds[i] != socketId){
				clients.push(chatClients[socketIds[i]]);
			}
		}
	}
	
	return clients;
}

// get the amount of clients in aroom
function countClientsInRoom(room){
	// 'io.sockets.manager.rooms' is an object that holds
	// the active room names as a key and an array of
	// all subscribed client socket ids
	if(io.sockets.manager.rooms['/' + room]){
		return io.sockets.manager.rooms['/' + room].length;
	}
	return 0;
}

// updating all other clients when a client goes
// online or offline. 
function updatePresence(room, socket, state){
	// socket.io may add a trailing '/' to the
	// room name so we are clearing it
	room = room.replace('/','');

	// by using 'socket.broadcast' we can send/emit
	// a message/event to all other clients except
	// the sender himself
	socket.broadcast.to(room).emit('presence', { client: chatClients[socket.id], state: state, room: room });
}

// unique id generator
function generateId(){
	var S4 = function () {
		return (((1 + Math.random()) * 0x10000) | 0).toString(16).substring(1);
	};
	return (S4() + S4() + "-" + S4() + "-" + S4() + "-" + S4() + "-" + S4() + S4() + S4());
}

		server.listen(app.get('port'), function(){
		  console.log('Express server listening on port ' + app.get('port'));
		});

