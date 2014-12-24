define('modules/game_manager',['EE'], function(EE) {
    

    var GameManager = function(client){
        this.client = client;
        this.currentRoom = null;
        this.client.on('disconnected', function(){
            // TODO: save or close current room
        });
    };

    GameManager.prototype  = new EE();


    GameManager.prototype.onMessage = function(message){
        var data = message.data, player = this.client.getPlayer(), i;
        console.log('game_manager;', 'message', message);
        switch (message.type) {
            case 'new_game':
                for ( i = 0; i < data.players.length; i++){
                    if (data.players[i] == player || data.players[i] == player.userId){ //TODO: warn! userList changed user ids list to user list; leave old game
                        if (this.currentRoom)
                            if (this.currentRoom.isClosed) this.leaveRoom();
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
                console.log('game_manager;', 'emit round_start', data);
                this.emit('round_start', {
                    players: [
                        this.getPlayer(data.players[0]),
                        this.getPlayer(data.players[1])
                    ],
                    first: this.getPlayer(data.first),
                    id: data.id,
                    inviteData: data.inviteData
                });
                break;
            case 'turn':
                console.log('game_manager;', 'emit turn', data);
                this.emit('turn', data);
                break;
            case 'event':
                var user = this.getPlayer(data.user);
                console.log('game_manager;', 'game event', data, user);
                this.onUserEvent(user, data);
                break;
            case 'user_leave':
                var user = this.getPlayer(data);
                this.onUserLeave(user);
                break;
            case 'round_end':
                console.log('game_manager', 'emit round_end', data);
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
                this.emit('round_end', data, this.client.getPlayer());
                break;
            case 'error':
                console.log('game_manager;', 'error', data);
                break;
        }
    };


    GameManager.prototype.onGameStart = function(room){
        //TODO: check and hide invite
        room = new Room(room, this.client);
        console.log('game_manager;', 'emit game_start', room);
        this.currentRoom = room;
        this.emit('game_start', room);
        this.sendReady();
    };


    GameManager.prototype.onUserLeave = function(user){
        //TODO: check user is opponent or me
        this.currentRoom.isClosed = true;
        console.log('game_manager;', 'user_leave', this.currentRoom, user);
        if (user != this.client.getPlayer()) this.emit('user_leave', user);
        else this.leaveRoom();
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
        }
    };


    GameManager.prototype.leaveGame = function(){
        // TODO: send to server leave game, block game and wait leave message
        this.client.send('game_manager', 'leave', 'server', true);
    };


    GameManager.prototype.leaveRoom = function(){
        if (!this.currentRoom.isClosed) throw new Error('leave not closed room! '+ this.currentRoom.id);
        console.log('game_manager;', 'emit game_leave;', this.currentRoom);
        this.emit('game_leave', this.currentRoom);
        this.currentRoom = null;
    };


    GameManager.prototype.sendReady = function(){
        this.client.send('game_manager', 'ready', 'server', true);
    };


    GameManager.prototype.sendTurn = function(turn){
        this.client.send('game_manager', 'turn', 'server', turn);
    };


    GameManager.prototype.sendThrow = function(){
        this.client.send('game_manager', 'event', 'server', {type:'throw'});
    };


    GameManager.prototype.sendDraw = function(){
        this.client.send('game_manager', 'event', 'server', {type:'draw', action:'ask'});
    };


    GameManager.prototype.acceptDraw = function(){
        this.client.send('game_manager', 'event', 'server', {type:'draw', action:'accept'});
    };


    GameManager.prototype.cancelDraw = function(){
        this.client.send('game_manager', 'event', 'server', {type:'draw', action:'cancel'});
    };


    GameManager.prototype.getPlayer = function(id){
        if (this.currentRoom)
            for (var i = 0; i < this.currentRoom.players.length; i++)
                if (this.currentRoom.players[i].userId == id) return this.currentRoom.players[i];
        return null;
    };


    function Room(room, client){
        this.data = room;
        this.id = room.room;
        this.owner = client.getUser(room.owner);
        this.players = [];
        if (typeof room.players[0] == "object") this.players = room.players;
        else for (var i = 0; i < room.players.length; i++) this.players.push(client.getUser(room.players[i]));
    }

    return GameManager;
});
define('modules/invite_manager',['EE'], function(EE) {
    

    var InviteManager = function(client){
        var self = this;

        this.client = client;
        this.invites = {}; // userId : invite
        this.invite = null;

        client.userList.on('leave_user', function (user) {
            if (self.invite && self.invite.target == user.userId) {
                self.invite = null;
            }
            self.removeInvite(user.userId);
        });
        client.gameManager.on('game_start', function(){
            self.invite = null;
            self.rejectAll();
        });
        client.on('disconnected', function(){
            self.invite = null;
            for (var userId in self.invites)
                if (self.invites.hasOwnProperty(userId)){
                    self.removeInvite(userId);
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
        this.emit('new_invite', {
            from: this.client.getUser(invite.from),
            data: invite
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
            this.removeInvite(invite.from);
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
        console.log('invite_manger;', 'removeInvite', userId);
        if (this.invites[userId]){
            this.emit('remove_invite', this.invites[userId]);
            delete this.invites[userId];
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

        client.on('login', function(user){
            self.onUserLogin(user, true);
        });
        client.on('disconnected', function(){
            self.rooms = [];
            self.users = [];
        });
    };

    UserList.prototype  = new EE();


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

    return UserList;
});
define('modules/socket',['EE'], function(EE) {
    

    var Socket = function(opts){
        opts = opts || {};
        this.port = opts.port||'8080';
        this.domain = opts.domain || 'localhost';
        this.game = opts.game||"test";
        this.url = opts.url || this.game;

        this.isConnecting = true;
        this.isConnected = false;

    };

    Socket.prototype  = new EE();


    Socket.prototype.init = function(){
        var self = this;
        self.isConnecting = true;
        self.isConnected = false;

        try{

            this.ws = new WebSocket ('ws://'+this.domain+':'+this.port+'/'+this.url);

            this.ws.onclose = function (code, message) {
                console.log('socket;', 'ws closed', code, message);
                if (self.isConnected) self.onDisconnect();
            };

            this.ws.onerror = function (error) {
                self.onError(error);
            };

            this.ws.onmessage = function (data, flags) {
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

define('text!tpls/userListFree.ejs',[],function () { return '<% _.each(users, function(user) { %>\r\n<tr>\r\n    <td class="userName"><%= user.userName %></td>\r\n    <% if (user.isPlayer) { %>\r\n    <td></td>\r\n    <% } else if (user.isInvited) { %>\r\n    <td class="inviteBtn activeInviteBtn" data-userId="<%= user.userId %>">Отмена</td>\r\n    <% } else { %>\r\n    <td class="inviteBtn" data-userId="<%= user.userId %>">Пригласить</td>\r\n    <% } %>\r\n\r\n</tr>\r\n\r\n<% }) %>';});


define('text!tpls/userListInGame.ejs',[],function () { return '<% _.each(rooms, function(room) { %>\r\n<tr>\r\n    <td class="userName"><%= room.players[0].userName %></td>\r\n    <td class="userName"><%= room.players[1].userName %></td>\r\n</tr>\r\n<% }) %>';});


define('text!tpls/userListMain.ejs',[],function () { return '<div class="tabs">\r\n    <div data-type="free">Свободны <span></span></div>\r\n    <div data-type="inGame">Играют <span></span></div>\r\n</div>\r\n<div id="userListSearch">\r\n    <label for="userListSearch">Поиск по списку:</label><input type="text" id="userListSearch"/>\r\n</div>\r\n<div class="tableWrap">\r\n    <table class="playerList"></table>\r\n</div>\r\n\r\n<div class="btn">\r\n    <span>Играть с любым</span>\r\n</div>';});

define('views/user_list',['underscore', 'backbone', 'text!tpls/userListFree.ejs', 'text!tpls/userListInGame.ejs', 'text!tpls/userListMain.ejs'],
    function(_, Backbone, tplFree, tplInGame, tplMain) {
    
    var UserListView = Backbone.View.extend({
        tagName: 'div',
        id: 'userList',
        tplFree: _.template(tplFree),
        tplInGame: _.template(tplInGame),
        tplMain: _.template(tplMain),
        events: {
            'click .inviteBtn': 'invitePlayer',
            'click .tabs div': 'clickTab',
            'click .disconnectButton': '_reconnect'
        },
        _reconnect: function() {
            this.$list.html(this.$loadingTab);
            this.client.socket.init();
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
        invitePlayer: function(e) {
            var target = $(e.currentTarget),
                userId = target.attr('data-userId');


            if (target.hasClass(this.ACTIVE_INVITE_CLASS)) {
                // cancel invite
                this.client.inviteManager.cancel();
                target.removeClass(this.ACTIVE_INVITE_CLASS);
                target.html('Пригласить');
            } else {
                // send invite
                this.$el.find('.' + this.ACTIVE_INVITE_CLASS).html('Пригласить').removeClass(this.ACTIVE_INVITE_CLASS);
                this.client.inviteManager.sendInvite(userId, (typeof this.client.opts.getUserParams == 'function'?this.client.opts.getUserParams():{}));
                target.addClass(this.ACTIVE_INVITE_CLASS);
                target.html('Отмена');
            }

            console.log('invite user', userId);
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
            /*
             tabType: {'free', 'inGame'}
             */
            this.$el.html(this.tplMain());
            $('body').append(this.el);

            this.ACTIVE_INVITE_CLASS = 'activeInviteBtn';
            this.ACTIVE_TAB_CLASS = 'activeTab';

            this.$list = this.$el.find('.tableWrap table');
            this.$counterFree = this.$el.find('.tabs div[data-type="free"]').find('span');
            this.$counterinGame = this.$el.find('.tabs div[data-type="inGame"]').find('span');

            this.listenTo(this.client.userList, 'new_user', bindedRender);
            this.listenTo(this.client.userList, 'leave_user', bindedRender);
            this.listenTo(this.client.inviteManager, 'reject_invite', this.onRejectInvite.bind(this));
            this.listenTo(this.client.userList, 'new_room', bindedRender);
            this.listenTo(this.client.userList, 'close_room', bindedRender);
            this.listenTo(this.client, 'disconnected', bindedRender);

            this.currentActiveTabName = 'free';
            this._setActiveTab(this.currentActiveTabName);
            this.$list.html(this.$loadingTab);
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
                    users: this.client.userList.getUserList()
                }));
            }
            else if (this.currentActiveTabName === 'inGame') {
                this.$list.html(this.tplInGame({
                    rooms: this.client.userList.getRoomList()
                }));
            } else {
                console.warn('unknown tab', this.currentActiveTabName);
            }
        },
        onRejectInvite: function(invite) {
            this.$el.find('.' + this.ACTIVE_INVITE_CLASS + '[data-userId="' + invite.user.userId + '"]').html('Пригласить').removeClass(this.ACTIVE_INVITE_CLASS);
        },
        render: function() {
            console.log('render');
            this._showPlayerListByTabName();
            this._setCounters();
            return this;
        }
    });
    return UserListView;
});
define('views/dialogs',[],function() {
    
    var dialogs = (function() {
        var NOTIFICATION_CLASS = 'dialogNotification';
        var INVITE_CLASS = 'dialogInvite';
        var USERLEAVE_CLASS = 'dialogUserLeave';
        var ROUNDRESULT_CLASS = 'dialogRoundResult';
        var client;

        function _subscribe(_client) {
            client = _client;
            client.inviteManager.on('new_invite', _newInvite);
            client.inviteManager.on('reject_invite', _rejectInvite);
            client.inviteManager.on('cancel_invite', _cancelInvite);
            client.inviteManager.on('remove_invite', _removeInvite);
            client.gameManager.on('user_leave', _userLeave);
            client.gameManager.on('game_start', _hideDialogs);
            client.gameManager.on('round_end', _roundEnd);
            client.gameManager.on('game_leave', _hideDialogs);
            client.gameManager.on('ask_draw', _askDraw);
            client.gameManager.on('cancel_draw', _cancelDraw);
        }

        function _newInvite(invite) {
            var div = $('<div>');
            div.addClass(INVITE_CLASS);
            div.attr('data-userId', invite.from.userId);
            var text = 'Вас пригласил в игру пользователь ' + invite.from.userName;
            if (typeof this.client.opts.generateInviteText == "function")
                text = this.client.opts.generateInviteText(invite);
            div.html(text).dialog({
                resizable: true,
                draggable: false,
                modal: false,
                buttons: {
                    "Принять": function() {
                        client.inviteManager.accept($(this).attr('data-userId'));
                        $(this).remove();
                    },
                    "Отклонить": function(){
                        client.inviteManager.reject($(this).attr('data-userId'));
                        $(this).remove();
                    }
                },
                close: function() {
                    client.inviteManager.reject($(this).attr('data-userId'));
                    $(this).remove();
                }
            }).parent().draggable();
        }

        function _rejectInvite(invite) {
            var div = $('<div>');
            div.addClass(INVITE_CLASS);
            div.addClass(NOTIFICATION_CLASS);

            div.html('Пользователь ' + invite.user.userName + ' отклонил ваше приглашение').dialog({
                resizable: false,
                modal: false,
                buttons: {
                    "Ок": function() {
                        $(this).remove();
                    }
                }
            });
        }

        function _cancelInvite(opt) {
            console.log('cancel invite', opt);
        }

        function _removeInvite(invite) {
            var userId = invite.from;
            console.log('remove invite', userId);
            $('.' + INVITE_CLASS + '[data-userId="' + userId + '"]').remove();
        }

        function _userLeave(user) {
            _hideDialogs();

            var div = $('<div>');
            div.addClass(INVITE_CLASS);
            div.addClass(NOTIFICATION_CLASS);

            div.html('Пользователь ' + user.userName + ' покинул игру').dialog({
                resizable: false,
                modal: false,
                buttons: {
                    "Ок": function() {
                        $(this).remove();
                        client.gameManager.leaveRoom();
                    }
                }
            });
        }


        function _askDraw(user) {
            console.log('ask draw', user);
            var div = $('<div>');
            div.addClass(NOTIFICATION_CLASS);

            div.html('Пользователь ' + user.userName + ' пердлогает ничью').dialog({
                resizable: false,
                modal: false,
                buttons: {
                    "Принять": function() {
                        client.gameManager.acceptDraw();
                        $(this).remove();
                    },
                    "Отклонить": function() {
                        client.gameManager.cancelDraw();
                        $(this).remove();
                    }
                }
            }).parent().draggable();
        }


        function _cancelDraw(user) {
            console.log('cancel draw', user);
            var div = $('<div>');
            div.addClass(NOTIFICATION_CLASS);

            div.html('Пользователь ' + user.userName + ' отклонил ваше предложение о ничье').dialog({
                resizable: false,
                modal: false,
                buttons: {
                    "Ок": function() {
                        $(this).remove();
                    }
                }
            });
        }


        function _roundEnd(data) {
            _hideDialogs();

            var div = $('<div>');
            div.addClass(ROUNDRESULT_CLASS);

            var result = "";
            switch (data.result){
                case 'win': result = 'Победа'; break;
                case 'lose': result = 'Поражение'; break;
                case 'draw': result = 'Ничья'; break;
                default : result = 'игра окночена';
            }
            // TODO: get opponent name;
            div.html(result + '<br><br> Сыграть с соперником еще раз?').dialog({
                resizable: false,
                modal: false,
                width: 350,
                buttons: {
                    "Да, начать новую игру": function() {
                        $(this).remove();
                        client.gameManager.sendReady();
                    },
                    "Нет, выйти": function() {
                        $(this).remove();
                        client.gameManager.leaveGame();
                    }
                }
            });
        }

        function _hideDialogs() { //TODO: hide all dialogs and messages
            $('.' + NOTIFICATION_CLASS).remove();
            $('.' + ROUNDRESULT_CLASS).remove();
        }

        return {
            init: _subscribe
        };
    }());

    return dialogs;
});


define('text!tpls/v6-chatMain.ejs',[],function () { return '<div class="tabs">\r\n    <div class="tab" data-type="public">Общий чат</div>\r\n    <div class="tab" data-type="private">игрок</div>\r\n</div>\r\n<div class="clear"></div>\r\n<div class="messagesWrap"><ul></ul></div>\r\n<div class="inputMsg" contenteditable="true"></div>\r\n<div class="layer1">\r\n    <div class="sendMsgBtn">Отправить</div>\r\n    <select id="chat-select">\r\n        <option selected>Готовые сообщения</option>\r\n        <option>Привет!</option>\r\n        <option>Молодец!</option>\r\n        <option>Здесь кто-нибудь умеет играть?</option>\r\n        <option>Кто со мной?</option>\r\n        <option>Спасибо!</option>\r\n        <option>Спасибо! Интересная игра!</option>\r\n        <option>Спасибо, больше играть не могу. Ухожу!</option>\r\n        <option>Спасибо, интересная игра! Сдаюсь!</option>\r\n        <option>Отличная партия. Спасибо!</option>\r\n        <option>Ты мог выиграть</option>\r\n        <option>Ты могла выиграть</option>\r\n        <option>Ходи!</option>\r\n        <option>Дай ссылку на твою страницу вконтакте</option>\r\n        <option>Снимаю шляпу!</option>\r\n        <option>Красиво!</option>\r\n        <option>Я восхищен!</option>\r\n        <option>Где вы так научились играть?</option>\r\n        <option>Еще увидимся!</option>\r\n        <option>Ухожу после этой партии. Спасибо!</option>\r\n        <option>Минуточку</option>\r\n    </select>\r\n</div>\r\n<div class="layer2">\r\n    <input type="checkbox" id="chatIsAdmin"/><label for="chatIsAdmin">От админа</label>\r\n    <span class="chatRules">Правила чата</span>\r\n</div>';});


define('text!tpls/v6-chatMsg.ejs',[],function () { return '<li class="chatMsg" data-msgId="<%= msg.msgId %>">\r\n    <div class="msgRow1">\r\n        <div class="smallRight time"><%= msg.time %></div>\r\n        <div class="smallRight rate"><%= (user.rate || \'-\') %></div>\r\n\r\n        <div data-userId="<%= user.userId%>">\r\n            <span class="userName"><%= user.userName %></span>\r\n        </div>\r\n    </div>\r\n    <div class="msgRow2">\r\n        <div class="delete">&dagger;</div>\r\n        <div class="msgTextWrap">\r\n            <span class="msgText"><%= _.escape(msg.msgText) %></span>\r\n        </div>\r\n    </div>\r\n</li>';});

define('views/chat',['underscore', 'backbone', 'text!tpls/v6-chatMain.ejs', 'text!tpls/v6-chatMsg.ejs'],
    function(_, Backbone, tplMain, tplMsg) {
        
        var pub = [
            {
                user: {
                    userId: 1,
                    userName: 'viteck'
                },
                msg: {
                    msgId: 1,
                    msgText: 'Привет ребята!!',
                    time: '5:45'
                }
            },
            {
                user: {
                    userId: 55555555555,
                    userName: '50 cent'
                },
                msg: {
                    msgId: 52,
                    msgText: '50 cent!',
                    time: '15:40'
                }
            }
        ];
        var priv = [
            {
                user: {
                    userId: 1,
                    userName: 'viteck'
                },
                msg: {
                    msgId: 1,
                    msgText: 'Привет!',
                    time: '5:46'
                }
            },
            {
                user: {
                    userId: 55555555555,
                    userName: '50 cent'
                },
                msg: {
                    msgId: 52,
                    msgText: '<div>hack you!</div>!'
                }
            }
        ];
        var TEST_DATA = {
            pub: pub,
            priv: priv
        };

        var ChatView = Backbone.View.extend({
            tagName: 'div',
            id: 'v6Chat',
            tplMain: _.template(tplMain),
            tplMsg: _.template(tplMsg),
            events: {
                'click .chatMsg': '_deleteMsg',
                'click .tab': 'clickTab',
                'blur .inputMsg': 'blurInputMsg',
                'click .inputMsg': 'clickInputMsg',
                'click .sendMsgBtn': 'sendMsgEvent',
                'keyup .inputMsg': 'sendMsgEvent',
                'change #chat-select': 'changeChatSelect'
            },
            changeChatSelect: function(e) {
                var textMsg = e.target.options[e.target.selectedIndex].innerHTML;
                this.$SELECTED_OPTION.attr('selected', true);
                this.$inputMsg.text(textMsg);
            },
            sendMsgEvent: function(e) {
                var msgText = '';
                console.log("TEST FIRE", e.type);
                // e используется здесь только если нажат enter

                if (e.type === 'keyup' && e.keyCode !== 13) {
                    return;
                }

                if (this.$inputMsg.has(this.$placeHolderSpan).length) {
                    return;
                }

                msgText = this.$inputMsg.text();
                this._sendMsg(msgText);
            },
            _sendMsg: function(text) {
                if (text === '' || typeof text !== 'string') {
                    return;
                }

                console.log('now check');
                if (text.length > this.MAX_MSG_LENGTH) {
                    alert(this.MAX_LENGTH_MSG);
                    return;
                }

                this._addOneMsg({
                    user: {
                        userName: 'goof',
                        userId: 665
                    },
                    msg: {
                        msgText: text,
                        msgId: 3,
                        time: '07:30'
                    }
                });

                this._onMsgAdded();
            },
            _onMsgAdded: function() {
                this.$messagesWrap.scrollTop(this.$messagesWrap[0].scrollHeight);
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

                this._addAllMsgs(this.currentActiveTabName === 'public'? TEST_DATA.pub: TEST_DATA.priv);
            },
            invitePlayer: function(e) {
            },
            initialize: function(_client) {
                this.$el.html(this.tplMain());

                this.MAX_MSG_LENGTH = 128;
                this.MAX_LENGTH_MSG = 'Сообщение слишком длинное (максимальная длина - 128 символов). Сократите его попробуйте снова';

                this.CLASS_DISABLED = 'disabled';
                this.CLASS_DELETE_CHAT_MESSAGE = 'delete';
                this.ACTIVE_TAB_CLASS = 'activeTab';

                this.$placeHolderSpan = $('<span class="placeHolderSpan">Введите ваше сообщение..</span>');

                this.$spinnerWrap = $('<li class="spinnerWrap"><div class="spinner"></div></li>');
                this.$messagesWrap = this.$el.find('.messagesWrap');
                this.$msgsList = this.$messagesWrap.find('ul');
                this.$inputMsg = this.$el.find('.inputMsg');
                this.$SELECTED_OPTION = this.$el.find('select option:selected');

                this.currentActiveTabName = 'public';
                this._setActiveTab(this.currentActiveTabName);

                $('body').append(this.el);
                this._addAllMsgs(TEST_DATA.pub);

                this.$inputMsg.empty().append(this.$placeHolderSpan);
                //this._setLoadingState();

                window.view = this;
            },
            _setActiveTab: function(tabName) {
                this.$el.find('.tabs div').removeClass(this.ACTIVE_TAB_CLASS);
                this.$el.find('.tabs div[data-type="' + tabName + '"]').addClass(this.ACTIVE_TAB_CLASS);
            },
            render: function() {
                return this;
            },
            _deleteMsg: function(e) {
                // delete by id or as click .delete handler
                var $msg, msgId;

                if (!isNaN(+e) && typeof +e === 'number') {
                    msgId = e;
                } else {
                    //клик не по кнопке удалить
                    if (!$(e.target).hasClass(this.CLASS_DELETE_CHAT_MESSAGE)) {
                        return;
                    }

                    $msg = $(e.currentTarget);
                    msgId = $msg.attr('data-msgId')
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
            _addAllMsgs: function(msgs) {
                this.$msgsList.empty();
                _.each(msgs, function(msg) {
                    this._addOneMsg(msg);
                }, this);
            },
            _addOneMsg: function(msg) {
                var $msg = this.tplMsg(msg);
                this.$msgsList.append($msg);
            },
            _setLoadingState: function() {
                this.$msgsList.prepend(this.$spinnerWrap);
                this.$messagesWrap.addClass(this.CLASS_DISABLED);
            },
            _removeLoadingState: function() {
                this.$spinnerWrap.remove();
                this.$messagesWrap.removeClass(this.CLASS_DISABLED);
            }
        });
        return ChatView;
    });
define('modules/views_manager',['views/user_list', 'views/dialogs', 'views/chat'], function(userListView, dialogsView, v6ChatView) {
    var ViewsManager = function(client){
        this.client = client;
        this.userListView = null;
        this.dialogsView = dialogsView;
        this.chat = null;
    };

    ViewsManager.prototype.init = function() {
        this.userListView = new userListView(this.client);
        this.dialogsView.init(this.client);
        this.v6ChatView = new v6ChatView();
    };

    return ViewsManager;
});

define('client',['modules/game_manager', 'modules/invite_manager', 'modules/user_list', 'modules/socket', 'modules/views_manager', 'EE'],
    function(GameManager, InviteManager, UserList, Socket, ViewsManager, EE) {
    
    var Client = function(opts) {

        var self = this;

        this.opts = opts;

        this.userList = new UserList(this);
        this.gameManager = new GameManager(this);
        this.inviteManager = new InviteManager(this);
        this.viewsManager = new ViewsManager(this);

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
        return this;
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
            case 'login':
                this.onLogin(message.data.you, message.data.userlist, message.data.rooms);
                break;
            case 'user_login':
                this.userList.onUserLogin(message.data);
                break;
            case 'user_leave':
                this.userList.onUserLeave(message.data);
                break;
            case 'new_game':
                this.userList.onGameStart(message.data.room, message.data.players);
                this.gameManager.onMessage(message);
                break;
            case 'end_game':
                this.userList.onGameEnd(message.data.room, message.data.players);
                break;
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


    Client.prototype.getPlayer = function(){
        return this.userList.player;
    };

    return Client;
});
define('v6-game-client',['client'], function(Client) {
    // TODO client is global(make singleton)
    // TODO css images not found)
    

    console.log('main;', new Date(), 'ready');

    return Client;
});
