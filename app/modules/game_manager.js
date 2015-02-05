define(['EE'], function(EE) {
    'use strict';

    var GameManager = function(client){
        this.client = client;
        this.currentRoom = null;
        this.client.on('disconnected', function(){
            // TODO: save or close current room
        });
    };

    GameManager.prototype  = new EE();


    GameManager.prototype.onMessage = function(message){
        var data = message.data, player = this.client.getPlayer(), i;
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
                this.onRoundStart(data);
                break;
            case 'turn':
                console.log('game_manager;', 'emit turn', data);
                if (data.turn.nextPlayer) {
                    data.nextPlayer = this.getPlayer(data.turn.nextPlayer);
                    delete data.turn.nextPlayer;
                }
                this.emit('turn', data);
                if (data.nextPlayer){
                    this.currentRoom.current = data.nextPlayer;
                    this.currentRoom.userTime = this.client.opts.turnTime * 1000;
                    this.emit('switch_player', this.currentRoom.current);
                    this.emitTime();
                    if (!this.timeInterval){
                        this.prevTime = null;
                        this.timeInterval = setInterval(this.onTimeTick.bind(this), 100);
                    }
                }

                break;
            case 'event':
                var user = this.getPlayer(data.user);
                console.log('game_manager;', 'game event', data, user);
                this.onUserEvent(user, data);
                break;
            case 'user_leave':
                var user = this.getPlayer(data);
                this.onUserLeave(user);
                break;
            case 'round_end':
                this.onRoundEnd(data);
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


    GameManager.prototype.onRoundStart = function (data){
        console.log('game_manager;', 'emit round_start', data);
        this.currentRoom.current = this.getPlayer(data.first);
        this.currentRoom.userTime = this.client.opts.turnTime * 1000;
        this.emit('round_start', {
            players: [
                this.getPlayer(data.players[0]),
                this.getPlayer(data.players[1])
            ],
            first: this.getPlayer(data.first),
            id: data.id,
            inviteData: data.inviteData
        });
        this.emitTime();
    };


    GameManager.prototype.onRoundEnd = function(data){
        console.log('game_manager', 'emit round_end', data, this.currentRoom);
        clearInterval(this.timeInterval);
        data.mode = this.currentRoom.data.mode;
        this.timeInterval = null;
        this.prevTime = null;
        this.currentRoom.current = null;
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
    };


    GameManager.prototype.onUserLeave = function(user){
        //TODO: check user is opponent or me
        this.currentRoom.isClosed = true;
        console.log('game_manager;', 'user_leave', this.currentRoom, user);
        if (user != this.client.getPlayer()) this.emit('user_leave', user);
        else this.leaveRoom();
    };


    GameManager.prototype.onUserEvent = function(user, event){
        switch (event.type){
            case 'draw':
                if (user == this.client.getPlayer()) return; // draw to yourself
                switch (event.action){
                    case 'ask':
                        this.emit('ask_draw', user);
                        break;
                    case 'cancel':
                        this.emit('cancel_draw', user);
                        break;
                }
                break;
            case 'timeout':
                if (event.nextPlayer) {
                    event.nextPlayer =  this.getPlayer(event.nextPlayer);
                    event.user = this.getPlayer(event.user);
                    this.emit('timeout', event);
                    this.currentRoom.current = event.nextPlayer;
                    this.emit('switch_player', this.currentRoom.current);
                }
                break;
        }
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
        if (this.currentRoom.userTime < 1000) {
            console.warn('game_manager;', 'your time is out!');
            return;
        }
        this.client.send('game_manager', 'turn', 'server', turn);

    };


    GameManager.prototype.sendThrow = function(){
        this.client.send('game_manager', 'event', 'server', {type:'throw'});
    };


    GameManager.prototype.sendDraw = function(){
        this.client.send('game_manager', 'event', 'server', {type:'draw', action:'ask'});
    };


    GameManager.prototype.acceptDraw = function(){
        this.client.send('game_manager', 'event', 'server', {type:'draw', action:'accept'});
    };


    GameManager.prototype.cancelDraw = function(){
        this.client.send('game_manager', 'event', 'server', {type:'draw', action:'cancel'});
    };


    GameManager.prototype.getPlayer = function(id){
        if (this.currentRoom)
            for (var i = 0; i < this.currentRoom.players.length; i++)
                if (this.currentRoom.players[i].userId == id) return this.currentRoom.players[i];
        return null;
    };


    GameManager.prototype.onTimeTick = function(){
        var time = Date.now();
        if (!this.prevTime){
            this.prevTime = time;
            return;
        }
        var delta = time - this.prevTime;

        if (delta > 333) {
            this.currentRoom.userTime -= delta;
            if (this.currentRoom.userTime  < 0) {
                this.currentRoom.userTime = 0;
                //console.warn('gameManager;', 'user time is out', this.current, this.currentRoom);
            }
            this.emitTime();
            this.prevTime = time;
        }
    };


    GameManager.prototype.emitTime = function(){
        var minutes = Math.floor(this.currentRoom.userTime / 60000);
        var seconds = Math.floor((this.currentRoom.userTime - minutes * 60000) / 1000);
        if (minutes < 10) minutes = '0' + minutes;
        if (seconds < 10) seconds = '0' + seconds;

        this.emit('time',{
            user:this.currentRoom.current,
            userTimeMS: this.currentRoom.userTime,
            userTimeS: Math.floor(this.currentRoom.userTime/ 1000),
            userTimeFormat: minutes + ':' + seconds
        });
    };


    function Room(room, client){
        this.data = room;
        this.id = room.room;
        this.owner = client.getUser(room.owner);
        this.players = [];
        if (typeof room.players[0] == "object") this.players = room.players;
        else for (var i = 0; i < room.players.length; i++) this.players.push(client.getUser(room.players[i]));
    }

    return GameManager;
});