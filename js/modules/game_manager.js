function GameManager(client){
    this.client = client;
    this.currentRoom = null;
}

GameManager.prototype  = new EventEmitter();


GameManager.prototype.onMessage = function(message){
    console.log('game_manager;', 'message', message);
    switch (message.type) {
        case 'game_start': this.onGameStart(message.data); break;
        case 'user_leave':
            var user = this.getPlayer(message.data);
            this.onUserLeave(user);
            break;
    }
};


GameManager.prototype.onGameStart = function(room){
    //TODO: check and hide invite
    room = new Room(room, this.client);
    console.log('game_manager;', 'game started', room);
    this.currentRoom = room;
    this.emit('game_start', room);
};


GameManager.prototype.onUserLeave = function(user){
    //TODO: check user is opponent or me
    console.log('game_manager', 'user leave game', user);
    this.emit('user_leave', user);
    this.emit('game_end', this.currentRoom);
    this.currentRoom = null;
};


GameManager.prototype.leaveGame = function(){
    // TODO: send to server leave game, block game and wait leave message
    this.client.send('game_manager', 'leave', 1, 1);
};


GameManager.prototype.getPlayer = function(id){
    if (this.currentRoom)
    for (var i = 0; i < this.currentRoom.players.length; i++)
        if (this.currentRoom.players[i].userId == id) return this.currentRoom.players[i];
    return null;
};


function Room(room, client){
    this.data = room;
    this.id = room.id;
    this.owner = client.getUser(room.owner);
    this.players = [];
    for (var i = 0; i < room.players.length; i++) this.players.push(client.getUser(room.players[i]));
}