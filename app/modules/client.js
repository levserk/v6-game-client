define(['modules/game_manager', 'modules/invite_manager', 'modules/user_list', 'modules/socket', 'modules/views_manager',
        'modules/chat_manager', 'modules/history_manager', 'modules/rating_manager', 'modules/sound_manager', 'modules/admin_manager',
        'modules/localization_manager', 'EE', 'idleTimer'],
function(GameManager, InviteManager, UserList, Socket, ViewsManager, ChatManager, HistoryManager, RatingManager,
         SoundManager, AdminManager, LocalizationManager, EE) {
    'use strict';
    var Client = function(opts) {
        this.version = "0.9.54";
        opts.resultDialogDelay = opts.resultDialogDelay || 0;
        opts.modes = opts.modes || opts.gameModes || ['default'];
        opts.reload = false;
        opts.turnTime = opts.turnTime || 60;
        opts.blocks = opts.blocks || {};
        opts.images = defaultImages;
        opts.sounds = $.extend({}, defaultSounds, opts.sounds || {});
        opts.autoReconnect = opts.autoReconnect != false;
        opts.idleTimeout = 1000 * (opts.idleTimeout || 60);
        opts.loadRanksInRating = false;
        opts.autoShowProfile = !!opts.autoShowProfile || false;
        opts.shortGuestNames = !!opts.shortGuestNames || false;
        opts.newGameFormat = !!opts.newGameFormat || false;
        opts.vk = opts.vk || {};
        opts.showSpectators =  opts.showSpectators || false;
        opts.showButtonsPanel = opts.showButtonsPanel || false;
        opts.localization = opts.localization || {};
        opts.enableConsole = opts.enableConsole || false;
        opts.showHidden = false;
        opts.showCheaters = false;

        try{
            this.isAdmin = opts.isAdmin || LogicGame.isSuperUser();
            // disable console on production
            if (!opts.enableConsole && !this.isAdmin && window.location.hostname == "logic-games.spb.ru") {
                this.disableConsole();
            }
        }catch (e){
            this.isAdmin = false;
            console.error(e);
        }

        var self = this;

        this.opts = this.conf = opts;
        this.game = opts.game || 'test';
        this.defaultSettings = $.extend(true, {}, defaultSettings, opts.settings || {});
        this.settings = $.extend(true, {}, this.defaultSettings);
        this.lang = opts.lang || 'ru';
        this.locale = opts.localization;
        this.modesAlias = {};
        this.localizationManager = new LocalizationManager(this);
        this.gameManager = new GameManager(this);
        this.userList = new UserList(this);
        this.inviteManager = new InviteManager(this);
        this.chatManager = new ChatManager(this);
        this.viewsManager = new ViewsManager(this);
        this.historyManager = new HistoryManager(this);
        this.ratingManager = new RatingManager(this);
        this.soundManager = new SoundManager(this);
        this.adminManager = new AdminManager(this);

        this.vkWallPost = (opts.vk.url ? this.checkVKWallPostEnabled() : false);
        this.vkEnable =  (window.VK && window.VK.api && window._isVk);

        this.currentMode = null;
        this.reconnectTimeout = null;
        this.timeoutUserChanged = null;
        this.lastTimeUserChanged = 0;
        this.isFocused = true;

        this.TIME_BETWEEN_RECONNECTION = 2000;

        this.socket = new Socket(opts);
        this.socket.on("connection", function () {
            console.log('client;', 'socket connected');
            clearTimeout(self.reconnectTimeout);
            self.relogin = self.reconnection;
            self.isLogin = false;
            self.socket.send({
                module:'server',
                type:'login',
                target:'server',
                data: self.loginData
            });
            self.reconnection = false;
        });

        this.socket.on("disconnection", function() {
            console.log('client;', 'socket disconnected');
            self.reconnection = false;
            self.isLogin = false;
            self.emit('disconnected');
            if (!self.closedByServer && self.opts.autoReconnect){
                self.reconnectTimeout = setTimeout(self.reconnect.bind(self), self.socket.connectionCount  < 2 ? 100 : self.TIME_BETWEEN_RECONNECTION);
            }
        });

        this.socket.on("failed", function() {
            console.log('client;', 'socket connection failed');
            self.reconnection = false;
            self.emit('disconnected');
            if (!self.closedByServer && self.opts.autoReconnect){
                self.reconnectTimeout = setTimeout(self.reconnect.bind(self), self.TIME_BETWEEN_RECONNECTION * 5);
            }
        });

        this.socket.on("message", function(message) {
            console.log('client;', "socket message", message);
            self.onMessage(message);
        });

        this.getUser = this.userList.getUser.bind(this.userList);

        this.unload = false;
        this.confirmUnload = false;
        window.onbeforeunload = this.onBeforeUnload.bind(this);
        window.onunload = this.onUnload.bind(this);
        // idle timer // fire when user become idle or active
        if (opts.idleTimeout > 0)
            $( document ).idleTimer(opts.idleTimeout);
        $( document ).on( "idle.idleTimer", function(){
            self.isActive = false;
            self.sendChanged();
        });
        $( document ).on( "active.idleTimer", function(){
            self.isActive = true;
            self.sendChanged();
        });

        this.lastKey = this.lastKeyTime = null;
        $(document).on("keydown", function(e) {
            this.lastKey = e.which;
            this.lastKeyTime = Date.now();
        }.bind(this));
    };

    Client.prototype  = new EE();

    Client.prototype.init = function(user){
        user = user || {};
        var userId = (user.userId || window._userId).toString(),
            userName = (user.userName || window._username).toString(),
            sign = (user.sign || window._sign).toString(),
            game = this.game || '';
        if (typeof userName != "string" || typeof userId != "string" || typeof sign !="string" || typeof  game != "string"){
            throw new Error('Client init error, wrong user parameters'
                            + ' userId: ' + user.userId, ' userName: ' + user.userName + ' sign' + user.sign) ;
        }
        document.cookie = '_userId=' + user.userId + "; path=/;";
        this.loginData = {
            userId: userId, userName: userName, sign: sign, game: game
        };
        this.socket.init();
        this.viewsManager.init();
        console.log('client;', 'init version:', this.version);
        return this;
    };


    Client.prototype.reconnect = function(force){
        clearTimeout(this.reconnectTimeout);
        var deltaTime = Date.now() - this.socket.timeConnection;
        console.log('client;', 'reconnect, last was', deltaTime, 'ms ago');
        if (deltaTime < this.TIME_BETWEEN_RECONNECTION){
            this.reconnectTimeout = setTimeout(this.reconnect.bind(this), this.TIME_BETWEEN_RECONNECTION - deltaTime);
            return;
        }
        if (this.isLogin && !force){
            console.log('client;', 'connected!');
            return;
        }
        if (this.socket.connectionCount > 10 || this.opts.reload) {
            this.forceReload = true;
            location.reload();
            return;
        }
        this.reconnection = true;
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
                this.onLogin(data);
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
                this.userList.onGameStart(data.room, data.players, data.mode);
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

    Client.prototype.onLogin = function(data){
        var user = data.you, userlist = data.userlist, rooms = data.rooms, ban = data.ban,
            settings = data.settings, opts = data.opts, waiting = data.waiting;
        console.log('client;', 'login', user, userlist, rooms, opts, ban, settings, waiting);
        settings = settings || {};
        this.game = this.opts.game = opts.game;
        this.modes = this.opts.modes = opts.modes;
        this.modesAlias = this.opts.modesAlias = opts.modesAlias || this.modesAlias;
        this.locale.modes = $.extend(true, this.modesAlias, this.locale.modes);
        this.opts.turnTime = opts.turnTime;
        this.opts.loadRanksInRating = !!opts.loadRanksInRating;
        this.chatManager.ban = ban;
        this.currentMode = this.modes[0];
        this.settings = $.extend({},this.defaultSettings, settings);
        console.log('client;', 'settings',  this.settings);

        this.userList.onUserLogin(user, true);
        for (var i = 0; i < userlist.length; i++) this.userList.onUserLogin(userlist[i]);
        this.userList.onWaiting(waiting);
        for (i = 0; i< rooms.length; i++) this.userList.onGameStart(rooms[i].room, rooms[i].players, rooms[i].mode);
        this.isLogin = true;

        this.emit(this.relogin ? 'relogin':'login', user);

        this.ratingManager.init();
        this.historyManager.init();
        this.relogin = false;
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
        if (!this.isLogin) return;
        if (!userName) {
            var user = this.userList.getUser(userId);
            if (!user) {
                console.error('client;', 'user', userId, ' is not online!, can not get his name');
                return;
            }
            userName = user.fullName;
        }
        this.emit('show_profile', {userId:userId, userName:userName});
        if (this.opts.autoShowProfile) {
            this.viewsManager.showUserProfile(userId, userName);
        }
    };


    Client.prototype.getPlayer = function(){
        return this.userList.player;
    };


    Client.prototype.getModeAlias = function(mode){
        if (this.modesAlias[mode]) return this.modesAlias[mode];
        else return mode;
    };

    Client.prototype.onBeforeUnload = function(){
        this.unload = true;
        console.log(this.lastKey, Date.now() - this.lastKeyTime);
        if (this.forceReload || (Date.now() - this.lastKeyTime < 100 && (this.lastKey == 82 || this.lastKey == 116))){
            this.confirmUnload = false;
        } else {
            this.confirmUnload = true;
            if (this.gameManager.isPlaying()) return this.locale['dialogs']['loseOnLeave'];
        }
    };


    Client.prototype.onUnload = function(){
        if (this.confirmUnload && this.gameManager.isPlaying()){
            this.gameManager.leaveGame();
        }
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


    Client.prototype._onSettingsChanged = function(data){
        this.emit('settings_changed', data);
        switch (data.property){
            case 'disableInvite':
                this.getPlayer().disableInvite = data.value;
                this.userList.onUserChanged(this.getPlayer());
                break;
            case 'blacklist':
                this.saveSettings();
                this.viewsManager.userListView.render();
                this.viewsManager.settingsView.renderBlackList();
                this.viewsManager.v6ChatView.reload();
                break;
        }
    };


    Client.prototype.checkVKWallPostEnabled = function () {
        this.vkWallPost = false;
        if (!this.vkEnable) return;
        window.VK.api('account.getAppPermissions', function(r) {
            if (r && r.response)
                console.log('client; checkVKWallPostEnabled; permissions', r.response);
                this.vkWallPost = !!(r.response & 8192);
        }.bind(this))
    };


    Client.prototype.vkInviteFriend = function () {
        if (!this.vkEnable) return;
        window.VK.callMethod('showInviteBox')
    };


    Client.prototype.vkWallPostResult = function (text) {
        console.log('client;', 'vkWallPostResult', text);
        if (this.opts.vk.title){
            text  += ' в ' + this.opts.vk.title;
        }
        var attachments = (this.opts.vk.photo || '') + ',' + (this.opts.vk.url || '');
        try{
            VK.api('wall.post', {message: text, attachments:attachments}, function(r) {console.log(r)})
        } catch (e) {
            console.log('client;', 'vkWallPostResult', e);
        }
    };

    Client.prototype.showCheaters = function(){
        this.opts.showCheaters = true;
        for (var i = 0; i < this.userList.users.length; i++) {
            for (var j = 0; j < this.modes.length; j++)
                if (this.userList.users[i][this.modes[j]].timeLastCheatGame) {
                    this.userList.users[i].userName = 'cheater!' + this.userList.users[i].userName;
                    break;
                }
        }
    };


    Client.prototype.disableConsole = function(){
        if (!window.console || !window.console.log) return;
        if (!this.console) {
            this.console = {
                    log: window.console.log,
                    error: window.console.error,
                    warn: window.console.warn
                }
        }
        window.console.log = window.console.error =  window.console.warn = function(){}
    };

    Client.prototype.enableConsole = function(){
        if (!window.console || !this.console) return;
        window.console.log = this.console.log;
        window.console.error = this.console.error;
        window.console.warn = this.console.warn;
    };


    var defaultSettings = {
        blacklist: {},
        disableInvite: false,
        sounds: true
    };

    var defaultImages = {
        close:      '//logic-games.spb.ru/v6-game-client/app/i/close.png',
        spin:       '//logic-games.spb.ru/v6-game-client/app/i/spin.gif',
        sortAsc:    '//logic-games.spb.ru/v6-game-client/app/i/sort-asc.png',
        sortDesc:   '//logic-games.spb.ru/v6-game-client/app/i/sort-desc.png',
        sortBoth:   '//logic-games.spb.ru/v6-game-client/app/i/sort-both.png',
        del:        '//logic-games.spb.ru/v6-game-client/app/i/delete.png',
        block:      '//logic-games.spb.ru/v6-game-client/app/i/stop.png'
    };

    var defaultSounds = {
        start: {
            src: '//logic-games.spb.ru/v6-game-client/app/audio/v6-game-start.ogg',
            volume: 0.5
        },
        turn: {
            src: '//logic-games.spb.ru/v6-game-client/app/audio/v6-game-turn.ogg',
            enable: false
        },
        win: {
            src: '//logic-games.spb.ru/v6-game-client/app/audio/v6-game-win.ogg',
            volume: 0.5
        },
        lose: {
            src: '//logic-games.spb.ru/v6-game-client/app/audio/v6-game-lose.ogg',
            volume: 0.5
        },
        invite: {
            src: '//logic-games.spb.ru/v6-game-client/app/audio/v6-invite.ogg'
        },
        timeout: {
            src: '//logic-games.spb.ru/v6-game-client/app/audio/v6-timeout.ogg'
        }
    };

    return Client;
});