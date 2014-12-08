function InviteManager(client){
    var self = this;

    this.client = client;
    this.invites = {}; // userId : invite
    this.invite = null;

    client.userList.on('user_leave', function (user) {
        if (self.invite && self.invite.target == user.userId) {
            self.invite = null;
        }
        self.removeInvite(user.userId);
    });

}

InviteManager.prototype  = new EventEmitter();


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
    this.emit('new_invite', {
        from: this.client.getUser(invite.from)
    });
};


InviteManager.prototype.onReject = function(userId, senderId, reason){
    if (this.invite.target == userId && this.client.getPlayer().userId == senderId){
        this.emit('reject_invite', {user:this.client.userList.getUser(userId), reason:reason});
        this.invite = null;
    } else {
        console.warn('invite_manager; ', 'wrong user reject invite', userId, senderId);
    }
};


InviteManager.prototype.onCancel = function(invite){
    if (this.invites[invite.from]){
        this.emit('cancel_invite', this.invites[invite.from]);
        delete this.invites[invite.from];
    }
};


InviteManager.prototype.sendInvite = function(userId, params) {
    // find user, get current params, send invite and emit event invite sand // params.gameType;
    if (!userId){
        console.warn('invite_manager; ', 'wrong userId to send invite', userId);
        return;
    }
    if (this.invite){
        this.cancel();
    }
    params = params || {};
    params.target = userId;
    this.invite = params;
    this.client.send('invite_manager', 'invite', userId, this.invite);
};


InviteManager.prototype.accept = function(userId){
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
    if (this.invite) {
        this.client.send('invite_manager', 'cancel', this.invite.target, this.invite);
        this.invite = null;
    }
};


InviteManager.prototype.removeInvite = function(userId){
    if (this.invites[userId]){
        this.emit('remove_invite', this.invites[userId]);
        delete this.invites[userId];
    }
};