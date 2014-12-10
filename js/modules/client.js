define(['modules/game_manager', 'modules/invite_manager', 'modules/user_list', 'modules/socket', 'lib/EventEmitter.min'], function(GameManager, InviteManager, UserList, Socket, EE) {
    'use strict';
    var Client = function(opts) {

        var self = this;

        this.userList = new UserList(this);
        this.gameManager = new GameManager(this);
        this.inviteManager = new InviteManager(this);

        this.socket = new Socket();
        this.socket.on("connection", function () {
            console.log('client;', 'socket connected');
        });

        this.socket.on("disconnection", function() {
            console.log('client;', 'socket disconnected');
        });

        this.socket.on("failed", function() {
            console.log('client;', 'socket connection failed');
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
    };


    Client.prototype.onMessage = function(message){
        switch (message.module){
            case 'server': this.onServerMessage(message); break;
            case 'invite_manager': this.inviteManager.onMessage(message); break;
            case 'game_manager': this.gameManager.onMessage(message); break;
        }
    };


    Client.prototype.onServerMessage = function(message){
        switch (message.type){
            case 'login': this.onLogin(message.data.you, message.data.userlist, message.data.rooms); break;
            case 'user_login': this.userList.onUserLogin(message.data); break;
            case 'user_leave': this.userList.onUserLeave(message.data); break;
            case 'new_game': this.userList.onGameStart(message.data.room, message.data.players); break;
            case 'end_game': this.userList.onGameEnd(message.data.room, message.data.players); break;
        }
    };

    Client.prototype.onLogin = function(user, userlist, rooms){
        console.log('client;', 'login', user, userlist, rooms);
        this.emit('login', user);
        var i;
        for (i = 0; i < userlist.length; i++) this.userList.onUserLogin(userlist[i]);
        for (i = 0; i< rooms.length; i++) this.userList.onGameStart(rooms[i].room, rooms[i].players);
    };


    Client.prototype.send = function (module, type, target, data) {
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
        if (target > 0){
            if (!this.userList.getUser(target)) console.warn('client;', 'send message to offline user!', target);
        }
        this.socket.send({
            module:module,
            type:type,
            target:target,
            data:data
        });
    };


    Client.prototype.getPlayer = function(){
        return this.userList.player;
    };

    return Client;
});