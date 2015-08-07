define(['EE'], function(EE) {
    'use strict';

    var UserList = function(client){

        var self = this;

        this.client = client;
        this.users = [];
        this.rooms = [];
        this.waiting = {};

        client.on('disconnected', function(){
            this.rooms = [];
            this.users = [];
            this.waiting = {};
        }.bind(this));
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
        if (this.client.opts.showCheaters) {
            for (var i = 0; i < this.client.modes.length; i++)
                if (user[this.client.modes[i]].timeLastCheatGame){
                    user.userName = 'cheater!' + user.userName;
                    break;
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
                this.removeWaiting(user);
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
            this.removeWaiting(players[i]);
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
                if (this.client.opts.showCheaters) {
                    for (var j = 0; j < this.client.modes.length; j++)
                        if (this.users[i][this.client.modes[j]].timeLastCheatGame){
                            this.users[i].userName = 'cheater!' + this.users[i].userName;
                            break;
                        }
                }
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
            user.waiting = (this.waiting && this.waiting[this.client.currentMode] == user);
            if (user.isInRoom) continue;
            if (!user.isPlayer && (!this.client.opts.showHidden && (user.disableInvite || !user.isActive))) continue;
            if (filter && user.userName.toLowerCase().indexOf(filter) == -1) continue;
            else userList.push(user);
        }
        userList.sort(function(a, b){
            var ar = a.getRank();
            if (isNaN(+ar)) {
                ar = 99999999;
                if (a.isPlayer) {
                    ar = 99999998;
                }
            }
            var br = b.getRank();
            if (isNaN(+br)) {
                br = 99999999;
                if (b.isPlayer) {
                    br = 99999998;
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
        var rooms = [], room;
        for (var i = 0; i < this.rooms.length; i++) {
            room = this.rooms[i];
            // check room is current
            room.current = (this.client.gameManager.currentRoom && this.client.gameManager.currentRoom.id == room.room);
            if (!filter) {
                rooms.push(room);
            } else { // find user by filter in room
                for (var j = 0; j < room.players.length; j++) {
                    if (room.players[j].userName.toLowerCase().indexOf(filter) != -1) {
                        rooms.push(room);
                        break;
                    }
                }
            }
        }
        rooms.sort(function(a, b){
            var ar = UserList.getRoomRank(a);
            var br = UserList.getRoomRank(b);
            return ar - br;
        });
        return rooms;
    };


    UserList.prototype.getSpectatorsList = function(filter) {
        var spectators = [];
        if (this.client.gameManager.currentRoom && this.client.gameManager.currentRoom.spectators.length) {
            var user, invite = this.client.inviteManager.invite;
            for (var i = 0; i < this.client.gameManager.currentRoom.spectators.length; i++) {
                user = this.client.gameManager.currentRoom.spectators[i];
                if (invite && user.userId == invite.target) { // user is invited
                    user.isInvited = true;
                } else {
                    delete user.isInvited;
                }
                if (!filter || user.userName.toLowerCase().indexOf(filter) != -1) {
                    spectators.push(user);
                }
            }
        }

        return spectators;
    };


    UserList.prototype.onWaiting = function(waiting){
        if (!waiting) return;
        var user;
        for (var mode in waiting){
            user = waiting[mode];
            if (user) {
                user = this.getUser(user);
                if (user){
                    this.waiting[mode] = user;
                } else {
                    console.error('waiting user no in list', waiting[mode], mode);
                }
            } else {
                this.waiting[mode] = null;
            }
        }
        this.emit('waiting', this.waiting);
    };


    UserList.prototype.removeWaiting = function(user) {
        if (this.waiting) {
            for (var mode in this.waiting) {
                if (this.waiting[mode] == user){
                    this.waiting[mode] = null;
                }
            }
        }
    };


    UserList.getRoomRank = function(room) {
        if (room.players.length) {
            return Math.min(room.players[0].getNumberRank(), room.players[1].getNumberRank())
        }
        return 0;
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
        this.fullName = this.userName;

        if (client.opts.shortGuestNames && this.userName.substr(0,6) == 'Гость ' &&  this.userName.length > 11){
            var nameNumber = this.userName.substr(6,1) + '..' + this.userName.substr(this.userName.length-2, 2);
            this.userName = 'Гость ' + nameNumber;
        }

        this.getRank = function (mode) {
            return this[mode||this._client.currentMode].rank || '—';
        };

        this.getNumberRank = function(mode) {
            return this[mode||this._client.currentMode].rank || Number.POSITIVE_INFINITY;
        };

        this.update = function(data) {
            for (var key in data){
                if (data.hasOwnProperty(key)) this[key] = data[key];
            }
            this.disableInvite = data.disableInvite || false;
            if (typeof data.isActive == 'boolean') this.isActive  = data.isActive;

            if (this._client.opts.shortGuestNames && this.userName.substr(0,6) == 'Гость ' &&  this.userName.length > 11){
                var nameNumber = this.userName.substr(6,1) + '..' + this.userName.substr(this.userName.length-2, 2);
                this.userName = 'Гость ' + nameNumber;
            }
        };

        this._client = client;
    }

    return UserList;
});