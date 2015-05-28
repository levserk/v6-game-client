define(['EE'], function(EE) {
    'use strict';

    var GameManager = function(client){
        this.client = client;
        this.currentRoom = null;
        this.enableGames = true;
        this.client.on('disconnected', function(){
            // TODO: save or close current room
        });
        window.addEventListener('blur', function(){
            this.onUserFocusChanged(false);
        }.bind(this));
        window.addEventListener('focus', function(){

            this.onUserFocusChanged(true);
        }.bind(this));
    };

    GameManager.prototype  = new EE();


    GameManager.prototype.onMessage = function(message){
        var data = message.data, player = this.client.getPlayer(), i, user;
        console.log('game_manager;', 'message', message);
        switch (message.type) {
            case 'new_game':
                for ( i = 0; i < data.players.length; i++){
                    if (data.players[i] == player){
                        if (this.currentRoom)
                            if (this.currentRoom.isClosed || !this.currentRoom.isPlayer) this.leaveRoom();
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
                this.onTurn(data);
                break;
            case 'event':
                user = this.getPlayer(data.user);
                console.log('game_manager;', 'game event', data, user);
                this.onUserEvent(user, data);
                break;
            case 'user_leave':
                user = this.getPlayer(data);
                this.onUserLeave(user);
                break;
            case 'round_end':
                this.onRoundEnd(data);
                break;
            case 'game_restart':
                this.onGameRestart(data);
                break;
            case 'spectate':
                this.onSpectateStart(data);
                break;
            case 'spectator_join':
                console.log('game_manager;', 'spectate_join', data);
                break;
            case 'spectator_leave':
                console.log('game_manager;', 'spectate_leave', data);
                if (this.currentRoom && this.currentRoom.id != data.room){
                    console.error('game_manager;', 'user leave wrong room, roomId:', data.room, 'current room: ', this.currentRoom);
                    return;
                }
                if (data.user == this.client.getPlayer().userId && this.currentRoom) {
                    this.currentRoom.isClosed = true;
                    this.leaveRoom();
                }
                break;
            case 'error':
                console.error('game_manager;', 'error', data);
                break;
        }
    };


    GameManager.prototype.onGameStart = function(room){
        room = new Room(room, this.client);
        console.log('game_manager;', 'emit game_start', room);
        this.currentRoom = room;
        this.emit('game_start', room);
        this.sendReady();
    };


    GameManager.prototype.onRoundStart = function (data, loading){
        console.log('game_manager;', 'emit round_start', data);
        this.currentRoom.current = this.getPlayer(data.first);
        this.currentRoom.userTime = this.currentRoom.turnTime;
        this.currentRoom.userTakeBacks = 0;
        this.currentRoom.cancelsAscTakeBack = 0;
        this.currentRoom.cancelsAscDraw = 0;
        this.currentRoom.history = [];
        var players = data.first == data.players[0]?[this.getPlayer(data.players[0]),this.getPlayer(data.players[1])]:[this.getPlayer(data.players[1]),this.getPlayer(data.players[0])];

        this.emit('round_start', {
            players: players,
            first: this.getPlayer(data.first),
            id: data.id,
            inviteData: data.inviteData,
            score: this.currentRoom.score,
            isPlayer: this.currentRoom.isPlayer,
            loading: !!loading
        });
        this.emitTime();
    };


    GameManager.prototype.onGameRestart = function (data) {
        console.log('game_manager;', 'game restart', data);
        //start game
        var room = new Room(data['roomInfo'], this.client);
        console.log('game_manager;', 'emit game_start', room);
        this.currentRoom = room;
        room.score = data.score || room.score;
        var timeStart = Date.now();
        this.emit('game_start', room);
        this.onRoundStart(data['initData'], true);
        this.currentRoom.history = GameManager.parseHistory(data.history, data['playerTurns']);
        this.emit('game_load', this.currentRoom.history);
        this.currentRoom.userTakeBacks = data['usersTakeBacks']?data['usersTakeBacks'][this.client.getPlayer().userId] : 0;
        // switch player
        this.switchPlayer(this.getPlayer(data.nextPlayer), data.userTime + (Date.now() - timeStart));
    };


    GameManager.prototype.onSpectateStart = function(data){
        console.log('game_manager;', 'spectate start', data);
        //start game
        var room = new Room(data['roomInfo'], this.client);
        // TODO: server send spectators
        room.spectators.push(this.client.getPlayer());
        console.log('game_manager;', 'emit game_start', room);
        this.currentRoom = room;
        room.score = data.score || room.score;
        var timeStart = Date.now();
        this.emit('game_start', room);
        if (data.state == 'waiting'){
            console.log('game_manager', 'start spectate', 'waiting players ready to play');
            return;
        }
        this.onRoundStart(data['initData'], true);
        this.currentRoom.history = GameManager.parseHistory(data.history, data['playerTurns']);
        this.emit('game_load', this.currentRoom.history);
        // switch player
        if (data.userTime != null)
            this.switchPlayer(this.getPlayer(data.nextPlayer), data.userTime + (Date.now() - timeStart));
    };


    GameManager.prototype.onRoundEnd = function(data){
        console.log('game_manager', 'emit round_end', data, this.currentRoom);
        clearInterval(this.timeInterval);
        this.timeInterval = null;
        this.prevTime = null;
        this.currentRoom.current = null;
        this.currentRoom.score = data.score;
        data.mode = this.currentRoom.data.mode;
        data.isPlayer = this.currentRoom.isPlayer;
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

        if (!this.currentRoom.isPlayer){
            data.result = null;
        }

        this.emit('round_end', data);
    };


    GameManager.prototype.onUserLeave = function(user){
        //TODO: check user is opponent or me
        this.currentRoom.isClosed = true;
        console.log('game_manager;', 'user_leave', this.currentRoom, user);
        if (user != this.client.getPlayer()) this.emit('user_leave', user);
        else this.leaveRoom();
    };


    GameManager.prototype.onTurn = function(data){
        console.log('game_manager;', 'emit turn', data);
        this.currentRoom.history.push(data.turn);
        if (data.turn.nextPlayer) {
            data.nextPlayer = this.getPlayer(data.turn.nextPlayer);
            delete data.turn.nextPlayer;
        }
        this.emit('turn', data);
        this.switchPlayer(data.nextPlayer);
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
                        this.currentRoom.cancelsAscDraw++;
                        break;
                }
                break;
            case 'timeout':
                if (event.nextPlayer) {
                    event.user = this.getPlayer(event.user);
                    this.currentRoom.history.push({user: event.user.userId, action: 'timeout', nextPlayer: event.nextPlayer});
                    this.emit('timeout', event);
                    this.switchPlayer(this.getPlayer(event.nextPlayer));
                }
                break;
            case 'back':
                switch (event.action){
                    case 'take':
                        if (user == this.client.getPlayer()){
                            this.currentRoom.userTakeBacks++;
                        }
                        this.switchPlayer(user);
                        this.currentRoom.history = GameManager.parseHistory(event.history);
                        this.emit('take_back', {user: user, history: this.currentRoom.history});
                        break;
                    case 'ask':
                        if (user != this.client.getPlayer())
                            this.emit('ask_back', user);
                        break;
                    case 'cancel':
                        this.emit('cancel_back', user);
                        this.currentRoom.cancelsAscTakeBack++;
                        break;
                }
                break;
            case 'focus':
                this.emit('focus', {user: user, windowHasFocus: event.action == 'has'});
                break;
            default:
                console.log('game_manager;', 'onUserEvent user:', user, 'event:', event);
                this.currentRoom.history.push(event);
                this.emit('event', event);
        }
    };


    GameManager.prototype.onUserFocusChanged = function(windowHasFocus){
        if (this.isPlaying()) {
            this.client.send('game_manager', 'event', 'server', {
                type: 'focus',
                action: windowHasFocus ? 'has' : 'lost'
            });
        }
    };


    GameManager.prototype.switchPlayer = function(nextPlayer, userTime){
        if (!this.currentRoom){
            console.error('game_manager;', 'switchPlayer', 'game not started!');
            return;
        }
        if (!nextPlayer)  return;
        userTime = userTime || 0;
        this.currentRoom.current = nextPlayer;
        this.currentRoom.userTime = this.currentRoom.turnTime - userTime;
        if (this.currentRoom.userTime < 0) this.currentRoom.userTime = 0;
        this.emit('switch_player', this.currentRoom.current);
        this.emitTime();
        if (!this.timeInterval) {
            this.prevTime = null;
            this.timeInterval = setInterval(this.onTimeTick.bind(this), 100);
        }
    };


    GameManager.prototype.leaveGame = function(){
        if (!this.currentRoom){
            console.error('game_manager;', 'leaveGame', 'game not started!');
            return;
        }
        if (this.currentRoom.isClosed){
            console.warn('game_manager;', 'leaveGame', 'game already ended');
            return;
        }
        // TODO: send to server leave game, block game and wait leave message
        this.client.send('game_manager', 'leave', 'server', true);
    };


    GameManager.prototype.leaveRoom = function(){
        if (!this.currentRoom){
            console.error('game_manager;', 'leaveRoom', 'game not started!');
            return;
        }
        if (!this.currentRoom.isClosed) {
            if (this.currentRoom.isPlayer)
                throw new Error('leave not closed room! ' + this.currentRoom.id);
            else console.error('game_manager', 'spectator leave not closed room')
        }
        clearInterval(this.timeInterval);
        this.timeInterval = null;
        console.log('game_manager;', 'emit game_leave;', this.currentRoom);
        this.emit('game_leave', this.currentRoom);
        this.currentRoom = null;
    };


    GameManager.prototype.sendReady = function(){
        if (!this.currentRoom){
            console.error('game_manager;', 'sendReady', 'game not started!');
            return;
        }
        if (!this.enableGames){
            this.leaveGame();
            this.client.viewsManager.dialogsView.showDialog('новые игры временно отключены',{}, true, false, false);
        }
        this.client.send('game_manager', 'ready', 'server', true);
    };


    GameManager.prototype.sendTurn = function(turn){
        if (!this.isPlaying()){
            console.error('game_manager;', 'sendTurn', 'game not started!');
            return false
        }
        if (this.currentRoom.current != this.client.getPlayer()){
            console.warn('game_manager;', 'not your turn!');
            return false;
        }
        if (this.currentRoom.userTime < 300) {
            console.warn('game_manager;', 'your time is out!');
            return false;
        }
        this.client.send('game_manager', 'turn', 'server', turn);
        return true;
    };


    GameManager.prototype.sendThrow = function(){
        if (!this.isPlaying()){
            console.error('game_manager', 'sendThrow', 'game not started!');
            return;
        }
        this.client.send('game_manager', 'event', 'server', {type:'throw'});
    };


    GameManager.prototype.sendDraw = function(){
        if (!this.isPlaying()){
            console.error('game_manager;', 'sendDraw', 'game not started!');
            return;
        }
        if (this.currentRoom.cancelsAscDraw >= 3){
            this.client.viewsManager.dialogsView.showDialog('Число запросов ограничено тремя', false, true, true);
            return;
        }
        this.client.send('game_manager', 'event', 'server', {type:'draw', action:'ask'});
        this.emit('send_draw');
    };


    GameManager.prototype.sendEvent = function (type, event, target) {
        if (!this.isPlaying()){
            console.error('game_manager;', 'sendEvent', 'game not started!');
            return;
        }
        console.log('game_manager;', 'sendEvent', type, event);
        event.type = type;
        if (target) event.target = target;
        else target = 'server';
        this.client.send('game_manager', 'event', target, event);
    };


    GameManager.prototype.sendTakeBack = function(){
        if (!this.isPlaying()){
            console.error('game_manager;', 'sendTakeBack', 'game not started!');
            return;
        }
        if (this.currentRoom.cancelsAscTakeBack >= 3){
            this.client.viewsManager.dialogsView.showDialog('Вы превысили число запросов к другому игроку', false, true, true);
            return;
        }
        this.client.viewsManager.dialogsView.cancelTakeBack();
        this.client.send('game_manager', 'event', 'server', {type:'back', action:'take'});
        this.emit('send_back');
    };


    GameManager.prototype.acceptTakeBack = function() {
        if (!this.isPlaying()){
            console.error('game_manager;', 'acceptTakeBack', 'game not started!');
            return;
        }
        this.client.send('game_manager', 'event', 'server', {type:'back', action:'accept'});
    };


    GameManager.prototype.cancelTakeBack = function() {
        if (!this.isPlaying()){
            console.error('game_manager;', 'cancelTakeBack', 'game not started!');
            return;
        }
        this.client.send('game_manager', 'event', 'server', {type:'back', action:'cancel'});
    };


    GameManager.prototype.acceptDraw = function(){
        if (!this.isPlaying()){
            console.error('game_manager;', 'acceptDraw', 'game not started!');
            return;
        }
        this.client.send('game_manager', 'event', 'server', {type:'draw', action:'accept'});
    };


    GameManager.prototype.cancelDraw = function(){
        if (!this.isPlaying()){
            console.error('game_manager;', 'cancelDraw', 'game not started!');
            return;
        }
        this.client.send('game_manager', 'event', 'server', {type:'draw', action:'cancel'});
    };


    GameManager.prototype.spectate = function(room){
        if (!room){
            return;
        }

        if (this.isPlaying()) {
            console.warn('game_manager;', 'spectate', 'you are already playing game!');
            return;
        }
        if (this.isSpectating()){
            this.leaveGame();
        }
        this.client.send('game_manager', 'spectate', 'server', {roomId: room});
    };


    GameManager.prototype.getPlayer = function(id){
        if (!this.currentRoom){
            console.error('game_manager;', 'getPlayer', 'game not started!');
            return;
        }
        if (this.currentRoom)
            for (var i = 0; i < this.currentRoom.players.length; i++)
                if (this.currentRoom.players[i].userId == id) return this.currentRoom.players[i];
        return null;
    };


    GameManager.prototype.getHistory = function(){
        if (!this.currentRoom || !this.currentRoom.history) return [];
        var history = [];
        for (var i = 0; i < this.currentRoom.history.length; i++) {
            if (this.currentRoom.history[i].length){
                for (var j = 0; j < this.currentRoom.history[i].length; j++){
                    history.push(this.currentRoom.history[i][j]);
                }
            }
            else history.push(this.currentRoom.history[i]);
        }
        return history
    };


    GameManager.prototype.inGame = function (){
        return this.currentRoom != null && !this.currentRoom.isClosed && this.getPlayer(this.client.getPlayer().userId);
    };


    GameManager.prototype.isPlaying = function(){
        return this.currentRoom != null && !this.currentRoom.isClosed
            && this.getPlayer(this.client.getPlayer().userId) && this.currentRoom.current != null;
    };


    GameManager.prototype.isSpectating = function(){
        if (this.currentRoom != null && !this.currentRoom.isClosed && this.currentRoom.spectators){
            for (var i = 0; i < this.currentRoom.spectators.length; i++){
                if (this.currentRoom.spectators[i] == this.client.getPlayer()) return true;
            }
        }
        return false;
    };


    GameManager.prototype.onTimeTick = function(){
        var time = Date.now();
        if (!this.prevTime){
            this.prevTime = time;
            return;
        }
        var delta = time - this.prevTime;

        if (delta > 100) {
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
            userTimePer: this.currentRoom.userTime / this.currentRoom.turnTime,
            userTimeFormat: minutes + ':' + seconds
        });
    };


    GameManager.parseHistory = function(shistory, playerTurns){
        shistory = '['+shistory+']';
        shistory = shistory.replace(new RegExp('@', 'g'),',');
        var history = JSON.parse(shistory);
        if (playerTurns && playerTurns.length != 0){
            if (playerTurns.length == 1)
                playerTurns = playerTurns[0];
            history.push(playerTurns);
        }
        return history;
    };


    function Room(room, client){
        this.data = room; //deprecated
        this.inviteData = room.data;
        this.id = room.room;
        this.owner = client.getUser(room.owner);
        this.players = [];
        this.spectators = [];
        this.isPlayer = false;
        this.mode = room.mode;
        this.turnTime = room.turnTime || client.opts.turnTime * 1000;
        this.takeBacks = room.takeBacks;
        this.history = [];

        console.log('TEST!', room.data);

        // init players
        if (typeof room.players[0] == "object") this.players = room.players;
        else for (var i = 0; i < room.players.length; i++) this.players.push(client.getUser(room.players[i]));

        this.score = {games:0};
        for (i = 0; i < this.players.length; i++){
            this.score[this.players[i].userId] = 0;
            if (this.players[i] == client.getPlayer()) this.isPlayer = true;
        }

        room.spectators = room.spectators || [];
        for (i = 0; i < room.spectators.length; i++) this.spectators.push(client.getUser(room.spectators[i]));
    }

    return GameManager;
});