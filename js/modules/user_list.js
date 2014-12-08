function UserList(client){

    var self = this;

    this.client = client;
    this.users = [];
    this.rooms = [];

    client.on('login', function(user){
        self.onUserLogin(user, true);
    });
}

UserList.prototype  = new EventEmitter();


UserList.prototype.onMessage = function(message){
    switch (message.type){
        case 'user_login': this.onUserLogin(message.data); break;
    }
};

UserList.prototype.getUsers = function() {
    var invite = client.inviteManager.invite;
    if (invite) {
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


UserList.prototype.onUserLogin = function(data, fIsPlayer){
    var user = new User(data, fIsPlayer);
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
    console.warn('user_list;', 'no user in list', userId);
};


UserList.prototype.onGameStart = function(roomId, players){
    var room = {
        id:roomId, players: players
    };
    this.rooms.push(room);
    this.emit('new_room',room);
};


UserList.prototype.onGameEnd = function(roomId, players){
    for (var i = 0; i < this.rooms.length; i++) {
        if (this.rooms[i].id == roomId){
            var room = this.rooms[i];
            this.rooms.splice(i, 1);
            this.emit('close_room', room);
            return;
        }
    }
    console.warn('user_list;', 'no user in list', userId);
};


UserList.prototype.getUser = function(id){
  for (var i = 0; i < this.users.length; i++)
      if (this.users[i].userId == id) return this.users[i];
  return null;
};


function User(data, fIsPlayer){
    if (!data || !data.userId || !data.userName) throw new Error("wrong user data!");
    this.userId = data.userId;
    this.userName = data.userName;
    this.isPlayer = fIsPlayer || false;
}