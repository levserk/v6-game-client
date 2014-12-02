function Client(opts){

    var self = this;

    this.userList = new UserList(this);
    this.inviteManager = new InviteManager(this);
    this.gameManager = new GameManager(this);

    this.socket = new Socket();
    this.socket.on("connection", function () {
        console.log("connection");
    });

    this.socket.on("disconnection", function() {
        console.log("disconnection");
    });

    this.socket.on("failed", function() {
        console.log("failed");
    });

    this.socket.on("message", function(message) {
        console.log('client;', "message", message);
        self.onMessage(message);
    });

    this.getUser = this.userList.getUser;
}

Client.prototype  = new EventEmitter();

Client.prototype.init = function(){
    this.socket.init();
};


Client.prototype.onMessage = function(message){
    switch (message.module){
        case 'server': this.onServerMessage(message); break;
        case 'invite_manager': this.inviteManager.onMessage(message); break;
        case 'game_manager': this.gameManager.onMessage(); break;
    }
};


Client.prototype.onServerMessage = function(message){
    switch (message.type){
        case 'login': this.onLogin(message.data.you, message.data.userlist); break;
        case 'user_login': this.userList.onUserLogin(message.data); break;
        case 'user_leave': this.userList.onUserLeave(message.data); break;
        case 'game_start': this.userList.onGameStart(message.data.roomId, message.data.players); break;
        case 'game_end': this.userList.onGameEnd(message.data.roomId, message.data.players); break;
    }
};

Client.prototype.onLogin = function(user, userlist){
    console.log('client;', 'login', user, userlist);
    this.emit('login', user);
    for (var i = 0; i < userlist.length; i++) this.userList.onUserLogin(userlist[i]);
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