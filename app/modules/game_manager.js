define(['EE'], function(EE) {
    'use strict';

    var GameManager = function(client){
        this.client = client;
        this.currentRoom = null;
    };

    GameManager.prototype  = new EE();


    GameManager.prototype.onMessage = function(message){
        var data = message.data, player = client.getPlayer(), i;
        console.log('game_manager;', 'message', message);
        switch (message.type) {
            case 'new_game':
                for ( i = 0; i < data.players.length; i++){
                    if (data.players[i] == player || data.players[i] == player.userId){ //TODO: warn! userList changed user ids list to user list; leave old game
                        if (this.currentRoom)
                            if (this.currentRoom.isClosed) this.leaveRoom();
                            else throw new Error('start game before current game finished! old: '+this.currentRoom.id+' new:'+data.room);
                        this.onGameStart(data);
                    }
                }
                break;
            case 'end_game':
                break;
            case 'ready':
                console.log('game_manager;', 'user_ready', data);
                break;
            case 'round_start':
                console.log('game_manager;', 'emit round_start', data);
                this.emit('round_start', {
                    players: [
                        this.getPlayer(data.players[0]),
                        this.getPlayer(data.players[1])
                    ],
                    first: this.getPlayer(data.first),
                    id: data.id
                });
                break;
            case 'turn':
                console.log('game_manager;', 'emit turn', data);
                this.emit('turn', data);
                break;
            case 'event':
                console.log('game_manager;', 'game event', data);
                break;
            case 'user_leave':
                var user = this.getPlayer(data);
                this.onUserLeave(user);
                break;
            case 'round_end':
                console.log('game_manager', 'emit round_end', data);
                if (data.winner){
                    if (data.winner == this.client.getPlayer().userId) { // win
                        console.log('game_manager;', 'win', data);
                        data.result = 'win'
                    } else { // lose
                        console.log('game_manager;', 'lose', data);
                        data.result = 'lose'
                    }
                } else { // not save or draw
                    if (data.winner == 'not_save') console.log('game_manager', 'not accepted', data);
                    else {
                        data.result = 'draw';
                        console.log('game_manager;', 'draw', data);
                    }
                }
                this.emit('round_end', data, this.client.getPlayer());
                break;
            case 'error':
                console.log('game_manager;', 'error', data);
                break;
        }
    };


    GameManager.prototype.onGameStart = function(room){
        //TODO: check and hide invite
        room = new Room(room, this.client);
        console.log('game_manager;', 'emit game_start', room);
        this.currentRoom = room;
        this.emit('game_start', room);
        this.sendReady();
    };


    GameManager.prototype.onUserLeave = function(user){
        //TODO: check user is opponent or me
        this.currentRoom.isClosed = true;
        console.log('game_manager;', 'user_leave', this.currentRoom, user);
        if (user != this.client.getPlayer()) this.emit('user_leave', user);
        else this.leaveRoom();
    };


    GameManager.prototype.leaveGame = function(){
        // TODO: send to server leave game, block game and wait leave message
        this.client.send('game_manager', 'leave', 'server', true);
    };


    GameManager.prototype.leaveRoom = function(){
        if (!this.currentRoom.isClosed) throw new Error('leave not closed room! '+ this.currentRoom.id);
        console.log('game_manager;', 'emit game_leave;', this.currentRoom);
        this.emit('game_leave', this.currentRoom);
        this.currentRoom = null;
    };


    GameManager.prototype.sendReady = function(){
        this.client.send('game_manager', 'ready', 'server', true);
    };


    GameManager.prototype.sendTurn = function(turn){
        this.client.send('game_manager', 'turn', 'server', turn);
    };


    GameManager.prototype.sendThrow = function(){
        this.client.send('game_manager', 'event', 'server', 'throw');
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
        if (typeof room.players[0] == "object") this.players = room.players;
        else for (var i = 0; i < room.players.length; i++) this.players.push(client.getUser(room.players[i]));
    }

    return GameManager;
});