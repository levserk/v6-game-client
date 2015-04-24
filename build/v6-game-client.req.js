define('modules/game_manager',['EE'], function(EE) {
    

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


    GameManager.prototype.onRoundStart = function (data){
        console.log('game_manager;', 'emit round_start', data);
        this.currentRoom.current = this.getPlayer(data.first);
        this.currentRoom.userTime = this.currentRoom.turnTime;
        this.currentRoom.userTakeBacks = 0;
        var players = data.first == data.players[0]?[this.getPlayer(data.players[0]),this.getPlayer(data.players[1])]:[this.getPlayer(data.players[1]),this.getPlayer(data.players[0])];

        this.emit('round_start', {
            players: players,
            first: this.getPlayer(data.first),
            id: data.id,
            inviteData: data.inviteData,
            score: this.currentRoom.score,
            isPlayer: this.currentRoom.isPlayer
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
        this.onRoundStart(data['initData']);
        this.emit('game_load', GameManager.parseHistory(data.history, data.playerTurns));
        this.currentRoom.userTakeBacks = data['usersTakeBacks']?data['usersTakeBacks'][this.client.getPlayer().userId] : 0;
        // switch player
        this.switchPlayer(this.getPlayer(data.nextPlayer), data.userTime + (Date.now() - timeStart));
    };


    GameManager.prototype.onSpectateStart = function(data){
        console.log('game_manager;', 'spectate restart', data);
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
        this.onRoundStart(data['initData']);
        this.emit('game_load', GameManager.parseHistory(data.history, data.playerTurns));
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
        if (data.turn.nextPlayer) {
            data.nextPlayer = this.getPlayer(data.turn.nextPlayer);
            delete data.turn.nextPlayer;
        }
        this.switchPlayer(data.nextPlayer);
        this.emit('turn', data);
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
                    event.user = this.getPlayer(event.user);
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
                        this.emit('take_back', {user: user, history: GameManager.parseHistory(event.history)});
                        break;
                    case 'ask':
                        if (user != this.client.getPlayer())
                            this.emit('ask_back', user);
                        break;
                    case 'cancel':
                        this.emit('cancel_back', user);
                        break;
                }
                break;
            case 'focus':
                this.emit('focus', {user: user, windowHasFocus: event.action == 'has'});
                break;
            default:
                console.log('game_manager;', 'onUserEvent user:', user, 'event:', event);
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
        this.client.send('game_manager', 'event', 'server', {type:'draw', action:'ask'});
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
        this.client.viewsManager.dialogsView.cancelTakeBack();
        this.client.send('game_manager', 'event', 'server', {type:'back', action:'take'});
    };


    GameManager.prototype.acceptTakeBack = function() {
        this.client.send('game_manager', 'event', 'server', {type:'back', action:'accept'});
    };


    GameManager.prototype.cancelTakeBack = function() {
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
define('modules/invite_manager',['EE'], function(EE) {
    

    var InviteManager = function(client){
        var self = this;

        this.client = client;
        this.invites = {}; // userId : invite
        this.invite = null;
        this.inviteTimeoutTime = 30;
        this.inviteTimeout = null;
        this.isPlayRandom = false;

        client.userList.on('leave_user', function (user) {
            if (self.invite && self.invite.target == user.userId) {
                self.invite = null;
            }
            self.removeInvite(user.userId);
        });
        client.on('user_relogin', function (user) {
            if (self.invite && self.invite.target == user.userId) {
                self.invite = null;
                user.isInvited = false;
            }
            self.removeInvite(user.userId);
        });
        client.gameManager.on('game_start', function(){
            self.cancel();
            self.rejectAll();
            self.invite = null;
            self.isPlayRandom = false;
            self.client.viewsManager.userListView._setRandomPlay();
        });
        client.on('disconnected', function(){
            self.invite = null;
            for (var userId in self.invites)
                if (self.invites.hasOwnProperty(userId)){
                    self.removeInvite(userId);
                }
        });
        client.on('mode_switch', function(){
            if (self.isPlayRandom){
                self.playRandom(true);
            }
        });
    };

    InviteManager.prototype  = new EE();


    InviteManager.prototype.onMessage = function(message){
        console.log('invite_manager;', 'message', message);
        switch (message.type) {
            case 'invite': this.onInvite(message.data); break;
            case 'reject': this.onReject(message.data.target, message.data.from, 'rejected'); break;
            case 'cancel': this.onCancel(message.data); break;
        }
    };


    InviteManager.prototype.onInvite = function(invite){
        //TODO: CHECK INVITE AVAILABLE
        this.invites[invite.from] = invite;

        if (this.client.settings.disableInvite){
            this.reject(invite.from);
            return;
        }

        if (this.isPlayRandom && this.client.currentMode == invite.mode) {
            console.log('invite_manager;', 'auto accept invite', invite);
            this.accept(invite.from);
            return;
        }

        this.emit('new_invite', {
            from: this.client.getUser(invite.from),
            data: invite
        });
    };


    InviteManager.prototype.onReject = function(userId, senderId, reason){
        console.log('invite_manger;', 'onReject', this.invite, 'reason');
        if (this.invite.target == userId && this.client.getPlayer().userId == senderId){
            if ((Date.now() - this.inviteTime)/1000 > this.inviteTimeoutTime - 1) reason = 'timeout';
            this.emit('reject_invite', {user:this.client.userList.getUser(userId), reason:reason});
            this.invite = null;
            clearTimeout(this.inviteTimeout);
        } else {
            console.warn('invite_manager; ', 'wrong user reject invite', userId, senderId);
        }
    };


    InviteManager.prototype.onCancel = function(invite){
        console.log('invite_manger;', 'onCancel', invite);
        if (this.invites[invite.from]){
            this.emit('cancel_invite', this.invites[invite.from]);
            this.removeInvite(invite.from);
        }
    };


    InviteManager.prototype.sendInvite = function(userId, params) {
        if (!this.client.gameManager.enableGames){
            this.client.viewsManager.dialogsView.showDialog('новые игры отключены',{}, true, false, false);
            return;
        }
        // find user, get current params, send invite and emit event invite sand // params.gameType;
        if (this.client.gameManager.inGame()){
            console.warn('You are already in game!');
            return;
        }
        if (!userId){
            console.warn('invite_manager; ', 'wrong userId to send invite', userId);
            return;
        }
        if (this.invite){
            this.cancel();
        }
        params = params || {};
        if (params.mode){
            console.error('invite param mode is reserved!');
            return;
        }
        params.mode = this.client.currentMode;
        params.target = userId;
        this.invite = params;
        this.inviteTime = Date.now();
        this.client.send('invite_manager', 'invite', userId, this.invite);
        this.inviteTimeout = setTimeout(function(){
            if (this.invite) {
                this.client.send('invite_manager', 'cancel', this.invite.target, this.invite);
                this.onReject(this.invite.target, this.client.getPlayer().userId, 'timeout');
            }
        }.bind(this), this.inviteTimeoutTime * 1000);
    };


    InviteManager.prototype.accept = function(userId){
        if (this.client.gameManager.inGame()){
            console.warn('You are already in game!');
            return;
        }
        if (this.invites[userId]){
            var invite = this.invites[userId];
            delete this.invites[userId];
            this.cancel();
            this.rejectAll();
            this.client.send('invite_manager', 'accept', userId, invite);
        }
    };


    InviteManager.prototype.reject = function(userId){
        if (this.invites[userId]){
            this.client.send('invite_manager', 'reject', userId, this.invites[userId]);
            this.removeInvite(userId);
        }
    };


    InviteManager.prototype.rejectAll = function() {
        for (var userId in this.invites)
            if (this.invites.hasOwnProperty(userId)){
                this.client.send('invite_manager', 'reject', userId, this.invites[userId]);
                this.removeInvite(userId);
            }
    };


    InviteManager.prototype.cancel = function(){
        console.log('invite_manger;', 'cancel', this.invite);
        if (this.invite) {
            this.client.send('invite_manager', 'cancel', this.invite.target, this.invite);
            this.invite = null;
            clearTimeout(this.inviteTimeout);
        }
    };


    InviteManager.prototype.removeInvite = function(userId){
        console.log('invite_manger;', 'removeInvite', userId);
        if (this.invites[userId]){
            this.emit('remove_invite', this.invites[userId]);
            clearInterval(this.invites[userId]);
            delete this.invites[userId];
        }
    };


    InviteManager.prototype.playRandom = function(cancel){
        if (!this.client.gameManager.enableGames && !cancel){
            this.client.viewsManager.dialogsView.showDialog('новые игры отключены',{}, true, false, false);
            return;
        }
        if (this.client.gameManager.inGame()){
            console.warn('You are already in game!');
            return;
        }

        if (!cancel){
            for (var userId in this.invites){
                if (this.invites[userId].mode == this.client.currentMode){
                    console.log('invite_manager;', 'auto accept invite', this.invites[userId]);
                    this.accept(userId);
                    return;
                }

            }
            this.isPlayRandom = true;
            var params = this.client.opts.getUserParams == 'function'?this.client.opts.getUserParams():{};
            if (params.mode){
                console.error('invite param mode is reserved!');
                return;
            }
            params.mode = this.client.currentMode;
            this.client.send('invite_manager', 'random', 'server', params);
        } else {
            this.isPlayRandom = false;
            this.client.send('invite_manager', 'random', 'server', 'off');
            this.client.viewsManager.userListView._setRandomPlay();
        }
    };

    return InviteManager;
});
define('modules/user_list',['EE'], function(EE) {
    

    var UserList = function(client){

        var self = this;

        this.client = client;
        this.users = [];
        this.rooms = [];

        client.on('disconnected', function(){
            self.rooms = [];
            self.users = [];
        });
        client.gameManager.on('round_end', function(data){
            if (data.ratings && data.mode){
                for (var userId in data.ratings){
                    for (var i = 0; i < self.users.length; i++){
                        if(self.users[i].userId == userId) {
                            self.users[i][data.mode] = data.ratings[userId];
                        }
                    }
                }
                this.emit('update', data);
            }
        });
    };

    UserList.prototype  = new EE();


    UserList.prototype.onMessage = function(message){
        switch (message.type){
            case 'user_login': this.onUserLogin(message.data); break;
        }
    };


    UserList.prototype.onUserLogin = function(data, fIsPlayer){
        var user = new User(data, fIsPlayer, this.client);
        if (fIsPlayer) this.player = user;
        for (var i = 0; i < this.users.length; i++){
            if(this.users[i].userId == user.userId) {
                console.warn('user_list;', 'user already in list!', user);
                return false;
            }
        }
        this.users.push(user);
        this.emit('new_user', user);
    };


    UserList.prototype.onUserLeave = function(userId){
        for (var i = 0; i < this.users.length; i++) {
            if (this.users[i].userId == userId){
                var user = this.users[i];
                this.users.splice(i, 1);
                this.emit('leave_user', user);
                return;
            }
        }
        console.warn('user_list;', 'onUserLeave; no user in list', userId);
    };


    UserList.prototype.onGameStart = function(roomId, players){
        for (var i = 0; i < players.length; i++){
            players[i] = this.getUser(players[i]);
            players[i].isInRoom = true;
        }
        var room = {
            room:roomId, players: players
        };
        this.rooms.push(room);
        this.emit('new_room',room);
    };


    UserList.prototype.onGameEnd = function(roomId, players){
        for (var i = 0; i < this.rooms.length; i++) {
            if (this.rooms[i].room == roomId){
                var room = this.rooms[i];
                this.rooms.splice(i, 1);
                for (var j = 0; j < room.players.length; j++){
                    room.players[j].isInRoom = false;
                }
                this.emit('close_room', room);
                return;
            }
        }
        console.warn('user_list;', 'onGameEnd; no room in list', roomId, players);
    };


    UserList.prototype.onUserChanged = function(userData){
        for (var i = 0; i < this.users.length; i++){
            if (this.users[i].userId == userData.userId){
                this.users[i].update(userData);
                if (!this.users[i].isPlayer) console.log('user_changed!', userData.isActive, userData);
                this.emit('user_changed', this.users[i]);
                return;
            }
        }
        console.warn('user_list;', 'onUserChanged; no user in list', userData)
    };


    UserList.prototype.getUser = function(id){
        for (var i = 0; i < this.users.length; i++)
            if (this.users[i].userId == id) return this.users[i];
        return null;
    };


    UserList.prototype.getUsers = function() {
        var invite = this.client.inviteManager.invite;
        if (invite) { // mark invited user
            return _.map(this.users, function(usr) {
                if (usr.userId === invite.target) {
                    usr.isInvited = true;
                }
                return usr;
            });
        } else {
            return this.users;
        }
    };


    UserList.prototype.getUserList = function(filter) {
        var userList = [], invite = this.client.inviteManager.invite, user;
        for (var i = 0; i < this.users.length; i++){
            user = this.users[i];
            if (invite && user.userId == invite.target) { // user is invited
                user.isInvited = true;
            } else delete user.isInvited;
            if (user.isInRoom) continue;
            if (!user.isPlayer && (user.disableInvite || !user.isActive)) continue;
            if (filter && user.userName.toLowerCase().indexOf(filter) == -1) continue;
            else userList.push(user);
        }
        userList.sort(function(a, b){
            var ar = a.getRank();
            if (isNaN(+ar)) {
                ar = 99999999;
                if (a.isPlayer) {
                    ar = 10000000;
                }
            }
            var br = b.getRank();
            if (isNaN(+br)) {
                br = 99999999;
                if (b.isPlayer) {
                    br = 100000000;
                }
            }
            return ar - br;
        });
        return userList;
    };


    UserList.prototype.getFreeUserList = function() {
        var userList = [], invite = this.client.inviteManager.invite, user;
        for (var i = 0; i < this.users.length; i++){
            user = this.users[i];
            if (user.isPlayer){
                continue;
            }
            if (invite && user.userId == invite.target) { // user is invited
                continue;
            }
            if (user.isInRoom) {
                continue;
            }
            userList.push(user);
        }
        return userList;
    };


    UserList.prototype.getRoomList = function(filter) {
        if (!filter) return this.rooms;
        else {
            var rooms = [], room;
            for (var i = 0; i < this.rooms.length; i++){
                room = this.rooms[i];
                for (var j = 0; j < room.players.length; j++){
                    if (room.players[j].userName.toLowerCase().indexOf(filter) != -1){
                        rooms.push(room);
                        break;
                    }
                }
            }
            return rooms;
        }
    };


    UserList.prototype.createUser = function(data) {
        if (!data.userId || !data.userName){
            console.error('user_list;', 'wrong data for User', data);
        }
        return new User(data, data.userId == this.player.userId, this.client);
    };


    function User(data, fIsPlayer, client){
        if (!data || !data.userId || !data.userName) throw new Error("wrong user data!");
        for (var key in data){
            if (data.hasOwnProperty(key)) this[key] = data[key];
        }

        this.isPlayer = fIsPlayer || false;
        this.disableInvite = data.disableInvite || false;
        this.isActive  = (typeof data.isActive == 'boolean' ? data.isActive : true); // true default

        this.getRank = function (mode) {
            return this[mode||this._client.currentMode].rank || '—';
        };

        this.update = function(data) {
            for (var key in data){
                if (data.hasOwnProperty(key)) this[key] = data[key];
            }
            this.disableInvite = data.disableInvite || false;
            if (typeof data.isActive == 'boolean') this.isActive  = data.isActive;
        };

        this._client = client;
    }

    return UserList;
});
define('modules/socket',['EE'], function(EE) {
    

    var Socket = function(opts){
        opts = opts || {};
        this.port = opts.port||'8080';
        this.domain = opts.domain || document.domain;
        this.game = opts.game||"test";
        this.url = opts.url || this.game;
        this.https = opts.https || false;
        this.protocol = (this.https?'wss':'ws');

        this.isConnecting = true;
        this.isConnected = false;

    };

    Socket.prototype  = new EE();


    Socket.prototype.init = function(){
        var self = this;
        self.isConnecting = true;
        self.isConnected = false;

        try{

            this.ws = new WebSocket (this.protocol+'://'+this.domain+':'+this.port+'/'+this.url);

            this.ws.onclose = function (code, message) {
                console.log('socket;', 'ws closed', code, message);
                if (self.isConnected) self.onDisconnect();
            };

            this.ws.onerror = function (error) {
                self.onError(error);
            };

            this.ws.onmessage = function (data, flags) {

                if (data.data == 'ping') {
                    self.ws.send('pong');
                    return;
                }
                console.log('socket;', 'ws message', data, flags);
                try{
                    data = JSON.parse(data.data)
                } catch (e) {
                    console.log('socket;', 'ws wrong data in message', e);
                    return;
                }

                self.onMessage(data);
            };

            this.ws.onopen = function () {
                console.log('socket;', new Date(), 'ws open');
                self.onConnect();
            };

        } catch (error) {
            console.log('socket;', 'ws open error');
            this.onError(error);
        }


    };

    Socket.prototype.onError = function(error){
        console.log('socket;', 'ws error', error);
        if (this.isConnecting){
            this.isConnecting = false;
            console.log('socket;', "ws connection failed!");
            this.onConnectionFailed();
        }
    };


    Socket.prototype.onConnect = function(){
        this.isConnected = true;
        this.emit("connection");
    };


    Socket.prototype.onDisconnect = function(){
        this.isConnected = false;
        this.emit("disconnection")
    };


    Socket.prototype.onMessage = function(data){
        this.emit("message", data);
    };


    Socket.prototype.onConnectionFailed = function(){
        this.isConnecting = false;
        this.isConnected = false;
        this.emit("failed");
    };


    Socket.prototype.send = function (data) {
        try{
            data = JSON.stringify(data);
        } catch (error){
            console.warn('socket;', "json stringify err", data, error);
            return;
        }
        this.ws.send(data);
    };

    return Socket;
});

define('text!tpls/userListFree.ejs',[],function () { return '<% _.each(users, function(user) { %>\r\n<tr class="userListFree">\r\n    <td class="userName" data-userId="<%= user.userId %>" title="<%= user.userName %>"><%= user.userName %></td>\r\n    <td class="userRank"><%= user.getRank() %></td>\r\n    <% if (user.isPlayer) { %>\r\n    <td></td>\r\n    <% } else if (user.isInvited) { %>\r\n    <td class="inviteBtn activeInviteBtn" data-userId="<%= user.userId %>">Отмена</td>\r\n    <% } else { %>\r\n    <td class="inviteBtn" data-userId="<%= user.userId %>">Пригласить</td>\r\n    <% } %>\r\n\r\n</tr>\r\n\r\n<% }) %>';});


define('text!tpls/userListInGame.ejs',[],function () { return '<% _.each(rooms, function(room) { %>\r\n<tr class="userListGame" data-id="<%= room.room %>">\r\n    <td class="userName" title="<%= room.players[0].userName + \' (\' +  room.players[0].getRank(room.mode) + \')\' %>" ><%= room.players[0].userName %></td>\r\n    <td>:</td>\r\n    <td class="userName" title="<%= room.players[1].userName + \' (\' +  room.players[1].getRank(room.mode) + \')\' %>" ><%= room.players[1].userName %></td>\r\n</tr>\r\n<% }) %>';});


define('text!tpls/userListMain.ejs',[],function () { return '<div class="tabs">\r\n    <div data-type="free">Свободны <span></span></div>\r\n    <div data-type="inGame">Играют <span></span></div>\r\n</div>\r\n<div id="userListSearch">\r\n    <label for="userListSearch">Поиск по списку:</label><input type="text" id="filterUserList"/>\r\n</div>\r\n<div class="tableWrap">\r\n    <table cellspacing="0" class="playerList"></table>\r\n</div>\r\n\r\n<div class="btn" id="randomPlay">\r\n    <span>Играть с любым</span>\r\n</div>';});

define('views/user_list',['underscore', 'backbone', 'text!tpls/userListFree.ejs', 'text!tpls/userListInGame.ejs', 'text!tpls/userListMain.ejs'],
    function(_, Backbone, tplFree, tplInGame, tplMain) {
    
    var UserListView = Backbone.View.extend({
        tagName: 'div',
        id: 'userList',
        tplFree: _.template(tplFree),
        tplInGame: _.template(tplInGame),
        tplMain: _.template(tplMain),
        events: {
            'click .inviteBtn': '_inviteBtnClicked',
            'click .userName': 'userClick',
            'click .userListGame': 'roomClick',
            'click .tabs div': 'clickTab',
            'click .disconnectButton': '_reconnect',
            'click #randomPlay': 'playClicked',
            'keyup #filterUserList': 'filter'
        },
        _reconnect: function() {
            this.client.reconnect();
            this.$list.html(this.$loadingTab);
        },
        clickTab: function(e) {
            if (!this.client.socket.isConnected) {
                return;
            }

            var target = $(e.currentTarget),
                clickedTabName = target.attr('data-type');

            if (clickedTabName === this.currentActiveTabName) {
                return;
            }

            this.currentActiveTabName = clickedTabName;
            this._setActiveTab(this.currentActiveTabName);
            this.render();
        },
        userClick: function(e) {
            var target = $(e.currentTarget),
                userId = target.attr('data-userId');
            this.client.onShowProfile(userId);
        },
        roomClick: function(e) {
            var target = $(e.currentTarget),
                roomId = target.attr('data-Id');
            if (roomId) {
                this.client.gameManager.spectate(roomId);
            } else {
                console.warn('wrong room id', roomId);
            }
        },
        _inviteBtnClicked: function(e) {
            var target = $(e.currentTarget),
                userId = target.attr('data-userId');
            this.invitePlayer(userId)
        },
        invitePlayer: function(userId) {
            if (this.client.gameManager.inGame()) {
                console.warn('You are already in game!');
                return;
            }

            var target = this.$el.find('.inviteBtn[data-userId="' + userId + '"]');

            if (target.hasClass(this.ACTIVE_INVITE_CLASS)) {
                // cancel invite
                this.client.inviteManager.cancel();
                target.removeClass(this.ACTIVE_INVITE_CLASS);
                target.html('Пригласить');
            } else {
                // send invite
                this.$el.find('.' + this.ACTIVE_INVITE_CLASS).html('Пригласить').removeClass(this.ACTIVE_INVITE_CLASS);
                var params = (typeof this.client.opts.getUserParams == 'function' ? this.client.opts.getUserParams() : {});
                params = $.extend(true, {}, params);
                this.client.inviteManager.sendInvite(userId, params);
                target.addClass(this.ACTIVE_INVITE_CLASS);
                target.html('Отмена');
            }
        },
        playClicked: function (e) {
            this.client.inviteManager.playRandom(this.client.inviteManager.isPlayRandom);
            this._setRandomPlay();
        },
        filter: function () {
            this.render();
        },
        initialize: function(_client) {
            var bindedRender = this.render.bind(this);

            this.client = _client;

            this.$disconnectedTab = $('<tr class="disconnected"><td><div>' +
                '<span class="disconnectText">Соединение с сервером отсутствует</span>' +
                '<br>' +
                '<br>' +
                '<span class="disconnectButton">Переподключиться</span>' +
                '</div></td></tr>');
            this.$loadingTab = $('<tr><td>Загрузка..</td></tr>');
            this.$el.html(this.tplMain());
            // append user list
            if (_client.opts.blocks.userListId)
                $('#'+_client.opts.blocks.userListId).append(this.el);
            else
                $('body').append(this.el);

            this.ACTIVE_INVITE_CLASS = 'activeInviteBtn';
            this.ACTIVE_TAB_CLASS = 'activeTab';

            this.TEXT_PLAY_ACTIVE = 'Идет подбор игрока...';
            this.TEXT_PLAY_UNACTIVE = 'Играть с любым';

            this.$list = this.$el.find('.tableWrap table');
            this.$counterFree = this.$el.find('.tabs div[data-type="free"]').find('span');
            this.$counterinGame = this.$el.find('.tabs div[data-type="inGame"]').find('span');
            this.$btnPlay = this.$el.find('#randomPlay');
            this.$filter = this.$el.find('#filterUserList');

            this.listenTo(this.client.userList, 'new_user', bindedRender);
            this.listenTo(this.client, 'mode_switch', bindedRender);
            this.listenTo(this.client.userList, 'update', bindedRender);
            this.listenTo(this.client.userList, 'leave_user', bindedRender);
            this.listenTo(this.client.inviteManager, 'reject_invite', this.onRejectInvite.bind(this));
            this.listenTo(this.client.userList, 'new_room', bindedRender);
            this.listenTo(this.client.userList, 'close_room', bindedRender);
            this.listenTo(this.client.userList, 'user_changed', bindedRender);
            this.listenTo(this.client, 'disconnected', bindedRender);
            this.listenTo(this.client, 'user_relogin', bindedRender);

            this.currentActiveTabName = 'free';
            this._setActiveTab(this.currentActiveTabName);
            this.$list.html(this.$loadingTab);
            this.randomPlay = false;
        },
        _setRandomPlay: function(){
            if (this.client.inviteManager.isPlayRandom) {
                this.$btnPlay.html(this.TEXT_PLAY_ACTIVE);
                this.$btnPlay.addClass('active');
            } else {
                this.$btnPlay.html(this.TEXT_PLAY_UNACTIVE);
                this.$btnPlay.removeClass('active');
            }
        },
        _setActiveTab: function(tabName) {
            this.$el.find('.tabs div').removeClass(this.ACTIVE_TAB_CLASS);
            this.$el.find('.tabs div[data-type="' + tabName + '"]').addClass(this.ACTIVE_TAB_CLASS);
        },
        _setCounters: function() {
            if (!this.client.socket.isConnected) {
                this.$counterFree.html('');
                this.$counterinGame.html('');
                return;
            }

            this.$counterFree.html('(' + this.client.userList.getUserList().length + ')');
            this.$counterinGame.html('(' + this.client.userList.getRoomList().length * 2 + ')');
        },
        _showPlayerListByTabName: function() {
            // default

            if (!this.client.socket.isConnected) {
                this.$list.html(this.$disconnectedTab);
                return;
            }

            if (this.currentActiveTabName === 'free') {
                this.$list.html(this.tplFree({
                    users: this.client.userList.getUserList(this.getFilter())
                }));
            }
            else if (this.currentActiveTabName === 'inGame') {
                this.$list.html(this.tplInGame({
                    rooms: this.client.userList.getRoomList(this.getFilter())
                }));
            } else {
                console.warn('unknown tab', this.currentActiveTabName);
            }
        },
        onRejectInvite: function(invite) {
            this.$el.find('.' + this.ACTIVE_INVITE_CLASS + '[data-userId="' + invite.user.userId + '"]').html('Пригласить').removeClass(this.ACTIVE_INVITE_CLASS);
        },
        render: function() {
            if (this.client.unload) return;
            setTimeout(this._showPlayerListByTabName.bind(this),1);
            this._setCounters();
            return this;
        },
        getFilter: function() {
            var filter = this.$filter.val().toLowerCase().trim();
            if (filter.length == 0) filter = false;
            return filter;
        }
    });
    return UserListView;
});
define('views/dialogs',[],function() {
    
    var dialogs = (function() {
        var NOTIFICATION_CLASS = 'dialogNotification';
        var HIDEONCLICK_CLASS = 'dialogClickHide';
        var INVITE_CLASS = 'dialogInvite';
        var DRAGGABLE_CLASS = 'dialogDraggable';
        var USERLEAVE_CLASS = 'dialogUserLeave';
        var ROUNDRESULT_CLASS = 'dialogRoundResult';
        var TAKEBACK_CLASS = 'dialogTakeBack';
        var ACTION_CLASS = 'dialogGameAction';
        var client;
        var dialogTimeout;
        var inviteTimeout = 30;
        var TIMEDIV = '<div class="inviteTime">Осталось: <span>'+inviteTimeout+'</span> секунд</div>';

        function _subscribe(_client) {
            client = _client;
            client.inviteManager.on('new_invite', newInvite);
            client.inviteManager.on('reject_invite', rejectInvite);
            client.inviteManager.on('cancel_invite', cancelInvite);
            client.inviteManager.on('remove_invite', removeInvite);
            client.gameManager.on('user_leave', userLeave);
            client.gameManager.on('game_start', hideDialogs);
            client.gameManager.on('round_end', roundEnd);
            client.gameManager.on('game_leave', hideDialogs);
            client.gameManager.on('ask_draw', askDraw);
            client.gameManager.on('cancel_draw', cancelDraw);
            client.gameManager.on('ask_back', askTakeBack);
            client.gameManager.on('cancel_back', cancelTakeBack);
            client.chatManager.on('show_ban', showBan);
            client.on('login_error', loginError);
            $(document).on("click", hideOnClick);
            inviteTimeout = client.inviteManager.inviteTimeoutTime;
            TIMEDIV = '<div class="inviteTime">Осталось: <span>'+inviteTimeout+'</span> секунд</div>';
        }

        function newInvite(invite) {
            var html = 'Вас пригласил в игру пользователь <b>' + invite.from.userName + '</b>';
            if (typeof this.client.opts.generateInviteText == "function")
                html = this.client.opts.generateInviteText(invite);
                html += TIMEDIV;
            var div = showDialog(html, {
                buttons: {
                    "Принять": function() {
                        clearInterval(invite.data.timeInterval);
                        client.inviteManager.accept($(this).attr('data-userId'));
                        $(this).remove();
                    },
                    "Отклонить": function(){
                        clearInterval(invite.data.timeInterval);
                        client.inviteManager.reject($(this).attr('data-userId'));
                        $(this).remove();
                    }
                },
                close: function() {
                    clearInterval(invite.data.timeInterval);
                    client.inviteManager.reject($(this).attr('data-userId'));
                    $(this).remove();
                }
            }, true, false, false);
            div.attr('data-userId', invite.from.userId);
            div.addClass(INVITE_CLASS);
            invite.data.startTime = Date.now();
            invite.data.timeInterval = setInterval(function(){
                var time = (inviteTimeout * 1000 - (Date.now() - invite.data.startTime)) / 1000 ^0;
                this.find('.inviteTime span').html(time);
                if (time < 1) this.dialog('close');
            }.bind(div), 250);
        }

        function rejectInvite(invite) {
            console.log('dialogs; rejectInvite invite', invite);
            var html = 'Пользователь <b>' + invite.user.userName + '</b>';
            if (invite.reason != 'timeout')
                html += ' отклонил ваше приглашение';
            else html += ' превысил лимит ожидания в '+inviteTimeout+' секунд';
            var div = showDialog(html, {}, true, true, true);
        }

        function cancelInvite(invite) {
            console.log('dialogs; cancel invite', invite);
            clearInterval(invite.timeInterval);
        }

        function removeInvite(invite) {
            console.log('dialogs; removeInvite invite', invite);
            var userId = invite.from;
            $('.' + INVITE_CLASS + '[data-userId="' + userId + '"]').remove();
            clearInterval(invite.timeInterval);
        }

        function askDraw(user) {
            if (!this.client.gameManager.inGame()) return;
            var html = 'Пользователь <b>' + user.userName + '</b> предлагает ничью';
            var div = showDialog(html,{
                buttons: {
                    "Принять": function() {
                        client.gameManager.acceptDraw();
                        $(this).remove();
                    },
                    "Отклонить": function() {
                        client.gameManager.cancelDraw();
                        $(this).remove();
                    }
                },
                close: function() {
                    client.gameManager.cancelDraw();
                    $(this).remove();
                }
            }, true, true, false);
        }

        function cancelDraw(user) {
            var html = 'Пользователь <b>' + user.userName + '</b> отклонил ваше предложение о ничье';
            var div = showDialog(html, {}, true, true, true);
        }

        function askTakeBack(user) {
            if (!this.client.gameManager.inGame()) return;
            var html = 'Пользователь <b>' + user.userName + '</b> просит отменить ход. Разрешить ему?';
            var div = showDialog(html,{
                buttons: {
                    "Да": function() {
                        client.gameManager.acceptTakeBack();
                        $(this).remove();
                    },
                    "Нет": function() {
                        client.gameManager.cancelTakeBack();
                        $(this).remove();
                    }
                },
                close: function() {
                    client.gameManager.cancelTakeBack();
                    $(this).remove();
                }
            }, true, true, false);
            div.addClass(TAKEBACK_CLASS);
        }

        function cancelTakeBack(user) {
            if (!this.client.gameManager.inGame()) return;
            var html = 'Пользователь <b>' + user.userName + '</b> отклонил ваше просьбу отменить ход';
            var div = showDialog(html, {}, true, true, true);
        }


        function roundEnd(data) {
            if (!data.isPlayer) {
                return;
            }
            var oldElo = +client.getPlayer()[data.mode].ratingElo;
            var oldRank = +client.getPlayer()[data.mode].rank;
            var newElo = +data['ratings'][client.getPlayer().userId].ratingElo;
            var newRank = +data['ratings'][client.getPlayer().userId].rank;
            var eloDif = newElo - oldElo;
            console.log('round_end;', data, oldElo, newElo, oldRank, newRank);
            hideDialogs();
            var result = "";
            switch (data.result){
                case 'win': result = 'Победа'; break;
                case 'lose': result = 'Поражение'; break;
                case 'draw': result = 'Ничья'; break;
                default : result = 'игра окночена';
            }
            result += '<b> (' + (eloDif >= 0 ? '+':'') + eloDif + ' очков) </b>';
            switch (data.action){
                case 'timeout': result +=  (data.result == 'win' ? 'У соперника ' : 'У Вас ') + ' закончилось время';
                    break;
                case 'throw': result +=  (data.result == 'win' ? 'Соперник сдался ' : 'Вы сдались ');
                    break;
            }
            var rankResult = '';
            if (newRank > 0) {
                if (data.result == 'win' && oldRank > 0 && newRank < oldRank) {
                    rankResult = 'Вы поднялись в общем рейтинге с ' + oldRank + ' на ' + newRank + ' место.';
                } else rankResult = 'Вы занимаете ' + newRank + ' место в общем рейтинге.';
            }
            var html = '<p>' + result + '</p><p>' + rankResult +'</p><br>' +
                '<span class="'+ACTION_CLASS+'">Сыграть с соперником еще раз?</span>';

            var div = showDialog(html, {
                width: 350,
                buttons: {
                    "Да, начать новую игру": function () {
                        $(this).remove();
                        client.gameManager.sendReady();
                    },
                    "Нет, выйти": function () {
                        $(this).remove();
                        client.gameManager.leaveGame();
                    },
                    "Ок" : function() {
                        $(this).remove();
                        client.gameManager.leaveRoom();
                    }
                },
                close: function () {
                    $(this).remove();
                    client.gameManager.leaveGame();
                }
            }, true, false);
            div.addClass(ROUNDRESULT_CLASS);
            div.parent().find(":button:contains('Ок')").hide();
            // show dialog result with delay
            div.parent().hide();
            dialogTimeout = setTimeout(function(){
                div.parent().show()
            }, client.opts.resultDialogDelay);
        }

        function userLeave(user) {
            hideNotification();
            var html = 'Пользователь <b>' + user.userName + '</b> покинул игру';
            var div = $('.'+ROUNDRESULT_CLASS);
            if (div && div.length>0){   // find round result dialog and update it
                div.parent().find(':button').hide();
                div.parent().find(":button:contains('Ок')").show();
                div.find('.'+ACTION_CLASS).html(html);
            } else {
                div = showDialog(html, {
                    buttons: {
                        "Ок": function() {
                            $(this).remove();
                            client.gameManager.leaveRoom();
                        }
                    },
                    close: function() {
                        client.gameManager.leaveRoom();
                        $(this).remove();
                    }
                }, true, true, true);
            }
        }

        function loginError() {
            var html = 'Ошибка авторизации. Обновите страницу';
            var div = showDialog(html, {}, false, false, false);
        }

        function showBan(ban) {
            var html = 'Вы не можете писать сообщения в чате, т.к. добавлены в черный список ';
            if (ban.reason && ban.reason != '') html += 'за ' + ban.reason;
            else html += 'за употребление нецензурных выражений и/или спам ';
            if (ban.timeEnd) {
                html += (ban.timeEnd > 2280000000000 ? ' навсегда' : ' до ' + formatDate(ban.timeEnd));
            }
            var div = showDialog(html, {}, false, false, false);
        }


        function showDialog(html, options, draggable, notification, clickHide) {
            options = options || {};
            options.resizable = options.resizable || false;
            options.modal = options.modal || false;
            options.draggable = options.draggable || false;
            options.buttons = options.buttons || {
                "Ок": function() {
                    $(this).remove();
                }
            };
            var div = $('<div>');
            var prevFocus = document.activeElement || document;
            div.html(html).dialog(options);
            div.parent().find(':button').attr('tabindex', '-1');
            document.activeElement.blur();
            $(prevFocus).focus();
            if (draggable) {
                div.parent().draggable();
                div.addClass(DRAGGABLE_CLASS);
            }
            if (notification) {
                div.addClass(NOTIFICATION_CLASS);
            }
            if (clickHide) {
                div.addClass(HIDEONCLICK_CLASS);
            }
            return div;
        }


        function hideDialogs() {
            $('.' + NOTIFICATION_CLASS).dialog("close");
            $('.' + ROUNDRESULT_CLASS).dialog("close");
            $('.' + INVITE_CLASS).dialog("close");
            clearTimeout(dialogTimeout);
        }

        function hideNotification() {
            $('.' + NOTIFICATION_CLASS).dialog("close");
        }

        function hideOnClick() {
            $('.' + HIDEONCLICK_CLASS).dialog("close");
        }

        function formatDate(time) {
            var date = new Date(time);
            var day = date.getDate();
            var month = date.getMonth() + 1;
            var year = ("" + date.getFullYear()).substr(2, 2);
            return ext(day, 2, "0") + "." + ext(month, 2, "0") + "."  + year;
            function ext(str, len, char) {
                //char = typeof (char) == "undefined" ? "&nbsp;" : char;
                str = "" + str;
                while (str.length < len) {
                    str = char + str;
                }
                return str;
            }
        }

        return {
            init: _subscribe,
            showDialog: showDialog,
            hideDialogs: hideDialogs,
            hideNotification: hideNotification,
            cancelTakeBack: function(){
                $('.' + TAKEBACK_CLASS).dialog("close");
            }
        };
    }());

    return dialogs;
});


define('text!tpls/v6-chatMain.ejs',[],function () { return '<div class="tabs">\r\n    <div class="tab" data-type="public">Общий чат</div>\r\n    <div class="tab" data-type="private" style="display: none;">игрок</div>\r\n</div>\r\n<div class="clear"></div>\r\n<div class="messagesWrap"><ul></ul></div>\r\n<div class="inputMsg" contenteditable="true"></div>\r\n<div class="layer1">\r\n    <div class="sendMsgBtn">Отправить</div>\r\n    <select id="chat-select">\r\n        <option selected>Готовые сообщения</option>\r\n        <option>Ваш ход!</option>\r\n        <option>Привет!</option>\r\n        <option>Молодец!</option>\r\n        <option>Здесь кто-нибудь умеет играть?</option>\r\n        <option>Кто со мной?</option>\r\n        <option>Спасибо!</option>\r\n        <option>Спасибо! Интересная игра!</option>\r\n        <option>Спасибо, больше играть не могу. Ухожу!</option>\r\n        <option>Спасибо, интересная игра! Сдаюсь!</option>\r\n        <option>Отличная партия. Спасибо!</option>\r\n        <option>Ты мог выиграть</option>\r\n        <option>Ты могла выиграть</option>\r\n        <option>Ходи!</option>\r\n        <option>Дай ссылку на твою страницу вконтакте</option>\r\n        <option>Снимаю шляпу!</option>\r\n        <option>Красиво!</option>\r\n        <option>Я восхищен!</option>\r\n        <option>Где вы так научились играть?</option>\r\n        <option>Еще увидимся!</option>\r\n        <option>Ухожу после этой партии. Спасибо!</option>\r\n        <option>Минуточку</option>\r\n    </select>\r\n</div>\r\n<div class="layer2">\r\n    <span class="chatAdmin">\r\n        <input type="checkbox" id="chatIsAdmin"/><label for="chatIsAdmin">От админа</label>\r\n    </span>\r\n\r\n    <span class="chatRules">Правила чата</span>\r\n</div>\r\n\r\n<ul class="menuElement noselect">\r\n    <li data-action="invite"><span>Пригласить в игру</span></li>\r\n    <li data-action="showProfile"><span>Показать профиль</span></li>\r\n    <li data-action="ban"><span>Забанить в чате</span></li>\r\n</ul>';});


define('text!tpls/v6-chatMsg.ejs',[],function () { return '<li class="chatMsg" data-msgId="<%= msg.time %>">\r\n    <div class="msgRow1">\r\n        <div class="smallRight time"><%= msg.t %></div>\r\n        <div class="smallRight rate"><%= (msg.rank || \'—\') %></div>\r\n        <div class="chatUserName" data-userId="<%= msg.userId%>" title="<%= msg.userName %>">\r\n            <span class="userName"><%= msg.userName %></span>\r\n        </div>\r\n    </div>\r\n    <div class="msgRow2">\r\n        <div class="delete" title="Удалить сообщение" style="background-image: url(<%= imgDel %>);"></div>\r\n        <div class="msgTextWrap">\r\n            <span class="v6-msgText"><%= _.escape(msg.text) %></span>\r\n        </div>\r\n    </div>\r\n</li>';});


define('text!tpls/v6-chatDay.ejs',[],function () { return '<li class="chatDay" data-day-msgId="<%= time %>">\r\n    <div>\r\n        <%= d %>\r\n    </div>\r\n</li>';});


define('text!tpls/v6-chatRules.ejs',[],function () { return '<div id="chat-rules" class="aboutPanel">\r\n    <img class="closeIcon" src="<%= close %>">\r\n\r\n    <div style="padding: 10px 12px 15px 25px;">\r\n        <h2>Правила чата</h2>\r\n        <p style="line-height: 16px;">В чате запрещено:<br>\r\n            <span style="margin-left:5px;">1. использование ненормативной лексики и оскорбительных выражений;</span><br>\r\n            <span style="margin-left:5px;">2. хамское и некорректное общение с другими участниками;</span><br>\r\n            <span style="margin-left:5px;">3. многократная публикация бессмысленных, несодержательных или одинаковых сообщений.</span>\r\n        </p>\r\n\r\n        <p style="line-height: 16px;"><span style="margin-left:5px;">Баны</span> выносятся: на 1 день, на 3 дня, на 7 дней,на\r\n            месяц или навсегда, в зависимости от степени тяжести нарушения.\r\n        </p>\r\n\r\n        <p style="line-height: 16px;"><span style="margin-left:5px;">Бан</span> снимается автоматически по истечении срока.\r\n        </p>\r\n\r\n    </div>\r\n</div>';});


define('text!tpls/v6-chatBan.ejs',[],function () { return '<div>\r\n    <span class="ban-username" style="font-weight:bold;">Бан игрока <i><%= userName%></i></span><br><br>\r\n    <span>Причина бана:</span>\r\n    <br>\r\n    <div class="inputTextField" id="ban-reason" contenteditable="true" style="height:54px; border: 1px solid #aaaaaa;"></div><br>\r\n\r\n    <span>Длительность бана:</span><br>\r\n    <select id="ban-duration">\r\n        <option value="1">1 день</option>\r\n        <option value="3">3 дня</option>\r\n        <option value="7" selected="">7 дней</option>\r\n        <option value="30">30 дней</option>\r\n        <option value="9999">Навсегда</option>\r\n    </select>\r\n\r\n</div>';});

define('views/chat',['underscore', 'backbone', 'text!tpls/v6-chatMain.ejs', 'text!tpls/v6-chatMsg.ejs', 'text!tpls/v6-chatDay.ejs', 'text!tpls/v6-chatRules.ejs', 'text!tpls/v6-chatBan.ejs'],
    function(_, Backbone, tplMain, tplMsg, tplDay, tplRules, tplBan) {
        

        var ChatView = Backbone.View.extend({
            tagName: 'div',
            id: 'v6Chat',
            tplMain: _.template(tplMain),
            tplMsg: _.template(tplMsg),
            tplDay: _.template(tplDay),
            tplRules: _.template(tplRules),
            tplBan: _.template(tplBan),
            events: {
                'click .chatMsg': '_deleteMsg',
                'click .tab': 'clickTab',
                'blur .inputMsg': 'blurInputMsg',
                'focus .inputMsg': 'clickInputMsg',
                'click .sendMsgBtn': 'sendMsgEvent',
                'keyup .inputMsg': 'sendMsgEvent',
                'change #chat-select': 'changeChatSelect',
                'click .chatMsg div[data-userid]': 'showMenu',
                'click li[data-action]': 'clickDialogAction',
                'click .chatRules': 'showChatRules'
            },

            banUser: function(userId, userName){
                var mng =  this.client.chatManager;
                var div = $(this.tplBan({userName: userName})).attr('data-userId', userId).dialog({
                    buttons: {
                        "Добавить в бан": function() {
                           mng.banUser($(this).attr('data-userId'),$(this).find('#ban-duration')[0].value, $(this).find('#ban-reason').html());
                            $(this).remove();
                        },
                        "Отмена": function(){
                            $(this).remove();
                        }
                    },
                    close: function() {
                        $(this).remove();
                    }
                }).parent().draggable();
            },

            showChatRules: function() {
                this.$rules.css({
                    top: ($(window).height() / 2) - (this.$rules.outerHeight() / 2),
                    left: ($(window).width() / 2) - (this.$rules.outerWidth() / 2)
                }).show();
            },

            clickDialogAction: function(e) {
                var actionObj = {
                    action: $(e.currentTarget).attr('data-action'),
                    userId: this.$menu.attr('data-userId'),
                    userName: this.$menu.attr('data-userName')
                };

                switch (actionObj.action){
                    case 'showProfile': this.client.onShowProfile(actionObj.userId, actionObj.userName); break;
                    case 'invite': this.client.viewsManager.userListView.invitePlayer(actionObj.userId); break;
                    case 'ban': this.banUser(actionObj.userId, actionObj.userName); break;
                }
            },

            showMenu: function(e) {
                // клик на window.body сработает раньше, поэтому сдесь даже не нужно вызывать $menu.hide()
                var coords = e.target.getBoundingClientRect(),
                    OFFSET = 20, // отступ, чтобы не закрывало имя
                    userId = $(e.target).parent().attr('data-userid');

                setTimeout(function() {
                    this.$menu.find('li[data-action=invite]').hide();
                    if (!this.client.gameManager.inGame()) {                // show invite user, if we can
                        var userlist = this.client.userList.getFreeUserList();
                        if (userlist) {                                     // check user is free
                            for (var i = 0; i < userlist.length; i++){
                                if (userlist[i].userId == userId){
                                    this.$menu.find('li[data-action=invite]').show();
                                }
                            }
                        }
                    }

                    this.$menu.attr('data-userId', userId);
                    this.$menu.attr('data-userName', $(e.target).html());
                    this.$menu.css({
                        left: OFFSET, // фиксированный отступ слева
                        top: coords.top - document.getElementById('v6Chat').getBoundingClientRect().top + OFFSET
                    }).slideDown();
                }.bind(this), 0);

            },

            hideMenuElement: function() {
                this.$menu.removeAttr('data-userId');
                this.$menu.hide();
            },

            changeChatSelect: function(e) {
                var textMsg = e.target.options[e.target.selectedIndex].innerHTML;
                this.$SELECTED_OPTION.attr('selected', true);
                this.$inputMsg.text(textMsg);
            },

            sendMsgEvent: function(e) {
                // e используется здесь только если нажат enter
                if (e.type === 'keyup' && e.keyCode !== 13) {
                    return;
                }

                if (this.$inputMsg.has(this.$placeHolderSpan).length) {
                    return;
                }

                this._sendMsg(this.$inputMsg.text());
            },

            scrollEvent: function() {
                if (this.$messagesWrap[0].scrollHeight - this.$messagesWrap.height() != 0 &&
                this.$messagesWrap.scrollTop()<5 &&
                !this.client.chatManager.fullLoaded[this.client.chatManager.current]){
                    this._setLoadingState();
                    this.client.chatManager.loadMessages();
                }
            },

            bodyScroll: function (e) {
                e.deltaY =  e.deltaY ||  e.originalEvent.wheelDeltaY || -e.originalEvent.detail;
                if ((this.$messagesWrap[0].scrollHeight - this.$messagesWrap.height() - this.$messagesWrap.scrollTop() === 0) && e.deltaY < 0) {
                    e.preventDefault();
                    e.stopPropagation();
                }
            },

            _sendMsg: function(text) {
                if (text === '' || typeof text !== 'string') {
                    return;
                }

                if (text.length > this.MAX_MSG_LENGTH) {
                    alert(this.MAX_LENGTH_MSG);
                    return;
                }
                this.client.chatManager.sendMessage(text, null, $('#chatIsAdmin')[0].checked);
                this.$inputMsg.empty();
                this.$inputMsg.focus();
            },

            blurInputMsg: function(e) {
                var target = $(e.currentTarget);

                if (target.text() === '') {
                    target.empty().append(this.$placeHolderSpan); // empty на всякий случай
                }
            },

            clickInputMsg: function(e) {
                var target = $(e.currentTarget);

                if (target.has(this.$placeHolderSpan).length) {
                    target.empty();
                }
            },

            clickTab: function(e) {
                var $target = $(e.target),
                    tabName = $target.attr('data-type');

                if (tabName === this.currentActiveTabName) {
                    return;
                }

                this.currentActiveTabName = tabName;
                this._setActiveTab(this.currentActiveTabName);
                this.client.chatManager.loadCachedMessages(this.tabs[tabName].target);
            },

            initialize: function(_client) {
                this.client = _client;
                this.images = _client.opts.images;
                this.$el.html(this.tplMain());

                this.MAX_MSG_LENGTH = 128;
                this.SCROLL_VAL = 40;
                this.MAX_LENGTH_MSG = 'Сообщение слишком длинное (максимальная длина - 128 символов). Сократите его попробуйте снова';

                this.CLASS_DISABLED = 'disabled';
                this.CLASS_CHATADMIN = 'chatAdmin';
                this.CLASS_DELETE_CHAT_MESSAGE = 'delete';
                this.CLASS_NEW_MSG = 'newMsg';
                this.CLASS_ADMIN_MSG = 'isAdmin';
                this.ACTIVE_TAB_CLASS = 'activeTab';
                this.CLASS_MENU_ELEMENT = 'menuElement';

                this.$menu = this.$el.find('.' + this.CLASS_MENU_ELEMENT); // диалоговое меню при ЛКМ на имени игрока
                if (!this.client.isAdmin) {
                    this.$menu.find('li[data-action="ban"]').remove();
                }
                window.document.body.addEventListener('click', this.hideMenuElement.bind(this));

                this.$rules = $(this.tplRules({close: this.images.close}));
                window.document.body.appendChild(this.$rules[0]);
                this.$rules.find('img.closeIcon').on('click', function() {
                    this.$rules.hide();
                }.bind(this));

                this.$placeHolderSpan = $('<span class="placeHolderSpan">Введите ваше сообщение..</span>');

                this.$spinnerWrap = $('<li class="spinnerWrap"><div class="spinner" style="background: url(' + this.images.spin + ');"></div></li>');
                this.$messagesWrap = this.$el.find('.messagesWrap');
                this.$msgsList = this.$messagesWrap.find('ul');
                this.$inputMsg = this.$el.find('.inputMsg');
                this.$SELECTED_OPTION = this.$el.find('select option:selected');

                this.currentActiveTabName = 'public';
                this.currentActiveTabTitle = _client.game;
                this.tabs = {
                    'public': { target: _client.game, title: 'Общий чат' },
                    'private': null
                };

                this._setActiveTab(this.currentActiveTabName);
                //append element
                if (_client.opts.blocks.chatId)
                    $('#'+_client.opts.blocks.chatId).append(this.el);
                else
                    $('body').append(this.el);

                this.$inputMsg.empty().append(this.$placeHolderSpan);
                this._setLoadingState();

                if (this.client.isAdmin) this.$el.find('.' + this.CLASS_CHATADMIN).removeClass(this.CLASS_CHATADMIN);

                this.listenTo(this.client.chatManager, 'message', this._addOneMsg.bind(this));
                this.listenTo(this.client.chatManager, 'load', this._preaddMsgs.bind(this));
                this.listenTo(this.client.chatManager, 'open_dialog', this._openDialog.bind(this));
                this.listenTo(this.client.chatManager, 'close_dialog', this._closeDialog.bind(this));
                this.$messagesWrap.scroll(this.scrollEvent.bind(this));
                this.$messagesWrap.on({'mousewheel DOMMouseScroll': this.bodyScroll.bind(this)});
            },

            setPublicTab: function(tabName){
                this.tabs.public.target = tabName;
                this.currentActiveTabName = 'public';
                this._setActiveTab('public');
            },

            _setActiveTab: function(tabName) {
                var $tab = this.$el.find('.tabs div[data-type="' + tabName + '"]');
                this.$el.find('.tabs div').removeClass(this.ACTIVE_TAB_CLASS);
                $tab.addClass(this.ACTIVE_TAB_CLASS);
                $tab.html(this.tabs[tabName].title);
                $tab.show();

                this.$msgsList.html('');
                this._setLoadingState();
                this.currentActiveTabTitle = this.tabs[tabName].target;

            },

            render: function() {
                return this;
            },

            _openDialog: function(dialog){
                if (dialog.userId) {
                    this.tabs['private'] = {target: dialog.userId, title: dialog.userName};
                }
                this.currentActiveTabName = 'private';
                this._setActiveTab('private');
            },

            _closeDialog: function(target){
                this.currentActiveTabName = 'public';
                this._setActiveTab('public');
                this.$el.find('.tabs div[data-type="' + 'private' + '"]').hide();
            },

            _deleteMsg: function(e) {
                var $msg, msgId;
                if (!isNaN(+e) && typeof +e === 'number') {
                    msgId = e;
                } else { //клик не по кнопке удалить
                    if (!$(e.target).hasClass(this.CLASS_DELETE_CHAT_MESSAGE)) {
                        return;
                    }
                    $msg = $(e.currentTarget);
                    msgId = $msg.attr('data-msgId')
                }
                if (msgId) {
                    this.client.chatManager.deleteMessage(parseFloat(msgId));
                }
                // если был передан id сообщения
                if (!$msg) {
                    $msg = this.$el.find('li[data-msgId="' + msgId + '"]').remove();
                }

                if (!$msg) {
                    console.warn('cannot find msg with  id', msgId, e);
                    return;
                }

                $msg.remove();
            },

            _addOneMsg: function(msg) {
                //console.log('chat message', msg);
                if (msg.target != this.currentActiveTabTitle) return;
                var $msg = this.tplMsg({msg:msg, imgDel:this.images.del});
                var fScroll = this.$messagesWrap[0].scrollHeight - this.$messagesWrap.height() - this.$messagesWrap.scrollTop() < this.SCROLL_VAL;

                if (!this.client.chatManager.last[msg.target] || this.client.chatManager.last[msg.target].d != msg.d) this.$msgsList.append(this.tplDay(msg));

                this.$msgsList.append($msg);

                $msg = this.$el.find('li[data-msgId="' + msg.time + '"]');
                if (msg.admin) $msg.addClass(this.CLASS_ADMIN_MSG);

                $msg.addClass(this.CLASS_NEW_MSG);
                setTimeout(function(){
                    this.$el.find('li[data-msgId="' + msg.time + '"]').removeClass(this.CLASS_NEW_MSG);
                }.bind(this), 2500);

                //scroll down
                if (fScroll) this.$messagesWrap.scrollTop(this.$messagesWrap[0].scrollHeight)
            },

            _preaddMsgs: function(msg) {
                //console.log('pre chat message', msg);
                if (msg && msg.target != this.currentActiveTabTitle) return;
                this._removeLoadingState();
                if (!msg) return;
                var oldScrollTop =  this.$messagesWrap.scrollTop();
                var oldScrollHeight = this.$messagesWrap[0].scrollHeight;
                var oldDay = this.$el.find('li[data-day-msgId="' + this.client.chatManager.first[msg.target].time + '"]');
                if (oldDay) oldDay.remove();
                // add day previous msg
                if (this.client.chatManager.first[msg.target].d != msg.d) this.$msgsList.prepend(this.tplDay(this.client.chatManager.first[msg.target]));
                var $msg = this.tplMsg({msg: msg, imgDel:this.images.del});
                this.$msgsList.prepend($msg);
                // add day this, now firs message
                this.$msgsList.prepend(this.tplDay(msg));
                $msg = this.$el.find('li[data-msgId="' + msg.time + '"]');
                if (msg.admin) $msg.addClass(this.CLASS_ADMIN_MSG);
                this.$messagesWrap.scrollTop(oldScrollTop + this.$messagesWrap[0].scrollHeight - oldScrollHeight);
            },

            _setLoadingState: function() {
                this.$msgsList.prepend(this.$spinnerWrap);
                this.$messagesWrap.addClass(this.CLASS_DISABLED);
            },

            _removeLoadingState: function(){
                this.$spinnerWrap.remove();
                this.$messagesWrap.removeClass(this.CLASS_DISABLED);
            }
        });
        return ChatView;
    });

define('text!tpls/v6-settingsMain.ejs',[],function () { return '\r\n    <img class="closeIcon" src="<%= close %>">\r\n    <div class="settingsContainer">\r\n    <%= settings %>\r\n    </div>\r\n    <div >\r\n        <div class="confirmBtn">OK</div>\r\n    </div>\r\n';});


define('text!tpls/v6-settingsDefault.ejs',[],function () { return '<p>Настройки игры</p>\r\n<div>\r\n    <div class="option">\r\n        <label><input type="checkbox" name="sounds">\r\n            Включить звук</label>\r\n    </div>\r\n    <div class="option">\r\n        <label><input type="checkbox" name="disableInvite">\r\n            Запретить приглашать меня в игру</label>\r\n    </div>\r\n</div>\r\n';});

define('views/settings',['underscore', 'backbone', 'text!tpls/v6-settingsMain.ejs', 'text!tpls/v6-settingsDefault.ejs'],
    function(_, Backbone, tplMain, tplDefault) {
        

        var SettingsView = Backbone.View.extend({
            tagName: 'div',
            id: 'v6-settings',
            tplMain: _.template(tplMain),
            tplDefault: _.template(tplDefault),
            events: {
                'click .closeIcon': 'close',
                'change input': 'changed',
                'click .confirmBtn': 'save'
            },


            initialize: function(client) {
                this.client = client;
                this.images  = client.opts.images;
                this.changedProperties = [];
                this.$el.html(this.tplMain({close:this.images.close, settings: client.opts.settingsTemplate ? _.template(client.opts.settingsTemplate)() : this.tplDefault()}));

                $('body').append(this.$el);
                this.$el.hide();

            },

            changed: function (e){
                var $target = $(e.target),
                    type = $target.prop('type'),
                    property = $target.prop('name'),
                    value = type == "radio" ? $target.val() : $target.prop('checked'),
                    settings = this.client.settings,
                    defaultSettings = this.client.defaultSettings;

                if (defaultSettings.hasOwnProperty(property)){
                    console.log('settings; changed', {property: property, value: value, type: type});
                    if (this.changedProperties.indexOf(property) == -1)this.changedProperties.push(property);
                    this.client._onSettingsChanged({property: property, value: value, type: type});
                } else {
                    console.warn('settings;', 'default settings does not have property', property);
                }
            },

            save: function () {
                this.$el.hide();
                this.isClosed = true;

                var defaultSettings = this.client.defaultSettings,
                    settings = this.client.settings,
                    value, $input;
                if (this.changedProperties.length == 0) {
                    console.log('settings; nothing changed');
                    return;
                }
                for (var property in defaultSettings){
                    if (defaultSettings.hasOwnProperty(property)){
                        value = settings[property];
                        if (typeof value == "boolean") {
                            $input = this.$el.find('input[name=' + property + ']');
                            value = $input.prop('checked');
                        }
                        else {
                            $input = this.$el.find('input[name=' + property + ']:checked');
                            value = $input.val();
                        }
                        if ($input) {
                            console.log('settings; save', property, value, $input.prop('type'));
                            settings[property] = value;
                        } else {
                            console.error('settings;', 'input element not found! ', property);
                        }
                    }
                }
                this.client.saveSettings();
            },

            load: function () {
                this.changedProperties = [];
                var defaultSettings = this.client.defaultSettings,
                    settings = this.client.settings,
                    value, $input;
                for (var property in defaultSettings){
                    if (defaultSettings.hasOwnProperty(property)){
                        value = settings[property];
                        if (typeof value == "boolean")
                            $input = this.$el.find('input[name=' + property + ']');
                        else
                            $input = this.$el.find('input[name=' + property + '][value=' + value + ']');
                        if ($input) {
                            console.log('settings; load', property, value, $input.prop('type'));
                            $input.prop('checked', !!value);
                        } else {
                            console.error('settings;', 'input element not found! ', property, value);
                        }
                    }
                }
            },

            close: function () {
                this.$el.hide();
                this.isClosed = true;

                //emit changed default
                var $input, value, property, settings = this.client.settings;
                for (var i = 0; i < this.changedProperties.length; i++){
                    property = this.changedProperties[i];
                    value = settings[property];
                    if (typeof value == "boolean")
                        $input = this.$el.find('input[name=' + property + ']');
                    else
                        $input = this.$el.find('input[name=' + property + '][value=' + value + ']');
                    if ($input) {
                        console.log('settings; default', {property: property, value: value, type: $input.prop('type')});
                        this.client._onSettingsChanged({property: property, value: value, type: $input.prop('type')});
                    } else {
                        console.error('settings;', 'input element not found! ', property, value);
                    }
                }
            },


            show: function () {
                this.$el.css({
                    top: ($(window).height() / 2) - (this.$el.outerHeight() / 2),
                    left: ($(window).width() / 2) - (this.$el.outerWidth() / 2)
                }).show();
                this.load();
            }

        });


        return SettingsView;
    });

define('modules/views_manager',['views/user_list', 'views/dialogs', 'views/chat', '../views/settings'], function(userListView, dialogsView, v6ChatView, v6SettingsView) {
    var ViewsManager = function(client){
        this.client = client;
        this.userListView = null;
        this.dialogsView = dialogsView;
        this.chat = null;
    };

    ViewsManager.prototype.init = function() {
        this.userListView = new userListView(this.client);
        this.dialogsView.init(this.client);
        this.v6ChatView = new v6ChatView(this.client);
        this.settingsView = new v6SettingsView(this.client)
    };

    ViewsManager.prototype.closeAll = function(){
        this.client.ratingManager.close();
        this.client.historyManager.close();
        this.settingsView.close();
    };

    ViewsManager.prototype.showSettings = function () {
        this.settingsView.show();
    };

    return ViewsManager;
});
/**
 * Obscene words detector for russian language
 *
 * @name antimat
 * @version 0.0.1
 * @license MIT License - http://www.opensource.org/licenses/mit-license.php
 * @see https://github.com/itlessons/js-antimat
 *
 * Copyright (c) 2014, www.itlessons.info
 */
(function () {

    var t = {};

    window.containsMat = function (text) {
        return t.containsMat(text);
    };

    window.antimat = t;

    t.badPatterns = [
        "^(о|а)н(о|а)нист.*",
        "^лошар.*",
        "^к(а|о)злина$",
        "^к(о|а)зел$",
        "^сволоч(ь|ъ|и|уга|ам|ами).*",
        "^лох[уеыаоэяию].*",
        ".*урод(ы|у|ам|ина|ины).*",
        ".*бля(т|д).*", ".*гандо.*",
        "^м(а|о)нд(а|о).*",
        ".*сперма.*",
        ".*[уеыаоэяию]еб$",
        "^сучк(а|у|и|е|ой|ай).*",
        "^придур(ок|ки).*",
        "^д(е|и)би(л|лы).*",
        "^сос(ать|и|ешь|у)$",
        "^залуп.*",
        "^муд(е|ил|о|а|я|еб).*",
        ".*шалав(а|ы|ам|е|ами).*",
        ".*пр(а|о)ст(и|е)т(у|е)тк(а|и|ам|е|ами).*",
        ".*шлюх(а|и|ам|е|ами).*",
        ".*ху(й|и|я|е|л(и|е)).*",
        ".*п(и|е|ы)зд.*",
        "^бл(я|т|д).*",
        "(с|сц)ук(а|о|и|у).*",
        "^еб.*",
        ".*(д(о|а)лб(о|а)|разъ|разь|за|вы|по)ебы*.*",
        ".*пид(а|о|е)р.*",
        ".*хер.*",
        // appended
        "идиот", 
        "коз(е|ё)л",
        "п(и|е)дрила",
        "лошара",
        "уе(бок|бан)",
        "сучка",
        "отсоси",
        "педик",
        "лесбиянк.*",
        "козлы",
        "говно",
        "жопа",
        "гнидовский",
        "обоссал.*"
    ];

    t.goodPatterns = [
        ".*психу.*",
        ".*плох.*",
        ".*к(о|а)манд.*",
        ".*истр(е|и)блять.*",
        ".*л(о|а)х(о|а)трон.*",
        ".*(о|а)ск(о|а)рблять.*",
        "хул(е|и)ган",
        ".*м(а|о)нд(а|о)рин.*",
        ".*р(а|о)ссл(а|о)блять.*",
        ".*п(о|а)тр(е|и)блять.*",
        ".*@.*\\.(ру|сом|нет)$"
    ];

    t.goodWords = [
        "дезмонда",
        "застрахуйте",
        "одномандатный",
        "подстрахуй",
        "психуй"
    ];

    t.letters = {
        "a": "а",
        "b": "в",
        "c": "с",
        "e": "е",
        "f": "ф",
        "g": "д",
        "h": "н",
        "i": "и",
        "k": "к",
        "l": "л",
        "m": "м",
        "n": "н",
        "o": "о",
        "p": "р",
        "r": "р",
        "s": "с",
        "t": "т",
        "u": "у",
        "v": "в",
        "x": "х",
        "y": "у",
        "w": "ш",
        "z": "з",
        "ё": "е",
        "6": "б",
        "9": "д"
    };

    t.containsMat = function (text) {

        text = t.cleanBadSymbols(text.toLowerCase());

        var words = text.split(" ");

        for (var i = 0; i < words.length; i++) {

            var word = t.convertEngToRus(words[i]);

            if (t.isInGoodWords(word) && t.isInGoodPatterns(word))
                continue;

            if (t.isInBadPatterns(word))
                return true;
        }

        if (t.containsMatInSpaceWords(words))
            return true;

        return false;
    };

    t.convertEngToRus = function (word) {
        for (var j = 0; j < word.length; j++) {
            for (var key in t.letters) {
                if (word.charAt(j) == key)
                    word = word.substring(0, j) + t.letters[key] + word.substring(j + 1, word.length)
            }
        }

        return word;
    };

    t.cleanBadSymbols = function (text) {
        return text.replace(/[^a-zA-Zа-яА-Яё0-9\s]/g, "");
    };

    t.isInGoodWords = function (word) {

        for (var i = 0; i < t.goodWords.length; i++) {
            if (word == t.goodWords[i])
                return true;
        }

        return false;
    };

    t.isInGoodPatterns = function (word) {

        for (var i = 0; i < t.goodPatterns.length; i++) {
            var pattern = new RegExp(t.goodPatterns[i]);
            if (pattern.test(word))
                return true;
        }

        return false;
    };

    t.isInBadPatterns = function (word) {

        for (var i = 0; i < t.badPatterns.length; i++) {
            var pattern = new RegExp(t.badPatterns[i]);
            if (pattern.test(word))
                return true;
        }

        return false;
    };

    t.containsMatInSpaceWords = function (words) {
        var spaceWords = t.findSpaceWords(words);

        for (var i = 0; i < spaceWords.length; i++) {

            var word = t.convertEngToRus(spaceWords[i]);

            if (t.isInBadPatterns(word))
                return true;
        }

        return false;
    };

    t.findSpaceWords = function (words) {

        var out = [];
        var spaceWord = "";

        for(var i=0; i < words.length; i++ ){
            var word = words[i];

            if(word.length <= 3){
                spaceWord += word;
                continue;
            }

            if(spaceWord.length >= 3){
                out.push(spaceWord);
                spaceWord = "";
            }
        }

        return out;
    };

    t.addBadPattern = function (pattern) {
        t.badPatterns.push(pattern);
    };

    t.addGoodPattern = function (pattern) {
        t.goodPatterns.push(pattern);
    };

    t.addGoodWord = function (pattern) {
        t.goodWords.push(pattern);
    };

})();
define("antimat", function(){});

define('modules/chat_manager',['EE', 'antimat'], function(EE) {
    
    var ChatManager = function (client) {
        this.client = client;
        this.first = {};
        this.last = {};
        this.fullLoaded = {};
        this.messages = {};
        this.current = client.game;
        this.MSG_COUNT = 10;

        client.on('login', function(){
            this.current = client.game;
            client.viewsManager.v6ChatView.setPublicTab(client.game);
            this.loadMessages();
        }.bind(this));

        client.gameManager.on('game_start', function(room){
            if (!room.isPlayer) return;
            for (var i = 0; i < room.players.length; i++){
                if (!room.players[i].isPlayer) {
                    this.openDialog(room.players[i].userId, room.players[i].userName);
                }
            }
        }.bind(this));

        client.gameManager.on('game_leave', function(room){
            if (!room.isPlayer) return;
            for (var i = 0; i < room.players.length; i++){
                if (!room.players[i].isPlayer) {
                    this.closeDialog(room.players[i].userId);
                }
            }
        }.bind(this));
    };

    ChatManager.prototype = new EE();


    ChatManager.initMessage = function(message, player, mode){
        if (message.userData[mode]) message.rank = message.userData[mode].rank;
        if (!message.rank || message.rank < 1) message.rank = '—';
        if (message.target == player.userId) // is private message, set target sender
            message.target = message.userId;

        if (message.admin) {
            message.rank = '';
            message.userId = 0;
            message.userName = 'Админ'
        }

        message.date = new Date(message.time);
        var h = message.date.getHours();
        var m = message.date.getMinutes();
        if (h < 10) h = '0' + h;
        if (m < 10) m = '0' + m;
        message.t =  h + ':' + m;
        message.d = message.date.getDate() + ' ' + ChatManager.months[message.date.getMonth()] + ' ' + message.date.getFullYear();
        return message;
    };

    ChatManager.months = ['Января', 'Февраля', 'Марта', 'Апреля', 'Мая', 'Июня', 'Июля', 'Сентября', 'Октября', 'Ноября', 'Декабря'];


    ChatManager.prototype.onMessage = function (message) {
        var data = message.data, player = this.client.getPlayer(), i, cache;
        console.log('chat_manager;', 'message', message);
        switch (message.type) {
            case 'message':
                message = ChatManager.initMessage(data, player, this.client.currentMode);
                if (!this.first[message.target]) this.first[message.target] = message;

                if (!this.messages[message.target]) this.messages[message.target] = [];
                cache = this.messages[message.target];
                cache.push(message);
                if (cache.length>100) cache.shift();

                this.emit('message', message);
                this.last[message.target] = message;

                if (message.target != this.client.game && message.target != this.current) this.openDialog(message.userId, message.userName);
                break;
            case 'load':
                if (!data.length || data.length<1) {
                    this.fullLoaded[this.current] = true;
                    this.emit('load', null);
                    return;
                }
                message = ChatManager.initMessage(data[0], player, this.client.currentMode);
                if (!this.messages[message.target]) this.messages[message.target] = [];
                cache = this.messages[message.target];
                for (i = 0; i < data.length; i++){
                   this.onMessageLoad(ChatManager.initMessage(data[i], player, this.client.currentMode), cache);
                }
                break;
            case 'ban':
                this.ban = message.data;
                this.emit('show_ban', message.data);
                break;
        }
    };


    ChatManager.prototype.sendMessage = function (text, target, admin){
        if (this.ban){
            this.emit('show_ban', this.ban);
            return;
        }
        if (window.containsMat(text)){
            console.warn('chat_manager; censored text', text);
            return;
        }
        var message = {
            text: text
        };
        if (admin) message.admin = true;
        if (!target) message.target = this.current;
        this.client.send('chat_manager', 'message', 'server', message);
    };


    ChatManager.prototype.loadMessages = function (count, time, target) {
        if (this.fullLoaded[this.current]){
            console.log('chat_manager;', 'all messages loaded!', count, time, this.first);
            this.emit('load', null);
            return;
        }
        count = count || this.MSG_COUNT;
        if (!target) target = this.current;
        time = time || (this.first[target]?this.first[target].time:null);
        console.log('chat_manager;', 'loading messages', count, time, this.first);
        this.client.send('chat_manager', 'load', 'server', {count:count, time:time, target:target});
    };


    ChatManager.prototype.onMessageLoad = function(message, cache){
        if (cache && cache.length<100) cache.unshift(message);
        if (!this.first[message.target]) this.first[message.target] = message;
        if (!this.last[message.target]) this.last[message.target] = message;
        this.emit('load', message);
        this.first[message.target] = message;
    };


    ChatManager.prototype.openDialog = function(userId, userName){
        this.current = userId;
        this.emit('open_dialog', {userId: userId, userName:userName});
        this.loadCachedMessages(userId);
    };


    ChatManager.prototype.closeDialog = function (target){
        this.emit('close_dialog', target || this.current);
        this.loadCachedMessages(this.client.game);
    };


    ChatManager.prototype.loadCachedMessages = function (target){
        this.current = target;
        this.first[target] = this.last[target] = null;
        if (this.messages[target] && this.messages[target].length>0){ // load cached messages;
            for (var i = this.messages[target].length - 1; i >= 0; i-- ){
                this.onMessageLoad(this.messages[target][i]);
            }
        }
        if (this.messages[target] && this.messages[target].length > 0
            && this.messages[target].length < this.MSG_COUNT) {
            this.loadMessages(this.MSG_COUNT, this.messages[target][0], target);
        }  else this.loadMessages(this.MSG_COUNT, null, target);
    };


    ChatManager.prototype.banUser = function(userId, days, reason) {
        console.log('chat_manager;', 'banUser', userId, days, reason);
        this.client.send('chat_manager', 'ban', 'server', {userId:userId, days:days, reason:reason});
    };

    ChatManager.prototype.deleteMessage = function(time) {
        console.log('chat_manager;', 'deleteMessage', time);
        this.client.send('chat_manager', 'delete', 'server', {time:time});
    };

    return ChatManager;
});

define('text!tpls/v6-historyMain.ejs',[],function () { return '<div id="v6-history">\r\n    <div class="historyHeader">\r\n        <div class="historyFilter">\r\n            <input type="text" placeholder="Поиск по имени" id="historyAutoComplete" value="">\r\n            <div class="delete" style="background-image: url(<%= imgDel %>)"></div>\r\n        </div>\r\n        <img class="closeIcon" src="<%= close %>" title="Закрыть окно истории">\r\n    </div>\r\n    <div class="historyWrapper">\r\n        <table class="historyTable">\r\n            <thead>\r\n                <tr></tr>\r\n            </thead>\r\n            <tbody>\r\n            </tbody>\r\n        </table>\r\n        <div id="showMore">Показать еще</div>\r\n        <div class="noHistory">Сохранения отсутствуют</div>\r\n        <div class="loading"><img src="<%= spin %>"></div>\r\n    </div>\r\n</div>';});


define('text!tpls/v6-historyHeaderTD.ejs',[],function () { return '<td class="sessionHeader historyDate" rowspan="<%= rows %>"> <%= date %> </td>\r\n<td class="sessionHeader historyName" rowspan="<%= rows %>">\r\n    <span class="userName" data-userid="<%= userId %>"><%= userName %></span>\r\n    <span class="userRank">(<%= rank %>)</span>\r\n    <span class="userScore"><%= score %></span>\r\n    <div class="eloDiff <%= (eloDiff>-1?\'diffPositive\':\'diffNegative\')%>"><%= eloDiff ===\'\'?\'\':(eloDiff>-1?\'+\'+eloDiff:eloDiff)%></div>\r\n</td>';});


define('text!tpls/v6-historyTH.ejs',[],function () { return '<th colspan="<%= colspan %>" title="<%= title %>"><%= value %></th>';});


define('text!tpls/v6-historyTR.ejs',[],function () { return '<tr title="<%= title %>" class="<%= trclass %>" data-id="<%= id %>" ><%= value %></tr>';});


define('text!tpls/v6-ratingTab.ejs',[],function () { return '<span class="unactiveLink"  data-idtab="<%= id %>"><%= title %></span>&nbsp;&nbsp;';});

define('views/history',['underscore', 'backbone', 'text!tpls/v6-historyMain.ejs', 'text!tpls/v6-historyHeaderTD.ejs', 'text!tpls/v6-historyTH.ejs', 'text!tpls/v6-historyTR.ejs', 'text!tpls/v6-ratingTab.ejs'],
    function(_, Backbone, tplMain, tplTD, tplTH, tplTR, tplTab) {
        

        var HistoryView = Backbone.View.extend({
            tagName: 'div',
            id: 'v6History',
            tplMain: _.template(tplMain),
            tplHeadTD: _.template(tplTD),
            tplTD: function(value){return '<td>'+value+'</td>'},
            tplTH: _.template(tplTH),
            tplTR: _.template(tplTR),
            tplTab: _.template(tplTab),
            events: {
                'click .closeIcon': 'close',
                'click .historyTable tr': 'trClicked',
                'click .historyTable .userName': 'userClicked',
                'click .historyHeader span': 'tabClicked',
                'click #showMore': 'showMore',
                'keyup #historyAutoComplete': 'filterChanged',
                'click .delete': 'clearFilter'
            },
            initialize: function(_conf, manager) {
                this.conf = _conf;
                this._manager = manager;
                this.tabs = _conf.tabs;
                this.columns = _conf.columns;
                this.$el.html(this.tplMain({close: _conf.images.close, imgDel: _conf.images.del, spin: _conf.images.spin}));

                this.$head = this.$el.find('.historyHeader');
                this.$titles = $(this.$el.find('.historyTable thead tr')[0]);
                this.$tbody = $(this.$el.find('.historyTable tbody')[0]);
                this.$noHistory = $(this.$el.find('.noHistory'));
                this.$showMore = $(this.$el.find('#showMore'));
                this.$filter = $(this.$el.find('#historyAutoComplete'));

                this.ACTIVE_TAB = 'activeLink';
                this.UNACTIVE_TAB = 'unactiveLink';
                this.WIN_CLASS = 'historyWin';
                this.LOSE_CLASS = 'historyLose';
                this.DRAW_CLASS = 'historyDraw';

                this.renderTabs();
                this.renderHead();

                this.isClosed = false;
            },

            trClicked: function(e){
                if ($(e.target).hasClass('sessionHeader') || $(e.target).hasClass('userName')) return;
                var id  = $(e.currentTarget).attr('data-id');
                //TODO save player userId history
                this._manager.getGame(id);
            },

            userClicked: function (e){
                var userId  = $(e.currentTarget).attr('data-userid');
                var userName = $(e.currentTarget).html();
                this._manager.client.onShowProfile(userId, userName);
            },

            tabClicked: function(e){
                var id  = $(e.currentTarget).attr('data-idtab');
                this.setActiveTab(id);
                this._manager._getHistory(id, null, false);
            },

            filterChanged: function(e) {
                if (e.type === 'keyup')
                    if (e.keyCode == 13 || e.target.value.length == 0) {
                        this._manager._getHistory(this.currentTab.id, null, false);
                }
            },

            clearFilter: function() {
                this.setFilter('');
                this._manager._getHistory(this.currentTab.id, null, false);
            },

            close: function () {
                this.$el.hide();
                this.isClosed = true;
                this.setFilter('');
            },

            showMore:function () {
                this._manager._getHistory(this.currentTab.id, null, true);
            },

            renderTabs: function() {
                for (var i = this.tabs.length - 1; i >= 0; i--){
                    this.$head.prepend(this.tplTab(this.tabs[i]));
                    this.setActiveTab(this.tabs[0].id);
                }
                if (!this.tabs || this.tabs.length == 0) {
                    this.currentTab = {
                        id: this._manager.client.currentMode
                    }
                }
            },

            renderHead:function() {
                for (var i = 0; i < this.columns.length; i++){
                    this.$titles.append(this.tplTH({
                            title: this.columns[i].title,
                            value: this.columns[i].title,
                            colspan: this.columns[i].dynamic?2:1
                        })
                    );
                }
            },

            renderHistory: function (mode, history) {
                for (var i = 0; i < history.length; i++) {
                    this.renderSession(mode, history[i]);
                }
            },

            renderSession:function(mode, session){
                var row, trclass;
                for (var i = 0; i < session.length; i++){
                    row = this.renderRow(mode, session[i], i==0, session.length);
                    if (session[i].result == 'draw') trclass = this.DRAW_CLASS;
                    else if (session[i].result == 'win') trclass = this.WIN_CLASS;
                         else trclass = this.LOSE_CLASS;

                    this.$tbody.append(this.tplTR({
                        title:session[i].result,
                        trclass:trclass,
                        id:session[i].id,
                        value:row
                    }));
                }
            },

            renderRow: function(mode, row, isFirst, count){
                var columns = "", col;
                if (isFirst){
                    columns = this.tplHeadTD({
                        rows:count,
                        date:row.date,
                        userId: row.opponent.userId,
                        userName: row.opponent.userName,
                        rank: row.opponent[mode]['rank'],
                        eloDiff: count>1?row.elo.diff:'',
                        score: row.gameScore
                    });
                }
                for (var i = 2; i < this.columns.length; i++){
                    col = row[this.columns[i].source];
                    if (col == undefined) col = this.columns[i].undef;
                    if (this.columns[i].dynamic){
                        columns += this.tplTD((col['dynamic']>-1&&col['dynamic']!==''?'+':'')+ col['dynamic']);
                        columns += this.tplTD(col['value']);
                    } else
                    columns += this.tplTD(col);
                }

                return columns;
            },

            render: function(mode, history, hideClose, showMore) {
                this.$el.show();
                this.setActiveTab(mode);

                if (this.$filter.val().length > 0) this.$filter.parent().find('.delete').show();
                else this.$filter.parent().find('.delete').hide();

                if (hideClose === true) this.$el.find('.closeIcon').hide();
                if (hideClose === false) this.$el.find('.closeIcon').show();
                if (!showMore) this.$showMore.hide(); else this.$showMore.show();

                if (!history) {
                    this.isClosed = false;
                    this.$el.find('.loading').show();
                    this.$noHistory.hide();
                }
                else {
                    this.clearHistory();
                    if (history.length == 0) this.$noHistory.show();
                    this.$el.find('.loading').hide();
                    console.log('render history', history);
                    this.renderHistory(mode, history);
                }

                return this;
            },

            clearHistory: function() {
                this.$tbody.children().remove();
            },

            setActiveTab: function(id){
                if (!id || !this.tabs || this.tabs.length < 2) return;
                for (var i = 0; i < this.tabs.length; i++){
                    this.tabs[i].active = false;
                    if (this.tabs[i].id != id)
                        this.$head.find('span[data-idtab="'+this.tabs[i].id+'"]').removeClass(this.ACTIVE_TAB).addClass(this.UNACTIVE_TAB);
                    else {
                        this.$head.find('span[data-idtab="'+this.tabs[i].id+'"]').removeClass(this.UNACTIVE_TAB).addClass(this.ACTIVE_TAB);
                        this.currentTab = this.tabs[i];
                    }
                }
            },


            setFilter: function(filter) {
                this.$filter.val(filter);
            },

            getFilter: function() {
                return this.$filter.val();
            }

        });
        return HistoryView;
    });
define('modules/history_manager',['EE', 'views/history'], function(EE, HistoryView) {
    

    var HistoryManager = function (client) {
        this.client = client;
        this.conf = {
            tabs:[],
            subTabs:[],
            columns:[
                {  id:'date',       source:'date',      title:'Дата' },
                {  id:'opponent',   source:'opponent',  title:'Противник' },
                {  id:'time',       source:'time',      title:'Время'     },
                {  id:'number',     source:'number',    title:'#' },
                {  id:'elo',        source:'elo',       title:'Рейтинг', dynamic:true, startValue:1600 }
            ]
        };

        if (typeof client.opts.initHistory== "function") this.conf =  client.opts.initHistory(this.conf);
        this.conf.images = client.opts.images;

        this.$container = (client.opts.blocks.historyId?$('#'+client.opts.blocks.historyId):$('body'));
        this.isCancel = false;
        this.userId = false;
        this.currentMode = false;
        this.maxCount = 100;
        this.count = 0;
        this.history = [];
    };

    HistoryManager.prototype = new EE();


    HistoryManager.prototype.init = function(conf){
        if (this.client.modes.length > 1)
            for (var i = 0 ; i < this.client.modes.length; i++)
                this.conf.tabs.push({id:this.client.modes[i], title: this.client.getModeAlias(this.client.modes[i])});
        this.historyView = new HistoryView(this.conf, this);
    };


    HistoryManager.prototype.onMessage = function (message) {
        var data = message.data;
        console.log('history_manager;', 'message', message);
        switch (message.type) {
            case 'history': this.onHistoryLoad(data.mode, data.history, data.userId); break;
            case 'game': this.onGameLoad(data.mode, data.game); break;
        }
    };


    HistoryManager.prototype.onHistoryLoad = function (mode, history, userId){
        console.log('history_manager;', 'history load', userId, history);
        if (!this.historyView.isClosed) {
            var histTable = [];
            this.userId = userId;
            this.currentMode = mode;
            this.history = this.history.concat(history);
            for (var i = this.history.length - 1; i > -1; i--) {
                this.formatHistoryRow(this.history[i], histTable, mode, this.history.length - i, userId);
            }
            this.$container.append(this.historyView.render(mode, histTable, null, history && history.length == this.maxCount).$el);
        }
    };


    HistoryManager.prototype.onGameLoad = function (mode, game){
        console.log('history_manager;', 'game load', game, 'time:', Date.now() - this.startTime);
        if (game) {
            game.history = '[' + game.history + ']';
            game.history = game.history.replace(new RegExp('@', 'g'), ',');
            game.history = JSON.parse(game.history);
            game.initData = JSON.parse(game.initData);
            game.userData = JSON.parse(game.userData);
            var players = [];
            for (var i = 0; i < game.players.length; i++) {
                players.push(this.client.userList.createUser(game.userData[game.players[i]]));
            }
            if (players.length != players.length) throw new Error('UserData and players are different!');
            game.players = players;
            console.log('history_manager;', 'game parsed', game);
        }
        if (!this.isCancel) this.emit('game_load', game);
    };


    HistoryManager.prototype.formatHistoryRow = function(hrow, history, mode, number, userId){
        var rows, row = {win:0, lose:0, id:hrow['_id'], number:number}, prev, userData = JSON.parse(hrow.userData), opponentId;
        //previous game
        if (history.length == 0) {
            rows = [];
            prev = null
        } else {
            rows = history[0];
            prev = rows[0];
        }
        opponentId =  userId == hrow.players[0]? hrow.players[1] : hrow.players[0];
        for (var i = 0; i < this.conf.columns.length; i++){
            var col = this.conf.columns[i];
            if (['date', 'opponent', 'time', 'number', 'elo'].indexOf(col.id) == -1){
                row[col.source] = userData[userId][mode][col.source];
            }
        }
        row.opponent = userData[opponentId];
        row.date = formatDate(hrow.timeStart);
        row.time = formatTime(hrow.timeStart);
        // compute game score
        if (!hrow.winner) row.result = 'draw';
        else {
            if (hrow.winner == userId) {
                row.result = 'win';
                row.win++;
            } else {
                row.result = 'lose';
                row.lose++;
            }
        }
        if (prev && prev.date == row.date && prev.opponent.userId == row.opponent.userId){
            row.win += prev.win;
            row.lose += prev.lose;
        }
        row.gameScore = row.win + ':' + row.lose;
        //compute elo
        row.elo = {
            value:userData[userId][mode]['ratingElo']
        };
        //TODO: dynamic columns
        row.elo.dynamic = prev ? row.elo.value - prev.elo.value : '';

        if (!prev || prev.date != row.date || prev.opponent.userId != row.opponent.userId){
            row.elo.diff = row.elo.dynamic||0;
            rows = [];
            rows.unshift(row);
            history.unshift([]);
            history[0] = rows
        } else {
            row.elo.diff = prev.elo.diff + row.elo.dynamic;
            rows.unshift(row);
        }
    };


    HistoryManager.prototype.getHistory = function(mode){
        this.historyView.clearHistory();
        var gm = this.client.gameManager;
        if (this.client.gameManager.inGame()){
            var filter = gm.currentRoom.players[0].isPlayer ? gm.currentRoom.players[1].userName :  gm.currentRoom.players[0].userName;
            if (filter) this.historyView.setFilter(filter);
        }
        this.$container = (this.client.opts.blocks.historyId?$('#'+this.client.opts.blocks.historyId):$('body'));
        this.userId = this.client.getPlayer().userId;
        this._getHistory(mode, false);
    };

    HistoryManager.prototype.getProfileHistory = function(mode, userId, blockId){
        this.historyView.clearHistory();
        this.historyView.setFilter('');
        if (blockId) this.$container = $('#'+blockId);
        if (!this.$container) throw new Error('wrong history container id! ' + blockId);
        this.userId = userId;
        this._getHistory(mode, true);
        this.historyView.delegateEvents();
    };


    HistoryManager.prototype._getHistory = function(mode, hideClose, append){
        if (!append) {
            this.count = 0;
            this.history = [];
        }
        mode = mode || this.client.currentMode;
        this.$container.append(this.historyView.render(mode, false, hideClose).$el);
        this.client.send('history_manager', 'history', 'server', {
            mode:   mode,
            userId: this.userId,
            count:  this.maxCount,
            offset: this.history.length,
            filter: this.historyView.getFilter()
        });
    };


    HistoryManager.prototype.getGame = function (id, userId, mode) {
        userId = userId || this.userId || this.client.getPlayer().userId;
        mode = mode || this.currentMode || this.client.currentMode;
        this.isCancel = false;
        this.client.send('history_manager', 'game', 'server', {mode:mode, id:id, userId: userId});
        this.startTime = Date.now();
    };


    HistoryManager.prototype.close = function(){
      this.historyView.close();
    };

    function formatDate(time) {
        var months = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
        var date = new Date(time);
        var day = date.getDate();
        var month = months[date.getMonth()];
        var year = date.getFullYear();
        if (day < 10) day = '0' + day;
        return day + " " + month + " "  + year;
    }

    function formatTime(time) {
        var date =  new Date(time);
        var h = date.getHours();
        var m = date.getMinutes();
        if (h < 10) h = '0' + h;
        if (m < 10) m = '0' + m;
        return  h + ':' + m;
    }

    HistoryManager.prototype.testHistory = [{"timeStart":1424080866344,"timeEnd":1424080868891,"players":["22050161915831","95120799727737"],"mode":"default","winner":"22050161915831","action":"game_over","userData":"{\"22050161915831\":{\"userId\":\"22050161915831\",\"userName\":\"us_22050161915831\",\"dateCreate\":1424080636958,\"default\":{\"win\":4,\"lose\":2,\"draw\":0,\"games\":6,\"rank\":1,\"ratingElo\":1627}},\"95120799727737\":{\"userId\":\"95120799727737\",\"userName\":\"us_95120799727737\",\"dateCreate\":1424080722018,\"default\":{\"win\":1,\"lose\":2,\"draw\":0,\"games\":3,\"rank\":5,\"ratingElo\":1587}}}"},{"timeStart":1424080860196,"timeEnd":1424080862868,"players":["22050161915831","95120799727737"],"mode":"default","winner":"22050161915831","action":"game_over","userData":"{\"22050161915831\":{\"userId\":\"22050161915831\",\"userName\":\"us_22050161915831\",\"dateCreate\":1424080636958,\"default\":{\"win\":3,\"lose\":2,\"draw\":0,\"games\":5,\"rank\":3,\"ratingElo\":1613}},\"95120799727737\":{\"userId\":\"95120799727737\",\"userName\":\"us_95120799727737\",\"dateCreate\":1424080722018,\"default\":{\"win\":1,\"lose\":1,\"draw\":0,\"games\":2,\"rank\":5,\"ratingElo\":1600}}}"},{"timeStart":1424080754813,"timeEnd":1424080762501,"players":["95120799727737","22050161915831"],"mode":"default","winner":"95120799727737","action":"game_over","userData":"{\"95120799727737\":{\"userId\":\"95120799727737\",\"userName\":\"us_95120799727737\",\"dateCreate\":1424080722018,\"default\":{\"win\":1,\"lose\":0,\"draw\":0,\"games\":1,\"rank\":3,\"ratingElo\":1615}},\"22050161915831\":{\"userId\":\"22050161915831\",\"userName\":\"us_22050161915831\",\"dateCreate\":1424080636958,\"default\":{\"win\":2,\"lose\":2,\"draw\":0,\"games\":4,\"rank\":5,\"ratingElo\":1598}}}"},{"timeStart":1424080713717,"timeEnd":1424080715662,"players":["98637392232194","22050161915831"],"mode":"default","winner":"98637392232194","action":"game_over","userData":"{\"98637392232194\":{\"userId\":\"98637392232194\",\"userName\":\"us_98637392232194\",\"dateCreate\":1424080704161,\"default\":{\"win\":1,\"lose\":0,\"draw\":0,\"games\":1,\"rank\":1,\"ratingElo\":1616}},\"22050161915831\":{\"userId\":\"22050161915831\",\"userName\":\"us_22050161915831\",\"dateCreate\":1424080636958,\"default\":{\"win\":2,\"lose\":1,\"draw\":0,\"games\":3,\"rank\":3,\"ratingElo\":1612}}}"},{"timeStart":1424080696911,"timeEnd":1424080698325,"players":["22050161915831","21508051152341"],"mode":"default","winner":"22050161915831","action":"game_over","userData":"{\"22050161915831\":{\"userId\":\"22050161915831\",\"userName\":\"us_22050161915831\",\"dateCreate\":1424080636958,\"default\":{\"win\":2,\"lose\":0,\"draw\":0,\"games\":2,\"rank\":1,\"ratingElo\":1627}},\"21508051152341\":{\"userId\":\"21508051152341\",\"userName\":\"us_21508051152341\",\"dateCreate\":1423834457435,\"default\":{\"win\":0,\"lose\":3,\"draw\":0,\"games\":3,\"rank\":4,\"ratingElo\":1561}}}"},{"timeStart":1424080690059,"timeEnd":1424080692709,"players":["22050161915831","21508051152341"],"mode":"default","winner":"22050161915831","action":"game_over","userData":"{\"22050161915831\":{\"userId\":\"22050161915831\",\"userName\":\"us_22050161915831\",\"dateCreate\":1424080636958,\"default\":{\"win\":1,\"lose\":0,\"draw\":0,\"games\":1,\"rank\":2,\"ratingElo\":1614}},\"21508051152341\":{\"userId\":\"21508051152341\",\"userName\":\"us_21508051152341\",\"dateCreate\":1423834457435,\"default\":{\"win\":0,\"lose\":2,\"draw\":0,\"games\":2,\"rank\":4,\"ratingElo\":1573}}}"}]
    return HistoryManager;
});

define('text!tpls/v6-ratingMain.ejs',[],function () { return '<div id="v6-rating">\r\n    <img class="closeIcon" src="<%= close %>" title="Закрыть окно рейтинга">\r\n    <div>\r\n        <!-- rating filter panel -->\r\n        <div class="filterPanel">\r\n            <div style="margin-left: 8px;">\r\n\r\n            </div>\r\n        </div>\r\n        <div class="loading"><img src="<%= spin %>"></div>\r\n        <!-- rating table -->\r\n        <table class="ratingTable" cellspacing="0">\r\n            <thead>\r\n                <tr class="headTitles">\r\n\r\n                </tr>\r\n                <tr class="headIcons">\r\n\r\n                </tr>\r\n            </thead>\r\n            <tbody class="ratingTBody">\r\n\r\n            </tbody>\r\n        </table>\r\n\r\n        <!-- div show more -->\r\n        <div class="chat-button chat-post" id="ratingShowMore">\r\n            <span>Ещё 500 игроков</span>\r\n        </div>\r\n\r\n        <!-- div bottom buttons -->\r\n        <div class="footButtons">\r\n            <div style="float:left"><span class="activeLink" id="jumpTop">[в начало рейтинга]</span></div>\r\n            <div style="float:right"><span class="activeLink" id="closeRatingBtn">[закрыть]</span> </div>\r\n        </div>\r\n    </div>\r\n</div>';});


define('text!tpls/v6-ratingTD.ejs',[],function () { return '<td data-idcol="<%= id %>" class="rating<%= id %>"><div><%= value %><sup class="greenSup"><%= sup %></sup></div></td>';});


define('text!tpls/v6-ratingTH.ejs',[],function () { return '<th data-idcol="<%= id %>" class="ratingTH<%= id %>" title="<%= title %>"><%= value %></th>';});


define('text!tpls/v6-ratingTR.ejs',[],function () { return '<tr class="<%= trclass %>" data-userId="<%= userId %>" data-userName="<%= userName %>"><%= value %></tr>';});


define('text!tpls/v6-ratingSearch.ejs',[],function () { return '<div style="padding-bottom:2px; position: relative;">\r\n    <div style="float:left;margin-top:4px;">Поиск:</div>\r\n    <input type="text" placeholder="Поиск по имени" id="ratingAutoComplete" value="">\r\n    <div class="delete" style="background-image: url(<%= imgDel %>)"></div>\r\n</div>';});


define('text!tpls/v6-ratingPhoto.ejs',[],function () { return '<div style="float:right;margin-top:2px;">\r\n    <a href="<%= photo %>" rel="lightbox" data-lightbox="<%= photo %>"><img src="i/camera.png"></a>\r\n</div>';});


define('text!tpls/v6-ratingUser.ejs',[],function () { return '<span class="userName" data-userid="<%= userId %>"><%= userName %></span>';});

define('views/rating',['underscore', 'backbone', 'text!tpls/v6-ratingMain.ejs', 'text!tpls/v6-ratingTD.ejs', 'text!tpls/v6-ratingTH.ejs',
        'text!tpls/v6-ratingTR.ejs', 'text!tpls/v6-ratingTab.ejs', 'text!tpls/v6-ratingSearch.ejs',
        'text!tpls/v6-ratingPhoto.ejs', 'text!tpls/v6-ratingUser.ejs'],
    function(_, Backbone, tplMain, tplTD, tplTH, tplTR, tplTab, tplSearch, tplPhoto, tplUser) {
        

        var RatingView = Backbone.View.extend({
            tagName: 'div',
            id: 'v6Rating',
            tplMain: _.template(tplMain),
            tplTD: _.template(tplTD),
            tplTH: _.template(tplTH),
            tplTR: _.template(tplTR),
            tplTab: _.template(tplTab),
            tplSearch: _.template(tplSearch),
            tplUser: _.template(tplUser),
            tplPhoto: _.template(tplPhoto),
            events: {
                'click .closeIcon': 'close',
                'click #closeRatingBtn': 'close',
                'click .headTitles th': 'thClicked',
                'click .headIcons th': 'thClicked',
                'click .filterPanel span': 'tabClicked',
                'click .ratingTable .userName': 'userClicked',
                'click #ratingShowMore': 'showMore',
                'keyup #ratingAutoComplete': 'filterChanged',
                'click .delete': 'clearFilter'
            },

            thClicked: function(e){
                var id = $(e.currentTarget).attr('data-idcol');
                for (var i = 0; i < this.columns.length; i++){
                    if (this.columns[i].id == id && this.columns[i].canOrder){
                        this.setColumnOrder(id);
                        console.log('log; rating col clicked',this.columns[i]);
                        this.getRatings();
                        break;
                    }
                }
            },

            tabClicked: function (e){
                var id = $(e.currentTarget).attr('data-idtab');
                for (var i = 0; i < this.subTabs.length; i++){
                    if (this.subTabs[i].id == id){
                        this.setActiveSubTab(id);
                        this.getRatings();
                        return;
                    }
                }
            },

            userClicked: function (e){
                var userId = $(e.currentTarget).attr('data-userid');
                var userName = $(e.currentTarget).html();
                this.manager.client.onShowProfile(userId, userName);
            },

            showMore: function() {
                this.getRatings(true);
            },

            filterChanged: function(e) {
                if (e.type === 'keyup')
                    if (e.keyCode == 13 || e.target.value.length == 0) {
                        this.getRatings();
                    }
            },

            clearFilter: function() {
                this.$filter.val('');
                this.getRatings();
            },

            getRatings: function(showmore) {
                this.manager.getRatings(this.currentSubTab.id, this.currentCollumn.id,
                    this.currentCollumn.order < 0? 'desc':'asc', this.$filter.val(), !!showmore);
            },

            initialize: function(_conf, _manager) {
                this.conf = _conf;
                this.manager = _manager;
                this.tabs = _conf.tabs;
                this.subTabs = _conf.subTabs;
                this.columns = _conf.columns;
                this.$el.html(this.tplMain({close:this.conf.images.close, spin: this.conf.images.spin}));

                this.$tabs = $(this.$el.find('.filterPanel').children()[0]);
                this.$titles = this.$el.find('.headTitles');
                this.$icons = this.$el.find('.headIcons');
                this.$head = this.$icons.parent();
                this.$tbody = $(this.$el.find('.ratingTable tbody')[0]);
                this.$showMore = $(this.$el.find('#ratingShowMore'));


                this.NOVICE = '<span style="color: #C42E21 !important;">новичок</span>';
                this.IMG_BOTH = '<img src="' + _conf.images.sortBoth + '">';
                this.IMG_ASC= '<img src="' + _conf.images.sortAsc + '">';
                this.IMG_DESC = '<img src="' + _conf.images.sortDesc + '">';
                this.ACTIVE_TAB = 'activeLink';
                this.UNACTIVE_TAB = 'unactiveLink';
                this.SORT = 'sorted';
                this.YOU = 'Вы:';
                this.HEAD_USER_CLASS = 'headUser';
                this.ACTIVE_CLASS = 'active';
                this.ONLINE_CLASS = 'online';
                this.USER_CLASS = 'user';

                this.renderTabs();
                this.renderHead();
                this.isClosed = false;
            },

            close: function () {
                this.$el.hide();
                this.isClosed = true;
            },

            renderTabs: function() {
                for (var i in this.tabs){
                    this.$tabs.append(this.tplTab(this.tabs[i]));
                    this.setActiveTab(this.tabs[0].id);
                }
                if (this.subTabs.length>1) {
                    this.$tabs.append('<br>');
                    for (var i in this.subTabs){
                        this.$tabs.append(this.tplTab(this.subTabs[i]));
                        this.setActiveSubTab(this.subTabs[0].id);
                    }
                }
            },

            renderHead:function() {
                var col, th;
                for (var i in this.columns) {
                    col = this.columns[i];
                    if (col.canOrder) {
                        if (col.id == 'ratingElo') col.order = 1;
                        else col.order = 0;
                    }
                    th = {
                        id: col.id,
                        title: col.topTitle||'',
                        value: col.title
                    };
                    this.$titles.append(this.tplTH(th));
                    th.value = col.canOrder?this.IMG_BOTH:'';
                    if (col.id == 'rank') th.value= "";
                    if (col.id == 'userName') th.value = this.tplSearch({imgDel: this.conf.images.del});
                    this.$icons.append(this.tplTH(th));
                }
                this.setColumnOrder('ratingElo');
                this.$filter = $(this.$el.find('#ratingAutoComplete'));
            },

            renderRatings: function (ratings) {
                var row;
                if (ratings.infoUser) {
                    row = ratings.infoUser;
                    this.$head.append(this.tplTR({
                        trclass: this.HEAD_USER_CLASS,
                        userId: row.userId,
                        userName: row.userName,
                        value: this.renderRow(row, true)
                    }));
                }
                if (!ratings.allUsers) return;
                for (var i = 0; i < ratings.allUsers.length; i++) {
                    row = ratings.allUsers[i];
                    var trclass = '';
                    if (row.user) trclass += this.USER_CLASS + ' ';
                    if (row.active) trclass += this.ACTIVE_CLASS;
                    this.$tbody.append(this.tplTR({
                        trclass: trclass,
                        userId: row.userId,
                        userName: row.userName,
                        value: this.renderRow(row)
                    }));
                }
            },

            renderRow: function(row, isUser){
                var columns = ""; var col;
                for (var i = 0; i < this.columns.length; i++){
                    if (row[this.columns[i].source] == undefined) row[this.columns[i].source] = this.columns[i].undef;
                    col = {
                        id: this.columns[i].id,
                        value: row[this.columns[i].source],
                        sup: ''
                    };
                    if (col.id == 'userName') col.value = this.tplUser({
                        userName: row.userName,
                        userId: row.userId
                    });
                    if (isUser){ // Render user rating row (infoUser)
                        if (col.id == 'rank') col.value = this.YOU;
                        if (col.id == 'userName') col.value += ' ('+(row.rank>0 ? row.rank : '-' ) + ' место)';
                    }
                    if (col.id == 'userName' && row.photo) col.value += this.tplPhoto(row.photo); //TODO: photo, photo link
                    columns += this.tplTD(col);
                }
                return columns;
            },

            setActiveTab: function(id){
                for (var i = 0; i < this.tabs.length; i++){
                    this.tabs[i].active = false;
                    if (this.tabs[i].id != id)
                        this.$tabs.find('span[data-idtab="'+this.tabs[i].id+'"]').removeClass(this.ACTIVE_TAB).addClass(this.UNACTIVE_TAB);
                    else {
                        this.$tabs.find('span[data-idtab="'+this.tabs[i].id+'"]').removeClass(this.UNACTIVE_TAB).addClass(this.ACTIVE_TAB);
                        this.currentTab = this.tabs[i];
                    }
                }
            },

            setActiveSubTab: function(id){
                for (var i = 0; i < this.subTabs.length; i++){
                    this.subTabs[i].active = false;
                    if (this.subTabs[i].id != id)
                        this.$tabs.find('span[data-idtab="'+this.subTabs[i].id+'"]').removeClass(this.ACTIVE_TAB).addClass(this.UNACTIVE_TAB);
                    else {
                        this.$tabs.find('span[data-idtab="'+this.subTabs[i].id+'"]').removeClass(this.UNACTIVE_TAB).addClass(this.ACTIVE_TAB);
                        this.currentSubTab = this.subTabs[i];
                    }
                }
            },

            setColumnOrder: function (id, order){
                for (var i = 2; i < this.columns.length; i++){
                    if (this.columns[i].id != id) {
                        this.columns[i].order = 0;
                        this.$titles.find('th[data-idcol="'+this.columns[i].id+'"]').removeClass(this.SORT);
                        this.$icons.find('th[data-idcol="'+this.columns[i].id+'"]').removeClass(this.SORT).html(this.columns[i].canOrder?this.IMG_BOTH:'');
                    } else {
                        this.currentCollumn = this.columns[i];
                        if (!order) {
                            if (this.columns[i].order < 1) this.columns[i].order = 1;
                            else this.columns[i].order = -1;
                        } else {
                            this.columns[i].order = order == 'desc' ? -1 : 1;
                        }

                        this.$titles.find('th[data-idcol="' + this.columns[i].id + '"]').addClass(this.SORT);
                        this.$icons.find('th[data-idcol="' + this.columns[i].id + '"]').addClass(this.SORT).html(this.columns[i].order>0?this.IMG_ASC:this.IMG_DESC);
                    }
                }
            },

            render: function(ratings, mode, column, order, append, showMore) {
                this.$el.show();
                this.setColumnOrder(column, order);

                if (this.$filter.val() && this.$filter.val().length > 0) this.$filter.parent().find('.delete').show();
                else this.$filter.parent().find('.delete').hide();

                if (!showMore) this.$showMore.hide(); else this.$showMore.show();
                if (mode) this.setActiveSubTab(mode);
                if (!ratings) {
                    this.isClosed = false;
                    this.$el.find('.loading').show();
                }
                else {
                    this.$el.find('.loading').hide();
                    this.$head.find('.'+this.HEAD_USER_CLASS).remove();
                    if (!append) this.$tbody.children().remove();
                    console.log('render ratings', ratings);
                    this.renderRatings(ratings);
                }

                return this;
            }


        });
        return RatingView;
    });
define('modules/rating_manager',['EE', 'views/rating'], function(EE, RatingView) {
    

    var RatingManager = function (client) {
        this.client = client;
        this.conf = {
            tabs:[
                {id: 'all_players', title: 'все игроки'}
            ],
            subTabs:[
            ],
            columns:[
                {  id:'rank',           source:'rank',        title:'Место',                    canOrder:false },
                {  id:'userName',       source:'userName',    title:'Имя',                      canOrder:false },
                {  id:'ratingElo',      source:'ratingElo',   title:'Рейтинг <br> Эло',         canOrder:true },
                {  id:'win',            source:'win',         title:'Выиграл <br> у соперников',canOrder:true },
                {  id:'percent',        source:'percent',     title:' % ',                      canOrder:false },
                {  id:'dateCreate',     source:'dateCreate',  title:'Дата <br> регистрации',    canOrder:true }
            ]
        };

        if (typeof client.opts.initRating == "function") this.conf =  client.opts.initRating(this.conf);
        this.conf.images = client.opts.images;

        this.$container = (client.opts.blocks.ratingId?$('#'+client.opts.blocks.ratingId):$('body'));
        this.maxCount = 500;
        this.count = 0;
    };

    RatingManager.prototype = new EE();


    RatingManager.prototype.init = function(conf){
        for (var i = 0 ; i < this.client.modes.length; i++)
            this.conf.subTabs.push({id:this.client.modes[i], title:this.client.getModeAlias(this.client.modes[i])});

        this.ratingView = new RatingView(this.conf, this);
    };


    RatingManager.prototype.onMessage = function (message) {
        var data = message.data, i;
        console.log('rating_manager;', 'message', message);
        switch (message.type) {
            case 'ratings': this.onRatingsLoad(data.mode, data.ratings, data.column, data.order); break;
        }
    };


    RatingManager.prototype.onRatingsLoad = function (mode, ratings, column, order){
        var rank = false;
        if (this.ratingView.isClosed) return;
        if (ratings.infoUser) {
            ratings.infoUser = this.formatRatingsRow(mode, ratings.infoUser, ratings.infoUser[mode].rank);
        }
        for (var i = 0; i < ratings.allUsers.length; i++) {
            if (!this.filter && column == 'ratingElo' && order == 'desc') {
                rank = i + 1 + this.count;
            } else {
                if (this.client.opts.loadRanksInRating){
                    rank =  ratings.allUsers[i][mode]['rank'] || false;
                }
            }
            ratings.allUsers[i] = this.formatRatingsRow(mode, ratings.allUsers[i], rank);
        }

        this.$container.append(this.ratingView.render(ratings, mode, column, order, this.count != 0, ratings.allUsers.length == this.maxCount).$el);
        this.count += ratings.allUsers.length;
    };


    RatingManager.prototype.formatRatingsRow = function(mode, info, rank){
        var row = {
            userId: info.userId,
            userName: info.userName,
            photo: undefined
        };
        for (var i in info[mode]){
            row[i] = info[mode][i];
        }
        if (rank !== false) row.rank = rank; // set rank on order
        else row.rank = '';
        if (this.client.getPlayer() && info.userId == this.client.getPlayer().userId) row.user = true;
        if (this.client.userList.getUser(info.userId)) row.active = true;
        row.percent = (row.games>0?Math.floor(row.win/row.games*100):0);
        if (Date.now() - info.dateCreate < 86400000)
            row.dateCreate = this.ratingView.NOVICE;
        else
            row.dateCreate = formatDate(info.dateCreate);
        return row;
    };


    RatingManager.prototype.getRatings = function(mode, column, order, filter, showMore){
        if (!showMore) this.count = 0;
        this.$container.append(this.ratingView.render(false).$el);
        this.filter = filter;
        this.client.send('rating_manager', 'ratings', 'server', {
            mode: mode||this.client.currentMode,
            column: column,
            order: order,
            filter: filter,
            count: this.maxCount,
            offset: this.count
        });
    };

    RatingManager.prototype.close = function(){
        this.ratingView.close();
    };

    function formatDate(time) {
        var date = new Date(time);
        var day = date.getDate();
        var month = date.getMonth() + 1;
        var year = ("" + date.getFullYear()).substr(2, 2);
        return ext(day, 2, "0") + "." + ext(month, 2, "0") + "."  + year;
        function ext(str, len, char) {
            //char = typeof (char) == "undefined" ? "&nbsp;" : char;
            str = "" + str;
            while (str.length < len) {
                str = char + str;
            }
            return str;
        }
    }

    RatingManager.prototype.testRatings = {"allUsers":[{"userId":"95514","userName":"us_95514","dateCreate":1423486149906,"mode1":{"win":2,"lose":0,"draw":0,"games":2,"rank":1,"ratingElo":1627},"mode2":{"win":1,"lose":0,"draw":0,"games":1,"rank":1,"ratingElo":1615}},{"userId":"93361","userName":"us_93361","dateCreate":1423486098554,"mode1":{"win":1,"lose":0,"draw":0,"games":1,"rank":2,"ratingElo":1615},"mode2":{"win":0,"lose":0,"draw":0,"games":0,"rank":0,"ratingElo":1600}},{"userId":"99937","userName":"us_99937","dateCreate":1423486099570,"mode1":{"win":0,"lose":3,"draw":0,"games":3,"rank":3,"ratingElo":1561},"mode2":{"win":0,"lose":1,"draw":0,"games":1,"rank":2,"ratingElo":1586}}],"infoUser":{"userId":"99937","userName":"us_99937","dateCreate":1423486099570,"mode1":{"win":0,"lose":3,"draw":0,"games":3,"rank":3,"ratingElo":1561},"mode2":{"win":0,"lose":1,"draw":0,"games":1,"rank":2,"ratingElo":1586}}};
    return RatingManager;
});
define('modules/sound_manager',['EE', 'underscore'], function(EE, _) {
    

    var SoundManager = function (client) {
        this.client = client;
        this.soundsList = client.opts.sounds || {};
        this.sounds = {};
        this.initSounds();
        this.volume = 1;
        this.sound = null;
        this.msAlerTimeBound = 15000;

        this.client.gameManager.on('game_start', function(){
            this._playSound('start');
        }.bind(this));

        this.client.gameManager.on('turn', function(){
            this._playSound('turn');
        }.bind(this));

        this.client.gameManager.on('round_end', function(data){
            if (data.result) {
                this._playSound(data.result);
            }
        }.bind(this));

        this.client.inviteManager.on('new_invite', function(data){
            this._playSound('invite');
        }.bind(this));

        this.client.gameManager.on('time', _.throttle(function(data){       // alert sound time bound in one second
            if (data.user == client.getPlayer() && data.userTimeMS < this.msAlerTimeBound && data.userTimeMS > 1000) {
                this._playSound('timeout', 0.5 + (this.msAlerTimeBound - data.userTimeMS) / this.msAlerTimeBound / 2);
            }
        }.bind(this), 1000));
    };

    SoundManager.prototype = new EE();


    SoundManager.prototype.initSounds = function(){
        for (var id in this.soundsList) {
            if (this.soundsList.hasOwnProperty(id))
                this.sounds[id] = new Sound(this.soundsList[id], id);
        }
    };


    SoundManager.prototype._playSound = function(id){
        // check auto play sound enable
        if (this.sounds[id] && this.sounds[id].enable)
            this.playSound(id);
    };


    SoundManager.prototype.playSound = function(id, volume){
        if (!this.client.settings.sounds) return;
        volume = volume || this.volume;
        if (!this.sounds[id]){
            console.error('sound_manager;', 'wrong sound id', id);
            return;
        }
        if (this.sound)
            this.sound.stop();
        this.sound = this.sounds[id].play(volume);
    };


    var Sound = function (data, id){
        this.volume = data.volume || 1;
        this.sound = document.createElement('audio');
        this.sound.id = 'sound-'+id;
        this.sound.src = data.src;
        this.enable = data.enable !== false;
        document.body.appendChild(this.sound);
    };

    Sound.prototype.play = function(volume) {
        volume *= this.volume;
        if (volume < 0 || volume > 1) volume = 1;
        try {
            this.sound.currentTime = 0;
            this.sound.volume = volume;
            this.sound.play();
            return this;
        } catch (e) {
            console.error('sound;', 'sound play error', e);
            return null;
        }
    };

    Sound.prototype.stop = function() {
        try {
            this.sound.pause()
        } catch (e) {
            console.error('sound;', 'sound stop error', e);
        }
    };

    return SoundManager;
});
define('modules/admin_manager',['EE'], function(EE) {
    var AdminManager = function(client){
        this.client = client;

    };

    AdminManager.prototype  = new EE();

    AdminManager.prototype.onMessage = function(message) {
        var data = message.data;
        console.log('admin_manager;', 'message', message);
        switch (message.type) {
            case 'message':
                this.client.viewsManager.dialogsView.showDialog(data,{}, true, false, false);
                break;
            case 'enable_games':
                this.client.gameManager.enableGames = data['flag'];
                break;
            case 'reload': location.reload(); break;

        }
    };


    AdminManager.prototype.send = function(type, data, pass){
        this.client.send('admin', type, 'server', {pass: pass, data:data})
    };


    return AdminManager;
});

/*! Idle Timer v1.0.1 2014-03-21 | https://github.com/thorst/jquery-idletimer | (c) 2014 Paul Irish | Licensed MIT */
!function(a){a.idleTimer=function(b,c){var d;"object"==typeof b?(d=b,b=null):"number"==typeof b&&(d={timeout:b},b=null),c=c||document,d=a.extend({idle:!1,timeout:3e4,events:"mousemove keydown wheel DOMMouseScroll mousewheel mousedown touchstart touchmove MSPointerDown MSPointerMove"},d);var e=a(c),f=e.data("idleTimerObj")||{},g=function(b){var d=a.data(c,"idleTimerObj")||{};d.idle=!d.idle,d.olddate=+new Date;var e=a.Event((d.idle?"idle":"active")+".idleTimer");a(c).trigger(e,[c,a.extend({},d),b])},h=function(b){var d=a.data(c,"idleTimerObj")||{};if(null==d.remaining){if("mousemove"===b.type){if(b.pageX===d.pageX&&b.pageY===d.pageY)return;if("undefined"==typeof b.pageX&&"undefined"==typeof b.pageY)return;var e=+new Date-d.olddate;if(200>e)return}clearTimeout(d.tId),d.idle&&g(b),d.lastActive=+new Date,d.pageX=b.pageX,d.pageY=b.pageY,d.tId=setTimeout(g,d.timeout)}},i=function(){var b=a.data(c,"idleTimerObj")||{};b.idle=b.idleBackup,b.olddate=+new Date,b.lastActive=b.olddate,b.remaining=null,clearTimeout(b.tId),b.idle||(b.tId=setTimeout(g,b.timeout))},j=function(){var b=a.data(c,"idleTimerObj")||{};null==b.remaining&&(b.remaining=b.timeout-(+new Date-b.olddate),clearTimeout(b.tId))},k=function(){var b=a.data(c,"idleTimerObj")||{};null!=b.remaining&&(b.idle||(b.tId=setTimeout(g,b.remaining)),b.remaining=null)},l=function(){var b=a.data(c,"idleTimerObj")||{};clearTimeout(b.tId),e.removeData("idleTimerObj"),e.off("._idleTimer")},m=function(){var b=a.data(c,"idleTimerObj")||{};if(b.idle)return 0;if(null!=b.remaining)return b.remaining;var d=b.timeout-(+new Date-b.lastActive);return 0>d&&(d=0),d};if(null===b&&"undefined"!=typeof f.idle)return i(),e;if(null===b);else{if(null!==b&&"undefined"==typeof f.idle)return!1;if("destroy"===b)return l(),e;if("pause"===b)return j(),e;if("resume"===b)return k(),e;if("reset"===b)return i(),e;if("getRemainingTime"===b)return m();if("getElapsedTime"===b)return+new Date-f.olddate;if("getLastActiveTime"===b)return f.lastActive;if("isIdle"===b)return f.idle}return e.on(a.trim((d.events+" ").split(" ").join("._idleTimer ")),function(a){h(a)}),f=a.extend({},{olddate:+new Date,lastActive:+new Date,idle:d.idle,idleBackup:d.idle,timeout:d.timeout,remaining:null,tId:null,pageX:null,pageY:null}),f.idle||(f.tId=setTimeout(g,f.timeout)),a.data(c,"idleTimerObj",f),e},a.fn.idleTimer=function(b){return this[0]?a.idleTimer(b,this[0]):this}}(jQuery);
define("idleTimer", function(){});

define('client',['modules/game_manager', 'modules/invite_manager', 'modules/user_list', 'modules/socket', 'modules/views_manager',
        'modules/chat_manager', 'modules/history_manager', 'modules/rating_manager', 'modules/sound_manager', 'modules/admin_manager', 'EE', 'idleTimer'],
function(GameManager, InviteManager, UserList, Socket, ViewsManager, ChatManager, HistoryManager, RatingManager, SoundManager, AdminManager, EE) {
    
    var Client = function(opts) {
        this.version = "0.8.17";
        opts.resultDialogDelay = opts.resultDialogDelay || 0;
        opts.modes = opts.modes || opts.gameModes || ['default'];
        opts.reload = opts.reload || false;
        opts.turnTime = opts.turnTime || 60;
        opts.blocks = opts.blocks || {};
        opts.images = opts.images || defaultImages;
        opts.sounds = $.extend({}, defaultSounds, opts.sounds || {});
        opts.autoReconnect = opts.autoReconnect || false;
        opts.idleTimeout = 1000 * (opts.idleTimeout || 60);
        opts.loadRanksInRating = false;

        try{
            this.isAdmin = opts.isAdmin || LogicGame.isSuperUser();
        }catch (e){
            this.isAdmin = false;
            console.error(e);
        }

        var self = this;

        this.opts = opts;
        this.game = opts.game || 'test';
        this.defaultSettings = $.extend(true, {}, defaultSettings, opts.settings || {});
        this.settings = $.extend(true, {}, this.defaultSettings);
        this.modesAlias = {};
        this.gameManager = new GameManager(this);
        this.userList = new UserList(this);
        this.inviteManager = new InviteManager(this);
        this.chatManager = new ChatManager(this);
        this.viewsManager = new ViewsManager(this);
        this.historyManager = new HistoryManager(this);
        this.ratingManager = new RatingManager(this);
        this.soundManager = new SoundManager(this);
        this.adminManager = new AdminManager(this);

        this.currentMode = null;

        this.reconnectTimeout = null;

        this.timeoutUserChanged = null;
        this.lastTimeUserChanged = 0;

        this.socket = new Socket(opts);
        this.socket.on("connection", function () {
            console.log('client;', 'socket connected');
            clearTimeout(self.reconnectTimeout);
            self.isLogin = false;
            self.socket.send({
                module:'server',
                type:'login',
                target:'server',
                data: self.loginData
            });
        });

        this.socket.on("disconnection", function() {
            console.log('client;', 'socket disconnected');
            self.isLogin = false;
            self.emit('disconnected');
            if (!self.closedByServer && self.opts.autoReconnect){
                self.reconnectTimeout = setTimeout(self.reconnect.bind(self), 3000);
            }
        });

        this.socket.on("failed", function() {
            console.log('client;', 'socket connection failed');
            self.emit('disconnected');
            if (!self.closedByServer && self.opts.autoReconnect){
                self.reconnectTimeout = setTimeout(self.reconnect.bind(self), 30000);
            }
        });

        this.socket.on("message", function(message) {
            console.log('client;', "socket message", message);
            self.onMessage(message);
        });

        this.getUser = this.userList.getUser.bind(this.userList);

        self.unload = false;
        window.onbeforeunload = function(){
            self.unload = true;
        };

        // idle timer // fire when user become idle or active
        if (opts.idleTimeout > 0)
            $( document ).idleTimer(opts.idleTimeout);
        $( document ).on( "idle.idleTimer", function(){
            console.log('client;', 'idle');
            self.isActive = false;
            self.sendChanged();
        });
        $( document ).on( "active.idleTimer", function(){
            console.log('client;', 'active');
            self.isActive = true;
            self.sendChanged();
        });
    };

    Client.prototype  = new EE();

    Client.prototype.init = function(user){
        user = user || {};
        user.userId = user.userId || window._userId;
        user.userName = user.userName || window._username;
        user.sign = user.sign || window._sign || '';
        if (!user.userName || !user.userId || !user.sign){
            throw new Error('Client init error, wrong user parameters'
                            + ' userId: ' + user.userId, ' userName: ' + user.userName + ' sign' + user.sign) ;
        }
        document.cookie = '_userId=' + user.userId + "; path=/;";
        this.loginData = user;
        this.socket.init();
        this.viewsManager.init();
        console.log('client;', 'init version:', this.version);
        return this;
    };


    Client.prototype.reconnect = function(force){
        clearTimeout(this.reconnectTimeout);
        if (this.isLogin && !force){
            console.log('client;', 'connected!');
            return;
        }
        if (this.opts.reload) {
            location.reload(false);
            return;
        }
        this.socket.init();
    };


    Client.prototype.onMessage = function(message){
        switch (message.module){
            case 'server': this.onServerMessage(message); break;
            case 'invite_manager': this.inviteManager.onMessage(message); break;
            case 'game_manager': this.gameManager.onMessage(message); break;
            case 'chat_manager': this.chatManager.onMessage(message); break;
            case 'history_manager': this.historyManager.onMessage(message); break;
            case 'rating_manager': this.ratingManager.onMessage(message); break;
            case 'admin': this.adminManager.onMessage(message); break;
        }
    };


    Client.prototype.onServerMessage = function(message){
        var data = message.data;
        switch (message.type){
            case 'login':
                this.onLogin(data.you, data.userlist, data.rooms, data.opts, data.ban, data.settings);
                break;
            case 'user_relogin':
                var user = this.userList.getUser(data.userId);
                console.log('client;', 'user relogin', user);
                if (user) this.emit('user_relogin', user);
                break;
            case 'user_login':
                this.userList.onUserLogin(data);
                break;
            case 'user_leave':
                this.userList.onUserLeave(data);
                break;
            case 'user_changed':
                this.userList.onUserChanged(data);
                break;
            case 'new_game':
                this.userList.onGameStart(data.room, data.players);
                this.gameManager.onMessage(message);
                break;
            case 'end_game':
                this.userList.onGameEnd(data.room, data.players);
                break;
            case 'error':
                this.onError(data);
                break;
        }
    };

    Client.prototype.onLogin = function(user, userlist, rooms, opts, ban, settings){
        console.log('client;', 'login', user, userlist, rooms, opts, ban, settings);
        settings = settings || {};
        this.game = this.opts.game = opts.game;
        this.modes = this.opts.modes = opts.modes;
        this.modesAlias = this.opts.modesAlias = opts.modesAlias || this.modesAlias;
        this.opts.turnTime = opts.turnTime;
        this.opts.loadRanksInRating = !!opts.loadRanksInRating;
        this.chatManager.ban = ban;
        this.currentMode = this.modes[0];
        this.settings = $.extend({},this.defaultSettings, settings);
        console.log('client;', 'settings',  this.settings);

        this.userList.onUserLogin(user, true);
        for (var i = 0; i < userlist.length; i++) this.userList.onUserLogin(userlist[i]);
        for (i = 0; i< rooms.length; i++) this.userList.onGameStart(rooms[i].room, rooms[i].players);

        this.isLogin = true;

        this.emit('login', user);

        this.ratingManager.init();
        this.historyManager.init();
    };


    Client.prototype.send = function (module, type, target, data) {
        if (!this.socket.isConnected){
            console.error('Client can not send message, socket is not connected!');
            return;
        }
        if (!this.isLogin){
            console.error('Client can not send message, client is not login!');
            return;
        }
        if (typeof module == "object" && module.module && module.type && module.data) {
            type = module.type;
            data = module.data;
            target = module.target;
            module = module.module;
        }
        if (!module || !type || !data || !target){
            console.warn('client;', "some arguments undefined!", module, type, target, data);
            return;
        }
        if (target != 'server'){
            if (!this.userList.getUser(target)) console.warn('client;', 'send message to offline user!', target);
        }
        this.socket.send({
            module:module,
            type:type,
            target:target,
            data:data
        });
    };

    Client.prototype.setMode = function (mode){
        if (!this.socket.isConnected || !this.isLogin){
            console.error('Client can set mode, socket is not connected!');
            return;
        }
        if (!this.modes|| this.modes.length<1){
            console.error('Client can set mode, no modes!');
            return;
        }
        if (this.modes[mode] &&  this.currentMode != this.modes[mode]) {
            this.currentMode = this.modes[mode];
            this.emit('mode_switch', this.currentMode);
            return
        }
        else {
            for (var i = 0; i < this.modes.length; i++){
                if (this.modes[i] == mode) {
                    this.currentMode = mode;
                    this.emit('mode_switch', this.currentMode);
                    return;
                }
            }
        }
        console.error('wrong mode:', mode, 'client modes:',  this.modes)
    };

    Client.prototype.onError = function (error) {
        console.error('client;', 'server error', error);
        switch (error){
            case 'login_error':
                this.emit('login_error');
                this.socket.ws.close();
                break;
            case 'new_connection':
                this.viewsManager.dialogsView.showDialog('Запущена еще одна копия игры', {});
                this.closedByServer = true;
                break;
        }
        if (error == 'login_error') {

        }
    };


    Client.prototype.onShowProfile = function(userId, userName){
        if (!userName) {
            var user = this.userList.getUser(userId);
            if (!user) {
                console.error('client;', 'user', userId, ' is not online!, can not get his name');
                return;
            }
            userName = user.userName;
        }
        this.emit('show_profile', {userId:userId, userName:userName});
    };


    Client.prototype.getPlayer = function(){
        return this.userList.player;
    };


    Client.prototype.getModeAlias = function(mode){
        if (this.modesAlias[mode]) return this.modesAlias[mode];
        else return mode;
    };


    Client.prototype.saveSettings = function(settings){
        settings = settings || this.settings;
        var saveSettings = {};
        for (var prop in this.defaultSettings){
            if (this.defaultSettings.hasOwnProperty(prop))
                saveSettings[prop] = settings[prop];
        }
        console.log('client;', 'save settings:', saveSettings);
        this.send('server', 'settings', 'server', saveSettings);
        this.emit('settings_saved', settings);
        if (this.viewsManager.settingsView.changedProperties.indexOf('disableInvite' != -1)) { // user enable/disable invites
            this.sendChanged();
        }
    };


    Client.prototype.sendChanged = function(){
        if (Date.now() - this.lastTimeUserChanged > 1000) {
            clearTimeout(this.timeoutUserChanged);
            this.lastTimeUserChanged = Date.now();
            this.send('server', 'changed', 'server', {
                isActive: this.isActive
            });
        } else {
            console.log('client;','user_changed!', 'to fast to send user changed!');
            setTimeout(this.sendChanged.bind(this), 1100 - (Date.now() - this.lastTimeUserChanged))
        }
    };


    Client.prototype._onSettingsChanged = function(property){
        this.emit('settings_changed', property);
    };

    var defaultSettings = {
        disableInvite: false,
        sounds: true
    };

    var defaultImages = {
        close: 'i/close.png',
        spin:  'i/spin.gif',
        sortAsc:  'i/sort-asc.png',
        sortDesc:  'i/sort-desc.png',
        sortBoth:  'i/sort-both.png',
        del: 'i/delete.png'
    };

    var defaultSounds = {
        start: {
            src: 'audio/v6-game-start.ogg'
        },
        turn: {
            src: 'audio/v6-game-turn.ogg',
            volume: 0.5
        },
        win: {
            src: 'audio/v6-game-win.ogg'
        },
        lose: {
            src: 'audio/v6-game-lose.ogg'
        },
        invite: {
            src: 'audio/v6-invite.ogg'
        },
        timeout: {
            src: 'audio/v6-timeout.ogg'
        }
    };

    return Client;
});
define('v6-game-client',['client'], function(Client) {
    // TODO client is global(make singleton)
    // TODO css images not found)
    

    console.log('main;', new Date(), 'ready');

    return Client;
});
