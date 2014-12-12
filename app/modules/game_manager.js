define(['EE'], function(EE) {
    'use strict';

    var GameManager = function(client){
        this.client = client;
        this.currentRoom = null;
    };

    GameManager.prototype  = new EE();


    GameManager.prototype.onMessage = function(message){
        var data = message.data;
        console.log('game_manager;', 'message', message);
        switch (message.type) {
            case 'game_start': this.onGameStart(message.data); break;
            case 'ready':
                console.log('game_manager;', 'game user ready', message.data);
                break;
            case 'round_start':
                this.emit('round_start', {
                    players: [
                        this.getPlayer(data.players[0]),
                        this.getPlayer(data.players[1])
                    ],
                    first: this.getPlayer(data.first),
                    id: data.id
                });
                console.log('game_manager;', 'game round start', message.data);
                break;
            case 'turn':
                this.emit('turn', data);
                console.log('game_manager;', 'game turn', message.data);
                break;
            case 'event':
                console.log('game_manager;', 'game event', message.data);
                break;
            case 'user_leave':
                var user = this.getPlayer(message.data);
                console.log('game_manager;', 'user leave game', user);
                this.emit('user_leave', user);
                break;
            case 'round_end':
                console.log('game_manager', 'round end', message.data);
                this.emit('round_end', message.data, this.client.getPlayer());
                if (message.data.winner){
                    if (message.data.winner == this.client.getPlayer().userId) { // win
                        console.log('game_manager;', 'win', message.data);
                    } else { // lose
                        console.log('game_manager;', 'lose', message.data);
                    }
                } else { // not save or draw
                    if (message.data.winner == 'not_save') console.log('game_manager', 'not accepted', message.data);
                    else console.log('game_manager;', 'draw', message.data);
                }
                break;
            case 'game_end':
                console.log('game_manager;', 'end game', this.currentRoom);
                this.emit('game_end', this.currentRoom);
                this.currentRoom = null;
                break;
            case 'error':
                console.log('game_manager;', 'error', message.data);
                break;
        }
    };


    GameManager.prototype.onGameStart = function(room){
        //TODO: check and hide invite
        room = new Room(room, this.client);
        console.log('game_manager;', 'game started', room);
        this.currentRoom = room;
        this.emit('game_start', room);
        this.sendReady();
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
        this.client.send('game_manager', 'leave', 'server', true);
    };


    GameManager.prototype.sendReady = function(){
        this.client.send('game_manager', 'ready', 'server', true);
    };


    GameManager.prototype.sendTurn = function(turn){
        this.client.send('game_manager', 'turn', 'server', turn);
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

    return GameManager;
});