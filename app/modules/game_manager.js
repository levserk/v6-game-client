define(['EE', 'instances/room', 'instances/turn', 'instances/game_event', 'instances/time'],
    function(EE, Room, Turn, GameEvent, Time) {
    'use strict';

    var GameManager = function(client){
        this.client = client;
        this.currentRoom = null;
        this.enableGames = true;
        this.wasPlaying = false;
        this.leaveGameTimeout = null;
        this.LEAVE_GAME_TIME = 1000;

        client.on('relogin', function(){
            clearTimeout(this.leaveGameTimeout);
            // if was previous game, wait reconnect and leave prev game;
            if (this.wasPlaying){
                this.leaveGameTimeout = setTimeout(function () {
                    console.log('game_manager;', 'auto leave not restarted game');
                    this.emit('game_leave', this.currentRoom);
                    this.currentRoom = null;
                }.bind(this), this.LEAVE_GAME_TIME);
            }
        }.bind(this));

        client.on('disconnected', function () {
            this.wasPlaying = this.isPlaying();
            if (this.isSpectating()){
                this.emit('game_leave', this.currentRoom);
            } else if (this.inGame() && !this.isPlaying()){
                this.emit('game_leave', this.currentRoom);
                this.currentRoom = null;
            }
            clearTimeout(this.leaveGameTimeout);
            clearInterval(this.timeInterval);
            this.timeInterval = null;
            this.prevTime = null;
        }.bind(this));

        window.addEventListener('blur', function(){
            this.onUserFocusChanged(false);
        }.bind(this));
        window.addEventListener('focus', function(){
            this.onUserFocusChanged(true);
        }.bind(this));
    };

    GameManager.prototype  = new EE();


    GameManager.prototype.onMessage = function(message){
        var data = message.data, player = this.client.getPlayer(),
            i, user, spectatorInd;
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
                console.log('game_manager;', 'spectator_join', data);
                user = this.client.getUser(data.user);
                spectatorInd = this.currentRoom.spectators.indexOf(user);
                if (user && spectatorInd < 0){
                    this.currentRoom.spectators.push(user);
                    this.emit('spectator_join', user);
                }
                break;
            case 'spectator_leave':
                console.log('game_manager;', 'spectator_leave', data);
                if (this.currentRoom && this.currentRoom.id != data.room){
                    console.error('game_manager;', 'user leave wrong room, roomId:', data.room, 'current room: ', this.currentRoom);
                    return;
                }
                if (data.user == this.client.getPlayer().userId && this.currentRoom) {
                    this.currentRoom.isClosed = true;
                    this.leaveRoom();
                } else {
                    user = this.getSpectator(data.user);
                    spectatorInd = this.currentRoom.spectators.indexOf(user);
                    if (user && spectatorInd >= 0){
                        this.currentRoom.spectators.splice(spectatorInd, 1);
                        this.emit('spectator_leave', user);
                    }
                }
                break;
            case 'error':
                console.error('game_manager;', 'error', data);
                this.emit('error', data);
                break;
        }
    };


    GameManager.prototype.onGameStart = function(room){
        clearTimeout(this.leaveGameTimeout);
        room = new Room(room, this.client);
        console.log('game_manager;', 'emit game_start', room);
        this.currentRoom = room;
        this.emit('game_start', room);
        this.sendReady();
    };


    GameManager.prototype.onGameRestart = function (data) {
        clearTimeout(this.leaveGameTimeout);
        console.log('game_manager;', 'game restart', data);
        //start game
        var room = new Room(data['roomInfo'], this.client);
        console.log('game_manager;', 'emit game_start', room);
        this.currentRoom = room;
        room.score = data.score || room.score;
        var timeStart = Date.now();
        this.emit('game_start', room);
        this.onRoundStart(data['initData'], true);
        room.load(data);
        for (var key in this.currentRoom.players){
            if (this.currentRoom.players.hasOwnProperty(key)){
                console.log('game_manager; emit time', key);
                this.emitTime(this.currentRoom.players[key], true);
            }
        }
        this.currentRoom.history = this.parseHistory(data.history, data['playerTurns']);
        this.emit('game_load', this.currentRoom.history);
        this.currentRoom.userTakeBacks = data['usersTakeBacks']?data['usersTakeBacks'][this.client.getPlayer().userId] : 0;
        // switch player
        var turn = this.getLastTurn(),
            userTurnTime = turn ? turn.userTurnTime : 0;
        this.switchPlayer(this.getPlayer(data.nextPlayer), data.userTime + (Date.now() - timeStart), turn ? turn.userTurnTime : 0);
    };


    GameManager.prototype.onSpectateStart = function(data){
        console.log('game_manager;', 'spectate start', data);
        //start game
        var room = new Room(data['roomInfo'], this.client);
        // for old server version add user to spectators
        if (!room.spectators.length) {
            room.spectators.push(this.client.getPlayer());
        }
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
        room.load(data);
        for (var key in this.currentRoom.players){
            if (this.currentRoom.players.hasOwnProperty(key)){
                this.emitTime(this.currentRoom.players[key], true)
            }
        }
        this.currentRoom.history = this.parseHistory(data.history, data['playerTurns']);
        this.emit('game_load', this.currentRoom.history);
        // switch player
        if (data.userTime != null) {
            var turn = this.getLastTurn();
            this.switchPlayer(this.getPlayer(data.nextPlayer), data.userTime + (Date.now() - timeStart), turn ? turn.userTurnTime : 0);
        }
    };


    GameManager.prototype.onRoundStart = function (data, loading){
        console.log('game_manager;', 'emit round_start', data);
        this.currentRoom.current = this.getPlayer(data.first);
        this.currentRoom.userTime = this.currentRoom.turnTime;
        this.currentRoom.userTurnTime = 0;
        this.currentRoom.turnStartTime = null;
        this.currentRoom.userTakeBacks = 0;
        this.currentRoom.cancelsAscTakeBack = 0;
        this.currentRoom.cancelsAscDraw = 0;
        this.currentRoom.history = [];
        this.currentRoom.initData = data;
        this.currentRoom.timeRoundStart = Date.now();
        var players = data.first == data.players[0]?[this.getPlayer(data.players[0]),this.getPlayer(data.players[1])]:[this.getPlayer(data.players[1]),this.getPlayer(data.players[0])];
        for (var i = 0; i < this.currentRoom.players.length; i++){
            this.currentRoom.userData[this.currentRoom.players[i].userId].userTotalTime = 0;
        }

        this.emit('round_start', {
            players: players,
            first: this.getPlayer(data.first),
            id: data.id,
            inviteData: data.inviteData,
            initData: data,
            score: this.currentRoom.score,
            isPlayer: this.currentRoom.isPlayer,
            loading: !!loading
        });
        if (this.currentRoom.timeStartMode == 'after_round_start'){
            this.switchPlayer(this.currentRoom.current, 0, this.getTurnTime());
        }
        this.emitTime();
    };


    GameManager.prototype.onRoundEnd = function(data){
        console.log('game_manager;', 'emit round_end', data, this.currentRoom, this.getHistory());
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

        data.message = this.getResultMessages(data);

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
        var room = this.currentRoom;
        if (!this.client.opts.newGameFormat){
            room.history.push(data.turn);
        }
        var userTurnTime = data.turn.userTurnTime || 0;
        if (data.turn.userTurnTime) {
            delete data.turn.userTurnTime;
        }
        if (data.turn.nextPlayer) {
            data.nextPlayer = this.getPlayer(data.turn.nextPlayer);
            delete data.turn.nextPlayer;
        } else {
            // reset user turn time if enabled
            if (room.timeMode == 'reset_every_turn'){
                console.log('game_manager;', 'reset user turn time', room.current, room.userTime, room.userTurnTime);
                room.userData[room.current.userId].userTotalTime += room.turnTime - room.userTime;
                room.userTime = userTurnTime || room.turnTime;
            }
        }
        if (this.client.opts.newGameFormat){
            data = new Turn(data.turn, this.getPlayer(data.user), data.nextPlayer);
            var time = this.currentRoom.getTime();
            if (time) {
                data.userTime = time.userTime;
                data.userTotalTime = time.userTotalTime;
            }
            room.history.push(data);
        }
        this.emit('turn', data);
        var nextPlayer = data.nextPlayer;
        // reset time on first turn if need
        if (!data.nextPlayer && !this.timeInterval && (room.timeMode == 'reset_every_turn' || room.timeStartMode == 'after_turn')){
            nextPlayer = room.current;
        }
        this.switchPlayer(nextPlayer, 0, userTurnTime);
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
                    var nextPlayer = this.getPlayer(event.nextPlayer);
                    if (this.client.opts.newGameFormat){
                        event.user = this.getPlayer(event.user);
                        event.nextPlayer = nextPlayer;
                        event = new GameEvent(event);
                        this.currentRoom.history.push(event);
                        this.emit('timeout', event);
                    } else {
                        event.user = this.getPlayer(event.user);
                        this.currentRoom.history.push({
                            user: event.user.userId,
                            action: 'timeout',
                            nextPlayer: event.nextPlayer
                        });
                        this.emit('timeout', event);
                    }
                    this.switchPlayer(nextPlayer);
                }
                break;
            case 'back':
                switch (event.action){
                    case 'take':
                        if (user == this.client.getPlayer()){
                            this.currentRoom.userTakeBacks++;
                        }
                        this.switchPlayer(user);
                        this.currentRoom.history = this.parseHistory(event.history);
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
                if (this.client.opts.newGameFormat) {
                    event.user = this.getPlayer(event.user) || undefined;
                    event.nextPlayer = this.getPlayer(event.nextPlayer) || undefined;
                    event.target = this.getPlayer(event.target) || undefined;
                    event = new GameEvent(event);
                }
                this.currentRoom.history.push(event);
                this.emit('event', event);

        }
    };


    GameManager.prototype.onUserFocusChanged = function(windowHasFocus){
        this.client.isFocused = windowHasFocus;
        if (this.isPlaying()) {
            this.client.send('game_manager', 'event', 'server', {
                type: 'focus',
                action: windowHasFocus ? 'has' : 'lost'
            });
        }
    };


    GameManager.prototype.switchPlayer = function(nextPlayer, userTime, turnTime){
        console.log('switch player;', nextPlayer, userTime, turnTime);
        var room = this.currentRoom;
        userTime = userTime || 0;
        if (!room){
            console.error('game_manager;', 'switchPlayer', 'game not started!');
            return;
        }
        if (!nextPlayer)  return;
        room.userData[room.current.userId].userTotalTime +=  room.turnStartTime ? Date.now() - room.turnStartTime : 0;
        if (!turnTime){
            room.userTurnTime = null;
        } else {
            room.userTurnTime = turnTime;
        }

        room.current = nextPlayer;
        userTime = userTime || 0;

        if (room.timeMode == 'common'){
            room.turnStartTime = room.turnStartTime == null ? Date.now() - userTime : room.turnStartTime;
            room.userTime = userTime;
        } else {
            room.turnStartTime = Date.now() - userTime;
            room.userTime = (turnTime || room.turnTime) - userTime;
            if (room.userTime < 0) room.userTime = 0;
        }

        this.emit('switch_player', room.current);
        this.emitTime();
        if (!this.timeInterval) {
            this.prevTime = null;
            this.timeInterval = setInterval(this.onTimeTick.bind(this), 100);
        }
    };


    GameManager.prototype.leaveGame = function(){
        if (!this.currentRoom){
            console.warn('game_manager;', 'leaveGame', 'game not started!');
            return;
        }
        if (this.currentRoom.isClosed){
            this.leaveRoom();
            return;
        }
        // TODO: send to server leave game, block game and wait leave message
        this.client.send('game_manager', 'leave', 'server', true);
    };


    GameManager.prototype.leaveRoom = function(){
        if (!this.currentRoom){
            console.warn('game_manager;', 'leaveRoom', 'game not started!');
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
            this.client.viewsManager.dialogsView.showDialog('Новые игры временно отключены',{}, true, false, false);
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
        if (this.currentRoom.timeMode != 'common' && this.currentRoom.userTime < 300) {
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


    GameManager.prototype.getSpectator = function(id){
        for (var i = 0; i < this.currentRoom.spectators.length; i++)
            if (this.currentRoom.spectators[i].userId == id) return this.currentRoom.spectators[i];
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


    GameManager.prototype.getLastTurn = function(){
        if (this.currentRoom && this.currentRoom.history && this.currentRoom.history.length >= 1){
            var history = this.currentRoom.history,
                turn = history[history.length - 1];
            if (turn.length){
                return turn[turn.length-1];
            } else {
                return turn;
            }
        } else {
            return null;
        }
    };


    GameManager.prototype.getTurnTime = function(){
        if (this.currentRoom){
            return this.currentRoom.userTurnTime || this.currentRoom.turnTime;
        }
        return null
    };


    GameManager.prototype.getResultMessages = function(data){
        var locale = this.client.locale['game']['resultMessages'], loser,
            message = {
            resultMessage: locale[data.result],
            resultComment: ""
        };
        if (data.winner){
            if (data.isPlayer){
                if (data.result == 'lose'){
                    switch  (data.action){
                        case 'timeout': message.resultComment =  locale['playerTimeout']; break;
                        case 'user_leave': message.resultComment = locale['playerLeave']; break;
                        case 'throw': message.resultComment = locale['playerThrow']; break;
                    }
                } else { // win
                    switch (data.action) {
                        case 'timeout':
                            message.resultComment = locale['opponentTimeoutPre'] + locale['opponentTimeout'];
                            break;
                        case 'user_leave':
                            message.resultComment = locale['opponent'] + locale['opponentLeave'];
                            break;
                        case 'throw':
                            message.resultComment = locale['opponent'] + locale['opponentThrow'];
                            break;
                    }
                }
            } else{ // spectator
                message.resultMessage = locale['wins'] + this.getPlayer(data.winner).userName;
                loser = (data.winner == this.currentRoom.players[0].userId ? this.currentRoom.players[1] : this.currentRoom.players[0]);
                switch (data.action) {
                    case 'timeout':
                        message.resultComment = locale['timeoutPre'] + loser.userName + locale['opponentTimeout'];
                        break;
                    case 'user_leave':
                        message.resultComment = loser.userName + locale['opponentLeave'];
                        break;
                    case 'throw':
                        message.resultComment = loser.userName + locale['opponentThrow'];
                        break;
                }
            }
        }
        return message;
    };

    /**
     * returns true if user in room and he is player
     * @returns {boolean|*}
     */
    GameManager.prototype.inGame = function (){
        return this.currentRoom != null && !this.currentRoom.isClosed && this.getPlayer(this.client.getPlayer().userId);
    };

    /**
     * returns true if user in room, he is player and room state is playing
     * @returns {boolean|*}
     */
    GameManager.prototype.isPlaying = function(){
        return this.currentRoom != null && !this.currentRoom.isClosed
            && this.getPlayer(this.client.getPlayer().userId) && this.currentRoom.current != null;
    };

    /**
     * return true if user is spectator
     * @returns {boolean}
     */
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


    GameManager.prototype.emitTime = function(user, fGetFromUserData){
        try {
            var time = this.currentRoom.getTime(user, fGetFromUserData);
            this.emit('time', time);
        } catch (e) {
            console.error('game_manager; emitTime', e);
        }
    };


    GameManager.prototype.parseHistory = function(shistory, playerTurns){
        shistory = '['+shistory+']';
        shistory = shistory.replace(new RegExp('@', 'g'),',');
        var history = JSON.parse(shistory);
        if (playerTurns && playerTurns.length != 0){
            if (playerTurns.length == 1)
                playerTurns = playerTurns[0];
            history.push(playerTurns);
        }
        if (this.client.opts.newGameFormat){
            var current = this.currentRoom.current,
                newHistory = [],
                times = {}, // contain users total time
                turnTime = this.currentRoom.turnTime,
                totalTime = 0,
                self = this;
            for (var i = 0; i < history.length; i++){
                newHistory = newHistory.concat(parseTurn(history[i]));
                if (newHistory[i] instanceof Turn || (newHistory[i] instanceof GameEvent && newHistory[i].event.type == 'timeout')){
                    // init user time
                    // userTurnTime - time remain for turn, userTime - time user turn
                    // clear first turn time; first turn time = turn time - round start time
                    if (this.currentRoom.timeStartMode != 'after_round_start' && $.isEmptyObject(times)){
                        newHistory[i].userTime = 0;
                    }
                    newHistory[i].userTime = newHistory[i].userTime || 0;
                    if (newHistory[i].userTime != null){
                        totalTime += newHistory[i].userTime;
                        if (this.currentRoom.timeMode == 'dont_reset'){ // blitz
                            newHistory[i].userTime = new Time((times[newHistory[i].user.userId] || turnTime) - newHistory[i].userTime || turnTime, turnTime);
                            newHistory[i].userTotalTime = new Time(times[newHistory[i].user.userId] || turnTime, turnTime);

                            // turn contain time for turn for next player
                            if (newHistory[i].nextPlayer){
                                times[newHistory[i].nextPlayer.userId] = newHistory[i].userTurnTime
                            } else {
                                times[newHistory[i].user.userId] = newHistory[i].userTurnTime
                            }
                        } else {
                            times[newHistory[i].user.userId] = times[newHistory[i].user.userId] ? times[newHistory[i].user.userId] + newHistory[i].userTime : newHistory[i].userTime;
                            newHistory[i].userTotalTime = new Time(times[newHistory[i].user.userId] || 0);
                            newHistory[i].userTime = new Time(newHistory[i].userTime);
                        }
                    }
                }
            }
            history = newHistory;
        }

        function parseTurn(turn){
            // parse array of user turns
            if (turn.length){
                for (var j = 0; j < turn.length; j++){
                    turn[j] = parseTurn(turn[j]);
                }
            } else { // parse single user turn or game event
                if (turn.type || turn.action == 'timeout'){ // event
                    turn.user = self.getPlayer(turn.user) || undefined;
                    turn.nextPlayer = self.getPlayer(turn.nextPlayer) || undefined;
                    turn.target = self.getPlayer(turn.target) || undefined;
                    turn = new GameEvent(turn);
                } else { // turn
                    turn.nextPlayer = self.getPlayer(turn.nextPlayer) || undefined;
                    turn = new Turn(turn, current, turn.nextPlayer);
                }
                if (turn.nextPlayer){
                    current = turn.nextPlayer;
                }
            }

            return turn;
        }
        return history;
    };

    return GameManager;
});