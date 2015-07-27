define(['EE'], function(EE) {
    'use strict';

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
            // TODO: clear all;
            clearTimeout(self.inviteTimeout);
            self.invite = null;
            for (var userId in self.invites)
                if (self.invites.hasOwnProperty(userId)){
                    self.removeInvite(userId);
                }
            self.isPlayRandom = false;
            self.client.viewsManager.userListView._setRandomPlay();
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
            case 'random_wait': this.client.userList.onWaiting(message.data); break;
            case 'random_cancel': this.client.userList.onWaiting(message.data); break;
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
            this.client.viewsManager.dialogsView.showDialog('новые игры временно отключены',{}, true, false, false);
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
        if (!this.client.isLogin) return;
        if (!this.client.gameManager.enableGames && !cancel){
            this.client.viewsManager.dialogsView.showDialog('новые игры временно отключены',{}, true, false, false);
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