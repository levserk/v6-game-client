define(['modules/game_manager', 'modules/invite_manager', 'modules/user_list', 'modules/socket', 'modules/views_manager', 'modules/chat_manager', 'modules/history_manager', 'modules/rating_manager', 'EE'],
function(GameManager, InviteManager, UserList, Socket, ViewsManager, ChatManager, HistoryManager, RatingManager,  EE) {
    'use strict';
    var Client = function(opts) {
        this.version = "0.6.10";
        opts.resultDialogDelay = opts.resultDialogDelay || 0;
        opts.modes = opts.modes || opts.gameModes || ['default'];
        opts.reload = opts.reload || false;
        opts.turnTime = opts.turnTime || 60;
        opts.blocks = opts.blocks || {};

        try{
            this.isAdmin = opts.isAdmin || LogicGame.isSuperUser();
        }catch (e){
            this.isAdmin = false;
            console.error(e);
        }

        var self = this;

        this.opts = opts;
        this.game = opts.game || 'test';
        this.modesAlias = {};
        this.gameManager = new GameManager(this);
        this.userList = new UserList(this);
        this.inviteManager = new InviteManager(this);
        this.chatManager = new ChatManager(this);
        this.viewsManager = new ViewsManager(this);
        this.historyManager = new HistoryManager(this);
        this.ratingManager = new RatingManager(this);

        this.currentMode = null;

        this.socket = new Socket(opts);
        this.socket.on("connection", function () {
            console.log('client;', 'socket connected');
        });

        this.socket.on("disconnection", function() {
            console.log('client;', 'socket disconnected');
            self.emit('disconnected');
        });

        this.socket.on("failed", function() {
            console.log('client;', 'socket connection failed');
            self.emit('disconnected');
        });

        this.socket.on("message", function(message) {
            console.log('client;', "socket message", message);
            self.onMessage(message);
        });

        this.getUser = this.userList.getUser.bind(this.userList);
    };

    Client.prototype  = new EE();

    Client.prototype.init = function(){
        this.socket.init();
        this.viewsManager.init();
        console.log('client;', 'init version:', this.version);
        return this;
    };


    Client.prototype.onMessage = function(message){
        switch (message.module){
            case 'server': this.onServerMessage(message); break;
            case 'invite_manager': this.inviteManager.onMessage(message); break;
            case 'game_manager': this.gameManager.onMessage(message); break;
            case 'chat_manager': this.chatManager.onMessage(message); break;
            case 'history_manager': this.historyManager.onMessage(message); break;
            case 'rating_manager': this.ratingManager.onMessage(message); break;
        }
    };


    Client.prototype.onServerMessage = function(message){
        var data = message.data;
        switch (message.type){
            case 'login':
                this.onLogin(data.you, data.userlist, data.rooms, data.opts, data.ban);
                break;
            case 'user_login':
                this.userList.onUserLogin(data);
                break;
            case 'user_leave':
                this.userList.onUserLeave(data);
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

    Client.prototype.onLogin = function(user, userlist, rooms, opts, ban){
        console.log('client;', 'login', user, userlist, rooms, opts, ban);

        this.game = this.opts.game = opts.game;
        this.modes = this.opts.modes = opts.modes;
        this.modesAlias = this.opts.modesAlias = opts.modesAlias || this.modesAlias;
        this.opts.turnTime = opts.turnTime;
        this.chatManager.ban = ban;

        this.currentMode = this.modes[0];
        var i;
        for (i = 0; i < userlist.length; i++) this.userList.onUserLogin(userlist[i]);
        for (i = 0; i< rooms.length; i++) this.userList.onGameStart(rooms[i].room, rooms[i].players);

        this.emit('login', user);
        this.isLogin = true;
        this.ratingManager.init();
        this.historyManager.init();
    };


    Client.prototype.send = function (module, type, target, data) {
        if (!this.socket.isConnected){
            console.error('Client can not send message, socket is not connected!');
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
        if (this.modes[mode]) {
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
        if (error == 'login_error') {
            this.emit('login_error');
            this.socket.ws.close();
        }
    };


    Client.prototype.onShowProfile = function(userId, userName){
        if (!userName) {
            var user = this.userList.getUser(userId);
            if (!user) {
                console.log('err;', 'user', userId, ' is not online!, can not get his name');
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

    return Client;
});