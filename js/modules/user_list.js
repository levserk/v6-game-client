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
    console.warn('user_list;', 'no room in list', roomId, players);
};


UserList.prototype.getUser = function(id){
  for (var i = 0; i < this.users.length; i++)
      if (this.users[i].userId == id) return this.users[i];
  return null;
};


UserList.prototype.getUsers = function() {
    var invite = this.client.inviteManager.invite;
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


UserList.prototype.getUserList = function() {
    var userList = [], invite = this.client.inviteManager.invite, user;
    for (var i = 0; i < this.users.length; i++){
        user = this.users[i];
        if (invite && user.userId == invite.target) {
            user.isInvited = true;
        } else delete user.isInvited;
        if (!user.isInRoom) userList.push(user);
    }
    return userList;
};


UserList.prototype.getRoomList = function() {
    return this.rooms;
};


function User(data, fIsPlayer){
    if (!data || !data.userId || !data.userName) throw new Error("wrong user data!");
    this.userId = data.userId;
    this.userName = data.userName;
    this.isPlayer = fIsPlayer || false;
}